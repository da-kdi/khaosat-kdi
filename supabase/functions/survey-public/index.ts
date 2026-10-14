// Supabase Edge Function: public respondent API (Deno).
// Every write from anonymous respondents goes through here with the
// service-role key, which never leaves the server. Validation uses the
// exact same survey-core code as the browser.
//
// Deploy:  supabase functions deploy survey-public --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  AVAILABILITY_MESSAGE, computeVisibility, makeResponseCode, makeToken, normalizeAnswers, publicSettings,
  sanitizeAnswers, sha256Hex, surveyAvailability, validateAnswers, findQuestion,
  type Answers, type FileValue, type SurveySchema, type SurveySettings,
} from '../_shared/survey-core/index.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim());
const MAX_ANSWER_BYTES = 200_000;
const RATE_LIMIT_PER_10MIN = Number(Deno.env.get('RATE_LIMIT_PER_10MIN') ?? 30);

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allow = ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'error', public fieldErrors?: Record<string, string>) { super(message); }
}

async function loadSurvey(slug: string) {
  const { data: s, error } = await supabase
    .from('surveys')
    .select('id, slug, title, description, status, theme, settings, start_at, end_at, current_version_id')
    .eq('slug', slug).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!s) throw new HttpError(404, AVAILABILITY_MESSAGE.not_found, 'not_found');
  return s;
}

async function loadVersion(versionId: string) {
  const { data, error } = await supabase.from('survey_versions').select('id, schema_json, settings_json, theme_json').eq('id', versionId).single();
  if (error) throw new HttpError(500, error.message);
  return data as { id: string; schema_json: SurveySchema; settings_json: SurveySettings; theme_json: Record<string, unknown> };
}

async function availability(s: any, settings: SurveySettings) {
  let submittedCount = 0;
  if (settings.maxResponses) {
    const { count } = await supabase.from('survey_responses').select('id', { count: 'exact', head: true }).eq('survey_id', s.id).eq('status', 'submitted');
    submittedCount = count ?? 0;
  }
  return surveyAvailability({ status: s.status, hasVersion: !!s.current_version_id, startAt: s.start_at, endAt: s.end_at, maxResponses: settings.maxResponses, submittedCount });
}

/** Check access mode. Returns invitation row when invite mode. */
async function checkAccess(s: any, settings: SurveySettings, token?: string, code?: string) {
  const mode = settings.access?.mode ?? 'public';
  if (mode === 'code') {
    if (!code) return { requiresCode: true as const };
    if (code.trim() !== (settings.access?.code ?? '').trim()) throw new HttpError(403, 'Mã truy cập không đúng', 'bad_code');
  }
  if (mode === 'invite' || token) {
    if (!token) throw new HttpError(403, 'Khảo sát này chỉ dành cho người được mời. Vui lòng dùng đường link riêng.', 'invite_required');
    const { data: inv } = await supabase.from('survey_invitations').select('*').eq('survey_id', s.id).eq('token_hash', await sha256Hex(token)).maybeSingle();
    if (!inv || inv.status === 'revoked') throw new HttpError(403, 'Đường link mời không hợp lệ hoặc đã bị thu hồi.', 'invalid_invitation');
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) throw new HttpError(403, 'Đường link mời đã hết hạn.', 'invalid_invitation');
    if (inv.status === 'completed') throw new HttpError(409, 'Lời mời này đã được sử dụng để gửi phản hồi.', 'invitation_used');
    return { invitation: inv };
  }
  return {};
}

function toPublic(s: any, v: Awaited<ReturnType<typeof loadVersion>>) {
  return {
    id: s.id, slug: s.slug, title: s.title, description: s.description,
    theme: v.theme_json ?? {}, settings: publicSettings(v.settings_json ?? {}),
    versionId: v.id, schema: v.schema_json,
  };
}

async function loadResponse(responseId: string, resumeToken: string) {
  const { data: r } = await supabase.from('survey_responses').select('*').eq('id', responseId).maybeSingle();
  if (!r || r.resume_token_hash !== (await sha256Hex(resumeToken))) throw new HttpError(403, 'Phiên trả lời không hợp lệ', 'bad_session');
  return r;
}

async function ipHash(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  return sha256Hex(`${ip}:${Deno.env.get('IP_SALT') ?? 'kdi'}`);
}

// ───────────── actions ─────────────
const actions: Record<string, (b: any, req: Request) => Promise<unknown>> = {
  async get({ slug, token, code }) {
    const s = await loadSurvey(slug);
    const settings: SurveySettings = s.settings ?? {};
    const state = await availability(s, settings);
    if (state !== 'open') return { state, title: s.title, message: AVAILABILITY_MESSAGE[state] };
    try {
      const acc = await checkAccess(s, settings, token, code);
      if ('requiresCode' in acc) return { state: 'requires_code', title: s.title, theme: s.theme ?? {} };
      if (acc.invitation && acc.invitation.status === 'pending')
        await supabase.from('survey_invitations').update({ status: 'opened', opened_at: new Date().toISOString() }).eq('id', acc.invitation.id);
    } catch (e) {
      if (e instanceof HttpError && e.code !== 'bad_code') return { state: 'invalid_invitation', message: e.message };
      throw e;
    }
    return { state: 'open', survey: toPublic(s, await loadVersion(s.current_version_id)) };
  },

  async start({ slug, token, code }, req) {
    const s = await loadSurvey(slug);
    const settings: SurveySettings = s.settings ?? {};
    const state = await availability(s, settings);
    if (state !== 'open') throw new HttpError(409, AVAILABILITY_MESSAGE[state], state);
    const acc = await checkAccess(s, settings, token, code);
    if ('requiresCode' in acc) throw new HttpError(403, 'Cần mã truy cập', 'requires_code');

    const ih = await ipHash(req);
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await supabase.from('survey_responses').select('id', { count: 'exact', head: true })
      .eq('survey_id', s.id).eq('ip_hash', ih).gte('started_at', since);
    if ((count ?? 0) >= RATE_LIMIT_PER_10MIN) throw new HttpError(429, 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.', 'rate_limited');

    const resumeToken = makeToken();
    const responseCode = makeResponseCode();
    const { data: r, error } = await supabase.from('survey_responses').insert({
      survey_id: s.id, version_id: s.current_version_id, response_code: responseCode,
      invitation_id: acc.invitation?.id ?? null,
      respondent_ref: acc.invitation ? acc.invitation.organization || acc.invitation.recipient_name : null,
      resume_token_hash: await sha256Hex(resumeToken), ip_hash: ih,
      metadata: { user_agent: req.headers.get('user-agent')?.slice(0, 200) },
    }).select('id').single();
    if (error) throw new HttpError(500, error.message);
    await supabase.from('response_events').insert({ response_id: r.id, event_type: 'started' });
    if (acc.invitation) await supabase.from('survey_invitations').update({ status: 'started' }).eq('id', acc.invitation.id).neq('status', 'completed');
    return { responseId: r.id, responseCode, resumeToken };
  },

  async save({ responseId, resumeToken, answers, sectionId }) {
    const r = await loadResponse(responseId, resumeToken);
    if (r.status !== 'in_progress') throw new HttpError(409, 'Phản hồi đã được gửi', 'already_submitted');
    if (JSON.stringify(answers ?? {}).length > MAX_ANSWER_BYTES) throw new HttpError(413, 'Dữ liệu quá lớn');
    await supabase.from('survey_responses').update({ answers: answers ?? {}, last_section_id: sectionId, updated_at: new Date().toISOString() }).eq('id', responseId);
    if (sectionId) {
      const { data: last } = await supabase.from('response_events').select('section_client_id').eq('response_id', responseId)
        .eq('event_type', 'section_reached').eq('section_client_id', sectionId).limit(1);
      if (!last?.length) await supabase.from('response_events').insert({ response_id: responseId, event_type: 'section_reached', section_client_id: sectionId });
    }
    return { ok: true };
  },

  async resume({ slug, resumeToken }) {
    const s = await loadSurvey(slug);
    const { data: r } = await supabase.from('survey_responses').select('*').eq('survey_id', s.id).eq('resume_token_hash', await sha256Hex(resumeToken)).maybeSingle();
    if (!r) throw new HttpError(404, 'Không tìm thấy phiên trả lời với mã này', 'not_found');
    if (r.status !== 'in_progress') throw new HttpError(409, 'Phản hồi này đã được gửi', 'already_submitted');
    const v = await loadVersion(r.version_id); // continue on the version they started with
    await supabase.from('response_events').insert({ response_id: r.id, event_type: 'resumed' });
    return { responseId: r.id, responseCode: r.response_code, answers: r.answers ?? {}, lastSectionId: r.last_section_id, survey: toPublic(s, v) };
  },

  async upload_url({ responseId, resumeToken, questionId, fileName, size }) {
    const r = await loadResponse(responseId, resumeToken);
    if (r.status !== 'in_progress') throw new HttpError(409, 'Phản hồi đã được gửi');
    const v = await loadVersion(r.version_id);
    const q = findQuestion(v.schema_json, questionId);
    if (!q || q.type !== 'file_upload') throw new HttpError(400, 'Câu hỏi không nhận tệp');
    const st = q.settings ?? {};
    if (size > (st.maxSizeMb ?? 10) * 1024 * 1024) throw new HttpError(400, `Tệp vượt quá ${st.maxSizeMb ?? 10}MB`);
    const accept = (st.accept ?? '').split(',').map((x: string) => x.trim().toLowerCase()).filter(Boolean);
    if (accept.length && !accept.some((a: string) => String(fileName).toLowerCase().endsWith(a))) throw new HttpError(400, `Chỉ chấp nhận: ${accept.join(', ')}`);
    const safe = String(fileName).normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);
    const path = `${r.survey_id}/${r.id}/${crypto.randomUUID()}-${safe}`;
    const { data, error } = await supabase.storage.from('response-files').createSignedUploadUrl(path);
    if (error) throw new HttpError(500, error.message);
    return { path, token: data.token, signedUrl: data.signedUrl };
  },

  async submit({ responseId, resumeToken, answers }) {
    const r = await loadResponse(responseId, resumeToken);
    if (r.status === 'submitted') return { ok: true, responseCode: r.response_code }; // idempotent
    const s = await supabase.from('surveys').select('id, status, start_at, end_at, settings, current_version_id').eq('id', r.survey_id).single();
    const state = await availability(s.data, s.data!.settings ?? {});
    if (state !== 'open' && state !== 'full') throw new HttpError(409, AVAILABILITY_MESSAGE[state], state);
    if (state === 'full') throw new HttpError(409, AVAILABILITY_MESSAGE.full, 'full');

    const v = await loadVersion(r.version_id);
    const schema = v.schema_json;
    const raw: Answers = answers ?? {};
    if (JSON.stringify(raw).length > MAX_ANSWER_BYTES) throw new HttpError(413, 'Dữ liệu quá lớn');
    const errors = validateAnswers(schema, raw);
    if (Object.keys(errors).length) throw new HttpError(422, 'Có câu trả lời chưa hợp lệ', 'validation', errors);
    const clean = sanitizeAnswers(schema, raw);

    // files must have been uploaded under this response's folder
    const vis = computeVisibility(schema, clean);
    const files: (FileValue & { question_client_id: string })[] = [];
    for (const sec of schema.sections) for (const q of sec.questions) {
      if (q.type !== 'file_upload' || !vis.questions.has(q.id) || !clean[q.id]) continue;
      for (const f of (Array.isArray(clean[q.id]) ? clean[q.id] : [clean[q.id]]) as FileValue[]) {
        if (!f.path?.startsWith(`${r.survey_id}/${r.id}/`)) throw new HttpError(400, 'Tệp không hợp lệ', 'bad_file');
        files.push({ ...f, question_client_id: q.id });
      }
    }
    const rows = normalizeAnswers(schema, clean);
    const { data: code, error } = await supabase.rpc('finalize_response', { p_response: r.id, p_answers: clean, p_rows: rows, p_files: files });
    if (error) throw new HttpError(500, 'Không thể lưu phản hồi: ' + error.message);
    return { ok: true, responseCode: code };
  },
};

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  try {
    const body = await req.json();
    const fn = actions[body?.action];
    if (!fn) throw new HttpError(400, 'Unknown action');
    const result = await fn(body, req);
    return new Response(JSON.stringify(result), { headers });
  } catch (e) {
    const err = e instanceof HttpError ? e : new HttpError(500, (e as Error).message ?? 'Server error');
    if (err.status >= 500) console.error(e);
    return new Response(JSON.stringify({ error: err.message, code: err.code, fieldErrors: err.fieldErrors }), { status: err.status, headers });
  }
});
