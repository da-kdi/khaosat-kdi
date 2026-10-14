import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Plus, TrendingUp } from 'lucide-react';
import type { SurveyStatus } from '@core/index.ts';
import { api } from '@/data';
import { useAsync } from '@/lib/useAsync';
import { ACTION_LABEL, STATUS_LABEL, STATUS_TONE, fmtNum, fmtPct, timeAgo } from '@/lib/format';
import { Badge, Button, Card, PageLoader, Select, Stat, ErrorBox } from '@/components/ui';
import { PageHeader } from './PageHeader';

export default function DashboardPage() {
  const surveys = useAsync(() => api.listSurveys());
  const projects = useAsync(() => api.listProjects());
  const audit = useAsync(() => api.listAudit(undefined, 12));
  const [project, setProject] = useState('');
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [period, setPeriod] = useState('all');

  const list = useMemo(() => {
    const since = period === 'all' ? 0 : Date.now() - Number(period) * 864e5;
    return (surveys.data ?? []).filter((s) =>
      (!project || s.projectId === project) && (!status || s.status === status) && (!owner || s.ownerId === owner) && new Date(s.createdAt).getTime() >= since);
  }, [surveys.data, project, status, owner, period]);

  const k = useMemo(() => {
    const by = (st: SurveyStatus[]) => list.filter((s) => st.includes(s.status)).length;
    const started = list.reduce((a, s) => a + (s.stats?.started ?? 0), 0);
    const submitted = list.reduce((a, s) => a + (s.stats?.submitted ?? 0), 0);
    const inProgress = list.reduce((a, s) => a + (s.stats?.inProgress ?? 0), 0);
    const rates = list.filter((s) => (s.stats?.started ?? 0) > 0).map((s) => s.stats!.submitted / s.stats!.started);
    return {
      total: list.length, active: by(['published']), draft: by(['draft']), closed: by(['closed', 'paused']),
      started, submitted, inProgress,
      pooled: started ? submitted / started : null,
      avgRate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
    };
  }, [list]);

  const top = [...list].filter((s) => (s.stats?.submitted ?? 0) > 0).sort((a, b) => b.stats!.submitted - a.stats!.submitted).slice(0, 6);
  const low = list.filter((s) => (s.stats?.started ?? 0) >= 5 && s.stats!.submitted / s.stats!.started < 0.75).sort((a, b) => a.stats!.submitted / a.stats!.started - b.stats!.submitted / b.stats!.started);
  const owners = [...new Map((surveys.data ?? []).map((s) => [s.ownerId, s.ownerName ?? s.ownerId])).entries()];

  if (surveys.loading && !surveys.data) return <PageLoader />;
  return (
    <div>
      <PageHeader title="Tổng quan" subtitle="Toàn bộ khảo sát bạn có quyền truy cập" actions={<Link to="/admin/surveys?new=1"><Button><Plus className="h-4 w-4" />Tạo khảo sát</Button></Link>} />
      <div className="space-y-6 p-5 sm:p-8">
        {surveys.error && <ErrorBox>{surveys.error}</ErrorBox>}
        <div className="flex flex-wrap gap-2">
          <Select className="w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Thời gian">
            <option value="all">Mọi thời điểm (ngày tạo)</option><option value="7">7 ngày qua</option><option value="30">30 ngày qua</option><option value="90">90 ngày qua</option>
          </Select>
          <Select className="w-auto" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Dự án">
            <option value="">Tất cả dự án</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái">
            <option value="">Mọi trạng thái</option>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select className="w-auto" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Người tạo">
            <option value="">Mọi người tạo</option>{owners.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Tổng số khảo sát" value={fmtNum(k.total)} hint={`${k.active} đang mở · ${k.draft} nháp · ${k.closed} đóng/tạm dừng`} />
          <Stat label="Phản hồi hoàn thành" value={fmtNum(k.submitted)} hint="Số phản hồi đã gửi thành công" accent />
          <Stat label="Đang làm dở" value={fmtNum(k.inProgress)} hint={`Trên ${fmtNum(k.started)} lượt bắt đầu`} />
          <Stat label="Tỷ lệ hoàn thành" value={fmtPct(k.pooled)} hint={<>Đã gửi ÷ lượt bắt đầu · TB theo khảo sát: {fmtPct(k.avgRate)}</>} />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="p-5 xl:col-span-2">
            <div className="mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-brand-600" /><h2 className="font-semibold">Khảo sát có nhiều phản hồi nhất</h2></div>
            {top.length ? (
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={top.map((s) => ({ name: s.title.length > 28 ? s.title.slice(0, 26) + '…' : s.title, submitted: s.stats!.submitted, inProgress: s.stats!.inProgress }))} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid horizontal={false} stroke="#eef1f6" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#5b6780' }} />
                    <YAxis type="category" dataKey="name" width={210} tick={{ fontSize: 12, fill: '#0f1b33' }} />
                    <Tooltip formatter={(v: any, n: any) => [v, n === 'submitted' ? 'Đã gửi' : 'Đang làm dở']} />
                    <Bar dataKey="submitted" stackId="a" fill="#154b98" barSize={22} />
                    <Bar dataKey="inProgress" stackId="a" fill="#faa934" radius={[0, 4, 4, 0]} barSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="py-10 text-center text-sm text-muted">Chưa có phản hồi nào.</p>}
            <div className="mt-2 flex gap-4 text-xs text-muted"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand-600" />Đã gửi</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-accent-400" />Đang làm dở</span></div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-accent-600" /><h2 className="font-semibold">Tỷ lệ hoàn thành thấp</h2></div>
            <p className="mb-3 text-xs text-muted">&lt; 75% và ≥ 5 lượt bắt đầu</p>
            {low.length ? low.slice(0, 5).map((s) => (
              <Link key={s.id} to={`/admin/surveys/${s.id}/analytics`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface">
                <span className="truncate">{s.title}</span><b className="tabular-nums text-accent-700">{fmtPct(s.stats!.submitted / s.stats!.started, 0)}</b>
              </Link>
            )) : <p className="py-6 text-center text-sm text-muted">Không có khảo sát nào cần chú ý.</p>}
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="overflow-hidden xl:col-span-2">
            <div className="flex items-center justify-between px-5 py-4"><h2 className="font-semibold">Khảo sát gần đây</h2><Link to="/admin/surveys" className="text-sm text-brand-700 hover:underline">Xem tất cả</Link></div>
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-5 py-2 font-medium">Khảo sát</th><th className="px-3 py-2 font-medium">Trạng thái</th><th className="px-3 py-2 text-right font-medium">Bắt đầu</th><th className="px-5 py-2 text-right font-medium">Đã gửi</th></tr></thead>
              <tbody>{list.slice(0, 6).map((s) => (
                <tr key={s.id} className="border-t border-line hover:bg-surface/60">
                  <td className="px-5 py-2.5"><Link to={`/admin/surveys/${s.id}/builder`} className="font-medium hover:text-brand-700">{s.title}</Link></td>
                  <td className="px-3 py-2.5"><Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(s.stats?.started)}</td>
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{fmtNum(s.stats?.submitted)}</td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Hoạt động quản trị</h2>
            <ul className="space-y-3">
              {(audit.data ?? []).map((a) => (
                <li key={a.id} className="flex gap-2.5 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-400" />
                  <div><p><b>{a.actor ?? 'Hệ thống'}</b> {ACTION_LABEL[a.action] ?? a.action}{a.surveyTitle && <> · <span className="text-muted">{a.surveyTitle}</span></>}</p><p className="text-xs text-muted">{timeAgo(a.createdAt)}</p></div>
                </li>
              ))}
              {!audit.data?.length && <li className="text-sm text-muted">Chưa có hoạt động.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
