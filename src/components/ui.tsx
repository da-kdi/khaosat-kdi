import { createContext, forwardRef, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2, X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

/** clsx + tailwind-merge: later classes win (e.g. a caller's `w-auto` overrides the default `w-full`) */
export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

// ───────────── Button ─────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'outline';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  accent: 'bg-accent-400 text-ink hover:bg-accent-300 shadow-sm',
  secondary: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  outline: 'border border-line bg-white text-ink hover:bg-surface',
  ghost: 'text-muted hover:bg-brand-50 hover:text-brand-700',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'icon'; loading?: boolean }>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...p }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'focus-ring inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        size === 'icon' && 'h-9 w-9',
        variants[variant],
        className,
      )}
      {...p}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  ),
);

// ───────────── Form controls ─────────────
const field = 'focus-ring w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400 transition focus:border-brand-400 disabled:bg-slate-50';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ className, invalid, ...p }, ref) => (
  <input ref={ref} className={cn(field, 'h-10', invalid && 'border-red-400', className)} {...p} />
));
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(({ className, invalid, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, 'min-h-[88px] py-2 leading-relaxed', invalid && 'border-red-400', className)} {...p} />
));
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(({ className, invalid, children, ...p }, ref) => (
  <select ref={ref} className={cn(field, 'h-10 pr-8', invalid && 'border-red-400', className)} {...p}>{children}</select>
));
export function Label({ children, hint, className, htmlFor }: { children: ReactNode; hint?: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1.5 block text-sm font-medium text-ink', className)}>
      {children}
      {hint && <span className="ml-1 font-normal text-muted">{hint}</span>}
    </label>
  );
}
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <div className={className}><Label hint={hint}>{label}</Label>{children}</div>;
}
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex cursor-pointer select-none items-center gap-2.5 text-sm', disabled && 'opacity-50')}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('focus-ring relative h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-slate-300')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}

// ───────────── Display ─────────────
export function Card({ children, className, ...p }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-line bg-white', className)} {...p}>{children}</div>;
}
export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: 'slate' | 'blue' | 'green' | 'orange' | 'red' | 'purple'; className?: string }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    orange: 'bg-accent-50 text-accent-700',
    red: 'bg-red-50 text-red-700',
    purple: 'bg-violet-50 text-violet-700',
  };
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-600', className)} />;
}
export function PageLoader() {
  return <div className="flex h-64 items-center justify-center"><Spinner className="h-7 w-7" /></div>;
}
export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-brand-300">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}
export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{children}</div>;
}

// ───────────── Modal ─────────────
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal className={cn('animate-in flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl',
        size === 'sm' && 'sm:max-w-md', size === 'md' && 'sm:max-w-lg', size === 'lg' && 'sm:max-w-2xl', size === 'xl' && 'sm:max-w-4xl')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="focus-ring rounded-md p-1 text-muted hover:bg-slate-100" aria-label="Đóng"><X className="h-5 w-5" /></button>
        </div>
        <div className="thin-scroll overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ───────────── Tabs ─────────────
export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-lg bg-slate-100 p-1', className)} role="tablist">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)}
          className={cn('focus-ring rounded-md px-3 py-1.5 text-sm font-medium transition', value === it.value ? 'bg-white text-brand-700 shadow-sm' : 'text-muted hover:text-ink')}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ───────────── Toast ─────────────
type Toast = { id: number; tone: 'success' | 'error' | 'info'; text: string };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cn('animate-in pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-lg',
            t.tone === 'success' && 'bg-emerald-600 text-white', t.tone === 'error' && 'bg-red-600 text-white', t.tone === 'info' && 'bg-brand-700 text-white')}>
            {t.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : t.tone === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <Card className={cn('p-4', accent && 'border-brand-200 bg-brand-50/40')}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
