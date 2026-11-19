import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown, GripVertical, Lock, Plus, Trash2, X,
  Type, AlignLeft, Mail, Phone, Link2, Hash, Banknote, Percent, Calendar, Clock, CalendarClock, CircleDot, CheckSquare, ChevronDownSquare,
  ToggleLeft, Star, SlidersHorizontal, Gauge, ListOrdered, Grid3x3, Calculator, LayoutGrid, MapPin, Contact, Paperclip, ShieldCheck,
  Heading, Pilcrow, Info, Image, Video, ExternalLink, Minus, FileText,
} from 'lucide-react';
import {
  GROUP_LABELS, createQuestion, getType, isInputQuestion, typeList,
  type CompositeField, type MediaRef, type Question, type QuestionSettings, type QuestionType, type Section, type SurveySchema, type Validation,
} from '@core/index.ts';
import { Button, Field, Input, Select, Switch, Textarea, cn } from '@/components/ui';
import { OptionsEditor } from './OptionsEditor';
import { LogicEditor } from './LogicEditor';
import { MediaFields, TypeSettings } from './Inspector';

export const ICONS: Record<QuestionType, typeof Type> = {
  short_text: Type, long_text: AlignLeft, email: Mail, phone: Phone, url: Link2, number: Hash, currency: Banknote, percentage: Percent,
  date: Calendar, time: Clock, datetime: CalendarClock, single_choice: CircleDot, multiple_choice: CheckSquare, dropdown: ChevronDownSquare,
  yes_no: ToggleLeft, rating: Star, likert: SlidersHorizontal, nps: Gauge, ranking: ListOrdered, matrix: Grid3x3,
  quantity_by_group: Calculator, category_level: LayoutGrid, number_range: Calculator, number_grid: LayoutGrid, composite: Contact, address: MapPin, contact: Contact, file_upload: Paperclip, consent: ShieldCheck,
  heading: Heading, paragraph: Pilcrow, instruction: Info, image: Image, video: Video, link: ExternalLink, divider: Minus,
};

const num = (v: string) => (v === '' ? undefined : Number(v));
const PLACEHOLDER_TYPES: QuestionType[] = ['short_text', 'long_text', 'email', 'phone', 'url', 'number', 'currency', 'percentage', 'dropdown'];

/** Đổi loại câu hỏi: giữ nội dung, mã, logic, đính kèm; lấy cấu hình mặc định của loại mới. */
export function changeType(q: Question, type: QuestionType, codes: string[]): Question {
  if (q.type === type) return q;
  const fresh = createQuestion(type, codes);
  const was = getType(q.type);
  const now = getType(type);
  return {
    ...fresh,
    id: q.id, code: q.code, title: q.title, description: q.description, helpText: q.helpText, required: now.isInput ? q.required : undefined,
    logic: q.logic, media: q.media, isPII: q.isPII, reportLabel: q.reportLabel,
    options: now.hasOptions && was.hasOptions && q.options?.length && type !== 'yes_no' && q.type !== 'yes_no' ? q.options : fresh.options,
    rows: now.hasRows && was.hasRows && q.rows?.length ? q.rows : fresh.rows,
  };
}

/* ───────────────────────── khung chung ───────────────────────── */

function Acts({ onDup, onDel, delLabel = 'Xóa', disabled }: { onDup: () => void; onDel: () => void; delLabel?: string; disabled?: boolean }) {
  if (disabled) return null;
  const b = 'rounded-md px-2 py-1 text-xs font-medium text-muted transition hover:bg-brand-50 hover:text-brand-700';
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" className={b} onClick={onDup}>Nhân bản</button>
      <button type="button" className={cn(b, 'hover:bg-red-50 hover:text-red-600')} onClick={onDel}>{delLabel}</button>
    </div>
  );
}

function useCard(id: string, canEdit: boolean) {
  const s = useSortable({ id: `c:${id}`, disabled: !canEdit });
  return { ...s, style: { transform: CSS.Translate.toString(s.transform), transition: s.transition } };
}

function Grip({ attributes, listeners, show }: { attributes: object; listeners?: object; show: boolean }) {
  if (!show) return null;
  return (
    <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-ink active:cursor-grabbing" title="Kéo để đổi vị trí" aria-label="Kéo để đổi vị trí">
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

function Chip({ tone, children, title }: { tone: 'amber' | 'blue' | 'slate' | 'red'; children: ReactNode; title?: string }) {
  const t = { amber: 'border-amber-300 bg-amber-50 text-amber-800', blue: 'border-sky-300 bg-sky-50 text-sky-800', slate: 'border-slate-300 bg-slate-50 text-slate-700', red: 'border-red-300 bg-red-50 text-red-700' }[tone];
  return <span title={title} className={cn('whitespace-nowrap rounded border px-1.5 py-px text-[11px] font-medium', t)}>{children}</span>;
}

function Adv({ children, open }: { children: ReactNode; open?: boolean }) {
  return (
    <details className="min-w-0 flex-[1_1_420px] rounded border border-line bg-surface/70 px-3 py-2" open={open}>
      <summary className="cursor-pointer select-none text-[13px] font-semibold">Tùy chọn nâng cao</summary>
      <div className="mt-3 space-y-4 text-sm">{children}</div>
    </details>
  );
}
function Sub({ title, children }: { title: string; children: ReactNode }) {
  return <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>{children}</div>;
}

/* ───────────────────────── chọn loại câu ───────────────────────── */

function TypePicker({ value, onChange, disabled, label }: { value: QuestionType; onChange: (t: QuestionType) => void; disabled?: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  const Icon = ICONS[value];
  return (
    <div ref={ref} className="relative min-w-0">
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        className="flex h-10 w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-line bg-white px-3 text-left text-sm hover:border-slate-300 disabled:opacity-60">
        <Icon className="h-4 w-4 shrink-0 text-brand-500" /><span className="truncate">{getType(value).label}</span><ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted" />
      </button>
      {open && (
        <div role="listbox" className="thin-scroll absolute right-0 top-[calc(100%+4px)] z-40 max-h-[380px] w-[260px] overflow-auto rounded-md border border-line bg-white px-1.5 pb-1.5 shadow-xl">
          {(['text', 'choice', 'structured'] as const).map((g) => (
            <div key={g}>
              <p className="px-2 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-muted">{GROUP_LABELS[g]}</p>
              {typeList.filter((t) => t.group === g).map((t) => {
                const I = ICONS[t.type];
                return (
                  <button key={t.type} type="button" role="option" aria-selected={t.type === value} onClick={() => { onChange(t.type); setOpen(false); }}
                    className={cn('flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-surface', t.type === value && 'bg-brand-50 font-semibold text-brand-700')}>
                    <I className="h-4 w-4 shrink-0 text-brand-500" />{t.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── thẻ câu hỏi ───────────────────────── */

export interface QCardProps {
  q: Question;
  n: number;
  schema: SurveySchema;
  focused: boolean;
  canEdit: boolean;
  issues?: string[];
  lockedOptions: Set<string>;
  lockedRows: Set<string>;
  codeLocked: boolean;
  onFocus: () => void;
  onChange: (patch: Partial<Question>, key?: string) => void;
  onType: (t: QuestionType) => void;
  onDup: () => void;
  onDel: () => void;
}

export function QuestionCard(p: QCardProps) {
  const { q, n, schema, canEdit } = p;
  const def = getType(q.type);
  const { attributes, listeners, setNodeRef, style, isDragging } = useCard(q.id, canEdit);
  const s = q.settings ?? {};
  const v = q.validation ?? {};
  const set = (patch: Partial<Question>) => p.onChange(patch, Object.keys(patch).join());
  const setS = (x: Partial<QuestionSettings>) => p.onChange({ settings: { ...s, ...x } }, 'settings');
  const setV = (x: Partial<Validation>) => p.onChange({ validation: { ...v, ...x } }, 'validation');
  const flat = schema.sections.flatMap((x) => x.questions);
  const sources = flat.slice(0, flat.findIndex((x) => x.id === q.id)).filter(isInputQuestion);
  const codeDup = flat.filter((x) => x.code === q.code).length > 1;
  const hasCond = !!q.logic?.visibleIf?.rules.length;
  const hasReqIf = !!q.logic?.requiredIf?.rules.length;
  const hasRules = Object.values(v).some((x) => x !== undefined && x !== '');
  const attach = (kind: MediaRef['kind']) => set({ media: { kind, url: q.media?.kind === kind ? q.media.url : '' } });

  return (
    <section ref={setNodeRef} style={style} id={`qc-${q.id}`} onFocusCapture={p.onFocus} onMouseDown={p.onFocus}
      className={cn('scroll-mt-16 rounded-md border bg-white p-4 transition-shadow', p.focused ? 'border-brand-400 shadow-[inset_3px_0_0_theme(colors.brand.500)]' : 'border-line', p.issues && 'border-red-300', isDragging && 'z-20 opacity-60 shadow-lg')}>
      <fieldset disabled={!canEdit} className="grid min-w-0 gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Grip attributes={attributes} listeners={listeners} show={canEdit} />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Câu {n}</span>
            {hasCond && <Chip tone="amber">Có điều kiện</Chip>}
            {hasReqIf && <Chip tone="red">Bắt buộc có điều kiện</Chip>}
            {hasRules && <Chip tone="blue">Có kiểm tra</Chip>}
            {q.isPII && <Chip tone="slate">Dữ liệu cá nhân</Chip>}
          </span>
          <Acts onDup={p.onDup} onDel={p.onDel} disabled={!canEdit} />
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(150px,210px)]">
          <Input className="font-semibold" value={q.title} placeholder="Nội dung câu hỏi" onChange={(e) => set({ title: e.target.value })} aria-label={`Nội dung câu ${n}`} />
          <TypePicker value={q.type} onChange={p.onType} disabled={!canEdit} label={`Loại câu ${n}: ${def.label}`} />
        </div>
        <Input className="h-9 text-sm" value={q.description ?? ''} placeholder="Ghi chú dưới câu hỏi (không bắt buộc): đơn vị tính, cách đếm, ví dụ…" onChange={(e) => set({ description: e.target.value || undefined })} aria-label={`Ghi chú câu ${n}`} />

        <QBody q={q} s={s} v={v} setS={setS} setV={setV} set={set} lockedOptions={p.lockedOptions} lockedRows={p.lockedRows} disabled={!canEdit} />

        {q.media ? (
          <div className="rounded-lg border border-dashed border-line p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
              <span>Minh họa cho câu này: {q.media.kind === 'image' ? 'Hình ảnh' : q.media.kind === 'video' ? 'Video' : q.media.kind === 'file' ? 'Tài liệu' : 'Liên kết'}</span>
              <button type="button" onClick={() => set({ media: undefined })} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-red-50 hover:text-red-600"><X className="h-3.5 w-3.5" />Bỏ</button>
            </div>
            <MediaFields media={q.media} onChange={(m) => p.onChange({ media: m }, 'media')} />
          </div>
        ) : canEdit && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] text-muted">Minh họa cho câu này:</span>
            <AttachBtn icon={Image} onClick={() => attach('image')}>Hình</AttachBtn>
            <AttachBtn icon={Video} onClick={() => attach('video')}>Video</AttachBtn>
            <AttachBtn icon={ExternalLink} onClick={() => attach('link')}>Liên kết</AttachBtn>
            <AttachBtn icon={FileText} onClick={() => attach('file')}>Tài liệu</AttachBtn>
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="pt-1.5"><Switch checked={!!q.required} onChange={(r) => set({ required: r })} label="Bắt buộc" disabled={!canEdit} /></div>
          <Adv open={hasRules && !!p.issues}>
            <Sub title="Chỉ hiện câu này khi">
              <LogicEditor group={q.logic?.visibleIf} onChange={(g) => set({ logic: { ...q.logic, visibleIf: g } })} sources={sources} emptyText="Luôn hiện. Thêm điều kiện để chỉ hiện khi thỏa mãn." disabled={!canEdit} />
            </Sub>
            {!q.required && (
              <Sub title="Bắt buộc khi">
                <LogicEditor group={q.logic?.requiredIf} onChange={(g) => set({ logic: { ...q.logic, requiredIf: g } })} sources={sources} emptyText="Không bắt buộc. Thêm điều kiện để bắt buộc trong trường hợp cụ thể." disabled={!canEdit} />
              </Sub>
            )}
            <Rules q={q} v={v} s={s} setV={setV} setS={setS} set={set} />
            <div className="grid gap-3 sm:grid-cols-2">
              {PLACEHOLDER_TYPES.includes(q.type) && <Field label="Chữ gợi ý trong ô"><Input value={q.placeholder ?? ''} onChange={(e) => set({ placeholder: e.target.value || undefined })} /></Field>}
              <Field label="Nội dung trợ giúp" hint="(hiện dưới ô trả lời)"><Input value={q.helpText ?? ''} onChange={(e) => set({ helpText: e.target.value || undefined })} /></Field>
              <Field label="Mã câu" hint="(giữ nguyên khi đổi thứ tự)">
                <div className="relative">
                  <Input className={cn('font-mono', codeDup && 'border-red-400')} value={q.code} disabled={p.codeLocked} onChange={(e) => set({ code: e.target.value.replace(/[^A-Za-z0-9_]/g, '').toUpperCase() })} />
                  {p.codeLocked && <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />}
                </div>
                {p.codeLocked && <p className="mt-1 text-xs text-muted">Đã dùng trong phiên bản đã xuất bản, khóa để so sánh được dữ liệu.</p>}
                {codeDup && <p className="mt-1 text-xs text-red-600">Mã bị trùng với câu khác.</p>}
              </Field>
              <Field label="Nhãn báo cáo" hint="(ngắn, hiện trên biểu đồ)"><Input value={q.reportLabel ?? ''} placeholder={q.title.slice(0, 40)} onChange={(e) => set({ reportLabel: e.target.value || undefined })} /></Field>
            </div>
            <Switch checked={!!q.isPII} onChange={(x) => set({ isPII: x })} label="Chứa dữ liệu cá nhân (che khi xem và khi xuất)" disabled={!canEdit} />
          </Adv>
        </div>
      </fieldset>
      {p.issues && <div className="-mx-4 -mb-4 mt-3 rounded-b-md border-t border-red-200 bg-red-50 px-4 py-1.5 text-xs text-red-700">{p.issues.join(' · ')}</div>}
    </section>
  );
}

function AttachBtn({ icon: I, children, onClick }: { icon: typeof Type; children: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-brand-50 hover:text-brand-700"><I className="h-3.5 w-3.5" />{children}</button>;
}

/** Phần thân theo từng loại câu — chỉnh trực tiếp như trong mockup. */
function QBody({ q, s, v, setS, setV, set, lockedOptions, lockedRows, disabled }: {
  q: Question; s: QuestionSettings; v: Validation; setS: (x: Partial<QuestionSettings>) => void; setV: (x: Partial<Validation>) => void;
  set: (x: Partial<Question>) => void; lockedOptions: Set<string>; lockedRows: Set<string>; disabled: boolean;
}) {
  const def = getType(q.type);
  const choice = ['single_choice', 'multiple_choice', 'dropdown', 'ranking'].includes(q.type);
  const rowsEd = def.hasRows && (
    <OptionsEditor label={q.type === 'matrix' ? 'Các dòng (tiêu chí)' : q.type === 'number_grid' ? 'Các dòng' : q.type === 'quantity_by_group' ? 'Các nhóm' : 'Danh mục'} items={q.rows ?? []} onChange={(rows) => set({ rows })} lockedCodes={lockedRows}
      prefix={q.type === 'quantity_by_group' ? 'grp' : q.type === 'matrix' || q.type === 'number_grid' ? 'row' : 'cat'} disabled={disabled} />
  );
  const optsEd = def.hasOptions && (
    <OptionsEditor label={q.type === 'matrix' ? 'Các cột (mức / mã)' : q.type === 'number_grid' ? 'Các cột (số cần nhập)' : q.type === 'category_level' ? 'Cấp độ' : q.type === 'yes_no' ? 'Nhãn' : 'Các lựa chọn'} items={q.options ?? []} onChange={(options) => set({ options })}
      lockedCodes={q.type === 'yes_no' ? new Set((q.options ?? []).map((o) => o.code)) : lockedOptions}
      prefix={q.type === 'category_level' ? 'lvl' : q.type === 'matrix' || q.type === 'number_grid' ? 'col' : q.type === 'likert' ? 'lk' : q.type === 'yes_no' ? 'yn' : 'opt'} disabled={disabled}
      marker={q.type === 'multiple_choice' ? 'square' : choice || q.type === 'likert' ? 'circle' : undefined} fixed={q.type === 'yes_no'} />
  );
  const numBox = (unit = true) => (
    <div className="grid gap-3 sm:grid-cols-3">
      {unit && <Field label="Đơn vị tính"><Input value={s.unit ?? ''} placeholder="VD: lớp, học sinh, triệu đồng" onChange={(e) => setS({ unit: e.target.value || undefined })} /></Field>}
      <Field label={q.type === 'number_grid' ? 'Mỗi ô nhỏ nhất' : 'Nhỏ nhất'}><Input type="number" value={v.min ?? ''} onChange={(e) => setV({ min: num(e.target.value) })} /></Field>
      <Field label={q.type === 'number_grid' ? 'Mỗi ô lớn nhất' : 'Lớn nhất'}><Input type="number" value={v.max ?? ''} placeholder="Không giới hạn" onChange={(e) => setV({ max: num(e.target.value) })} /></Field>
    </div>
  );
  const extra = q.type === 'number_grid' ? (
    <div className="space-y-3">
      {numBox()}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Switch checked={!!s.showTotals} onChange={(x) => setS({ showTotals: x })} label="Hiện dòng / cột cộng" disabled={disabled} />
        <Switch checked={!!s.requireAllCells} onChange={(x) => setS({ requireAllCells: x })} label="Bắt buộc điền mọi ô" disabled={disabled} />
      </div>
    </div>
  ) : <TypeSettings q={q} s={s} setS={setS} onChange={set} />;
  let body: ReactNode;
  if (def.hasRows && def.hasOptions) body = <div className="grid gap-4 md:grid-cols-2"><div>{rowsEd}</div><div className="space-y-3">{optsEd}{extra}</div></div>;
  else if (def.hasRows) body = <div className="space-y-3">{rowsEd}{extra}</div>;
  else if (def.hasOptions) body = (
    <div className="space-y-2">
      {optsEd}
      {['single_choice', 'multiple_choice', 'dropdown'].includes(q.type) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Switch checked={!!s.allowOther} onChange={(x) => setS({ allowOther: x })} label='Thêm "Khác (ghi rõ)"' disabled={disabled} />
          {s.allowOther && <Input className="h-8 w-44 text-sm" value={s.otherLabel ?? ''} placeholder="Khác (ghi rõ)" onChange={(e) => setS({ otherLabel: e.target.value || undefined })} aria-label='Nhãn "Khác"' />}
          {q.type === 'dropdown' && <Switch checked={!!s.searchable} onChange={(x) => setS({ searchable: x })} label="Cho phép tìm kiếm" disabled={disabled} />}
        </div>
      )}
      {extra}
    </div>
  );
  else if (q.type === 'number_range') body = <div className="space-y-2">{numBox()}<p className="text-[13px] text-muted">Người trả lời nhập hai số “từ – đến”. Hệ thống tự báo khi số đầu lớn hơn số sau.</p></div>;
  else if (q.type === 'composite') body = <FieldsEditor fields={s.fields ?? []} onChange={(fields) => setS({ fields })} disabled={disabled} />;
  else if (['number', 'currency', 'percentage'].includes(q.type)) body = (
    <div className="grid gap-3 sm:grid-cols-3">
      {q.type === 'currency' ? extra : <Field label="Đơn vị tính"><Input value={q.type === 'percentage' ? '%' : s.unit ?? ''} disabled={q.type === 'percentage'} placeholder="VD: lớp, học sinh" onChange={(e) => setS({ unit: e.target.value || undefined })} /></Field>}
      <Field label="Nhỏ nhất"><Input type="number" value={v.min ?? ''} onChange={(e) => setV({ min: num(e.target.value) })} /></Field>
      <Field label="Lớn nhất"><Input type="number" value={v.max ?? ''} placeholder="Không giới hạn" onChange={(e) => setV({ max: num(e.target.value) })} /></Field>
    </div>
  );
  else body = extra ?? null;
  const fallback = ['short_text', 'long_text', 'email', 'phone', 'url', 'date', 'time', 'datetime'].includes(q.type);
  return (
    <>
      {body}
      {fallback && <p className="text-[13px] text-muted">{q.type === 'email' ? 'Người trả lời nhập email, hệ thống tự kiểm tra định dạng.' : q.type === 'phone' ? 'Người trả lời nhập số điện thoại Việt Nam, tự kiểm tra định dạng.' : ['date', 'time', 'datetime'].includes(q.type) ? 'Người trả lời chọn trên lịch.' : 'Người trả lời gõ câu trả lời vào ô.'}</p>}
    </>
  );
}

/** Câu ghép: danh sách ô nhỏ (nhãn, kiểu, đơn vị). Mã ô giữ nguyên khi đổi nhãn. */
function FieldsEditor({ fields, onChange, disabled }: { fields: CompositeField[]; onChange: (f: CompositeField[]) => void; disabled: boolean }) {
  const set = (i: number, p: Partial<CompositeField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const nextCode = () => { let n = fields.length + 1; while (fields.some((f) => f.code === `f${n}`)) n++; return `f${n}`; };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Các ô trong câu</p>
      {fields.map((f, i) => (
        <div key={f.code} className="grid items-center gap-2 rounded-md border border-line bg-white p-2 sm:grid-cols-[minmax(0,1fr)_120px_100px_auto_auto]">
          <Input className="h-9" value={f.label} onChange={(e) => set(i, { label: e.target.value })} aria-label={`Nhãn ô ${i + 1}`} disabled={disabled} />
          <Select className="h-9 text-sm" value={f.kind} onChange={(e) => set(i, { kind: e.target.value as CompositeField['kind'] })} aria-label={`Kiểu ô ${i + 1}`} disabled={disabled}>
            <option value="text">Chữ</option><option value="number">Số</option><option value="date">Ngày</option><option value="select">Chọn</option>
          </Select>
          {f.kind === 'number' ? <Input className="h-9" value={f.unit ?? ''} placeholder="Đơn vị" onChange={(e) => set(i, { unit: e.target.value || undefined })} aria-label={`Đơn vị ô ${i + 1}`} disabled={disabled} />
            : f.kind === 'select' ? <Input className="h-9" value={(f.choices ?? []).join('; ')} placeholder="A; B; C" onChange={(e) => set(i, { choices: e.target.value.split(/\s*;\s*/).filter(Boolean) })} aria-label={`Lựa chọn ô ${i + 1}`} disabled={disabled} />
            : <span />}
          <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={f.required !== false} onChange={(e) => set(i, { required: e.target.checked ? undefined : false })} disabled={disabled} />Bắt buộc</label>
          <button type="button" onClick={() => onChange(fields.filter((_, j) => j !== i))} className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-40" disabled={disabled || fields.length <= 1} aria-label={`Xóa ô ${i + 1}`}><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => onChange([...fields, { code: nextCode(), label: `Ô ${fields.length + 1}`, kind: 'text' }])} disabled={disabled}><Plus className="h-4 w-4" />Thêm ô</Button>
      <p className="text-xs text-muted">Ô “Bắt buộc” chỉ áp dụng khi cả câu bật Bắt buộc. Khi xuất dữ liệu, mỗi ô là một cột riêng.</p>
    </div>
  );
}

/** Kiểm tra câu trả lời (trong Tùy chọn nâng cao). */
function Rules({ q, v, s, setV, setS, set }: { q: Question; v: Validation; s: QuestionSettings; setV: (x: Partial<Validation>) => void; setS: (x: Partial<QuestionSettings>) => void; set: (x: Partial<Question>) => void }) {
  const text = ['short_text', 'long_text', 'email', 'phone', 'url'].includes(q.type);
  const multi = q.type === 'multiple_choice' || q.type === 'category_level';
  const single = ['single_choice', 'dropdown'].includes(q.type);
  const defText = ['short_text', 'number', 'currency', 'percentage', 'date', 'email'].includes(q.type);
  if (!text && !multi && !single && !defText && q.type !== 'quantity_by_group') return null;
  return (
    <Sub title="Kiểm tra câu trả lời">
      <div className="grid gap-3 sm:grid-cols-2">
        {text && <>
          <Field label="Độ dài tối thiểu"><Input type="number" min={0} value={v.minLength ?? ''} onChange={(e) => setV({ minLength: num(e.target.value) })} /></Field>
          <Field label="Độ dài tối đa"><Input type="number" min={0} value={v.maxLength ?? ''} onChange={(e) => setV({ maxLength: num(e.target.value) })} /></Field>
          <Field label="Biểu thức chính quy" hint="(tùy chọn)"><Input className="font-mono text-xs" value={v.pattern ?? ''} placeholder="^[0-9]{6}$" onChange={(e) => setV({ pattern: e.target.value || undefined })} /></Field>
          {v.pattern && <Field label="Thông báo khi sai định dạng"><Input value={v.patternMessage ?? ''} onChange={(e) => setV({ patternMessage: e.target.value || undefined })} /></Field>}
        </>}
        {q.type === 'quantity_by_group' && <Field label="Tối đa mỗi nhóm"><Input type="number" value={v.max ?? ''} onChange={(e) => setV({ max: num(e.target.value) })} /></Field>}
        {multi && <>
          <Field label={q.type === 'category_level' ? 'Chọn tối thiểu (ô)' : 'Chọn tối thiểu'}><Input type="number" min={0} value={s.minSelect ?? ''} onChange={(e) => setS({ minSelect: num(e.target.value) })} /></Field>
          <Field label={q.type === 'category_level' ? 'Chọn tối đa (ô)' : 'Chọn tối đa'}><Input type="number" min={0} value={s.maxSelect ?? ''} onChange={(e) => setS({ maxSelect: num(e.target.value) })} /></Field>
        </>}
        {single && (
          <Field label="Lựa chọn mặc định">
            <Select value={String(q.defaultValue ?? '')} onChange={(e) => set({ defaultValue: e.target.value || undefined })}>
              <option value="">— Không —</option>{(q.options ?? []).map((o) => <option key={o.id} value={o.code}>{o.label}</option>)}
            </Select>
          </Field>
        )}
        {defText && <Field label="Giá trị mặc định"><Input value={String(q.defaultValue ?? '')} onChange={(e) => set({ defaultValue: e.target.value === '' ? undefined : ['number', 'currency', 'percentage'].includes(q.type) ? Number(e.target.value) : e.target.value })} /></Field>}
      </div>
      {q.type === 'multiple_choice' && (
        <Field label="Lựa chọn loại trừ" hint="(chọn thì bỏ các lựa chọn khác)">
          <div className="flex flex-wrap gap-1">{(q.options ?? []).map((o) => {
            const on = (s.exclusiveCodes ?? []).includes(o.code);
            return <button type="button" key={o.id} onClick={() => setS({ exclusiveCodes: on ? (s.exclusiveCodes ?? []).filter((c) => c !== o.code) : [...(s.exclusiveCodes ?? []), o.code] })} className={cn('rounded-full border px-2 py-0.5 text-xs', on ? 'border-brand-500 bg-brand-600 text-white' : 'border-line bg-white')}>{o.label}</button>;
          })}</div>
        </Field>
      )}
    </Sub>
  );
}

/* ───────────────────────── khối nội dung (hướng dẫn, hình, video, liên kết…) ───────────────────────── */

export function BlockCard({ q, schema, focused, canEdit, onFocus, onChange, onDup, onDel }: {
  q: Question; schema: SurveySchema; focused: boolean; canEdit: boolean; onFocus: () => void;
  onChange: (patch: Partial<Question>, key?: string) => void; onDup: () => void; onDel: () => void;
}) {
  const { attributes, listeners, setNodeRef, style, isDragging } = useCard(q.id, canEdit);
  const def = getType(q.type);
  const Icon = ICONS[q.type];
  const s = q.settings ?? {};
  const set = (patch: Partial<Question>) => onChange(patch, Object.keys(patch).join());
  const flat = schema.sections.flatMap((x) => x.questions);
  const sources = flat.slice(0, flat.findIndex((x) => x.id === q.id)).filter(isInputQuestion);
  const media = q.type === 'image' || q.type === 'video' || q.type === 'link';
  return (
    <section ref={setNodeRef} style={style} id={`qc-${q.id}`} onFocusCapture={onFocus} onMouseDown={onFocus}
      className={cn('scroll-mt-16 rounded-md border border-dashed bg-white/70 p-4', focused ? 'border-brand-400 shadow-[inset_3px_0_0_theme(colors.brand.500)]' : 'border-slate-300', isDragging && 'z-20 opacity-60 shadow-lg')}>
      <fieldset disabled={!canEdit} className="grid min-w-0 gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <Grip attributes={attributes} listeners={listeners} show={canEdit} />
            <Icon className="h-4 w-4 text-brand-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{q.type === 'instruction' ? 'Đoạn hướng dẫn' : def.label}</span>
            {q.logic?.visibleIf?.rules.length ? <Chip tone="amber">Có điều kiện</Chip> : null}
          </span>
          <Acts onDup={onDup} onDel={onDel} disabled={!canEdit} />
        </div>
        {(q.type === 'heading' || q.type === 'instruction') && <Input className="font-semibold" value={q.title} placeholder={q.type === 'heading' ? 'Tiêu đề' : 'Tiêu đề hộp (không bắt buộc)'} onChange={(e) => set({ title: e.target.value })} aria-label="Tiêu đề" />}
        {(q.type === 'paragraph' || q.type === 'instruction' || q.type === 'heading') && (
          <Textarea className={q.type === 'heading' ? 'min-h-[44px]' : 'min-h-[64px]'} value={q.description ?? ''} placeholder={q.type === 'heading' ? 'Mô tả ngắn (không bắt buộc)' : 'Đoạn chữ hiển thị cho người trả lời đọc'}
            onChange={(e) => set({ description: e.target.value || undefined })} aria-label="Nội dung" />
        )}
        {media && <MediaFields media={q.media ?? { kind: q.type as MediaRef['kind'], url: '' }} onChange={(m) => onChange({ media: m }, 'media')} />}
        {q.type === 'video' && <p className="-mt-1 text-[12.5px] text-muted">Video phát ngay trong phiếu, người trả lời không phải rời trang.</p>}
        {(q.type === 'heading' || q.type === 'instruction') && <div className="max-w-xs"><TypeSettings q={q} s={s} setS={(x) => onChange({ settings: { ...s, ...x } }, 'settings')} onChange={set} /></div>}
        {q.type === 'divider' && <hr className="border-line" />}
        <Adv>
          <Sub title="Chỉ hiện khối này khi">
            <LogicEditor group={q.logic?.visibleIf} onChange={(g) => set({ logic: { ...q.logic, visibleIf: g } })} sources={sources} emptyText="Luôn hiện." disabled={!canEdit} />
          </Sub>
        </Adv>
      </fieldset>
    </section>
  );
}

/* ───────────────────────── dòng "Phần" ───────────────────────── */

export function SectionRow({ section, idx, schema, focused, canEdit, onFocus, onChange, onDup, onDel }: {
  section: Section; idx: number; schema: SurveySchema; focused: boolean; canEdit: boolean; onFocus: () => void;
  onChange: (p: Partial<Section>, key?: string) => void; onDup: () => void; onDel: () => void;
}) {
  const { attributes, listeners, setNodeRef, style, isDragging } = useCard(section.id, canEdit);
  const sources = schema.sections.slice(0, idx).flatMap((s) => s.questions).filter(isInputQuestion);
  const cond = !!section.logic?.visibleIf?.rules.length;
  return (
    <div ref={setNodeRef} style={style} id={`qc-${section.id}`} onFocusCapture={onFocus} onMouseDown={onFocus}
      className={cn('scroll-mt-16 rounded-md border-l-4 bg-brand-50 px-3 py-2.5', focused ? 'border-brand-600 ring-1 ring-brand-300' : 'border-brand-400', isDragging && 'z-20 opacity-60 shadow-lg', idx > 0 && 'mt-3')}>
      <fieldset disabled={!canEdit} className="min-w-0">
        <div className="flex items-center gap-2">
          <Grip attributes={attributes} listeners={listeners} show={canEdit} />
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-brand-700">Phần {idx + 1}</span>
          <input className="h-9 min-w-0 flex-1 rounded-md border border-transparent bg-white/80 px-2.5 font-semibold text-brand-800 hover:border-line focus:border-brand-400 focus:outline-none" value={section.title}
            onChange={(e) => onChange({ title: e.target.value }, 'title')} aria-label={`Tên phần ${idx + 1}`} placeholder="Tên phần" />
          {cond && <Chip tone="amber">Có điều kiện</Chip>}
          <Acts onDup={onDup} onDel={onDel} delLabel="Xóa phần" disabled={!canEdit} />
        </div>
        <details className="mt-1.5 pl-7 text-sm" open={!!section.description || cond || undefined}>
          <summary className="cursor-pointer select-none text-xs text-muted">Mô tả và điều kiện hiện phần</summary>
          <div className="mt-2 space-y-3">
            <Textarea className="min-h-[44px] bg-white" value={section.description ?? ''} placeholder="Mô tả phần (không bắt buộc)" onChange={(e) => onChange({ description: e.target.value || undefined }, 'description')} aria-label="Mô tả phần" />
            <LogicEditor group={section.logic?.visibleIf} onChange={(g) => onChange({ logic: { visibleIf: g } })} sources={sources} emptyText="Luôn hiện phần này. Thêm điều kiện để bỏ qua phần khi không phù hợp." disabled={!canEdit} />
          </div>
        </details>
      </fieldset>
    </div>
  );
}
