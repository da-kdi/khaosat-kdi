import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, type AppUser } from '@/data';
import { PageLoader } from '@/components/ui';

interface AuthCtx { user: AppUser | null; loading: boolean; refresh: () => Promise<void>; setUser: (u: AppUser | null) => void }
const Ctx = createContext<AuthCtx>({ user: null, loading: true, refresh: async () => {}, setUser: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    try { setUser(await api.currentUser()); } catch { setUser(null); } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);
  return <Ctx.Provider value={{ user, loading, refresh, setUser }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export const isAdminRole = (u: AppUser | null) => !!u && (u.role === 'super_admin' || u.role === 'admin');
