import { useMemo, useState } from 'react';
import { LayoutTemplate, Trash2, Eye, BookmarkPlus } from 'lucide-react';
import { isInputQuestion, type SurveySchema } from '@core/index.ts';
import { api, type TemplateRow } from '@/data';
import { useAsync } from '@/lib/useAsync';
import { Badge, Button, Card, Empty, Field, Input, Modal, PageLoader, Select, Textarea, useToast } from '@/components/ui';
import { resolveTheme } from '@/survey/theme';
import { SurveyForm } from '@/survey/SurveyForm';
import { PageHeader } from './PageHeader';
import { NewSurveyModal } from './SurveysPage';

const count = (s: SurveySchema) => s.sections.flatMap((x) => x.questions).filter(isInputQuestion).length;

export default function TemplatesPage() {
  const t = useAsync(() => api.listTemplates());
  const projects = useAsync(() => api.listProjects());
  const toast = useToast();
  const [preview, setPreview] = useState<TemplateRow | null>(null);
  const [use, setUse] = useState<TemplateRow | null>(null);
  const [cat, setCat] = useState('');
  const [saving, setSaving] = useState(false);
  const cats = useMemo(() => [...new Set((t.data ?? []).map((x) => x.category).filter(Boolean) as string[])].sort(), [t.data]);
  const list = (t.data ?? []).filter((x) => !cat || x.category === cat);
  return (
    <div>
      <PageHeader title="3. Thư viện mẫu" actions={<Button variant="outline" onClick={() => setSaving(true)}><BookmarkPlus className="h-4 w-4" />Lưu khảo sát thành mẫu</Button>} />
      <div className="space-y-4 px-5 pb-8 pt-3 sm:px-8">
        <label className="flex items-center gap-1.5 text-sm"><b>Danh mục:</b>
          <Select className="h-9 w-auto" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Tất cả</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
        </label>
        {t.loading && !t.data ? <PageLoader /> : !list.length ? <Card><Empty icon={<LayoutTemplate className="h-10 w-10" />} title="Chưa có mẫu" /></Card> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((x) => (
              <Card key={x.id} className="flex flex-col overflow-hidden p-5 pt-0">
                <span className="-mx-5 mb-4 block h-1.5" style={{ background: resolveTheme(x.theme).primary }} />
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={x.visibility === 'system' ? 'purple' : 'blue'}>{x.visibility === 'system' ? 'Mẫu hệ thống' : 'Mẫu tổ chức'}</Badge>
                  {x.category && <span className="text-xs text-muted">{x.category}</span>}
                </div>
                <h3 className="mt-3 font-semibold">{x.title}</h3>
                <p className="mt-1 line-clamp-3 text-sm text-muted">{x.description}</p>
                <p className="mt-3 text-xs text-muted">{x.category ? `${x.category} · ` : ''}{count(x.schema)} câu · {x.schema.sections.length} phần · khoảng {x.settings?.estimatedMinutes ?? Math.max(2, Math.round(count(x.schema) / 2))} phút</p>
                <div className="mt-auto flex gap-2 pt-4">
                  <Button size="sm" variant="outline" onClick={() => setPreview(x)}><Eye className="h-4 w-4" />Xem</Button>
                  <Button size="sm" onClick={() => setUse(x)}>Dùng mẫu này</Button>
                  {x.visibility !== 'system' && <Button size="sm" variant="ghost" className="ml-auto" onClick={async () => { if (!confirm('Xóa mẫu này?')) return; await api.deleteTemplate(x.id); t.reload(); toast('Đã xóa mẫu'); }} aria-label="Xóa"><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </Card>
            ))}
          </div>
        )}
        <p className="rounded border border-dashed border-line bg-white px-3 py-2 text-xs text-muted"><b>Mỗi khảo sát tạo từ mẫu là một bản sao riêng:</b> sửa khảo sát không làm đổi mẫu gốc; mã câu hỏi được giữ để so sánh giữa các đợt.</p>
      </div>
      {saving && <SaveFromSurvey onClose={() => setSaving(false)} onSaved={t.reload} />}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.title} size="xl">
        {preview && <div className="-mx-5 -my-4 h-[70vh] overflow-y-auto"><SurveyForm embedded survey={{ title: preview.title, description: preview.description, settings: preview.settings, theme: preview.theme, schema: preview.schema }} onSubmit={async () => toast('Đây là bản xem trước mẫu', 'info')} /></div>}
      </Modal>
      {use && <NewSurveyModal open onClose={() => setUse(null)} projects={projects.data ?? []} onProjectCreated={projects.reload} preset={use} />}
    </div>
  );
}

/** Chọn một khảo sát có sẵn để lưu thành mẫu. */
function SaveFromSurvey({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const surveys = useAsync(() => api.listSurveys());
  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const s = surveys.data?.find((x) => x.id === id);
  const pick = (v: string) => { setId(v); const x = surveys.data?.find((y) => y.id === v); setTitle(x?.title ?? ''); setDesc(x?.description ?? ''); };
  const save = async () => {
    if (!s) return;
    setBusy(true);
    try {
      const full = await api.getSurvey(s.id);
      await api.saveTemplate({ title, description: desc, category: full.category, schema: full.draftSchema, theme: full.theme, settings: { ...full.settings, access: { mode: 'public' } } });
      toast('Đã lưu vào thư viện mẫu'); onSaved(); onClose();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Lưu khảo sát thành mẫu" footer={<><Button variant="outline" onClick={onClose}>Hủy</Button><Button onClick={save} loading={busy} disabled={!s || !title.trim()}>Lưu mẫu</Button></>}>
      <div className="space-y-4">
        <Field label="Khảo sát"><Select value={id} onChange={(e) => pick(e.target.value)}><option value="">— Chọn khảo sát —</option>{surveys.data?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
        <Field label="Tên mẫu"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Mô tả"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <p className="text-xs text-muted">Mẫu lưu câu hỏi, giao diện và cài đặt; không lưu phản hồi, mã truy cập hay lời mời.</p>
      </div>
    </Modal>
  );
}
