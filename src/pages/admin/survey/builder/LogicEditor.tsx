import { Plus, Trash2, GitBranch } from 'lucide-react';
import { OTHER_CODE, getType, type LogicGroup, type LogicOperator, type LogicRule, type Question } from '@core/index.ts';
import { cn } from '@/components/ui';

const OP_LABEL: Record<LogicOperator, string> = {
  equals: 'bằng', not_equals: 'khác', in: 'là một trong', not_in: 'không là một trong',
  contains_any: 'có chọn bất kỳ', contains_all: 'có chọn tất cả', gt: '>', gte: '≥', lt: '<', lte: '≤',
  is_empty: 'để trống', is_not_empty: 'đã trả lời',
};
const MULTI_VALUE: LogicOperator[] = ['in', 'not_in', 'contains_any', 'contains_all'];
const NO_VALUE: LogicOperator[] = ['is_empty', 'is_not_empty'];

const isGroup = (x: LogicRule | LogicGroup): x is LogicGroup => (x as LogicGroup).rules !== undefined;
const sel = 'h-8 rounded-md border border-line bg-white px-1.5 text-xs focus:border-brand-400 focus:outline-none';

export function LogicEditor({ group, onChange, sources, emptyText, depth = 0, disabled }: {
  group?: LogicGroup;
  onChange: (g: LogicGroup | undefined) => void;
  sources: Question[];
  emptyText: string;
  depth?: number;
  disabled?: boolean;
}) {
  const g: LogicGroup = group ?? { op: 'and', rules: [] };
  const usable = sources.filter((q) => getType(q.type).operators.length > 0);
  const set = (rules: (LogicRule | LogicGroup)[]) => onChange(rules.length || depth > 0 ? { ...g, rules } : undefined);
  const newRule = (): LogicRule => {
    const q = usable[usable.length - 1];
    const ops = getType(q.type).operators;
    return { questionId: q.id, operator: ops[0], value: q.options?.[0]?.code };
  };

  if (!usable.length) return <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">Cần có câu hỏi phía trước để đặt điều kiện.</p>;

  return (
    <div className={cn(depth > 0 && 'rounded-lg border border-dashed border-brand-200 bg-brand-50/40 p-2')}>
      {g.rules.length === 0 && depth === 0 && <p className="mb-2 text-xs text-muted">{emptyText}</p>}
      {g.rules.length > 1 && (
        <div className="mb-2 flex items-center gap-1.5 text-xs">
          <span className="text-muted">Thỏa</span>
          <select className={sel} value={g.op} onChange={(e) => onChange({ ...g, op: e.target.value as 'and' | 'or' })} disabled={disabled}>
            <option value="and">TẤT CẢ (AND)</option><option value="or">BẤT KỲ (OR)</option>
          </select>
          <span className="text-muted">điều kiện</span>
        </div>
      )}
      <div className="space-y-2">
        {g.rules.map((r, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              {isGroup(r) ? (
                <LogicEditor group={r} sources={sources} emptyText="" depth={depth + 1} disabled={disabled}
                  onChange={(ng) => set(ng && ng.rules.length ? g.rules.map((x, j) => (j === i ? ng : x)) : g.rules.filter((_, j) => j !== i))} />
              ) : (
                <RuleRow rule={r} sources={usable} disabled={disabled} onChange={(nr) => set(g.rules.map((x, j) => (j === i ? nr : x)))} />
              )}
            </div>
            <button type="button" onClick={() => set(g.rules.filter((_, j) => j !== i))} className="mt-1 rounded p-1 text-muted hover:bg-red-50 hover:text-red-600" aria-label="Xóa điều kiện" disabled={disabled}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3">
        <button type="button" onClick={() => set([...g.rules, newRule()])} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline" disabled={disabled}><Plus className="h-3.5 w-3.5" />Điều kiện</button>
        {depth === 0 && g.rules.length > 0 && <button type="button" onClick={() => set([...g.rules, { op: g.op === 'and' ? 'or' : 'and', rules: [newRule()] }])} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline" disabled={disabled}><GitBranch className="h-3.5 w-3.5" />Nhóm điều kiện</button>}
      </div>
    </div>
  );
}

function RuleRow({ rule, sources, onChange, disabled }: { rule: LogicRule; sources: Question[]; onChange: (r: LogicRule) => void; disabled?: boolean }) {
  const q = sources.find((x) => x.id === rule.questionId);
  const ops = q ? getType(q.type).operators : [];
  const opts = q ? [...(q.options ?? []).filter((o) => o.active !== false), ...(q.settings?.allowOther ? [{ id: 'other', code: OTHER_CODE, label: q.settings.otherLabel || 'Khác' }] : [])] : [];
  const multi = MULTI_VALUE.includes(rule.operator);
  const values = Array.isArray(rule.value) ? rule.value.map(String) : rule.value !== undefined ? [String(rule.value)] : [];
  const numeric = q && ['number', 'currency', 'percentage', 'rating', 'nps'].includes(q.type);
  return (
    <div className="space-y-1.5 rounded-lg border border-line bg-white p-2">
      {!q && <p className="text-xs text-red-600">Câu hỏi được tham chiếu đã bị xóa hoặc nằm sau.</p>}
      <select className={cn(sel, 'w-full')} value={rule.questionId} disabled={disabled}
        onChange={(e) => { const nq = sources.find((x) => x.id === e.target.value)!; const o = getType(nq.type).operators[0]; onChange({ questionId: nq.id, operator: o, value: nq.options?.[0]?.code }); }}>
        {!q && <option value={rule.questionId}>(không tồn tại)</option>}
        {sources.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.title.slice(0, 50)}</option>)}
      </select>
      <div className="flex gap-1.5">
        <select className={cn(sel, 'w-32 shrink-0')} value={rule.operator} disabled={disabled}
          onChange={(e) => { const op = e.target.value as LogicOperator; onChange({ ...rule, operator: op, value: NO_VALUE.includes(op) ? undefined : MULTI_VALUE.includes(op) ? values.slice(0, 1) : values[0] }); }}>
          {ops.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
        </select>
        {!NO_VALUE.includes(rule.operator) && (opts.length ? (
          multi ? (
            <div className="flex min-w-0 flex-1 flex-wrap gap-1">
              {opts.map((o) => {
                const on = values.includes(o.code);
                return <button key={o.code} type="button" disabled={disabled} onClick={() => onChange({ ...rule, value: on ? values.filter((v) => v !== o.code) : [...values, o.code] })}
                  className={cn('rounded-full border px-2 py-0.5 text-xs', on ? 'border-brand-500 bg-brand-600 text-white' : 'border-line bg-white text-muted hover:border-slate-300')}>{o.label}</button>;
              })}
            </div>
          ) : (
            <select className={cn(sel, 'min-w-0 flex-1')} value={values[0] ?? ''} onChange={(e) => onChange({ ...rule, value: e.target.value })} disabled={disabled}>
              {opts.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          )
        ) : (
          <input className={cn(sel, 'min-w-0 flex-1')} type={numeric ? 'number' : q?.type === 'date' || q?.type === 'datetime' ? 'date' : 'text'} value={values[0] ?? ''} disabled={disabled}
            onChange={(e) => onChange({ ...rule, value: numeric ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value })} placeholder="giá trị" />
        ))}
      </div>
    </div>
  );
}

export function describeLogic(g: LogicGroup | undefined, all: Question[]): string {
  if (!g || !g.rules.length) return '';
  const parts = g.rules.map((r) => {
    if (isGroup(r)) return `(${describeLogic(r, all)})`;
    const q = all.find((x) => x.id === r.questionId);
    const lbl = (c: unknown) => (q?.options?.find((o) => o.code === c)?.label ?? (c === OTHER_CODE ? 'Khác' : String(c)));
    const v = NO_VALUE.includes(r.operator) ? '' : ` ${Array.isArray(r.value) ? r.value.map(lbl).join(', ') : lbl(r.value)}`;
    return `${q?.code ?? '?'} ${OP_LABEL[r.operator]}${v}`;
  });
  return parts.join(g.op === 'and' ? ' VÀ ' : ' HOẶC ');
}
