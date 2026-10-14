// ─────────────────────────────────────────────────────────────
// DEMO MODE — all data lives in this browser's localStorage.
// Mirrors the semantics of the Supabase backend (versioning, status
// transitions, server-side validation, idempotent submit) so the app
// behaves the same; it is NOT a security boundary.
// ─────────────────────────────────────────────────────────────
import {
  AVAILABILITY_MESSAGE, PublicApiError, TEMPLATES, publicSettings, sanitizeAnswers, sha256Hex, makeToken,
  makeResponseCode, surveyAvailability, validateAnswers, findQuestion, cloneSchemaWithNewIds,
  type Answers, type GetSurveyResult, type PublicApi, type PublicSurvey, type ResponseRecord, type SurveyStatus,
} from '@core/index.ts';
import type { AdminApi, AppUser, AuditRow, InvitationRow, MemberRow, Project, SurveyRow, TemplateRow, VersionRow } from './types';
import { syntheticResponses } from './demoSeed';

const KEY = 'kdi-survey-demo-v1';

interface DemoResponse extends ResponseRecord { surveyId: string; resumeTokenHash: string; invitationId?: string | null }
interface DemoInvitation extends InvitationRow { tokenHash: string }
interface DB {
  user: AppUser | null;
  users: AppUser[];
  projects: Project[];
  surveys: SurveyRow[];
  members: { surveyId: string; userId: string; role: MemberRow['role'] }[];
  versions: VersionRow[];
  responses: DemoResponse[];
  invitations: DemoInvitation[];
  templates: TemplateRow[];
  audit: AuditRow[];
}

const now = () => new Date().toISOString();
const id = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const delay = (ms = 60) => new Promise((r) => setTimeout(r, ms));

function seed(): DB {
  const admin: AppUser = { id: 'u_admin', email: 'admin@kdi.edu.vn', name: 'Quản trị KDI', role: 'super_admin' };
  const analyst: AppUser = { id: 'u_analyst', email: 'analyst@kdi.edu.vn', name: 'Chuyên viên phân tích', role: 'member' };
  const proj: Project = { id: 'p_stem', name: 'Giáo dục STEM 2026–2027' };
  const proj2: Project = { id: 'p_training', name: 'Đào tạo & sự kiện' };
  const db: DB = { user: null, users: [admin, analyst], projects: [proj, proj2], surveys: [], members: [], versions: [], responses: [], invitations: [], templates: [], audit: [] };

  db.templates = TEMPLATES.map((t) => ({ id: `t_${t.key}`, key: t.key, title: t.title, description: t.description, category: t.category, schema: t.schema, theme: (t.theme ?? {}) as any, settings: (t.settings ?? {}) as any, visibility: 'system' }));

  const mk = (key: string, title: string, slug: string, projectId: string, status: SurveyStatus, n: number, seedNo: number, extra: Partial<SurveyRow> = {}) => {
    const t = TEMPLATES.find((x) => x.key === key)!;
    const sid = `s_${slug}`;
    const created = new Date(Date.now() - 20 * 864e5).toISOString();
    const s: SurveyRow = {
      id: sid, projectId, title, slug, description: t.description, category: t.category, purpose: null, status,
      ownerId: admin.id, draftSchema: clone(t.schema), settings: { allowResume: true, showProgress: true, requireReview: true, access: { mode: 'public' }, ...(t.settings as any) },
      theme: (t.theme ?? {}) as any, startAt: null, endAt: null, currentVersionId: null, hasUnpublishedChanges: status === 'draft', createdAt: created, updatedAt: created, ...extra,
    };
    db.surveys.push(s);
    db.members.push({ surveyId: sid, userId: admin.id, role: 'owner' }, { surveyId: sid, userId: analyst.id, role: 'analyst' });
    if (status !== 'draft') {
      const v: VersionRow = { id: `v_${slug}_1`, surveyId: sid, versionNumber: 1, schema: clone(s.draftSchema), settings: clone(s.settings), theme: clone(s.theme), publishedAt: created };
      db.versions.push(v);
      s.currentVersionId = v.id;
      for (const r of syntheticResponses(v.schema, v.id, n, seedNo)) db.responses.push({ ...r, surveyId: sid, resumeTokenHash: '' });
    }
    db.audit.push({ id: id('a'), actor: admin.name, action: 'survey.create', entityType: 'survey', surveyId: sid, surveyTitle: title, createdAt: created });
  };
  mk('stem-needs', 'Khảo sát nhu cầu chủ đề STEM 2026–2027', 'nhu-cau-stem-2026-2027', proj.id, 'published', 64, 7,
    { description: 'Khảo sát nhu cầu triển khai các chủ đề giáo dục STEM năm học 2026–2027 dành cho các trường Mầm non, Tiểu học, THCS, THPT.' });
  mk('course-satisfaction', 'Đánh giá khóa tập huấn giáo viên STEM — Đợt 1', 'danh-gia-tap-huan-dot-1', proj2.id, 'closed', 38, 13);
  mk('event-registration', 'Đăng ký Ngày hội STEM 2026', 'dang-ky-ngay-hoi-stem', proj2.id, 'draft', 0, 0);
  return db;
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupted or blocked storage → reseed */ }
  const db = seed();
  save(db);
  return db;
}
function save(db: DB) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full / blocked */ }
}
export function resetDemo() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

function audit(db: DB, action: string, entityType: string, surveyId: string | null, after?: unknown) {
  const s = db.surveys.find((x) => x.id === surveyId);
  db.audit.unshift({ id: id('a'), actor: db.user?.name ?? 'Người trả lời', action, entityType, surveyId, surveyTitle: s?.title, createdAt: now(), after });
}

function roleOf(db: DB, surveyId: string): SurveyRow['myRole'] {
  if (!db.user) return null;
  if (db.user.role !== 'member') return 'admin';
  return db.members.find((m) => m.surveyId === surveyId && m.userId === db.user!.id)?.role ?? null;
}
function requireEdit(db: DB, surveyId: string) {
  const r = roleOf(db, surveyId);
  if (!r || r === 'analyst') throw new Error('Không có quyền chỉnh sửa khảo sát này');
}

const TRANSITIONS: [SurveyStatus, SurveyStatus][] = [
  ['published', 'paused'], ['paused', 'published'], ['published', 'closed'], ['paused', 'closed'],
  ['closed', 'published'], ['closed', 'archived'], ['draft', 'archived'], ['archived', 'draft'],
];

export const demoAdmin: AdminApi = {
  mode: 'demo',
  async currentUser() { return load().user; },
  async signIn(email) {
    const db = load();
    const u = db.users.find((x) => x.email.toLowerCase() === email.toLowerCase()) ?? db.users[0];
    db.user = u; save(db); return u;
  },
  async signUp(email, _pw, name) {
    const db = load();
    if (!db.users.some((u) => u.email === email)) db.users.push({ id: id('u'), email, name, role: 'member' });
    save(db); return { needsConfirmation: false };
  },
  async signOut() { const db = load(); db.user = null; save(db); },

  async listProjects() { return load().projects; },
  async createProject(name) { const db = load(); const p = { id: id('p'), name }; db.projects.push(p); save(db); return p; },

  async listSurveys() {
    await delay();
    const db = load();
    return db.surveys
      .filter((s) => roleOf(db, s.id))
      .map((s) => {
        const rs = db.responses.filter((r) => r.surveyId === s.id);
        return { ...s, myRole: roleOf(db, s.id), ownerName: db.users.find((u) => u.id === s.ownerId)?.name, stats: { started: rs.length, submitted: rs.filter((r) => r.status === 'submitted').length, inProgress: rs.filter((r) => r.status === 'in_progress').length } };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async getSurvey(sid) {
    const db = load();
    const s = db.surveys.find((x) => x.id === sid);
    if (!s || !roleOf(db, sid)) throw new Error('Không tìm thấy khảo sát');
    return { ...s, myRole: roleOf(db, sid) };
  },
  async createSurvey(input) {
    const db = load();
    if (!db.user) throw new Error('Chưa đăng nhập');
    if (db.surveys.some((s) => s.slug === input.slug)) throw new Error('Slug đã tồn tại');
    const s: SurveyRow = {
      id: id('s'), projectId: input.projectId ?? null, title: input.title, slug: input.slug, description: input.description ?? null,
      category: input.category ?? null, purpose: input.purpose ?? null, status: 'draft', ownerId: db.user.id, draftSchema: input.schema,
      settings: { allowResume: true, showProgress: true, requireReview: true, access: { mode: 'public' }, ...(input.settings ?? {}) },
      theme: input.theme ?? {}, startAt: null, endAt: null, currentVersionId: null, hasUnpublishedChanges: true, createdAt: now(), updatedAt: now(),
    };
    db.surveys.push(s);
    db.members.push({ surveyId: s.id, userId: db.user.id, role: 'owner' });
    audit(db, 'survey.create', 'survey', s.id);
    save(db);
    return s;
  },
  async updateSurvey(sid, patch) {
    const db = load();
    requireEdit(db, sid);
    const s = db.surveys.find((x) => x.id === sid)!;
    if (patch.slug && patch.slug !== s.slug && db.surveys.some((x) => x.slug === patch.slug)) throw new Error('Slug đã tồn tại');
    if (patch.draftSchema) s.hasUnpublishedChanges = true;
    Object.assign(s, patch, { updatedAt: now() });
    save(db);
  },
  async duplicateSurvey(sid, title, slug) {
    const db = load();
    const s = db.surveys.find((x) => x.id === sid)!;
    const created = await demoAdmin.createSurvey({ title, slug, description: s.description ?? undefined, category: s.category ?? undefined, projectId: s.projectId, schema: clone(s.draftSchema), settings: clone(s.settings), theme: clone(s.theme) });
    return created.id;
  },
  async publish(sid) {
    await delay(150);
    const db = load();
    requireEdit(db, sid);
    const s = db.surveys.find((x) => x.id === sid)!;
    if (s.status === 'archived') throw new Error('Khảo sát đã lưu trữ');
    if (!s.draftSchema.sections.length) throw new Error('Khảo sát chưa có nội dung');
    const n = db.versions.filter((v) => v.surveyId === sid).length + 1;
    const v: VersionRow = { id: id('v'), surveyId: sid, versionNumber: n, schema: clone(s.draftSchema), settings: clone(s.settings), theme: clone(s.theme), publishedAt: now() };
    db.versions.push(v);
    s.currentVersionId = v.id;
    s.hasUnpublishedChanges = false;
    if (s.status === 'draft' || s.status === 'closed') s.status = 'published';
    s.updatedAt = now();
    audit(db, 'survey.publish', 'survey_version', sid, { version: n });
    save(db);
    return v.id;
  },
  async setStatus(sid, status) {
    const db = load();
    requireEdit(db, sid);
    const s = db.surveys.find((x) => x.id === sid)!;
    if (!TRANSITIONS.some(([a, b]) => a === s.status && b === status)) throw new Error(`Không thể chuyển ${s.status} → ${status}`);
    if (status === 'published' && !s.currentVersionId) throw new Error('Cần xuất bản phiên bản trước');
    audit(db, 'survey.status', 'survey', sid, { from: s.status, to: status });
    s.status = status; s.updatedAt = now();
    save(db);
  },
  async listVersions(sid) { return load().versions.filter((v) => v.surveyId === sid).sort((a, b) => b.versionNumber - a.versionNumber); },

  async listResponses(sid) {
    await delay();
    const db = load();
    if (!roleOf(db, sid)) throw new Error('Không có quyền');
    return db.responses.filter((r) => r.surveyId === sid).map(({ resumeTokenHash: _h, surveyId: _s, invitationId: _i, ...r }) => r);
  },
  async flagResponse(rid, flag, reason, note) {
    const db = load();
    const r = db.responses.find((x) => x.id === rid)!;
    r.flag = flag; r.flagReason = reason; if (note !== undefined) r.note = note;
    audit(db, 'response.flag', 'survey_response', r.surveyId, { code: r.code, flag, reason });
    save(db);
  },
  async getFileUrl() { return null; },

  async listInvitations(sid) {
    return load().invitations.filter((i) => i.surveyId === sid).map(({ tokenHash: _t, ...i }) => i);
  },
  async createInvitations(sid, recipients, expiresAt) {
    const db = load();
    requireEdit(db, sid);
    const out: InvitationRow[] = [];
    for (const r of recipients) {
      const token = makeToken(18);
      const inv: DemoInvitation = { id: id('i'), surveyId: sid, recipientName: r.name ?? null, recipientEmail: r.email ?? null, organization: r.organization ?? null, tokenHint: token.slice(-4), status: 'pending', invitedAt: now(), completedAt: null, expiresAt: expiresAt ?? null, tokenHash: await sha256Hex(token) };
      db.invitations.push(inv);
      const { tokenHash: _x, ...pub } = inv;
      out.push({ ...pub, token });
    }
    audit(db, 'invitation.create', 'survey', sid, { count: recipients.length });
    save(db);
    return out;
  },
  async revokeInvitation(iid) {
    const db = load();
    const i = db.invitations.find((x) => x.id === iid)!;
    if (i.status !== 'completed') i.status = 'revoked';
    audit(db, 'invitation.revoke', 'survey_invitation', i.surveyId);
    save(db);
  },

  async listTemplates() { return load().templates; },
  async saveTemplate(t) { const db = load(); db.templates.push({ ...t, id: id('t'), key: null, visibility: 'organization' }); save(db); },
  async deleteTemplate(tid) { const db = load(); db.templates = db.templates.filter((t) => t.id !== tid || t.visibility === 'system'); save(db); },

  async listAudit(sid, limit = 50) { return load().audit.filter((a) => !sid || a.surveyId === sid).slice(0, limit); },
  async listMembers(sid) {
    const db = load();
    return db.members.filter((m) => m.surveyId === sid).map((m) => { const u = db.users.find((x) => x.id === m.userId)!; return { userId: u.id, email: u.email, name: u.name, role: m.role }; });
  },
  async addMember(sid, email, role) {
    const db = load();
    const u = db.users.find((x) => x.email === email);
    if (!u) throw new Error('Không tìm thấy người dùng với email này (người dùng cần đăng ký trước)');
    db.members = db.members.filter((m) => !(m.surveyId === sid && m.userId === u.id));
    db.members.push({ surveyId: sid, userId: u.id, role });
    save(db);
  },
  async removeMember(sid, uid) { const db = load(); db.members = db.members.filter((m) => !(m.surveyId === sid && m.userId === uid && m.role !== 'owner')); save(db); },
  async listUsers() { return load().users; },
  async setUserRole(uid, role) { const db = load(); db.users.find((u) => u.id === uid)!.role = role; save(db); },
  async uploadMedia(file) {
    // demo: inline as data URL (small files only)
    if (file.size > 1.5 * 1024 * 1024) throw new Error('Chế độ demo chỉ hỗ trợ ảnh ≤ 1.5MB. Hãy dán URL ảnh công khai.');
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(file); });
  },
};

// ───────────── Public respondent API (demo) ─────────────
function toPublic(s: SurveyRow, v: VersionRow): PublicSurvey {
  return { id: s.id, slug: s.slug, title: s.title, description: s.description, theme: v.theme, settings: publicSettings(v.settings), versionId: v.id, schema: v.schema };
}

async function checkAccess(db: DB, s: SurveyRow, token?: string, code?: string): Promise<DemoInvitation | null | 'requires_code'> {
  const mode = s.settings.access?.mode ?? 'public';
  if (mode === 'code') {
    if (!code) return 'requires_code';
    if (code.trim() !== (s.settings.access?.code ?? '').trim()) throw new PublicApiError('Mã truy cập không đúng', 'bad_code');
  }
  if (mode === 'invite' || token) {
    if (!token) throw new PublicApiError('Khảo sát này chỉ dành cho người được mời. Vui lòng dùng đường link riêng.', 'invalid_invitation');
    const h = await sha256Hex(token);
    const inv = db.invitations.find((i) => i.surveyId === s.id && i.tokenHash === h);
    if (!inv || inv.status === 'revoked') throw new PublicApiError('Đường link mời không hợp lệ hoặc đã bị thu hồi.', 'invalid_invitation');
    if (inv.expiresAt && new Date(inv.expiresAt) < new Date()) throw new PublicApiError('Đường link mời đã hết hạn.', 'invalid_invitation');
    if (inv.status === 'completed') throw new PublicApiError('Lời mời này đã được sử dụng để gửi phản hồi.', 'invitation_used');
    return inv;
  }
  return null;
}

function avail(db: DB, s: SurveyRow) {
  return surveyAvailability({ status: s.status, hasVersion: !!s.currentVersionId, startAt: s.startAt, endAt: s.endAt, maxResponses: s.settings.maxResponses, submittedCount: db.responses.filter((r) => r.surveyId === s.id && r.status === 'submitted').length });
}

async function loadResp(db: DB, rid: string, token: string) {
  const r = db.responses.find((x) => x.id === rid);
  if (!r || r.resumeTokenHash !== (await sha256Hex(token))) throw new PublicApiError('Phiên trả lời không hợp lệ', 'bad_session');
  return r;
}

export const demoPublic: PublicApi = {
  async get(slug, opts = {}): Promise<GetSurveyResult> {
    await delay(120);
    const db = load();
    const s = db.surveys.find((x) => x.slug === slug);
    if (!s) return { state: 'not_found', message: AVAILABILITY_MESSAGE.not_found };
    const state = avail(db, s);
    if (state !== 'open') return { state, title: s.title, message: AVAILABILITY_MESSAGE[state] };
    try {
      const acc = await checkAccess(db, s, opts.token, opts.code);
      if (acc === 'requires_code') return { state: 'requires_code', title: s.title, theme: s.theme };
      if (acc && acc.status === 'pending') { acc.status = 'opened'; save(db); }
    } catch (e) {
      if (e instanceof PublicApiError && e.code !== 'bad_code') return { state: 'invalid_invitation', message: e.message };
      throw e;
    }
    return { state: 'open', survey: toPublic(s, db.versions.find((v) => v.id === s.currentVersionId)!) };
  },
  async start(slug, opts = {}) {
    const db = load();
    const s = db.surveys.find((x) => x.slug === slug);
    if (!s) throw new PublicApiError(AVAILABILITY_MESSAGE.not_found, 'not_found');
    const state = avail(db, s);
    if (state !== 'open') throw new PublicApiError(AVAILABILITY_MESSAGE[state], state);
    const inv = await checkAccess(db, s, opts.token, opts.code);
    if (inv === 'requires_code') throw new PublicApiError('Cần mã truy cập', 'requires_code');
    const resumeToken = makeToken();
    const r: DemoResponse = {
      id: id('r'), code: makeResponseCode(), versionId: s.currentVersionId!, status: 'in_progress', startedAt: now(), answers: {}, reachedSections: [],
      surveyId: s.id, resumeTokenHash: await sha256Hex(resumeToken), invitationId: inv?.id ?? null, respondentRef: inv ? inv.organization || inv.recipientName : null,
    };
    db.responses.push(r);
    if (inv) inv.status = 'started';
    save(db);
    return { responseId: r.id, responseCode: r.code, resumeToken };
  },
  async save(rid, token, answers, sectionId) {
    const db = load();
    const r = await loadResp(db, rid, token);
    if (r.status !== 'in_progress') throw new PublicApiError('Phản hồi đã được gửi', 'already_submitted');
    r.answers = answers;
    if (sectionId && !(r.reachedSections ?? []).includes(sectionId)) r.reachedSections = [...(r.reachedSections ?? []), sectionId];
    save(db);
  },
  async resume(slug, token) {
    const db = load();
    const s = db.surveys.find((x) => x.slug === slug);
    const h = await sha256Hex(token);
    const r = db.responses.find((x) => x.surveyId === s?.id && x.resumeTokenHash === h);
    if (!s || !r) throw new PublicApiError('Không tìm thấy phiên trả lời với mã này', 'not_found');
    if (r.status !== 'in_progress') throw new PublicApiError('Phản hồi này đã được gửi', 'already_submitted');
    const v = db.versions.find((x) => x.id === r.versionId)!;
    const path = r.reachedSections ?? [];
    return { responseId: r.id, responseCode: r.code, answers: r.answers, lastSectionId: path[path.length - 1] ?? null, survey: toPublic(s, v) };
  },
  async uploadFile(rid, token, questionId, file) {
    const db = load();
    const r = await loadResp(db, rid, token);
    const v = db.versions.find((x) => x.id === r.versionId)!;
    const q = findQuestion(v.schema, questionId);
    if (!q || q.type !== 'file_upload') throw new PublicApiError('Câu hỏi không nhận tệp');
    if (file.size > (q.settings?.maxSizeMb ?? 10) * 1024 * 1024) throw new PublicApiError(`Tệp vượt quá ${q.settings?.maxSizeMb ?? 10}MB`);
    await delay(300);
    return { path: `${r.surveyId}/${r.id}/demo-${file.name}` }; // demo: file content is not stored
  },
  async submit(rid, token, answers: Answers) {
    await delay(250);
    const db = load();
    const r = await loadResp(db, rid, token);
    if (r.status === 'submitted') return { ok: true, responseCode: r.code };
    const s = db.surveys.find((x) => x.id === r.surveyId)!;
    const state = avail(db, s);
    if (state !== 'open') throw new PublicApiError(AVAILABILITY_MESSAGE[state], state);
    const v = db.versions.find((x) => x.id === r.versionId)!;
    const errors = validateAnswers(v.schema, answers);
    if (Object.keys(errors).length) throw new PublicApiError('Có câu trả lời chưa hợp lệ', 'validation', errors);
    r.answers = sanitizeAnswers(v.schema, answers);
    r.status = 'submitted';
    r.submittedAt = now();
    r.durationSeconds = Math.round((Date.now() - new Date(r.startedAt).getTime()) / 1000);
    if (r.invitationId) { const inv = db.invitations.find((i) => i.id === r.invitationId); if (inv) { inv.status = 'completed'; inv.completedAt = now(); } }
    save(db);
    return { ok: true, responseCode: r.code };
  },
};

export { cloneSchemaWithNewIds };
