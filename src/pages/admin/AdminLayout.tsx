import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, LayoutTemplate, Users, LogOut, Menu, X, RotateCcw } from 'lucide-react';
import { api, isDemo } from '@/data';
import { resetDemo } from '@/data/demo';
import { isAdminRole, useAuth } from '@/lib/auth';
import { Badge, cn } from '@/components/ui';

const NAV = [
  { to: '/admin/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { to: '/admin/surveys', label: 'Khảo sát', icon: ClipboardList },
  { to: '/admin/templates', label: 'Thư viện mẫu', icon: LayoutTemplate },
  { to: '/admin/users', label: 'Người dùng', icon: Users, adminOnly: true },
];

export default function AdminLayout() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const logout = async () => { await api.signOut(); setUser(null); nav('/admin/login'); };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <img src="/brand/kdi-logo.png" alt="KDI Education" className="h-8" />
      </div>
      <p className="px-4 pb-3 text-xs font-semibold uppercase tracking-wider text-brand-700">Hệ thống khảo sát STEM</p>
      <nav className="flex-1 space-y-0.5 px-2">
        {NAV.filter((n) => !n.adminOnly || isAdminRole(user)).map((n) => (
          <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)}
            className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition', isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-brand-50 hover:text-brand-700')}>
            <n.icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />{n.label}
          </NavLink>
        ))}
      </nav>
      {isDemo && (
        <div className="mx-3 mb-3 rounded-lg border border-accent-200 bg-accent-50 p-3 text-xs text-accent-700">
          <b>Chế độ demo</b> · dữ liệu lưu trong trình duyệt.
          <button onClick={() => { if (confirm('Xóa toàn bộ dữ liệu demo và tạo lại dữ liệu mẫu?')) { resetDemo(); location.href = '/admin/login'; } }} className="mt-1.5 flex items-center gap-1 font-semibold hover:underline"><RotateCcw className="h-3 w-3" />Khôi phục dữ liệu mẫu</button>
        </div>
      )}
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">{user?.name?.[0]?.toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-muted">{user?.role === 'member' ? 'Thành viên' : user?.role === 'admin' ? 'Quản trị' : 'Super Admin'}</p>
          </div>
          <button onClick={logout} className="rounded-md p-1.5 text-muted hover:bg-slate-100" title="Đăng xuất" aria-label="Đăng xuất"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/30" />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white px-4 py-2.5 lg:hidden">
          <button onClick={() => setOpen(!open)} className="rounded-md p-1.5 hover:bg-slate-100" aria-label="Menu">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          <img src="/brand/kdi-logo.png" alt="KDI" className="h-7" />
          {isDemo && <Badge tone="orange">Demo</Badge>}
        </div>
        <Outlet />
      </div>
    </div>
  );
}
