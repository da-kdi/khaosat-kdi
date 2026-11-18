import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, isDemo } from '@/data';
import { useAuth } from '@/lib/auth';
import { Button, ErrorBox, Field, Input, Tabs } from '@/components/ui';

export default function LoginPage() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(isDemo ? 'admin@kdi.edu.vn' : '');
  const [password, setPassword] = useState(isDemo ? 'demo' : '');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={loc.state?.from ?? '/admin/dashboard'} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'in') {
        const u = await api.signIn(email, password);
        setUser(u);
        nav(loc.state?.from ?? '/admin/dashboard', { replace: true });
      } else {
        const r = await api.signUp(email, password, name);
        if (r.needsConfirmation) setInfo('Đã gửi email xác nhận. Vui lòng kiểm tra hộp thư rồi đăng nhập.');
        else { setUser(await api.signIn(email, password)); nav('/admin/dashboard'); }
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-brand-700 p-10 text-white lg:flex">
        <div className="flex items-center gap-3"><div className="rounded-lg bg-white px-3 py-2"><img src={`${import.meta.env.BASE_URL}brand/kdi-logo.png`} alt="KDI Education" className="h-8" /></div></div>
        <div>
          <div className="mb-5 h-1.5 w-16 rounded-full bg-accent-400" />
          <h1 className="text-4xl font-bold leading-tight">Hệ thống khảo sát STEM</h1>
          <p className="prose-vi mt-4 max-w-md text-brand-100">Tạo khảo sát kéo-thả, phân phối có kiểm soát và tự động tổng hợp kết quả — cho mọi chương trình của KDI Education.</p>
        </div>
        <p className="text-sm text-brand-200">© KDI Education</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <img src={`${import.meta.env.BASE_URL}brand/kdi-logo.png`} alt="KDI Education" className="h-10 lg:hidden" />
          <div>
            <h2 className="text-2xl font-bold">{mode === 'in' ? 'Đăng nhập quản trị' : 'Tạo tài khoản'}</h2>
            <p className="mt-1 text-sm text-muted">{mode === 'in' ? 'Dành cho người quản lý & phân tích khảo sát.' : 'Tài khoản đầu tiên của hệ thống sẽ là Super Admin.'}</p>
          </div>
          {isDemo && <div className="rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-700"><b>Chế độ demo</b> — dữ liệu lưu trên trình duyệt này. Dùng <code>admin@kdi.edu.vn</code> (quản trị) hoặc <code>analyst@kdi.edu.vn</code> (chỉ xem), mật khẩu bất kỳ.</div>}
          <Tabs value={mode} onChange={setMode} items={[{ value: 'in', label: 'Đăng nhập' }, { value: 'up', label: 'Đăng ký' }]} className="w-full [&>button]:flex-1" />
          {mode === 'up' && <Field label="Họ và tên"><Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></Field>}
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
          <Field label="Mật khẩu"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={isDemo ? 1 : 8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></Field>
          {err && <ErrorBox>{err}</ErrorBox>}
          {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}
          <Button type="submit" className="w-full" size="lg" loading={busy}>{mode === 'in' ? 'Đăng nhập' : 'Đăng ký'}</Button>
        </form>
      </div>
    </div>
  );
}
