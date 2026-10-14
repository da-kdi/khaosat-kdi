import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, Copy, FilePlus2, LayoutGrid, List, Plus, Search, Sparkles } from 'lucide-react';
import { blankSchema, cloneSchemaWithNewIds } from '@core/index.ts';
import { api, type SurveyRow, type TemplateRow } from '@/data';
import { useAsync } from '@/lib/useAsync';
import { STATUS_LABEL, STATUS_TONE, fmtDate, fmtNum, fmtPct, slugify } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageLoader, Select, Tabs, Textarea, cn, useToast } from '@/components/ui';
import { PageHeader } from './PageHeader';

export default function SurveysPage() {
  const surveys = useAsync(() => api.listSurveys());
  const projects = useAsync(() => api.listProjects());
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [project, setProject] = useState('');
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [dup, setDup] = useState<SurveyRow | null>(null);

  const list = useMemo(() => (surveys.data ?? []).filter((s) =>
    (!status ? s.status !== 'archived' : s.status === status) && (!project || s.projectId === project) &&
    (!q || `${s.title} ${s.slug} ${s.category ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [surveys.data, q, status, project]);
  const pname = (id: string | null) => projects.data?.find((p) => p.id === id)?.name ?? '—';

  return (
    <div>
      <PageHeader title="Khảo sát" subtitle="Survey Workspace · quản lý theo dự án, trạng thái và mục đích"
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Tạo khảo sát</Button>} />
      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Tìm theo tên, slug, danh mục…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái">
            <option value="">Đang dùng (trừ lưu trữ)</option>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select className="w-auto" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Dự án">
            <option value="">Tất cả dự án</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <div className="ml-auto"><Tabs value={view} onChange={setView} items={[{ value: 'table', label: <List className="h-4 w-4" /> }, { value: 'cards', label: <LayoutGrid className="h-4 w-4" /> }]} /></div>
        </div>
        {surveys.error && <ErrorBox>{surveys.error}</ErrorBox>}
        {surveys.loading && !surveys.data ? <PageLoader /> : !list.length ? (
          <Card><Empty icon={<ClipboardList className="h-10 w-10" />} title="Chưa có khảo sát nào">Tạo khảo sát mới từ đầu hoặc từ thư viện mẫu.<div className="mt-4"><Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Tạo khảo sát</Button></div></Empty></Card>
        ) : view === 'table' ? (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-5 py-2.5 font-medium">Khảo sát</th><th className="px-3 py-2.5 font-medium">Dự án</th><th className="px-3 py-2.5 font-medium">Trạng thái</th><th className="px-3 py-2.5 text-right font-medium">Đã gửi / bắt đầu</th><th className="px-3 py-2.5 text-right font-medium">Hoàn thành</th><th className="px-3 py-2.5 font-medium">Cập nhật</th><th className="px-5 py-2.5" /></tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-t border-line hover:bg-surface/60">
                    <td className="px-5 py-3">
                      <Link to={`/admin/surveys/${s.id}/builder`} className="font-medium hover:text-brand-700">{s.title}</Link>
                      <p className="mt-0.5 font-mono text-xs text-muted">/s/{s.slug}{s.hasUnpublishedChanges && s.currentVersionId && <span className="ml-2 font-sans text-accent-700">• có thay đổi chưa xuất bản</span>}</p>
                    </td>
                    <td className="px-3 py-3 text-muted">{pname(s.projectId)}</td>
                    <td className="px-3 py-3"><Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge></td>
                    <td className="px-3 py-3 text-right tabular-nums"><b>{fmtNum(s.stats?.submitted)}</b> / {fmtNum(s.stats?.started)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{s.stats?.started ? fmtPct(s.stats.submitted / s.stats.started, 0) : '—'}</td>
                    <td className="px-3 py-3 text-muted">{fmtDate(s.updatedAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Link to={`/admin/surveys/${s.id}/analytics`}><Button size="sm" variant="ghost">Phân tích</Button></Link>
                        <Button size="sm" variant="ghost" onClick={() => setDup(s)} title="Nhân bản"><Copy className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((s) => (
              <Card key={s.id} className="flex flex-col p-5 transition hover:border-brand-200 hover:shadow-sm">
                <div className="flex items-start justify-between gap-2"><Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge><span className="text-xs text-muted">{pname(s.projectId)}</span></div>
                <Link to={`/admin/surveys/${s.id}/builder`} className="mt-3 font-semibold leading-snug hover:text-brand-700">{s.title}</Link>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{s.description}</p>
                <div className="mt-auto flex items-end justify-between pt-4">
                  <div><p className="text-2xl font-semibold tabular-nums">{fmtNum(s.stats?.submitted)}</p><p className="text-xs text-muted">phản hồi đã gửi</p></div>
                  <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setDup(s)}><Copy className="h-4 w-4" /></Button><Link to={`/admin/surveys/${s.id}/analytics`}><Button size="sm" variant="secondary">Phân tích</Button></Link></div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <NewSurveyModal open={creating} onClose={() => { setCreating(false); if (params.get('new')) setParams({}); }} projects={projects.data ?? []} onProjectCreated={projects.reload} />
      {dup && <DuplicateModal survey={dup} onClose={() => setDup(null)} onDone={surveys.reload} />}
    </div>
  );
}

function NewSurveyModal({ open, onClose, projects, onProjectCreated, preset }: { open: boolean; onClose: () => void; projects: { id: string; name: string }[]; onProjectCreated: () => void; preset?: TemplateRow }) {
  const nav = useNavigate();
  const toast = useToast();
  const templates = useAsync(() => (open ? api.listTemplates() : Promise.resolve([])), [open]);
  const [tpl, setTpl] = useState<string>(preset?.id ?? 'blank');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [newProject, setNewProject] = useState('');
  const [category, setCategory] = useState('');
  const [purpose, setPurpose] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!slugTouched) setSlug(slugify(title)); }, [title, slugTouched]);
  useEffect(() => { if (preset) setTpl(preset.id); }, [preset]);
  const chosen = templates.data?.find((t) => t.id === tpl);
  useEffect(() => { if (chosen && !title) { setTitle(chosen.title); setCategory(chosen.category ?? ''); } }, [chosen]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    setErr('');
    if (!title.trim()) return setErr('Vui lòng nhập tên khảo sát');
    if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(slug)) return setErr('Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang (≥ 3 ký tự)');
    setBusy(true);
    try {
      let pid: string | null = projectId || null;
      if (projectId === '__new' && newProject.trim()) { pid = (await api.createProject(newProject.trim())).id; onProjectCreated(); }
      const s = await api.createSurvey({
        title: title.trim(), slug, category: category || undefined, purpose: purpose || undefined, projectId: pid === '__new' ? null : pid,
        description: chosen?.description ?? undefined,
        schema: chosen ? cloneSchemaWithNewIds(chosen.schema) : blankSchema(),
        settings: chosen?.settings, theme: chosen?.theme,
      });
      toast('Đã tạo khảo sát');
      nav(`/admin/surveys/${s.id}/builder`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Tạo khảo sát mới" size="lg" footer={<><Button variant="outline" onClick={onClose}>Hủy</Button><Button onClick={create} loading={busy}>Tạo và mở Builder</Button></>}>
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium">Bắt đầu từ</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <TemplateTile active={tpl === 'blank'} onClick={() => setTpl('blank')} icon={<FilePlus2 className="h-5 w-5" />} title="Khảo sát trống" text="Tự thiết kế từ đầu" />
            {templates.data?.map((t) => <TemplateTile key={t.id} active={tpl === t.id} onClick={() => { setTpl(t.id); if (!title || templates.data?.some((x) => x.title === title)) { setTitle(t.title); setCategory(t.category ?? ''); } }} icon={<Sparkles className="h-5 w-5" />} title={t.title} text={t.description ?? ''} />)}
          </div>
        </div>
        <Field label="Tên khảo sát"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Khảo sát nhu cầu chủ đề STEM 2026–2027" autoFocus /></Field>
        <Field label="Đường dẫn" hint="(slug)">
          <div className="flex items-center rounded-lg border border-line bg-surface pl-3 text-sm text-muted focus-within:border-brand-400">
            <span>/s/</span><input className="h-10 flex-1 bg-transparent px-1 font-mono text-ink outline-none" value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }} />
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dự án / Phòng ban">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— Không thuộc dự án —</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="__new">+ Tạo dự án mới…</option>
            </Select>
            {projectId === '__new' && <Input className="mt-2" placeholder="Tên dự án mới" value={newProject} onChange={(e) => setNewProject(e.target.value)} />}
          </Field>
          <Field label="Danh mục"><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="VD: Giáo dục STEM, Hài lòng…" /></Field>
        </div>
        <Field label="Mục đích khảo sát" hint="(nội bộ)"><Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} className="min-h-[64px]" placeholder="Dữ liệu dùng để làm gì? Ai sử dụng?" /></Field>
        {err && <ErrorBox>{err}</ErrorBox>}
      </div>
    </Modal>
  );
}
export { NewSurveyModal };

function TemplateTile({ active, onClick, icon, title, text }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex gap-3 rounded-xl border p-3 text-left transition', active ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-line hover:border-slate-300')}>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-muted')}>{icon}</span>
      <span className="min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="line-clamp-2 text-xs text-muted">{text}</span></span>
    </button>
  );
}

function DuplicateModal({ survey, onClose, onDone }: { survey: SurveyRow; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(`${survey.title} (bản sao)`);
  const [slug, setSlug] = useState(`${survey.slug}-ban-sao`.slice(0, 80));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const toast = useToast();
  const go = async () => {
    setBusy(true); setErr('');
    try { const id = await api.duplicateSurvey(survey.id, title, slug); toast('Đã nhân bản khảo sát (bản nháp, chưa có phản hồi)'); onDone(); nav(`/admin/surveys/${id}/builder`); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Nhân bản khảo sát" footer={<><Button variant="outline" onClick={onClose}>Hủy</Button><Button onClick={go} loading={busy}>Nhân bản</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-muted">Bản sao giữ nguyên cấu trúc, mã câu hỏi, giao diện và cài đặt — không sao chép phản hồi.</p>
        <Field label="Tên mới"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Slug mới"><Input className="font-mono" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} /></Field>
        {err && <ErrorBox>{err}</ErrorBox>}
      </div>
    </Modal>
  );
}
