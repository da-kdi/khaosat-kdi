import type { Answers, GridValue, Question, SurveySchema } from './types.ts';
import { OTHER_CODE, otherKey } from './types.ts';
import { getType, isInputQuestion } from './registry.ts';
import { allQuestions, isEmptyValue } from './logic.ts';

/** One row of response_answers */
export interface AnswerRow {
  question_client_id: string;
  question_code: string;
  answer_text: string | null;
  answer_number: number | null;
  answer_date: string | null;
  /** raw value — always stored so the answer can be re-rendered exactly */
  answer_json: unknown;
  options: OptionRow[];
}

/** One row of response_answer_options — one per selected choice / grid cell */
export interface OptionRow {
  option_code: string;
  row_code: string | null;
  rank: number | null;
  quantity: number | null;
  other_text: string | null;
}

/**
 * Convert sanitized answers into typed, analysis-friendly rows.
 * Same function runs in browser (demo mode) and in the Edge Function.
 */
export function normalizeAnswers(schema: SurveySchema, answers: Answers): AnswerRow[] {
  const rows: AnswerRow[] = [];
  for (const q of allQuestions(schema)) {
    if (!isInputQuestion(q)) continue;
    const v = answers[q.id];
    if (v === undefined) continue;
    rows.push(normalizeOne(q, v, answers));
  }
  return rows;
}

function normalizeOne(q: Question, v: unknown, answers: Answers): AnswerRow {
  const row: AnswerRow = {
    question_client_id: q.id,
    question_code: q.code,
    answer_text: null,
    answer_number: null,
    answer_date: null,
    answer_json: v,
    options: [],
  };
  const other = answers[otherKey(q.id)];
  const otherText = typeof other === 'string' && other.trim() ? other.trim() : null;
  const def = getType(q.type);

  switch (def.storage) {
    case 'text':
      row.answer_text = String(v);
      break;
    case 'number':
      row.answer_number = Number(v);
      break;
    case 'date':
      row.answer_date = String(v);
      row.answer_text = String(v);
      break;
    case 'json':
      row.answer_text = flattenText(v);
      break;
    case 'file':
      row.answer_text = (Array.isArray(v) ? v : [v]).map((f: any) => f?.name).filter(Boolean).join('; ');
      break;
    case 'options':
      break;
  }

  if (q.type === 'consent') {
    row.answer_text = v === true ? 'agree' : 'disagree';
    row.options.push(opt(v === true ? 'agree' : 'disagree'));
  } else if (q.type === 'single_choice' || q.type === 'dropdown' || q.type === 'yes_no' || q.type === 'likert') {
    const code = String(v);
    row.answer_text = code === OTHER_CODE ? otherText : code;
    row.options.push({ ...opt(code), other_text: code === OTHER_CODE ? otherText : null });
    if (q.type === 'likert') {
      const idx = (q.options ?? []).findIndex((o) => o.code === code);
      if (idx >= 0) row.answer_number = idx + 1;
    }
  } else if (q.type === 'multiple_choice') {
    for (const c of v as string[]) row.options.push({ ...opt(String(c)), other_text: c === OTHER_CODE ? otherText : null });
    row.answer_text = (v as string[]).join(';');
  } else if (q.type === 'ranking') {
    (v as string[]).forEach((c, i) => row.options.push({ ...opt(String(c)), rank: i + 1 }));
  } else if (q.type === 'matrix') {
    for (const [r, sel] of Object.entries(v as Record<string, unknown>)) {
      for (const c of Array.isArray(sel) ? sel : [sel]) row.options.push({ ...opt(String(c)), row_code: r });
    }
  } else if (q.type === 'quantity_by_group') {
    let total = 0;
    for (const [r, n] of Object.entries(v as Record<string, unknown>)) {
      if (n === '' || n === null || n === undefined) continue;
      total += Number(n);
      row.options.push({ ...opt('qty'), row_code: r, quantity: Number(n) });
    }
    row.answer_number = total;
  } else if (q.type === 'number_range') {
    const r = v as Record<string, unknown>;
    const lo = r.min === '' || r.min == null ? null : Number(r.min);
    const hi = r.max === '' || r.max == null ? null : Number(r.max);
    row.answer_number = lo !== null && hi !== null ? (lo + hi) / 2 : lo ?? hi;
    row.answer_text = `${lo ?? ''}–${hi ?? ''}`;
    if (lo !== null) row.options.push({ ...opt('min'), quantity: lo });
    if (hi !== null) row.options.push({ ...opt('max'), quantity: hi });
  } else if (q.type === 'number_grid') {
    let total = 0;
    for (const [r, cells] of Object.entries(v as Record<string, Record<string, unknown>>)) {
      for (const [c, n] of Object.entries(cells ?? {})) {
        if (n === '' || n === null || n === undefined || !Number.isFinite(Number(n))) continue;
        total += Number(n);
        row.options.push({ ...opt(c), row_code: r, quantity: Number(n) });
      }
    }
    row.answer_number = total;
  } else if (q.type === 'composite') {
    const c = v as Record<string, unknown>;
    row.answer_text = (q.settings?.fields ?? []).filter((f) => !isEmptyValue(c[f.code])).map((f) => `${f.label}: ${c[f.code]}${f.unit ? ` ${f.unit}` : ''}`).join('; ');
    for (const f of q.settings?.fields ?? []) {
      if (f.kind === 'number' && !isEmptyValue(c[f.code])) row.options.push({ ...opt(f.code), quantity: Number(c[f.code]) });
    }
  } else if (q.type === 'category_level') {
    let total = 0;
    for (const [r, cells] of Object.entries(v as GridValue)) {
      for (const [c, n] of Object.entries(cells ?? {})) {
        if (!(Number(n) > 0)) continue;
        total += Number(n);
        row.options.push({ ...opt(c), row_code: r, quantity: Number(n) });
      }
    }
    row.answer_number = total;
  }
  return row;
}

function opt(code: string): OptionRow {
  return { option_code: code, row_code: null, rank: null, quantity: null, other_text: null };
}

function flattenText(v: unknown): string {
  if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>).filter(Boolean).join(', ');
  return String(v ?? '');
}

/** Human-readable rendering of an answer for tables / exports. */
export function formatAnswer(q: Question, v: unknown, answers?: Answers): string {
  if (v === undefined || v === null || v === '') return '';
  const label = (code: string) => {
    if (code === OTHER_CODE) {
      const t = answers?.[otherKey(q.id)];
      return `${q.settings?.otherLabel || 'Khác'}${t ? `: ${t}` : ''}`;
    }
    return q.options?.find((o) => o.code === code)?.label ?? code;
  };
  const rowLabel = (code: string) => q.rows?.find((o) => o.code === code)?.label ?? code;
  switch (q.type) {
    case 'consent':
      return v === true ? 'Đồng ý' : 'Không đồng ý';
    case 'single_choice': case 'dropdown': case 'yes_no': case 'likert':
      return label(String(v));
    case 'multiple_choice':
      return (v as string[]).map(label).join('; ');
    case 'ranking':
      return (v as string[]).map((c, i) => `${i + 1}. ${label(c)}`).join(' | ');
    case 'matrix':
      return Object.entries(v as Record<string, unknown>)
        .map(([r, s]) => `${rowLabel(r)}: ${(Array.isArray(s) ? s : [s]).map((c) => label(String(c))).join(', ')}`)
        .join(' | ');
    case 'quantity_by_group':
      return Object.entries(v as Record<string, unknown>).filter(([, n]) => n !== '' && n != null).map(([r, n]) => `${rowLabel(r)}: ${n}`).join(' | ');
    case 'category_level':
      return Object.entries(v as GridValue)
        .flatMap(([r, cells]) => Object.entries(cells ?? {}).filter(([, n]) => Number(n) > 0)
          .map(([c, n]) => `${rowLabel(r)} – ${label(c)}${q.settings?.withQuantity ? ` (${n})` : ''}`))
        .join(' | ');
    case 'currency':
      return `${Number(v).toLocaleString('vi-VN')} ${q.settings?.currency ?? 'VND'}`;
    case 'number':
      return q.settings?.unit ? `${v} ${q.settings.unit}` : String(v);
    case 'number_range': {
      const r = v as Record<string, unknown>;
      return `${r.min ?? '?'} – ${r.max ?? '?'}${q.settings?.unit ? ` ${q.settings.unit}` : ''}`;
    }
    case 'number_grid':
      return Object.entries(v as Record<string, Record<string, unknown>>)
        .map(([r, cells]) => `${rowLabel(r)}: ${Object.entries(cells ?? {}).filter(([, n]) => n !== '' && n != null).map(([c, n]) => `${label(c)} ${n}`).join(', ')}`)
        .filter((s) => !s.endsWith(': ')).join(' | ');
    case 'composite': {
      const c = v as Record<string, unknown>;
      return (q.settings?.fields ?? []).filter((f) => !isEmptyValue(c[f.code])).map((f) => `${f.label}: ${c[f.code]}${f.unit ? ` ${f.unit}` : ''}`).join('; ');
    }
    case 'percentage':
      return `${v}%`;
    case 'address': case 'contact':
      return flattenText(v);
    case 'file_upload':
      return (Array.isArray(v) ? v : [v]).map((f: any) => f?.name).join('; ');
    default:
      return String(v);
  }
}
