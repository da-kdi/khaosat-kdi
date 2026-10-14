import type { Answers, LogicGroup, LogicRule, Question, Section, SurveySchema } from './types.ts';
import { isInputQuestion } from './registry.ts';

export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') {
    const vals = Object.values(v as Record<string, unknown>);
    return vals.length === 0 || vals.every(isEmptyValue);
  }
  return false;
}

function asArray(v: unknown): (string | number)[] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v as (string | number)[];
  return [v as string | number];
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    // dates compare as timestamps
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
      const t = Date.parse(v);
      return Number.isNaN(t) ? null : t;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function evaluateRule(rule: LogicRule, answers: Answers): boolean {
  const actual = answers[rule.questionId];
  const expected = rule.value;
  switch (rule.operator) {
    case 'is_empty':
      return isEmptyValue(actual);
    case 'is_not_empty':
      return !isEmptyValue(actual);
    case 'equals':
      if (Array.isArray(actual)) return actual.map(String).includes(String(expected));
      return String(actual ?? '') === String(expected ?? '');
    case 'not_equals':
      if (Array.isArray(actual)) return !actual.map(String).includes(String(expected));
      return String(actual ?? '') !== String(expected ?? '');
    case 'in':
      return asArray(expected).map(String).includes(String(actual ?? ''));
    case 'not_in':
      return !isEmptyValue(actual) && !asArray(expected).map(String).includes(String(actual));
    case 'contains_any': {
      const a = asArray(actual).map(String);
      return asArray(expected).some((e) => a.includes(String(e)));
    }
    case 'contains_all': {
      const a = asArray(actual).map(String);
      const e = asArray(expected);
      return e.length > 0 && e.every((x) => a.includes(String(x)));
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = toNum(actual);
      const b = toNum(expected);
      if (a === null || b === null) return false;
      if (rule.operator === 'gt') return a > b;
      if (rule.operator === 'gte') return a >= b;
      if (rule.operator === 'lt') return a < b;
      return a <= b;
    }
    default:
      return false;
  }
}

function isGroup(x: LogicRule | LogicGroup): x is LogicGroup {
  return (x as LogicGroup).rules !== undefined;
}

export function evaluateGroup(group: LogicGroup | undefined, answers: Answers): boolean {
  if (!group || !group.rules || group.rules.length === 0) return true;
  const results = group.rules.map((r) => (isGroup(r) ? evaluateGroup(r, answers) : evaluateRule(r, answers)));
  return group.op === 'or' ? results.some(Boolean) : results.every(Boolean);
}

export interface Visibility {
  sections: Set<string>;
  questions: Set<string>;
  /** answers with hidden questions removed (what logic actually "sees") */
  effective: Answers;
}

/**
 * Evaluate visibility in document order. A hidden question's answer is treated as empty
 * for every rule evaluated after it — this makes chained logic deterministic and
 * identical on client and server.
 */
export function computeVisibility(schema: SurveySchema, answers: Answers): Visibility {
  const sections = new Set<string>();
  const questions = new Set<string>();
  const effective: Answers = {};
  for (const section of schema.sections) {
    const sectionVisible = evaluateGroup(section.logic?.visibleIf, effective);
    if (sectionVisible) sections.add(section.id);
    for (const q of section.questions) {
      const visible = sectionVisible && evaluateGroup(q.logic?.visibleIf, effective);
      if (visible) {
        questions.add(q.id);
        if (answers[q.id] !== undefined) effective[q.id] = answers[q.id];
      }
    }
  }
  return { sections, questions, effective };
}

export function isRequired(q: Question, effective: Answers): boolean {
  if (!isInputQuestion(q)) return false;
  if (q.required) return true;
  if (q.logic?.requiredIf) return evaluateGroup(q.logic.requiredIf, effective);
  return false;
}

export function allQuestions(schema: SurveySchema): Question[] {
  return schema.sections.flatMap((s) => s.questions);
}

export function findQuestion(schema: SurveySchema, id: string): Question | undefined {
  for (const s of schema.sections) for (const q of s.questions) if (q.id === id) return q;
  return undefined;
}

export interface LogicIssue {
  questionId: string;
  message: string;
}

/** Static checks: references to missing or later questions. */
export function lintLogic(schema: SurveySchema): LogicIssue[] {
  const issues: LogicIssue[] = [];
  const order = new Map<string, number>();
  let i = 0;
  for (const s of schema.sections) for (const q of s.questions) order.set(q.id, i++);
  const collect = (g: LogicGroup | undefined): LogicRule[] =>
    !g ? [] : g.rules.flatMap((r) => (isGroup(r) ? collect(r) : [r]));

  const check = (ownerId: string, ownerIndex: number, g: LogicGroup | undefined, what: string) => {
    for (const r of collect(g)) {
      if (!order.has(r.questionId)) issues.push({ questionId: ownerId, message: `${what}: tham chiếu câu hỏi đã bị xóa` });
      else if ((order.get(r.questionId) ?? 0) >= ownerIndex)
        issues.push({ questionId: ownerId, message: `${what}: tham chiếu câu hỏi nằm sau hoặc chính nó` });
    }
  };
  for (const s of schema.sections) {
    const firstIdx = s.questions.length ? order.get(s.questions[0].id)! : Number.MAX_SAFE_INTEGER;
    check(s.id, firstIdx, s.logic?.visibleIf, `Section "${s.title}"`);
    for (const q of s.questions) {
      check(q.id, order.get(q.id)!, q.logic?.visibleIf, `Câu ${q.code} (hiển thị)`);
      check(q.id, order.get(q.id)!, q.logic?.requiredIf, `Câu ${q.code} (bắt buộc)`);
    }
  }
  return issues;
}

export function lintSchema(schema: SurveySchema): LogicIssue[] {
  const issues = lintLogic(schema);
  const codes = new Map<string, number>();
  for (const q of allQuestions(schema)) {
    if (!isInputQuestion(q)) continue;
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(q.code)) issues.push({ questionId: q.id, message: `Mã câu hỏi "${q.code}" không hợp lệ (chữ, số, _; bắt đầu bằng chữ)` });
    codes.set(q.code, (codes.get(q.code) ?? 0) + 1);
    const optCodes = new Set<string>();
    for (const o of q.options ?? []) {
      if (optCodes.has(o.code)) issues.push({ questionId: q.id, message: `Câu ${q.code}: mã lựa chọn "${o.code}" bị trùng` });
      optCodes.add(o.code);
    }
  }
  for (const [code, n] of codes) if (n > 1) {
    const q = allQuestions(schema).find((x) => x.code === code)!;
    issues.push({ questionId: q.id, message: `Mã câu hỏi "${code}" bị trùng` });
  }
  if (schema.sections.length === 0) issues.push({ questionId: '', message: 'Khảo sát chưa có section nào' });
  return issues;
}

export function sectionOf(schema: SurveySchema, questionId: string): Section | undefined {
  return schema.sections.find((s) => s.questions.some((q) => q.id === questionId));
}
