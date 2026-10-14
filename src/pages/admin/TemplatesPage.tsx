import { useState } from 'react';
import { LayoutTemplate, Trash2, Eye } from 'lucide-react';
import { isInputQuestion, type SurveySchema } from '@core/index.ts';
import { api, type TemplateRow } from '@/data';
import { useAsync } from '@/lib/useAsync';
import { Badge, Button, Card, Empty, Modal, PageLoader, useToast } from '@/components/ui';
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
  return (
    <div>
      <PageHeader title="Thư viện mẫu" subtitle="Tạo khảo sát mới từ mẫu — mỗi khảo sát là bản sao độc lập, mã câu hỏi được giữ để so sánh giữa các đợt." />
      <div className="p-5 sm:p-8">
        {t.loading && !t.data ? <PageLoader /> : !t.data?.length ? <Card><Empty icon={<LayoutTemplate className="h-10 w-10" />} title="Chưa có mẫu" /></Card> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {t.data.map((x) => (
              <Card key={x.id} className="flex flex-col p-5">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={x.visibility === 'system' ? 'purple' : 'blue'}>{x.visibility === 'system' ? 'Mẫu hệ thống' : 'Mẫu tổ chức'}</Badge>
                  {x.category && <span className="text-xs text-muted">{x.category}</span>}
                </div>
                <h3 className="mt-3 font-semibold">{x.title}</h3>
                <p className="mt-1 line-clamp-3 text-sm text-muted">{x.description}</p>
                <p className="mt-3 text-xs text-muted">{x.schema.sections.length} phần · {count(x.schema)} câu hỏi</p>
                <div className="mt-auto flex gap-2 pt-4">
                  <Button size="sm" variant="outline" onClick={() => setPreview(x)}><Eye className="h-4 w-4" />Xem</Button>
                  <Button size="sm" onClick={() => setUse(x)}>Dùng mẫu này</Button>
                  {x.visibility !== 'system' && <Button size="sm" variant="ghost" className="ml-auto" onClick={async () => { if (!confirm('Xóa mẫu này?')) return; await api.deleteTemplate(x.id); t.reload(); toast('Đã xóa mẫu'); }} aria-label="Xóa"><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.title} size="xl">
        {preview && <div className="-mx-5 -my-4 h-[70vh] overflow-y-auto"><SurveyForm embedded survey={{ title: preview.title, description: preview.description, settings: preview.settings, theme: preview.theme, schema: preview.schema }} onSubmit={async () => toast('Đây là bản xem trước mẫu', 'info')} /></div>}
      </Modal>
      {use && <NewSurveyModal open onClose={() => setUse(null)} projects={projects.data ?? []} onProjectCreated={projects.reload} preset={use} />}
    </div>
  );
}
