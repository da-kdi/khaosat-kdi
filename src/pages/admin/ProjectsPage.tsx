import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '@/data';
import { useAsync } from '@/lib/useAsync';
import { isAdminRole, useAuth } from '@/lib/auth';
import { Button, Card, ErrorBox, Input, PageLoader, useToast } from '@/components/ui';
import { PageHeader } from './PageHeader';

/** 4.2. Dự án / phòng ban — nhóm khảo sát theo dự án. */
export default function ProjectsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const projects = useAsync(() => api.listProjects());
  const surveys = useAsync(() => api.listSurveys());
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  if (!isAdminRole(user)) return <div className="p-8"><ErrorBox>Chỉ quản trị viên được truy cập trang này.</ErrorBox></div>;
  const add = async () => {
    if (!name.trim()) return;
    try { await api.createProject(name.trim()); setName(''); setAdding(false); projects.reload(); toast('Đã thêm dự án'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const rows = (projects.data ?? []).map((p) => {
    const ss = (surveys.data ?? []).filter((s) => s.projectId === p.id);
    const owners = [...new Set(ss.map((s) => s.ownerName).filter(Boolean))];
    return { p, total: ss.length, live: ss.filter((s) => s.status === 'published').length, owners };
  });
  const none = (surveys.data ?? []).filter((s) => !s.projectId).length;
  return (
    <div>
      <PageHeader title="4.2. Dự án / phòng ban" actions={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Thêm dự án</Button>} />
      <div className="space-y-4 px-5 pb-8 pt-3 sm:px-8">
        {adding && (
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <Input autoFocus className="h-9 max-w-md" placeholder="Tên dự án hoặc phòng ban" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <Button size="sm" onClick={add} disabled={!name.trim()}>Lưu</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Hủy</Button>
          </Card>
        )}
        {projects.loading && !projects.data ? <PageLoader /> : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-brand-600 text-left text-white"><tr>
                <th className="px-3 py-2.5 text-center font-semibold">STT</th><th className="px-3 py-2.5 font-semibold">Dự án / phòng ban</th><th className="px-3 py-2.5 font-semibold">Người tạo khảo sát</th>
                <th className="px-3 py-2.5 text-center font-semibold">Số khảo sát</th><th className="px-3 py-2.5 text-center font-semibold">Đang thu thập</th><th className="px-3 py-2.5 text-center font-semibold">Thao tác</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.p.id} className="border-t border-line">
                    <td className="px-3 py-2.5 text-center tabular-nums text-muted">{i + 1}</td>
                    <td className="px-3 py-2.5 font-semibold">{r.p.name}{r.p.description && <p className="text-xs font-normal text-muted">{r.p.description}</p>}</td>
                    <td className="px-3 py-2.5 text-muted">{r.owners.join(', ') || '—'}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{r.total}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{r.live}</td>
                    <td className="px-3 py-2.5 text-center"><Link to={`/admin/surveys?project=${r.p.id}`}><Button size="sm" variant="outline">Xem khảo sát</Button></Link></td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">Chưa có dự án.</td></tr>}
              </tbody>
            </table>
          </Card>
        )}
        {none > 0 && <p className="text-xs text-muted">{none} khảo sát chưa gắn dự án (gắn trong tab Cài đặt của khảo sát).</p>}
      </div>
    </div>
  );
}
