import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, LayoutTemplate, Settings2, ChevronDown, LogOut, RotateCcw } from 'lucide-react';
import { api, isDemo } from '@/data';
import { resetDemo } from '@/data/demo';
import { isAdminRole, useAuth } from '@/lib/auth';
import { Badge, cn } from '@/components/ui';

/** Menu ngang của phân hệ Khảo sát. Khi gắn vào hệ thống chung, thanh này nằm dưới tab "Khảo sát". */
const NAV = [
  { to: '/admin/dashboard', label: '1. Tổng quan', icon: LayoutDashboard },
  { to: '/admin/surveys', label: '2. Khảo sát', icon: ClipboardList },
  { to: '/admin/templates', label: '3. Thư viện mẫu', icon: LayoutTemplate },
];
const ADMIN_SUB = [
  { to: '/admin/users', label: '4.1. Người dùng & vai trò', hint: 'Ai được vào, quyền gì' },
  { to: '/admin/projects', label: '4.2. Dự án / phòng ban', hint: 'Nhóm khảo sát theo dự án' },
  { to: '/admin/audit', label: '4.3. Nhật ký thao tác', hint: 'Ai đã làm gì, lúc nào' },
];

const item = (active: boolean) => cn(
  'flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 py-2.5 text-sm font-medium transition',
  active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-transparent text-muted hover:text-ink',
);

export default function AdminLayout() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const ddRef = useRef<HTMLDivElement>(null);
  const logout = async () => { await api.signOut(); setUser(null); nav('/admin/login'); };
  const adminActive = ADMIN_SUB.some((s) => loc.pathname.startsWith(s.to));

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ddRef.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="thin-scroll flex items-stretch gap-0.5 overflow-x-auto px-4">
          <span className="mr-2 flex shrink-0 items-center gap-2 border-r border-line py-2 pr-4 text-sm font-bold text-brand-700">
            <b className="rounded bg-brand-600 px-1.5 py-0.5 text-xs tracking-wide text-white">KDI</b>Hệ thống khảo sát STEM
          </span>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => item(isActive)}><n.icon className="h-4 w-4" />{n.label}</NavLink>
          ))}
          {isAdminRole(user) && (
            <div ref={ddRef} className="relative flex">
              <button type="button" className={item(adminActive)} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
                <Settings2 className="h-4 w-4" />4. Quản trị<ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
              {open && (
                <div role="menu" className="fixed z-40 mt-[42px] min-w-[260px] rounded-md border border-line bg-white py-1 shadow-lg">
                  {ADMIN_SUB.map((s) => (
                    <NavLink key={s.to} to={s.to} role="menuitem" className={({ isActive }) => cn('block px-4 py-2.5 text-sm', isActive ? 'bg-brand-600 text-white' : 'hover:bg-brand-50')}>
                      {s.label}<small className="block text-xs opacity-75">{s.hint}</small>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2 pl-4">
            {isDemo && (
              <>
                <Badge tone="orange">Demo</Badge>
                <button onClick={() => { if (confirm('Xóa toàn bộ dữ liệu demo và tạo lại dữ liệu mẫu?')) { resetDemo(); location.href = import.meta.env.BASE_URL + 'admin/login'; } }} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50" title="Khôi phục dữ liệu mẫu"><RotateCcw className="h-3.5 w-3.5" /><span className="hidden xl:inline">Khôi phục dữ liệu mẫu</span></button>
              </>
            )}
            <span className="hidden text-sm sm:inline" title={user?.email}>{user?.name}</span>
            <button onClick={logout} className="rounded-md p-1.5 text-muted hover:bg-slate-100" title="Đăng xuất" aria-label="Đăng xuất"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
