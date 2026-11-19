import { api, isDemo, type AppUser } from '@/data';
import { useAsync } from '@/lib/useAsync';
import { isAdminRole, useAuth } from '@/lib/auth';
import { useState } from 'react';
import { Card, ErrorBox, Input, PageLoader, Select, useToast } from '@/components/ui';
import { PageHeader } from './PageHeader';

export default function UsersPage() {
  const { user } = useAuth();
  const users = useAsync(() => api.listUsers());
  const toast = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  if (!isAdminRole(user)) return <div className="p-8"><ErrorBox>Chỉ quản trị viên được truy cập trang này.</ErrorBox></div>;
  const change = async (u: AppUser, role: AppUser['role']) => {
    if (role === 'super_admin' && user?.role !== 'super_admin') return toast('Chỉ Super Admin được cấp quyền Super Admin', 'error');
    try { await api.setUserRole(u.id, role); users.reload(); toast('Đã cập nhật vai trò'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <div>
      <PageHeader title="4.1. Người dùng & vai trò" />
      <div className="space-y-4 px-5 pb-8 pt-3 sm:px-8">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Input className="h-9 max-w-[340px] flex-1" placeholder="Tìm theo tên hoặc email" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-1.5"><b>Vai trò:</b><Select className="h-9 w-auto" value={role} onChange={(e) => setRole(e.target.value)}><option value="">Tất cả</option><option value="super_admin">Super Admin</option><option value="admin">Quản trị</option><option value="member">Thành viên</option></Select></label>
        </div>
        {users.loading && !users.data ? <PageLoader /> : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-brand-600 text-left text-white"><tr><th className="px-3 py-2.5 text-center font-semibold">STT</th><th className="px-5 py-2.5 font-semibold">Người dùng</th><th className="px-3 py-2.5 font-semibold">Email</th><th className="px-5 py-2.5 font-medium">Vai trò</th></tr></thead>
              <tbody>{users.data?.filter((u) => (!role || u.role === role) && (!q.trim() || `${u.name} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase()))).map((u, i) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted">{i + 1}</td>
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
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5 text-sm">
            <h2 className="mb-3 font-semibold">Vai trò hệ thống làm được gì</h2>
            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2">
              <dt className="font-semibold">Super Admin</dt><dd className="text-muted">Toàn quyền, kể cả cấp quyền Super Admin</dd>
              <dt className="font-semibold">Quản trị</dt><dd className="text-muted">Thấy và quản lý mọi khảo sát, dự án, nhật ký</dd>
              <dt className="font-semibold">Thành viên</dt><dd className="text-muted">Chỉ thấy khảo sát mình tạo hoặc được thêm vào</dd>
            </dl>
          </Card>
          <Card className="p-5 text-sm">
            <h2 className="mb-2 font-semibold">Quyền theo từng khảo sát</h2>
            <p className="text-muted">Đặt trong <b className="text-ink">hồ sơ khảo sát → tab Cài đặt → Phân quyền</b>: Chủ sở hữu, Biên tập, Phân tích (chỉ xem kết quả, dữ liệu cá nhân luôn bị che).</p>
            {!isDemo && <p className="mt-2 text-muted">Người dùng mới tự đăng ký tại trang đăng nhập (có thể tắt đăng ký công khai trong Supabase Auth và mời qua email).</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
