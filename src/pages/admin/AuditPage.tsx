import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '@/data';
import { useAsync } from '@/lib/useAsync';
import { isAdminRole, useAuth } from '@/lib/auth';
import { ACTION_LABEL, fmtDateTime } from '@/lib/format';
import { Button, Card, ErrorBox, PageLoader, Select } from '@/components/ui';
import { PageHeader } from './PageHeader';

/** 4.3. Nhật ký thao tác toàn hệ thống. */
export default function AuditPage() {
  const { user } = useAuth();
  const a = useAsync(() => api.listAudit(undefined, 500));
  const [actor, setActor] = useState('');
  const [survey, setSurvey] = useState('');
  const [action, setAction] = useState('');
  const all = a.data ?? [];
  const opts = useMemo(() => ({
    actors: [...new Set(all.map((x) => x.actor ?? 'Hệ thống'))].sort(),
    surveys: [...new Set(all.map((x) => x.surveyTitle).filter(Boolean) as string[])].sort(),
    actions: [...new Set(all.map((x) => x.action))].sort(),
  }), [all]);
  if (!isAdminRole(user)) return <div className="p-8"><ErrorBox>Chỉ quản trị viên được truy cập trang này.</ErrorBox></div>;
  const list = all.filter((x) => (!actor || (x.actor ?? 'Hệ thống') === actor) && (!survey || x.surveyTitle === survey) && (!action || x.action === action));
  const label = (k: string) => { const l = ACTION_LABEL[k] ?? k; return l.charAt(0).toUpperCase() + l.slice(1); };
  const csv = () => {
    const rows = [['Thời gian', 'Người thực hiện', 'Thao tác', 'Khảo sát'], ...list.map((x) => [fmtDateTime(x.createdAt), x.actor ?? 'Hệ thống', label(x.action), x.surveyTitle ?? ''])];
    const el = document.createElement('a');
    el.href = URL.createObjectURL(new Blob(['﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }));
    el.download = `nhat-ky-${new Date().toISOString().slice(0, 10)}.csv`; el.click();
  };
  return (
    <div>
      <PageHeader title="4.3. Nhật ký thao tác" actions={<Button variant="outline" onClick={csv} disabled={!list.length}><Download className="h-4 w-4" />Tải nhật ký</Button>} />
      <div className="space-y-4 px-5 pb-8 pt-3 sm:px-8">
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1.5"><b>Người thực hiện:</b><Select className="h-9 w-auto" value={actor} onChange={(e) => setActor(e.target.value)}><option value="">Tất cả</option>{opts.actors.map((x) => <option key={x}>{x}</option>)}</Select></label>
          <label className="flex items-center gap-1.5"><b>Khảo sát:</b><Select className="h-9 w-auto max-w-[280px]" value={survey} onChange={(e) => setSurvey(e.target.value)}><option value="">Tất cả</option>{opts.surveys.map((x) => <option key={x}>{x}</option>)}</Select></label>
          <label className="flex items-center gap-1.5"><b>Thao tác:</b><Select className="h-9 w-auto" value={action} onChange={(e) => setAction(e.target.value)}><option value="">Tất cả</option>{opts.actions.map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select></label>
        </div>
        {a.loading && !a.data ? <PageLoader /> : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-brand-600 text-left text-white"><tr><th className="px-3 py-2.5 font-semibold">Thời gian</th><th className="px-3 py-2.5 font-semibold">Người thực hiện</th><th className="px-3 py-2.5 font-semibold">Thao tác</th><th className="px-3 py-2.5 font-semibold">Khảo sát</th></tr></thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.id} className="border-t border-line"><td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{fmtDateTime(x.createdAt)}</td><td className="px-3 py-2.5">{x.actor ?? 'Hệ thống'}</td><td className="px-3 py-2.5 font-semibold">{label(x.action)}</td><td className="px-3 py-2.5 text-muted">{x.surveyTitle ?? '—'}</td></tr>
                ))}
                {!list.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted">Không có thao tác nào.</td></tr>}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
