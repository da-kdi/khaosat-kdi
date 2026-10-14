import { createContext, useContext, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Pause, Play, Rocket, Square, Archive, Undo2, Copy } from 'lucide-react';
import { lintSchema, type SurveyStatus } from '@core/index.ts';
import { api, publicSurveyUrl, type SurveyRow, type VersionRow } from '@/data';
import { useAsync } from '@/lib/useAsync';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/format';
import { Badge, Button, ErrorBox, Modal, PageLoader, cn, useToast } from '@/components/ui';

interface Ctx {
  survey: SurveyRow;
  versions: VersionRow[];
  reload: () => Promise<void>;
  reloadVersions: () => Promise<void>;
  setSurvey: (s: SurveyRow) => void;
  canEdit: boolean;
}
const SurveyCtx = createContext<Ctx>(null!);
export const useSurvey = () => useContext(SurveyCtx);

const TABS = [
  { to: 'builder', label: 'Thiết kế' },
  { to: 'preview', label: 'Xem trước' },
  { to: 'distribution', label: 'Phân phối' },
  { to: 'responses', label: 'Phản hồi' },
  { to: 'analytics', label: 'Phân tích' },
  { to: 'settings', label: 'Cài đặt' },
];

export default function SurveyLayout() {
  const { id = '' } = useParams();
  const s = useAsync(() => api.getSurvey(id), [id]);
  const v = useAsync(() => api.listVersions(id), [id]);
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [confirmPublish, setConfirmPublish] = useState(false);

  if (s.loading && !s.data) return <PageLoader />;
  if (s.error || !s.data) return <div className="p-8"><ErrorBox>{s.error || 'Không tìm thấy khảo sát'}</ErrorBox></div>;
  const survey = s.data;
  const canEdit = survey.myRole === 'admin' || survey.myRole === 'owner' || survey.myRole === 'editor';
  const issues = lintSchema(survey.draftSchema);

  const doStatus = async (st: SurveyStatus, label: string) => {
    setBusy(st);
    try { await api.setStatus(survey.id, st); await s.reload(); toast(label); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); }
  };
  const publish = async () => {
    setBusy('publish');
    try { await api.publish(survey.id); await Promise.all([s.reload(), v.reload()]); toast(`Đã xuất bản phiên bản ${(v.data?.length ?? 0) + 1}`); setConfirmPublish(false); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); }
  };
  const live = survey.currentVersionId && ['published', 'paused'].includes(survey.status);

  return (
    <SurveyCtx.Provider value={{ survey, versions: v.data ?? [], reload: s.reload, reloadVersions: v.reload, setSurvey: (x) => s.setData(x), canEdit }}>
      <div className="border-b border-line bg-white">
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4 sm:px-8">
          <Link to="/admin/surveys" className="rounded-md p-1 text-muted hover:bg-slate-100" aria-label="Quay lại"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-bold">{survey.title}</h1>
              <Badge tone={STATUS_TONE[survey.status]}>{STATUS_LABEL[survey.status]}</Badge>
              {v.data?.[0] && <Badge tone="blue">v{v.data[0].versionNumber}</Badge>}
              {survey.hasUnpublishedChanges && survey.currentVersionId && <Badge tone="orange">Có thay đổi chưa xuất bản</Badge>}
              {!canEdit && <Badge>Chỉ xem</Badge>}
            </div>
            <p className="mt-0.5 font-mono text-xs text-muted">/s/{survey.slug}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {survey.currentVersionId && (
              <>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(publicSurveyUrl(survey.slug)); toast('Đã sao chép link'); }}><Copy className="h-4 w-4" />Link</Button>
                <a href={publicSurveyUrl(survey.slug)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><ExternalLink className="h-4 w-4" />Mở</Button></a>
              </>
            )}
            {canEdit && (
              <>
                {survey.status === 'published' && <Button size="sm" variant="outline" loading={busy === 'paused'} onClick={() => doStatus('paused', 'Đã tạm dừng nhận phản hồi')}><Pause className="h-4 w-4" />Tạm dừng</Button>}
                {survey.status === 'paused' && <Button size="sm" variant="outline" loading={busy === 'published'} onClick={() => doStatus('published', 'Đã mở lại khảo sát')}><Play className="h-4 w-4" />Mở lại</Button>}
                {live && <Button size="sm" variant="outline" loading={busy === 'closed'} onClick={() => confirm('Đóng khảo sát? Người trả lời sẽ không thể gửi thêm.') && doStatus('closed', 'Đã đóng khảo sát')}><Square className="h-4 w-4" />Đóng</Button>}
                {(survey.status === 'closed' || survey.status === 'draft') && <Button size="sm" variant="ghost" loading={busy === 'archived'} onClick={() => confirm('Lưu trữ khảo sát? Khảo sát sẽ ẩn khỏi danh sách mặc định, dữ liệu được giữ nguyên.') && doStatus('archived', 'Đã lưu trữ')}><Archive className="h-4 w-4" />Lưu trữ</Button>}
                {survey.status === 'archived' && <Button size="sm" variant="outline" loading={busy === 'draft'} onClick={() => doStatus('draft', 'Đã khôi phục về bản nháp')}><Undo2 className="h-4 w-4" />Khôi phục</Button>}
                {survey.status !== 'archived' && (survey.hasUnpublishedChanges || !survey.currentVersionId || survey.status === 'closed') && (
                  <Button size="sm" onClick={() => setConfirmPublish(true)}><Rocket className="h-4 w-4" />{survey.currentVersionId ? (survey.status === 'closed' ? 'Mở lại & xuất bản' : 'Xuất bản thay đổi') : 'Xuất bản'}</Button>
                )}
              </>
            )}
          </div>
        </div>
        <nav className="thin-scroll mt-3 flex gap-1 overflow-x-auto px-4 sm:px-7">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => cn('whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition', isActive ? 'border-accent-400 text-brand-700' : 'border-transparent text-muted hover:text-ink')}>{t.label}</NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
      <Modal open={confirmPublish} onClose={() => setConfirmPublish(false)} title="Xuất bản khảo sát" footer={<><Button variant="outline" onClick={() => setConfirmPublish(false)}>Hủy</Button><Button onClick={publish} loading={busy === 'publish'} disabled={issues.length > 0}><Rocket className="h-4 w-4" />Xuất bản phiên bản {(v.data?.length ?? 0) + 1}</Button></>}>
        <div className="space-y-3 text-sm">
          <p>Hệ thống sẽ tạo <b>phiên bản {(v.data?.length ?? 0) + 1}</b> bất biến từ bản nháp hiện tại.</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>Phản hồi mới sẽ dùng phiên bản này; phản hồi cũ vẫn hiển thị theo đúng phiên bản lúc người dùng trả lời.</li>
            <li>Người đang làm dở tiếp tục trên phiên bản họ đã bắt đầu.</li>
            <li>Giữ nguyên <b>mã câu hỏi</b> và <b>mã lựa chọn</b> để số liệu so sánh được giữa các phiên bản.</li>
          </ul>
          {issues.length > 0 && <ErrorBox><div><b>Cần sửa trước khi xuất bản:</b><ul className="mt-1 list-disc pl-4">{issues.slice(0, 6).map((i, k) => <li key={k}>{i.message}</li>)}</ul></div></ErrorBox>}
        </div>
      </Modal>
    </SurveyCtx.Provider>
  );
}
