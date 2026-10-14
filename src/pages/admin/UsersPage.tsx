import { api, isDemo, type AppUser } from '@/data';
import { useAsync } from '@/lib/useAsync';
import { isAdminRole, useAuth } from '@/lib/auth';
import { Card, ErrorBox, PageLoader, Select, useToast } from '@/components/ui';
import { PageHeader } from './PageHeader';

export default function UsersPage() {
  const { user } = useAuth();
  const users = useAsync(() => api.listUsers());
  const toast = useToast();
  if (!isAdminRole(user)) return <div className="p-8"><ErrorBox>Chỉ quản trị viên được truy cập trang này.</ErrorBox></div>;
  const change = async (u: AppUser, role: AppUser['role']) => {
    if (role === 'super_admin' && user?.role !== 'super_admin') return toast('Chỉ Super Admin được cấp quyền Super Admin', 'error');
    try { await api.setUserRole(u.id, role); users.reload(); toast('Đã cập nhật vai trò'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <div>
      <PageHeader title="Người dùng" subtitle="Vai trò hệ thống. Quyền theo từng khảo sát được gán trong tab Cài đặt của khảo sát." />
      <div className="space-y-4 p-5 sm:p-8">
        <Card className="p-4 text-sm text-muted">
          <b className="text-ink">Super Admin / Quản trị</b>: thấy và quản lý mọi khảo sát. <b className="text-ink">Thành viên</b>: tạo khảo sát của mình và truy cập khảo sát được chia sẻ.
          {!isDemo && ' Người dùng mới tự đăng ký tại trang đăng nhập (có thể tắt đăng ký công khai trong Supabase Auth và mời qua email).'}
        </Card>
        {users.loading && !users.data ? <PageLoader /> : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-5 py-2.5 font-medium">Người dùng</th><th className="px-3 py-2.5 font-medium">Email</th><th className="px-5 py-2.5 font-medium">Vai trò</th></tr></thead>
              <tbody>{users.data?.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-5 py-2.5 font-medium">{u.name}{u.id === user?.id && <span className="ml-2 text-xs text-muted">(bạn)</span>}</td>
                  <td className="px-3 py-2.5 text-muted">{u.email}</td>
                  <td className="px-5 py-2.5">
                    <Select className="h-9 w-48" value={u.role} disabled={u.id === user?.id} onChange={(e) => change(u, e.target.value as AppUser['role'])}>
                      <option value="member">Thành viên</option><option value="admin">Quản trị</option><option value="super_admin">Super Admin</option>
                    </Select>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
