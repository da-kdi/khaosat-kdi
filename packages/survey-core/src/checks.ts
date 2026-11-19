import type { Answers, CrossCheck, CheckOperand, Question, SurveySchema } from './types.ts';
import { allQuestions, computeVisibility, isEmptyValue } from './logic.ts';

export interface CheckResult {
  check: CrossCheck;
  /** question the message is attached to (left side) */
  questionId: string;
  message: string;
}

const OP_LABEL: Record<CrossCheck['op'], string> = { lte: '≤', lt: '<', gte: '≥', gt: '>', eq: '=' };

const num = (x: unknown): number | undefined => {
  if (x === '' || x === null || x === undefined) return undefined;
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : undefined;
};
const sum = (xs: (number | undefined)[]) => {
  const d = xs.filter((x): x is number => x !== undefined);
  return d.length ? d.reduce((a, b) => a + b, 0) : undefined;
};

/** Parts a question exposes for numeric checks: '' = whole value / total. */
export function checkParts(q: Question): { code: string; label: string }[] {
  switch (q.type) {
    case 'number': case 'currency': case 'percentage': case 'rating': case 'nps':
      return [{ code: '', label: 'Giá trị' }];
    case 'number_range':
      return [{ code: 'min', label: 'Tối thiểu' }, { code: 'max', label: 'Tối đa' }];
    case 'quantity_by_group':
      return [{ code: '', label: 'Tổng' }, ...(q.rows ?? []).map((r) => ({ code: r.code, label: r.label }))];
    case 'number_grid':
      return [{ code: '', label: 'Tổng' }, ...(q.rows ?? []).map((r) => ({ code: `row:${r.code}`, label: `Dòng “${r.label}”` })), ...(q.options ?? []).map((c) => ({ code: `col:${c.code}`, label: `Cột “${c.label}”` }))];
    case 'composite':
      return (q.settings?.fields ?? []).filter((f) => f.kind === 'number').map((f) => ({ code: f.code, label: f.label }));
    default:
      return [];
  }
}

/** Numeric value of one part of an answer, or undefined when not answered. */
export function numericPart(q: Question, v: unknown, part = ''): number | undefined {
  if (isEmptyValue(v)) return undefined;
  switch (q.type) {
    case 'number_range': {
      const r = v as { min?: unknown; max?: unknown };
      return part === 'max' ? num(r.max) : num(r.min);
    }
    case 'quantity_by_group': {
      const m = v as Record<string, unknown>;
      return part ? num(m[part]) : sum(Object.values(m).map(num));
    }
    case 'number_grid': {
      const g = v as Record<string, Record<string, unknown>>;
      if (part.startsWith('row:')) return sum(Object.values(g[part.slice(4)] ?? {}).map(num));
      if (part.startsWith('col:')) { const c = part.slice(4); return sum(Object.values(g).map((r) => num(r?.[c]))); }
      return sum(Object.values(g).flatMap((r) => Object.values(r ?? {}).map(num)));
    }
    case 'composite':
      return num((v as Record<string, unknown>)[part]);
    default:
      return num(v);
  }
}

function operandValue(o: CheckOperand, byId: Map<string, Question>, answers: Answers, visible: Set<string>): number | undefined {
  if ('value' in o) return num(o.value);
  const q = byId.get(o.questionId);
  if (!q || !visible.has(q.id)) return undefined;
  const n = numericPart(q, answers[q.id], o.part ?? '');
  return n === undefined ? undefined : n * (o.factor ?? 1);
}

export function describeOperand(o: CheckOperand, schema: SurveySchema): string {
  if ('value' in o) return String(o.value);
  const qs = allQuestions(schema);
  const q = qs.find((x) => x.id === o.questionId);
  if (!q) return '(câu đã xóa)';
  const n = qs.filter((x) => x.type !== 'heading' && x.type !== 'paragraph' && x.type !== 'instruction' && x.type !== 'image' && x.type !== 'video' && x.type !== 'link' && x.type !== 'divider').indexOf(q) + 1;
  const part = checkParts(q).find((p) => p.code === (o.part ?? ''));
  const partLabel = part && part.code ? ` – ${part.label}` : part?.label === 'Tổng' ? ' (tổng)' : '';
  return `Câu ${n}${partLabel}${o.factor && o.factor !== 1 ? ` × ${o.factor}` : ''}`;
}

export function describeCheck(c: CrossCheck, schema: SurveySchema): string {
  return `${describeOperand(c.left, schema)} ${OP_LABEL[c.op]} ${describeOperand(c.right, schema)}`;
}

/** Run every cross-question check. Checks with a missing side are skipped. */
export function runChecks(schema: SurveySchema, answers: Answers, severity?: CrossCheck['severity']): CheckResult[] {
  const checks = schema.checks ?? [];
  if (!checks.length) return [];
  const vis = computeVisibility(schema, answers);
  const byId = new Map(allQuestions(schema).map((q) => [q.id, q]));
  const out: CheckResult[] = [];
  for (const c of checks) {
    if (severity && c.severity !== severity) continue;
    if (!('questionId' in c.left)) continue;
    const a = operandValue(c.left, byId, answers, vis.questions);
    const b = operandValue(c.right, byId, answers, vis.questions);
    if (a === undefined || b === undefined) continue;
    const ok = c.op === 'lte' ? a <= b : c.op === 'lt' ? a < b : c.op === 'gte' ? a >= b : c.op === 'gt' ? a > b : a === b;
    if (ok) continue;
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
    out.push({ check: c, questionId: c.left.questionId, message: c.message || `${describeCheck(c, schema)} chưa đúng (${fmt(a)} so với ${fmt(b)}). Vui lòng kiểm tra lại.` });
  }
  return out;
}
