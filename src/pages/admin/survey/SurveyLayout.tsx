import { createContext, useContext, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Pause, Play, Rocket, Square, Undo2, Copy, Eye, PencilLine } from 'lucide-react';
import { lintSchema, type SurveyStatus } from '@core/index.ts';
import { api, publicSurveyUrl, type SurveyRow, type VersionRow } from '@/data';
import { useAsync } from '@/lib/useAsync';
import { STATUS_LABEL, STATUS_TONE, fmtDate } from '@/lib/format';
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

/** 5 tab theo vòng đời khảo sát. "Soạn câu hỏi" gồm cả màn hình xem trước. */
const TABS: { to: string; label: string; also?: string[] }[] = [
  { to: 'builder', label: 'Soạn câu hỏi', also: ['preview'] },
  { to: 'distribution', label: 'Phát hành & tiến độ' },
  { to: 'responses', label: 'Phản hồi' },
  { to: 'analytics', label: 'Báo cáo' },
  { to: 'settings', label: 'Cài đặt' },
];

/** Mở khảo sát thì vào thẳng tab hợp với trạng thái: nháp → soạn, đang thu → phát hành, đã kết thúc → báo cáo. */
export function DefaultSurveyTab() {
  const { survey } = useSurvey();
  const to = survey.status === 'draft' ? 'builder' : survey.status === 'published' || survey.status === 'paused' ? 'distribution' : 'analytics';
  return <Navigate to={to} replace />;
}

export default function SurveyLayout() {
  const { id = '' } = useParams();
  const s = useAsync(() => api.getSurvey(id), [id]);
  const v = useAsync(() => api.listVersions(id), [id]);
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [confirmPublish, setConfirmPublish] = useState(false);
  const { pathname } = useLocation();

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
  const onPreview = pathname.endsWith('/preview');
  const onSoan = onPreview || pathname.endsWith('/builder');
  const live = survey.currentVersionId && ['published', 'paused'].includes(survey.status);

  return (
    <SurveyCtx.Provider value={{ survey, versions: v.data ?? [], reload: s.reload, reloadVersions: v.reload, setSurvey: (x) => s.setData(x), canEdit }}>
      <div className="border-b border-line bg-white">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-3 sm:px-8">
          <div className="flex min-w-0 flex-[1_1_360px] items-center gap-2">
            <Link to="/admin/surveys" className="rounded-md border border-line p-1 text-muted hover:bg-slate-100" aria-label="Về danh sách khảo sát" title="Về danh sách khảo sát"><ArrowLeft className="h-4 w-4" /></Link>
            <h1 className="min-w-[8rem] truncate text-base font-bold" title={survey.title}>{survey.title}</h1>
            <Badge tone={STATUS_TONE[survey.status]}>{STATUS_LABEL[survey.status]}</Badge>
            {v.data?.[0] && <Badge tone="blue">v{v.data[0].versionNumber}</Badge>}
            {!canEdit && <Badge>Chỉ xem</Badge>}
            <span className="hidden whitespace-nowrap text-xs text-muted md:inline">
              {survey.currentVersionId ? <><b className="tabular-nums text-ink">{survey.stats?.submitted ?? 0}</b> đã gửi · {fmtDate(survey.startAt)} – {survey.endAt ? fmtDate(survey.endAt) : 'không thời hạn'}</> : <span className="font-mono">/s/{survey.slug}</span>}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {onSoan && <Link to={onPreview ? 'builder' : 'preview'}><Button size="sm" variant="outline">{onPreview ? <><PencilLine className="h-4 w-4" />Quay lại soạn</> : <><Eye className="h-4 w-4" />Xem trước & kiểm tra</>}</Button></Link>}
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
                {live && <Button size="sm" variant="outline" loading={busy === 'closed'} onClick={() => confirm('Kết thúc khảo sát? Người trả lời sẽ không thể gửi thêm. Có thể mở lại sau.') && doStatus('closed', 'Đã kết thúc khảo sát')}><Square className="h-4 w-4" />Kết thúc</Button>}
                {survey.status === 'archived' && <Button size="sm" variant="outline" loading={busy === 'draft'} onClick={() => doStatus('draft', 'Đã khôi phục về bản nháp')}><Undo2 className="h-4 w-4" />Khôi phục</Button>}
                {survey.status !== 'archived' && (survey.hasUnpublishedChanges || !survey.currentVersionId || survey.status === 'closed') && (
                  <Button size="sm" className="bg-accent-400 text-ink hover:bg-accent-300" onClick={() => setConfirmPublish(true)}><Rocket className="h-4 w-4" />{survey.currentVersionId ? (survey.status === 'closed' ? 'Mở lại & xuất bản' : `Xuất bản phiên bản ${(v.data?.length ?? 0) + 1}`) : 'Xuất bản'}</Button>
                )}
              </>
            )}
          </div>
        </div>
        <nav className="thin-scroll mt-2 flex gap-1 overflow-x-auto px-4 sm:px-7" role="tablist">
          {TABS.map((t, i) => {
            const active = [t.to, ...(t.also ?? [])].some((p) => pathname.endsWith('/' + p));
            return (
              <NavLink key={t.to} to={t.to} role="tab" aria-selected={active} className={cn('flex items-center gap-2 whitespace-nowrap border-b-[3px] px-3 py-2 text-sm font-medium transition', active ? 'border-brand-600 font-semibold text-brand-700' : 'border-transparent text-muted hover:text-ink')}>
                <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold', active ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface')}>{t.to === 'settings' ? '⚙' : i + 1}</span>{t.label}
              </NavLink>
            );
          })}
          {survey.hasUnpublishedChanges && survey.currentVersionId && <span className="my-auto ml-auto shrink-0" title="Người trả lời vẫn thấy phiên bản đang phát hành cho tới khi xuất bản lại."><Badge tone="orange">Có thay đổi chưa xuất bản</Badge></span>}
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
