// Production adapter: Supabase (Auth + Postgres with RLS + RPC + Edge Function).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PublicApiError, type PublicApi, type ResponseRecord } from '@core/index.ts';
import type { AdminApi, AppUser, AuditRow, InvitationRow, SurveyRow, TemplateRow, VersionRow } from './types';

export function createSupabaseApis(url: string, anonKey: string): { admin: AdminApi; pub: PublicApi; client: SupabaseClient } {
  const sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

  const must = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data as T;
  };

  const mapSurvey = (r: any): SurveyRow => ({
    id: r.id, projectId: r.project_id, title: r.title, slug: r.slug, description: r.description, category: r.category, purpose: r.purpose,
    status: r.status, ownerId: r.owner_id, ownerName: r.owner?.full_name ?? undefined, draftSchema: r.draft_schema, settings: r.settings ?? {}, theme: r.theme ?? {},
    startAt: r.start_at, endAt: r.end_at, currentVersionId: r.current_version_id, hasUnpublishedChanges: r.has_unpublished_changes,
    createdAt: r.created_at, updatedAt: r.updated_at,
  });

  let cachedUser: AppUser | null = null;
  const me = async (): Promise<AppUser | null> => {
    const { data } = await sb.auth.getUser();
    if (!data.user) { cachedUser = null; return null; }
    const p = must(await sb.from('profiles').select('*').eq('id', data.user.id).single()) as any;
    cachedUser = { id: p.id, email: p.email, name: p.full_name ?? p.email, role: p.role };
    return cachedUser;
  };

  const myRole = async (surveyId: string): Promise<SurveyRow['myRole']> => {
    const u = cachedUser ?? (await me());
    if (!u) return null;
    if (u.role !== 'member') return 'admin';
    const { data } = await sb.from('survey_members').select('role').eq('survey_id', surveyId).eq('user_id', u.id).maybeSingle();
    return (data?.role as any) ?? null;
  };

  const admin: AdminApi = {
    mode: 'supabase',
    currentUser: me,
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email hoặc mật khẩu không đúng' : error.message);
      return (await me())!;
    },
    async signUp(email, password, name) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: `${location.origin}${import.meta.env.BASE_URL}admin/login` } });
      if (error) throw new Error(error.message);
      return { needsConfirmation: !data.session };
    },
    async signOut() { await sb.auth.signOut(); cachedUser = null; },

    async listProjects() { return must(await sb.from('projects').select('id, name, description').order('name')) as any; },
    async createProject(name) {
      const u = cachedUser ?? (await me());
      return must(await sb.from('projects').insert({ name, created_by: u!.id }).select('id, name').single()) as any;
    },

    async listSurveys() {
      const rows = must(await sb.from('surveys').select('*, owner:profiles!surveys_owner_id_fkey(full_name)').order('updated_at', { ascending: false })) as any[];
      // response counts per survey (status only, RLS-scoped)
      const ids = rows.map((r) => r.id);
      const counts = new Map<string, { started: number; submitted: number; inProgress: number }>();
      if (ids.length) {
        const resp = must(await sb.from('survey_responses').select('survey_id, status').in('survey_id', ids)) as any[];
        for (const r of resp) {
          const c = counts.get(r.survey_id) ?? { started: 0, submitted: 0, inProgress: 0 };
          c.started++; if (r.status === 'submitted') c.submitted++; else c.inProgress++;
          counts.set(r.survey_id, c);
        }
      }
      const u = cachedUser ?? (await me());
      const roles = new Map<string, string>();
      if (u?.role === 'member') {
        for (const m of must(await sb.from('survey_members').select('survey_id, role').eq('user_id', u.id)) as any[]) roles.set(m.survey_id, m.role);
      }
      return rows.map((r) => ({ ...mapSurvey(r), stats: counts.get(r.id) ?? { started: 0, submitted: 0, inProgress: 0 }, myRole: u?.role !== 'member' ? 'admin' : (roles.get(r.id) as any) ?? null }));
    },
    async getSurvey(id) {
      const r = must(await sb.from('surveys').select('*').eq('id', id).single());
      // số phản hồi cho dòng tiêu đề (chỉ cột trạng thái, theo RLS)
      const resp = must(await sb.from('survey_responses').select('status').eq('survey_id', id)) as { status: string }[];
      const submitted = resp.filter((x) => x.status === 'submitted').length;
      return { ...mapSurvey(r), myRole: await myRole(id), stats: { started: resp.length, submitted, inProgress: resp.length - submitted } };
    },
    async createSurvey(input) {
      const u = cachedUser ?? (await me());
      const r = must(await sb.from('surveys').insert({
        title: input.title, slug: input.slug, description: input.description, category: input.category, purpose: input.purpose,
        project_id: input.projectId ?? null, owner_id: u!.id, draft_schema: input.schema,
        settings: { allowResume: true, showProgress: true, requireReview: true, access: { mode: 'public' }, ...(input.settings ?? {}) }, theme: input.theme ?? {},
      }).select('*').single());
      return mapSurvey(r);
    },
    async updateSurvey(id, p) {
      const patch: Record<string, unknown> = {};
      if (p.title !== undefined) patch.title = p.title;
      if (p.slug !== undefined) patch.slug = p.slug;
      if (p.description !== undefined) patch.description = p.description;
      if (p.category !== undefined) patch.category = p.category;
      if (p.purpose !== undefined) patch.purpose = p.purpose;
      if (p.projectId !== undefined) patch.project_id = p.projectId;
      if (p.draftSchema !== undefined) patch.draft_schema = p.draftSchema;
      if (p.settings !== undefined) patch.settings = p.settings;
      if (p.theme !== undefined) patch.theme = p.theme;
      if (p.startAt !== undefined) patch.start_at = p.startAt;
      if (p.endAt !== undefined) patch.end_at = p.endAt;
      const { error } = await sb.from('surveys').update(patch).eq('id', id);
      if (error) throw new Error(error.code === '23505' ? 'Slug đã tồn tại' : error.message);
    },
    async duplicateSurvey(id, title, slug) { return must(await sb.rpc('duplicate_survey', { p_survey: id, p_title: title, p_slug: slug })) as string; },
    async publish(id) { return must(await sb.rpc('publish_survey', { p_survey: id })) as string; },
    async setStatus(id, status) { must(await sb.rpc('set_survey_status', { p_survey: id, p_status: status })); },
    async listVersions(surveyId) {
      const rows = must(await sb.from('survey_versions').select('*').eq('survey_id', surveyId).order('version_number', { ascending: false })) as any[];
      return rows.map((v): VersionRow => ({ id: v.id, surveyId: v.survey_id, versionNumber: v.version_number, schema: v.schema_json, settings: v.settings_json, theme: v.theme_json, publishedAt: v.published_at }));
    },

    async listResponses(surveyId) {
      const out: ResponseRecord[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const rows = must(await sb.from('survey_responses')
          .select('id, response_code, version_id, status, started_at, submitted_at, duration_seconds, answers, flag, flag_reason, note, respondent_ref, response_events(event_type, section_client_id)')
          .eq('survey_id', surveyId).order('started_at', { ascending: false }).range(from, from + pageSize - 1)) as any[];
        for (const r of rows) out.push({
          id: r.id, code: r.response_code, versionId: r.version_id, status: r.status, startedAt: r.started_at, submittedAt: r.submitted_at,
          durationSeconds: r.duration_seconds, answers: r.answers ?? {}, flag: r.flag, flagReason: r.flag_reason, note: r.note, respondentRef: r.respondent_ref,
          reachedSections: (r.response_events ?? []).filter((e: any) => e.event_type === 'section_reached').map((e: any) => e.section_client_id),
        });
        if (rows.length < pageSize) break;
      }
      return out;
    },
    async flagResponse(rid, flag, reason, note) { must(await sb.rpc('flag_response', { p_response: rid, p_flag: flag, p_reason: reason, p_note: note ?? null })); },
    async getFileUrl(path) {
      const { data } = await sb.storage.from('response-files').createSignedUrl(path, 300);
      return data?.signedUrl ?? null;
    },

    async listInvitations(surveyId) {
      const rows = must(await sb.from('survey_invitations').select('*').eq('survey_id', surveyId).order('invited_at', { ascending: false })) as any[];
      return rows.map((i): InvitationRow => ({ id: i.id, surveyId: i.survey_id, recipientName: i.recipient_name, recipientEmail: i.recipient_email, organization: i.organization, tokenHint: i.token_hint, status: i.status, invitedAt: i.invited_at, completedAt: i.completed_at, expiresAt: i.expires_at }));
    },
    async createInvitations(surveyId, recipients, expiresAt) {
      const rows = must(await sb.rpc('create_invitations', { p_survey: surveyId, p_recipients: recipients, p_expires_at: expiresAt ?? null })) as any[];
      return rows.map((r): InvitationRow => ({ id: r.id, surveyId, recipientName: r.recipient_name, recipientEmail: r.recipient_email, organization: r.organization, tokenHint: r.token.slice(-4), status: 'pending', invitedAt: new Date().toISOString(), completedAt: null, expiresAt: expiresAt ?? null, token: r.token }));
    },
    async revokeInvitation(id) { must(await sb.rpc('revoke_invitation', { p_invitation: id })); },

    async listTemplates() {
      const rows = must(await sb.from('survey_templates').select('*').order('created_at')) as any[];
      return rows.map((t): TemplateRow => ({ id: t.id, key: t.key, title: t.title, description: t.description, category: t.category, schema: t.schema_json, theme: t.theme_json, settings: t.settings_json, visibility: t.visibility }));
    },
    async saveTemplate(t) {
      const u = cachedUser ?? (await me());
      must(await sb.from('survey_templates').insert({ title: t.title, description: t.description, category: t.category, schema_json: t.schema, theme_json: t.theme, settings_json: t.settings, visibility: 'organization', created_by: u!.id }));
    },
    async deleteTemplate(id) { must(await sb.from('survey_templates').delete().eq('id', id)); },

    async listAudit(surveyId, limit = 50) {
      let q = sb.from('audit_logs').select('id, action, entity_type, survey_id, created_at, after_data, actor:profiles(full_name)').order('created_at', { ascending: false }).limit(limit);
      if (surveyId) q = q.eq('survey_id', surveyId);
      const rows = must(await q) as any[];
      return rows.map((a): AuditRow => ({ id: String(a.id), actor: a.actor?.full_name ?? null, action: a.action, entityType: a.entity_type, surveyId: a.survey_id, createdAt: a.created_at, after: a.after_data }));
    },
    async listMembers(surveyId) {
      const rows = must(await sb.from('survey_members').select('user_id, role, profile:profiles(email, full_name)').eq('survey_id', surveyId)) as any[];
      return rows.map((m) => ({ userId: m.user_id, role: m.role, email: m.profile?.email, name: m.profile?.full_name }));
    },
    async addMember(surveyId, email, role) {
      const p = (await sb.from('profiles').select('id').eq('email', email).maybeSingle()).data;
      if (!p) throw new Error('Không tìm thấy người dùng với email này (người dùng cần đăng ký trước)');
      must(await sb.from('survey_members').upsert({ survey_id: surveyId, user_id: p.id, role }));
    },
    async removeMember(surveyId, userId) { must(await sb.from('survey_members').delete().eq('survey_id', surveyId).eq('user_id', userId)); },
    async listUsers() {
      const rows = must(await sb.from('profiles').select('*').order('created_at')) as any[];
      return rows.map((p) => ({ id: p.id, email: p.email, name: p.full_name ?? p.email, role: p.role }));
    },
    async setUserRole(userId, role) { must(await sb.from('profiles').update({ role }).eq('id', userId)); },
    async uploadMedia(file) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from('survey-media').upload(path, file, { cacheControl: '31536000', contentType: file.type });
      if (error) throw new Error(error.message);
      return sb.storage.from('survey-media').getPublicUrl(path).data.publicUrl;
    },
  };

  // ───────────── public API via Edge Function ─────────────
  const call = async <T,>(action: string, body: Record<string, unknown>): Promise<T> => {
    const res = await fetch(`${url}/functions/v1/survey-public`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ action, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new PublicApiError(json.error ?? `Lỗi máy chủ (${res.status})`, json.code, json.fieldErrors);
    return json as T;
  };

  const pub: PublicApi = {
    get: (slug, o = {}) => call('get', { slug, ...o }),
    start: (slug, o = {}) => call('start', { slug, ...o }),
    save: async (responseId, resumeToken, answers, sectionId) => { await call('save', { responseId, resumeToken, answers, sectionId }); },
    resume: (slug, resumeToken) => call('resume', { slug, resumeToken }),
    async uploadFile(responseId, resumeToken, questionId, file) {
      const t = await call<{ path: string; token: string }>('upload_url', { responseId, resumeToken, questionId, fileName: file.name, size: file.size, type: file.type });
      const { error } = await sb.storage.from('response-files').uploadToSignedUrl(t.path, t.token, file, { contentType: file.type });
      if (error) throw new PublicApiError('Tải tệp thất bại: ' + error.message);
      return { path: t.path };
    },
    submit: (responseId, resumeToken, answers) => call('submit', { responseId, resumeToken, answers }),
  };

  return { admin, pub, client: sb };
}
