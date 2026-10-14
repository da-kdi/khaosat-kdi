import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, FileText, ImageOff, Loader2, Paperclip, Play, Star, X, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { OTHER_CODE, otherKey, type Answers, type ChoiceOption, type FileValue, type GridValue, type MediaRef, type Question } from '@core/index.ts';
import { cn } from '@/components/ui';
import { PROVINCES } from './provinces';
import { isSafeUrl, parseVideo } from './theme';

const inputCls = 'w-full rounded-lg border bg-white px-3 text-[15px] text-ink placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-[color:var(--survey-primary)]/30 focus:border-[color:var(--survey-primary)]';

export interface FieldProps {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
  answers: Answers;
  setAnswer: (key: string, v: unknown) => void;
  invalid?: boolean;
  onUpload?: (file: File) => Promise<{ path: string }>;
  disabled?: boolean;
}

const active = (opts?: ChoiceOption[]) => (opts ?? []).filter((o) => o.active !== false);

// ───────────── content blocks & media ─────────────
export function MediaView({ media }: { media: MediaRef }) {
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  if (!media.url || !isSafeUrl(media.url)) return null;
  if (media.kind === 'image') {
    return (
      <figure className="my-2">
        {failed ? (
          <div className="flex h-40 items-center justify-center gap-2 rounded-lg bg-slate-100 text-sm text-muted"><ImageOff className="h-5 w-5" />Không tải được hình ảnh</div>
        ) : (
          <img src={media.url} alt={media.alt ?? ''} loading="lazy" onError={() => setFailed(true)} className="max-h-[420px] w-full rounded-lg object-contain" />
        )}
        {media.caption && <figcaption className="mt-1.5 text-center text-sm text-muted">{media.caption}</figcaption>}
      </figure>
    );
  }
  if (media.kind === 'video') {
    const v = parseVideo(media.url);
    if (v.kind === 'link') return <LinkCard url={media.url} text={media.text || 'Mở video'} caption={media.caption} />;
    return (
      <figure className="my-2">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-900">
          {playing || v.kind === 'file' ? (
            v.kind === 'file' ? <video src={v.embed} controls preload="metadata" className="h-full w-full" /> :
              <iframe src={v.embed} title={media.caption || 'Video'} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          ) : (
            <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 flex items-center justify-center" aria-label="Phát video">
              {v.thumb && <img src={v.thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-90" />}
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition group-hover:scale-105"><Play className="ml-1 h-7 w-7 text-slate-900" /></span>
            </button>
          )}
        </div>
        {media.caption && <figcaption className="mt-1.5 text-center text-sm text-muted">{media.caption}</figcaption>}
      </figure>
    );
  }
  return <LinkCard url={media.url} text={media.text || media.url} caption={media.caption} newTab={media.newTab !== false} file={media.kind === 'file'} />;
}

function LinkCard({ url, text, caption, newTab = true, file }: { url: string; text: string; caption?: string; newTab?: boolean; file?: boolean }) {
  return (
    <a href={url} target={newTab ? '_blank' : undefined} rel="noopener noreferrer"
      className="my-2 flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 transition hover:border-[color:var(--survey-primary)]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 survey-primary-text">{file || /\.pdf$/i.test(url) ? <FileText className="h-5 w-5" /> : <ExternalLink className="h-5 w-5" />}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium survey-primary-text">{text}</span>
        {caption && <span className="block text-sm text-muted">{caption}</span>}
      </span>
    </a>
  );
}

export function ContentBlock({ q }: { q: Question }) {
  switch (q.type) {
    case 'heading': {
      const L = q.settings?.level ?? 2;
      return <div>{L === 1 ? <h2 className="text-2xl font-bold">{q.title}</h2> : L === 2 ? <h3 className="text-xl font-semibold">{q.title}</h3> : <h4 className="text-lg font-semibold">{q.title}</h4>}{q.description && <p className="prose-vi mt-1 text-muted whitespace-pre-line">{q.description}</p>}</div>;
    }
    case 'paragraph':
      return <div className="prose-vi whitespace-pre-line text-[15px]">{q.title && q.title !== 'Đoạn văn' && <p className="mb-1 font-semibold">{q.title}</p>}{q.description}</div>;
    case 'instruction': {
      const tone = q.settings?.tone ?? 'info';
      const Icon = tone === 'warning' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info;
      return (
        <div className={cn('flex gap-3 rounded-xl border p-4', tone === 'info' && 'border-brand-100 bg-brand-50/60', tone === 'warning' && 'border-accent-200 bg-accent-50', tone === 'success' && 'border-emerald-200 bg-emerald-50')}>
          <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', tone === 'info' && 'text-brand-600', tone === 'warning' && 'text-accent-600', tone === 'success' && 'text-emerald-600')} />
          <div className="prose-vi text-[15px]"><p className="font-semibold">{q.title}</p>{q.description && <p className="mt-1 whitespace-pre-line text-slate-700">{q.description}</p>}</div>
        </div>
      );
    }
    case 'image': case 'video': case 'link':
      return <div>{q.title && !['Hình ảnh', 'Video', 'Liên kết / Tài liệu'].includes(q.title) && <p className="mb-1 font-semibold">{q.title}</p>}{q.description && <p className="mb-2 text-sm text-muted">{q.description}</p>}{q.media && <MediaView media={q.media} />}</div>;
    case 'divider':
      return <hr className="border-line" />;
    default:
      return null;
  }
}

// ───────────── shared bits ─────────────
function ChoiceTile({ checked, onClick, children, type, disabled }: { checked: boolean; onClick: () => void; children: ReactNode; type: 'radio' | 'checkbox'; disabled?: boolean }) {
  return (
    <button type="button" role={type} aria-checked={checked} disabled={disabled} onClick={onClick}
      className={cn('flex w-full items-center gap-3 rounded-lg border bg-white px-3.5 py-3 text-left text-[15px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--survey-primary)]/40',
        checked ? 'border-[color:var(--survey-primary)] bg-[color:var(--survey-primary)]/[0.06]' : 'border-line hover:border-slate-300', disabled && 'cursor-not-allowed opacity-50')}>
      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center border-2 transition', type === 'radio' ? 'rounded-full' : 'rounded-md',
        checked ? 'border-[color:var(--survey-primary)] bg-[color:var(--survey-primary)]' : 'border-slate-300')}>
        {checked && (type === 'radio' ? <span className="h-2 w-2 rounded-full bg-white" /> : <svg viewBox="0 0 12 12" className="h-3 w-3 text-white"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>)}
      </span>
      <span className="leading-snug">{children}</span>
    </button>
  );
}

function OtherInput({ q, answers, setAnswer, show }: { q: Question; answers: Answers; setAnswer: FieldProps['setAnswer']; show: boolean }) {
  if (!show) return null;
  return <input className={cn(inputCls, 'mt-2 h-11 border-line')} placeholder="Ghi rõ…" value={String(answers[otherKey(q.id)] ?? '')} onChange={(e) => setAnswer(otherKey(q.id), e.target.value)} maxLength={500} aria-label="Ghi rõ lựa chọn khác" />;
}

// ───────────── question inputs ─────────────
export function QuestionInput(p: FieldProps) {
  const { q, value, onChange, invalid, disabled } = p;
  const s = q.settings ?? {};
  const border = invalid ? 'border-red-400' : 'border-line';

  switch (q.type) {
    case 'short_text': case 'email': case 'phone': case 'url':
      return <input className={cn(inputCls, 'h-11', border)} type={q.type === 'email' ? 'email' : q.type === 'url' ? 'url' : q.type === 'phone' ? 'tel' : 'text'}
        inputMode={q.type === 'phone' ? 'tel' : q.type === 'email' ? 'email' : undefined} autoComplete={q.type === 'email' ? 'email' : q.type === 'phone' ? 'tel' : 'off'}
        placeholder={q.placeholder} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} maxLength={q.validation?.maxLength ?? 500} disabled={disabled} />;
    case 'long_text':
      return (
        <div>
          <textarea className={cn(inputCls, 'min-h-[120px] py-2.5 leading-relaxed', border)} placeholder={q.placeholder} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} maxLength={q.validation?.maxLength ?? 5000} disabled={disabled} />
          {q.validation?.maxLength && <p className="mt-1 text-right text-xs text-muted">{String(value ?? '').length}/{q.validation.maxLength}</p>}
        </div>
      );
    case 'number': case 'currency': case 'percentage':
      return (
        <div className="relative max-w-xs">
          <input className={cn(inputCls, 'h-11 pr-14', border)} type="number" inputMode="decimal" placeholder={q.placeholder} min={q.validation?.min} max={q.validation?.max}
            value={value === undefined || value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} disabled={disabled} />
          {(q.type === 'currency' || q.type === 'percentage') && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{q.type === 'percentage' ? '%' : s.currency ?? 'VND'}</span>}
        </div>
      );
    case 'date': case 'time': case 'datetime':
      return <input className={cn(inputCls, 'h-11 max-w-xs', border)} type={q.type === 'datetime' ? 'datetime-local' : q.type} value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)} disabled={disabled} />;

    case 'single_choice': case 'yes_no': {
      const opts = active(q.options);
      return (
        <div>
          <div className={cn('grid gap-2', q.type === 'yes_no' ? 'grid-cols-2 max-w-sm' : opts.length > 6 ? 'sm:grid-cols-2' : '')} role="radiogroup">
            {opts.map((o) => <ChoiceTile key={o.id} type="radio" checked={value === o.code} onClick={() => onChange(o.code)} disabled={disabled}>{o.label}</ChoiceTile>)}
            {s.allowOther && <ChoiceTile type="radio" checked={value === OTHER_CODE} onClick={() => onChange(OTHER_CODE)} disabled={disabled}>{s.otherLabel || 'Khác'}</ChoiceTile>}
          </div>
          <OtherInput q={q} answers={p.answers} setAnswer={p.setAnswer} show={value === OTHER_CODE} />
        </div>
      );
    }
    case 'dropdown':
      return <DropdownInput {...p} />;
    case 'multiple_choice': {
      const opts = active(q.options);
      const sel = (Array.isArray(value) ? value : []) as string[];
      const excl = new Set(s.exclusiveCodes ?? []);
      const toggle = (code: string) => {
        if (sel.includes(code)) return onChange(sel.filter((c) => c !== code));
        if (excl.has(code)) return onChange([code]);
        const next = [...sel.filter((c) => !excl.has(c)), code];
        if (s.maxSelect && next.length > s.maxSelect) return;
        onChange(next);
      };
      return (
        <div>
          {(s.minSelect || s.maxSelect) && <p className="mb-2 text-sm text-muted">{s.minSelect ? `Chọn ít nhất ${s.minSelect}` : ''}{s.minSelect && s.maxSelect ? ', ' : ''}{s.maxSelect ? `tối đa ${s.maxSelect}` : ''} lựa chọn · đã chọn {sel.length}</p>}
          <div className={cn('grid gap-2', opts.length > 6 && 'sm:grid-cols-2')}>
            {opts.map((o) => <ChoiceTile key={o.id} type="checkbox" checked={sel.includes(o.code)} onClick={() => toggle(o.code)} disabled={disabled || (!sel.includes(o.code) && !!s.maxSelect && sel.length >= s.maxSelect && !excl.has(o.code))}>{o.label}</ChoiceTile>)}
            {s.allowOther && <ChoiceTile type="checkbox" checked={sel.includes(OTHER_CODE)} onClick={() => toggle(OTHER_CODE)} disabled={disabled}>{s.otherLabel || 'Khác'}</ChoiceTile>}
          </div>
          <OtherInput q={q} answers={p.answers} setAnswer={p.setAnswer} show={sel.includes(OTHER_CODE)} />
        </div>
      );
    }
    case 'rating': {
      const max = s.scaleMax ?? 5;
      const n = Number(value ?? 0);
      return (
        <div className="flex items-center gap-1" role="radiogroup" aria-label={q.title}>
          {Array.from({ length: max }, (_, i) => i + 1).map((i) => (
            <button key={i} type="button" role="radio" aria-checked={n === i} aria-label={`${i} sao`} disabled={disabled} onClick={() => onChange(i)}
              className="rounded-md p-1 transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--survey-primary)]/40">
              <Star className={cn('h-8 w-8', i <= n ? 'fill-[color:var(--survey-accent)] text-[color:var(--survey-accent)]' : 'text-slate-300')} />
            </button>
          ))}
          {n > 0 && <span className="ml-2 text-sm text-muted">{n}/{max}</span>}
        </div>
      );
    }
    case 'likert': {
      const opts = active(q.options);
      return (
        <div className="grid gap-2 sm:grid-flow-col sm:auto-cols-fr" role="radiogroup">
          {opts.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={value === o.code} disabled={disabled} onClick={() => onChange(o.code)}
              className={cn('rounded-lg border px-2 py-2.5 text-center text-sm leading-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--survey-primary)]/40',
                value === o.code ? 'border-[color:var(--survey-primary)] bg-[color:var(--survey-primary)] text-white' : 'border-line bg-white hover:border-slate-300')}>{o.label}</button>
          ))}
        </div>
      );
    }
    case 'nps':
      return (
        <div>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11" role="radiogroup">
            {Array.from({ length: 11 }, (_, i) => i).map((i) => (
              <button key={i} type="button" role="radio" aria-checked={value === i} disabled={disabled} onClick={() => onChange(i)}
                className={cn('h-11 rounded-lg border text-sm font-semibold tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--survey-primary)]/40',
                  value === i ? 'border-[color:var(--survey-primary)] bg-[color:var(--survey-primary)] text-white' : 'border-line bg-white hover:border-slate-300')}>{i}</button>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-muted"><span>0 · {s.minLabel || 'Không có khả năng'}</span><span>{s.maxLabel || 'Rất có khả năng'} · 10</span></div>
        </div>
      );
    case 'ranking': {
      const opts = active(q.options);
      const order = (Array.isArray(value) && value.length === opts.length ? value : opts.map((o) => o.code)) as string[];
      const move = (i: number, d: number) => {
        const next = [...order];
        const j = i + d;
        if (j < 0 || j >= next.length) return;
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
      };
      return (
        <div>
          <ol className="space-y-2">
            {order.map((code, i) => (
              <li key={code} className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full survey-accent-bg text-sm font-bold text-ink">{i + 1}</span>
                <span className="flex-1 text-[15px]">{opts.find((o) => o.code === code)?.label}</span>
                <button type="button" className="rounded p-1.5 text-muted hover:bg-slate-100 disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0 || disabled} aria-label="Lên"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" className="rounded p-1.5 text-muted hover:bg-slate-100 disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === order.length - 1 || disabled} aria-label="Xuống"><ArrowDown className="h-4 w-4" /></button>
              </li>
            ))}
          </ol>
          {!Array.isArray(value) && <button type="button" onClick={() => onChange(order)} className="mt-2 text-sm font-medium survey-primary-text underline-offset-2 hover:underline">Xác nhận thứ tự hiện tại</button>}
        </div>
      );
    }
    case 'matrix': {
      const rows = active(q.rows), cols = active(q.options);
      const m = (value ?? {}) as Record<string, string | string[]>;
      const set = (r: string, c: string) => {
        if (s.multiPerRow) {
          const cur = Array.isArray(m[r]) ? (m[r] as string[]) : [];
          onChange({ ...m, [r]: cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c] });
        } else onChange({ ...m, [r]: c });
      };
      const isOn = (r: string, c: string) => (Array.isArray(m[r]) ? (m[r] as string[]).includes(c) : m[r] === c);
      return (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="hidden w-full border-separate border-spacing-y-1 text-sm sm:table">
            <thead><tr><th />{cols.map((c) => <th key={c.id} className="px-2 pb-1 text-center font-medium text-muted">{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="bg-white">
                  <td className="rounded-l-lg border-y border-l border-line px-3 py-2.5 font-medium">{r.label}</td>
                  {cols.map((c, ci) => (
                    <td key={c.id} className={cn('border-y border-line text-center', ci === cols.length - 1 && 'rounded-r-lg border-r')}>
                      <button type="button" role={s.multiPerRow ? 'checkbox' : 'radio'} aria-checked={isOn(r.code, c.code)} aria-label={`${r.label}: ${c.label}`} disabled={disabled} onClick={() => set(r.code, c.code)}
                        className={cn('mx-auto flex h-6 w-6 items-center justify-center border-2 transition', s.multiPerRow ? 'rounded-md' : 'rounded-full', isOn(r.code, c.code) ? 'border-[color:var(--survey-primary)] bg-[color:var(--survey-primary)]' : 'border-slate-300 hover:border-slate-400')}>
                        {isOn(r.code, c.code) && <span className="h-2 w-2 rounded-full bg-white" />}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-3 sm:hidden">
            {rows.map((r) => (
              <div key={r.id}>
                <p className="mb-1.5 text-sm font-medium">{r.label}</p>
                <div className="flex flex-wrap gap-1.5">{cols.map((c) => (
                  <button key={c.id} type="button" onClick={() => set(r.code, c.code)} disabled={disabled}
                    className={cn('rounded-full border px-3 py-1.5 text-sm', isOn(r.code, c.code) ? 'border-[color:var(--survey-primary)] bg-[color:var(--survey-primary)] text-white' : 'border-line bg-white')}>{c.label}</button>
                ))}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'quantity_by_group': {
      const rows = active(q.rows);
      const m = (value ?? {}) as Record<string, number | ''>;
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((r) => (
            <label key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2">
              <span className="text-[15px]">{r.label}</span>
              <input type="number" inputMode="numeric" min={0} max={q.validation?.max} className={cn(inputCls, 'h-9 w-24 border-line text-right')} value={m[r.code] ?? ''} disabled={disabled}
                onChange={(e) => { const next = { ...m }; if (e.target.value === '') delete next[r.code]; else next[r.code] = Math.max(0, Math.floor(Number(e.target.value))); onChange(next); }} aria-label={r.label} />
            </label>
          ))}
          <p className="text-sm text-muted sm:col-span-2">Tổng: <b className="text-ink">{Object.values(m).reduce<number>((a, b) => a + (Number(b) || 0), 0)}</b></p>
        </div>
      );
    }
    case 'category_level':
      return <CategoryLevelInput {...p} />;
    case 'address': {
      const a = (value ?? {}) as Record<string, string>;
      const set = (k: string, v: string) => onChange({ ...a, [k]: v });
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <select className={cn(inputCls, 'h-11', border)} value={a.province ?? ''} onChange={(e) => set('province', e.target.value)} disabled={disabled} aria-label="Tỉnh/Thành phố">
            <option value="">— Tỉnh / Thành phố —</option>
            {PROVINCES.map((p_) => <option key={p_}>{p_}</option>)}
          </select>
          {s.includeWard !== false && <input className={cn(inputCls, 'h-11', border)} placeholder="Xã / Phường / Đặc khu" value={a.ward ?? ''} onChange={(e) => set('ward', e.target.value)} disabled={disabled} />}
          <input className={cn(inputCls, 'h-11 border-line sm:col-span-2')} placeholder="Số nhà, đường (không bắt buộc)" value={a.street ?? ''} onChange={(e) => set('street', e.target.value)} disabled={disabled} />
        </div>
      );
    }
    case 'contact': {
      const c = (value ?? {}) as Record<string, string>;
      const labels: Record<string, string> = { name: 'Họ và tên', email: 'Email', phone: 'Số điện thoại', position: 'Chức vụ', organization: 'Đơn vị / Tổ chức' };
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {(s.contactFields ?? ['name', 'email', 'phone']).map((f) => (
            <input key={f} className={cn(inputCls, 'h-11', border)} placeholder={labels[f]} aria-label={labels[f]} type={f === 'email' ? 'email' : f === 'phone' ? 'tel' : 'text'}
              autoComplete={f === 'name' ? 'name' : f === 'email' ? 'email' : f === 'phone' ? 'tel' : f === 'organization' ? 'organization' : 'off'}
              value={c[f] ?? ''} onChange={(e) => onChange({ ...c, [f]: e.target.value })} disabled={disabled} />
          ))}
        </div>
      );
    }
    case 'file_upload':
      return <FileInput {...p} />;
    case 'consent':
      return (
        <ChoiceTile type="checkbox" checked={value === true} onClick={() => onChange(value === true ? undefined : true)} disabled={disabled}>
          <span className="prose-vi">{s.consentText || 'Tôi đồng ý'}</span>
        </ChoiceTile>
      );
    default:
      return null;
  }
}

function DropdownInput({ q, value, onChange, invalid, disabled, answers, setAnswer }: FieldProps) {
  const s = q.settings ?? {};
  const opts = active(q.options);
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase().normalize('NFC');
    return f ? opts.filter((o) => o.label.toLowerCase().normalize('NFC').includes(f)) : opts;
  }, [filter, opts]);
  return (
    <div className="max-w-lg">
      {s.searchable && opts.length > 7 && <input className={cn(inputCls, 'mb-2 h-10 border-line')} placeholder="Tìm…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Tìm lựa chọn" />}
      <select className={cn(inputCls, 'h-11', invalid ? 'border-red-400' : 'border-line')} value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)} disabled={disabled} aria-label={q.title}>
        <option value="">{q.placeholder || '— Chọn —'}</option>
        {shown.map((o) => <option key={o.id} value={o.code}>{o.label}</option>)}
        {s.allowOther && <option value={OTHER_CODE}>{s.otherLabel || 'Khác'}</option>}
      </select>
      <OtherInput q={q} answers={answers} setAnswer={setAnswer} show={value === OTHER_CODE} />
    </div>
  );
}

function CategoryLevelInput({ q, value, onChange, disabled }: FieldProps) {
  const rows = active(q.rows), cols = active(q.options);
  const s = q.settings ?? {};
  const g = (value ?? {}) as GridValue;
  const get = (r: string, c: string) => g[r]?.[c];
  const set = (r: string, c: string, n: number | undefined) => {
    const next: GridValue = JSON.parse(JSON.stringify(g));
    if (n === undefined || n <= 0) { if (next[r]) { delete next[r][c]; if (!Object.keys(next[r]).length) delete next[r]; } }
    else next[r] = { ...(next[r] ?? {}), [c]: n };
    onChange(next);
  };
  const cell = (r: ChoiceOption, c: ChoiceOption) => {
    const v = get(r.code, c.code);
    const on = v !== undefined && v > 0;
    return (
      <div className="flex items-center justify-center gap-1.5">
        <button type="button" role="checkbox" aria-checked={on} aria-label={`${r.label} – ${c.label}`} disabled={disabled} onClick={() => set(r.code, c.code, on ? undefined : 1)}
          className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition', on ? 'border-[color:var(--survey-primary)] bg-[color:var(--survey-primary)]' : 'border-slate-300 hover:border-slate-400')}>
          {on && <svg viewBox="0 0 12 12" className="h-3 w-3 text-white"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
        {s.withQuantity && on && (
          <input type="number" min={1} inputMode="numeric" value={v} disabled={disabled} aria-label={`${s.quantityLabel || 'Số lượng'} ${r.label} ${c.label}`}
            onChange={(e) => set(r.code, c.code, e.target.value === '' ? 1 : Math.max(1, Math.floor(Number(e.target.value))))}
            className="h-8 w-14 rounded-md border border-line px-1.5 text-center text-sm focus:border-[color:var(--survey-primary)] focus:outline-none" />
        )}
      </div>
    );
  };
  const selected = Object.values(g).reduce((a, cs) => a + Object.keys(cs ?? {}).length, 0);
  return (
    <div>
      {s.withQuantity && <p className="mb-2 text-sm text-muted">Tích chọn rồi nhập <b>{(s.quantityLabel || 'số lượng').toLowerCase()}</b> vào ô bên cạnh.</p>}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-white sm:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50"><tr><th className="px-3 py-2.5 text-left font-medium text-muted">Danh mục</th>{cols.map((c) => <th key={c.id} className="px-3 py-2.5 text-center font-medium text-muted">{c.label}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t border-line"><td className="px-3 py-2.5 font-medium">{r.label}</td>{cols.map((c) => <td key={c.id} className="px-3 py-2">{cell(r, c)}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
      <div className="space-y-2 sm:hidden">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-line bg-white p-3">
            <p className="mb-2 font-medium">{r.label}</p>
            <div className="grid grid-cols-1 gap-2">{cols.map((c) => <div key={c.id} className="flex items-center justify-between gap-2 text-sm"><span>{c.label}</span>{cell(r, c)}</div>)}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">Đã chọn {selected} mục</p>
    </div>
  );
}

function FileInput({ q, value, onChange, onUpload, disabled }: FieldProps) {
  const s = q.settings ?? {};
  const files = (Array.isArray(value) ? value : value ? [value] : []) as FileValue[];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const max = s.maxFiles ?? 1;
  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    setErr('');
    const f = list[0];
    if (f.size > (s.maxSizeMb ?? 10) * 1024 * 1024) return setErr(`Tệp vượt quá ${s.maxSizeMb ?? 10}MB`);
    const accept = (s.accept ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (accept.length && !accept.some((a) => f.name.toLowerCase().endsWith(a))) return setErr(`Chỉ chấp nhận: ${accept.join(', ')}`);
    if (!onUpload) { onChange([...files, { name: f.name, size: f.size, type: f.type }].slice(0, max)); return; }
    setBusy(true);
    try {
      const { path } = await onUpload(f);
      onChange([...files, { name: f.name, size: f.size, type: f.type, path }].slice(0, max));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div>
      {files.map((f, i) => (
        <div key={i} className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm">
          <Paperclip className="h-4 w-4 text-muted" /><span className="flex-1 truncate">{f.name}</span><span className="text-xs text-muted">{(f.size / 1024).toFixed(0)} KB</span>
          <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded p-1 text-muted hover:bg-slate-100" aria-label="Xóa tệp"><X className="h-4 w-4" /></button>
        </div>
      ))}
      {files.length < max && (
        <label className={cn('flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line bg-white px-4 py-6 text-sm text-muted transition hover:border-slate-400', (busy || disabled) && 'pointer-events-none opacity-60')}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
          <span>{busy ? 'Đang tải lên…' : 'Chọn tệp để tải lên'}</span>
          <span className="text-xs">{s.accept} · tối đa {s.maxSizeMb ?? 10}MB</span>
          <input type="file" className="sr-only" accept={s.accept} onChange={(e) => { pick(e.target.files); e.target.value = ''; }} disabled={busy || disabled} />
        </label>
      )}
      {err && <p className="mt-1 text-sm text-red-600">{err}</p>}
    </div>
  );
}
