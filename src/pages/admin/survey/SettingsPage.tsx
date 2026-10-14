import { useState } from 'react';
import { Save, Trash2, UserPlus } from 'lucide-react';
import type { SurveySettings, SurveyTheme } from '@core/index.ts';
import { api } from '@/data';
import { useAsync } from '@/lib/useAsync';
import { ACTION_LABEL, fmtDateTime } from '@/lib/format';
import { Badge, Button, Card, Field, Input, Select, Switch, Textarea, cn, useToast } from '@/components/ui';
import { THEME_PRESETS, resolveTheme } from '@/survey/theme';
import { useSurvey } from './SurveyLayout';

export default function SettingsPage() {
  const { survey, setSurvey, versions, canEdit } = useSurvey();
  const toast = useToast();
  const projects = useAsync(() => api.listProjects());
  const [info, setInfo] = useState({ title: survey.title, slug: survey.slug, description: survey.description ?? '', category: survey.category ?? '', purpose: survey.purpose ?? '', projectId: survey.projectId ?? '' });
  const [st, setSt] = useState<SurveySettings>(survey.settings);
  const [theme, setTheme] = useState<SurveyTheme>(survey.theme);
  const [busy, setBusy] = useState(false);
  const r = resolveTheme(theme);

  const save = async () => {
    if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(info.slug)) return toast('Slug không hợp lệ', 'error');
    if (info.slug !== survey.slug && survey.currentVersionId && !confirm('Đổi slug sẽ làm link và mã QR cũ ngừng hoạt động. Tiếp tục?')) return;
    setBusy(true);
    try {
      const patch = { title: info.title, slug: info.slug, description: info.description || null, category: info.category || null, purpose: info.purpose || null, projectId: info.projectId || null, settings: st, theme };
      await api.updateSurvey(survey.id, patch);
      setSurvey({ ...survey, ...patch });
      toast('Đã lưu. Nội dung giới thiệu/hoàn thành & giao diện áp dụng cho người trả lời ở lần xuất bản tiếp theo.');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5 sm:p-8">
      <fieldset disabled={!canEdit} className="space-y-6">
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Thông tin khảo sát</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tên khảo sát"><Input value={info.title} onChange={(e) => setInfo({ ...info, title: e.target.value })} /></Field>
            <Field label="Slug"><Input className="font-mono" value={info.slug} onChange={(e) => setInfo({ ...info, slug: e.target.value.toLowerCase() })} /></Field>
            <Field label="Dự án"><Select value={info.projectId} onChange={(e) => setInfo({ ...info, projectId: e.target.value })}><option value="">— Không —</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Danh mục"><Input value={info.category} onChange={(e) => setInfo({ ...info, category: e.target.value })} /></Field>
          </div>
          <Field label="Mô tả"><Textarea value={info.description} onChange={(e) => setInfo({ ...info, description: e.target.value })} /></Field>
          <Field label="Mục đích (nội bộ)"><Textarea className="min-h-[60px]" value={info.purpose} onChange={(e) => setInfo({ ...info, purpose: e.target.value })} /></Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Trang giới thiệu & hoàn thành</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tiêu đề giới thiệu" hint="(mặc định = tên)"><Input value={st.introTitle ?? ''} onChange={(e) => setSt({ ...st, introTitle: e.target.value || undefined })} /></Field>
            <Field label="Thời lượng dự kiến (phút)"><Input type="number" min={1} value={st.estimatedMinutes ?? ''} onChange={(e) => setSt({ ...st, estimatedMinutes: e.target.value ? Number(e.target.value) : undefined })} /></Field>
          </div>
          <Field label="Nội dung giới thiệu" hint="(mặc định = mô tả)"><Textarea value={st.introText ?? ''} onChange={(e) => setSt({ ...st, introText: e.target.value || undefined })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tiêu đề hoàn thành"><Input value={st.completionTitle ?? ''} placeholder="Cảm ơn bạn đã hoàn thành khảo sát!" onChange={(e) => setSt({ ...st, completionTitle: e.target.value || undefined })} /></Field>
            <Field label="Thông tin liên hệ"><Input value={st.contactInfo ?? ''} placeholder="Hotline / email hỗ trợ" onChange={(e) => setSt({ ...st, contactInfo: e.target.value || undefined })} /></Field>
          </div>
          <Field label="Lời cảm ơn"><Textarea value={st.completionText ?? ''} onChange={(e) => setSt({ ...st, completionText: e.target.value || undefined })} /></Field>
          <div className="flex flex-wrap gap-6">
            <Switch checked={st.showProgress !== false} onChange={(x) => setSt({ ...st, showProgress: x })} label="Thanh tiến độ" />
            <Switch checked={st.requireReview !== false} onChange={(x) => setSt({ ...st, requireReview: x })} label="Màn hình xem lại trước khi gửi" />
          </div>
          <Field label="Thời hạn lưu dữ liệu (ngày)" hint="— để trống = lưu vô thời hạn"><Input type="number" min={30} className="max-w-[200px]" value={st.retentionDays ?? ''} onChange={(e) => setSt({ ...st, retentionDays: e.target.value ? Number(e.target.value) : null })} /></Field>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Giao diện</h2>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_300px]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(THEME_PRESETS).map(([k, p]) => (
                  <button key={k} type="button" onClick={() => setTheme({ ...theme, preset: k, primary: undefined, accent: undefined, background: undefined })}
                    className={cn('rounded-xl border p-2.5 text-left text-xs transition', (theme.preset ?? 'kdi') === k ? 'border-brand-500 ring-1 ring-brand-500' : 'border-line hover:border-slate-300')}>
                    <div className="mb-2 flex h-6 overflow-hidden rounded"><span className="flex-[2]" style={{ background: p.primary }} /><span className="flex-1" style={{ background: p.accent }} /><span className="flex-1 border-l border-line" style={{ background: p.background }} /></div>{p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(['primary', 'accent', 'background'] as const).map((k) => (
                  <Field key={k} label={k === 'primary' ? 'Màu chủ đạo' : k === 'accent' ? 'Màu nhấn' : 'Màu nền'}>
                    <div className="flex items-center gap-2"><input type="color" value={r[k]} onChange={(e) => setTheme({ ...theme, [k]: e.target.value })} className="h-10 w-12 cursor-pointer rounded border border-line" /><span className="font-mono text-xs">{r[k]}</span></div>
                  </Field>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Logo (URL)" hint="— mặc định KDI"><Input value={theme.logoUrl ?? ''} onChange={(e) => setTheme({ ...theme, logoUrl: e.target.value || undefined })} /></Field>
                <Field label="Ảnh bìa (URL)"><Input value={theme.coverUrl ?? ''} onChange={(e) => setTheme({ ...theme, coverUrl: e.target.value || undefined })} /></Field>
              </div>
              <Field label="Font chữ"><Select value={theme.font ?? 'be-vietnam'} onChange={(e) => setTheme({ ...theme, font: e.target.value as SurveyTheme['font'] })} className="max-w-xs"><option value="be-vietnam">Be Vietnam Pro</option><option value="system">Hệ thống</option><option value="serif">Serif</option></Select></Field>
            </div>
            <div className="rounded-xl p-4" style={{ background: r.background }}>
              <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                {r.coverUrl && <img src={r.coverUrl} alt="" className="h-20 w-full object-cover" />}
                <div className="p-4">
                  <img src={r.logoUrl} alt="" className="h-6" />
                  <div className="mt-3 h-1 w-10 rounded" style={{ background: r.accent }} />
                  <p className="mt-2 font-bold" style={{ color: r.primary }}>{info.title}</p>
                  <div className="mt-3 rounded-lg border-2 px-3 py-2 text-xs" style={{ borderColor: r.primary }}>Lựa chọn đã chọn</div>
                  <button type="button" className="mt-3 rounded-lg px-4 py-2 text-xs font-semibold text-white" style={{ background: r.primary }}>Tiếp tục</button>
                </div>
              </div>
            </div>
          </div>
        </Card>
        {canEdit && <div className="flex justify-end"><Button onClick={save} loading={busy} size="lg"><Save className="h-4 w-4" />Lưu cài đặt</Button></div>}
      </fieldset>

      <Members />

      <Card className="p-5">
        <h2 className="font-semibold">Lịch sử phiên bản</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {versions.map((v) => <li key={v.id} className="flex items-center justify-between py-2"><span><Badge tone="blue">v{v.versionNumber}</Badge> <span className="ml-2">{v.schema.sections.flatMap((s) => s.questions).length} khối · {v.schema.sections.length} phần</span></span><span className="text-muted">{fmtDateTime(v.publishedAt)}</span></li>)}
          {!versions.length && <li className="py-2 text-muted">Chưa xuất bản phiên bản nào.</li>}
        </ul>
      </Card>
      <AuditList />
    </div>
  );
}

function Members() {
  const { survey } = useSurvey();
  const toast = useToast();
  const m = useAsync(() => api.listMembers(survey.id), [survey.id]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'analyst'>('analyst');
  const canManage = survey.myRole === 'admin' || survey.myRole === 'owner';
  const ROLE: Record<string, string> = { owner: 'Chủ sở hữu', editor: 'Biên tập', analyst: 'Phân tích (chỉ xem)' };
  return (
    <Card className="p-5">
      <h2 className="font-semibold">Phân quyền khảo sát</h2>
      <p className="mt-0.5 text-xs text-muted">Biên tập: sửa, xuất bản, phân phối. Phân tích: xem phản hồi, dashboard và xuất dữ liệu. Quyền được kiểm tra ở máy chủ (RLS).</p>
      <ul className="mt-3 divide-y divide-line text-sm">
        {m.data?.map((x) => (
          <li key={x.userId} className="flex items-center justify-between gap-2 py-2">
            <span><b>{x.name}</b> <span className="text-muted">{x.email}</span></span>
            <span className="flex items-center gap-2"><Badge tone={x.role === 'owner' ? 'purple' : x.role === 'editor' ? 'blue' : 'slate'}>{ROLE[x.role]}</Badge>
              {canManage && x.role !== 'owner' && <button onClick={async () => { await api.removeMember(survey.id, x.userId); m.reload(); }} className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600" aria-label="Gỡ"><Trash2 className="h-4 w-4" /></button>}</span>
          </li>
        ))}
      </ul>
      {canManage && (
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); try { await api.addMember(survey.id, email.trim(), role); setEmail(''); m.reload(); toast('Đã thêm thành viên'); } catch (err) { toast((err as Error).message, 'error'); } }}>
          <Input type="email" required placeholder="email@kdi.edu.vn" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-xs" />
          <Select value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'analyst')} className="w-auto"><option value="analyst">Phân tích</option><option value="editor">Biên tập</option></Select>
          <Button type="submit" variant="secondary"><UserPlus className="h-4 w-4" />Thêm</Button>
        </form>
      )}
    </Card>
  );
}

function AuditList() {
  const { survey } = useSurvey();
  const a = useAsync(() => api.listAudit(survey.id, 30), [survey.id]);
  return (
    <Card className="p-5">
      <h2 className="font-semibold">Nhật ký thao tác</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {a.data?.map((x) => <li key={x.id} className="flex justify-between gap-3"><span><b>{x.actor ?? 'Hệ thống'}</b> {ACTION_LABEL[x.action] ?? x.action}{x.after ? <span className="ml-1 font-mono text-xs text-muted">{JSON.stringify(x.after).slice(0, 60)}</span> : null}</span><span className="shrink-0 text-muted">{fmtDateTime(x.createdAt)}</span></li>)}
        {!a.data?.length && <li className="text-muted">Chưa có.</li>}
      </ul>
    </Card>
  );
}
