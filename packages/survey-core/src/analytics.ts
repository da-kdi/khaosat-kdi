import type { Answers, GridValue, Question, SurveySchema } from './types.ts';
import { OTHER_CODE, otherKey } from './types.ts';
import { allQuestions, computeVisibility, isEmptyValue } from './logic.ts';
import { getType, isInputQuestion } from './registry.ts';

export type ResponseStatus = 'in_progress' | 'submitted';
export type ResponseFlag = 'needs_review' | 'invalid' | 'spam' | null;

export interface ResponseRecord {
  id: string;
  code: string;
  versionId: string;
  status: ResponseStatus;
  startedAt: string;
  submittedAt?: string | null;
  durationSeconds?: number | null;
  answers: Answers; // keyed by question client id of its own version
  flag?: ResponseFlag;
  flagReason?: string | null;
  note?: string | null;
  respondentRef?: string | null;
  /** section ids reached, in order (from response_events) */
  reachedSections?: string[];
}

/** Response prepared for cross-version analytics: keyed by question CODE */
export interface PreparedResponse extends ResponseRecord {
  byCode: Record<string, unknown>;
  otherByCode: Record<string, string>;
  shownCodes: Set<string>;
}

export function prepareResponses(responses: ResponseRecord[], versions: Record<string, SurveySchema>): PreparedResponse[] {
  return responses.map((r) => {
    const schema = versions[r.versionId];
    const byCode: Record<string, unknown> = {};
    const otherByCode: Record<string, string> = {};
    const shownCodes = new Set<string>();
    if (schema) {
      const vis = computeVisibility(schema, r.answers);
      // for in-progress responses, "shown" = visible AND in a reached section
      const reached = r.status === 'submitted' ? null : new Set(r.reachedSections ?? []);
      for (const s of schema.sections) for (const q of s.questions) {
        if (!isInputQuestion(q)) continue;
        if (vis.questions.has(q.id) && (!reached || reached.has(s.id))) shownCodes.add(q.code);
        if (r.answers[q.id] !== undefined) byCode[q.code] = r.answers[q.id];
        const o = r.answers[otherKey(q.id)];
        if (typeof o === 'string' && o) otherByCode[q.code] = o;
      }
    }
    return { ...r, byCode, otherByCode, shownCodes };
  });
}

// ───────────────────────── KPIs ─────────────────────────

export interface Kpis {
  started: number;
  submitted: number;
  inProgress: number;
  completionRate: number | null; // submitted / started
  avgDurationSec: number | null;
  medianDurationSec: number | null;
  flagged: number;
}

export function computeKpis(responses: ResponseRecord[]): Kpis {
  const started = responses.length;
  const submittedList = responses.filter((r) => r.status === 'submitted');
  const submitted = submittedList.length;
  const durations = submittedList.map((r) => r.durationSeconds ?? NaN).filter((d) => Number.isFinite(d) && d >= 0).sort((a, b) => a - b);
  // drop outliers above P99
  const p99 = durations.length > 20 ? quantile(durations, 0.99) : Infinity;
  const kept = durations.filter((d) => d <= p99);
  return {
    started,
    submitted,
    inProgress: responses.filter((r) => r.status === 'in_progress').length,
    completionRate: started ? submitted / started : null,
    avgDurationSec: kept.length ? kept.reduce((a, b) => a + b, 0) / kept.length : null,
    medianDurationSec: kept.length ? quantile(kept, 0.5) : null,
    flagged: responses.filter((r) => r.flag).length,
  };
}

export interface SectionFunnelRow {
  sectionId: string;
  title: string;
  reached: number;
  droppedHere: number;
  dropRate: number | null; // droppedHere / reached
}

/** Drop-off by section (denominator = responses that reached the section). */
export function sectionFunnel(schema: SurveySchema, responses: ResponseRecord[]): SectionFunnelRow[] {
  return schema.sections.map((s) => {
    let reached = 0;
    let dropped = 0;
    for (const r of responses) {
      const path = r.reachedSections ?? [];
      if (r.status === 'submitted' || path.includes(s.id)) reached++;
      if (r.status === 'in_progress' && path[path.length - 1] === s.id) dropped++;
    }
    return { sectionId: s.id, title: s.title, reached, droppedHere: dropped, dropRate: reached ? dropped / reached : null };
  });
}

// ───────────────────────── Question stats ─────────────────────────

export interface OptionStat {
  code: string;
  label: string;
  count: number;              // selections
  pctOfRespondents: number;   // count / answered
  pctOfSelections: number;    // count / totalSelections
}

export interface NumericStats { n: number; min: number; max: number; mean: number; median: number; p25: number; p75: number; sum: number }

export interface QuestionStats {
  question: Question;
  chart: ReturnType<typeof getType>['chart'];
  shown: number;     // respondents who were shown the question (denominator)
  answered: number;
  skipRate: number | null; // (shown - answered) / shown
  options?: OptionStat[];
  totalSelections?: number;
  numeric?: NumericStats;
  histogram?: { bucket: string; count: number }[];
  distribution?: { value: string; count: number; pct: number }[];
  nps?: { promoters: number; passives: number; detractors: number; score: number };
  ranking?: { code: string; label: string; avgRank: number; borda: number }[];
  grid?: { rows: { code: string; label: string }[]; cols: { code: string; label: string }[]; cells: Record<string, Record<string, number>>; respondents: Record<string, Record<string, number>>; rowTotals: Record<string, number>; colTotals: Record<string, number> };
  texts?: { responseId: string; text: string }[];
  keywords?: { word: string; count: number }[];
  timeline?: { date: string; count: number }[];
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function numericStats(values: number[]): NumericStats | undefined {
  if (!values.length) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return { n: s.length, min: s[0], max: s[s.length - 1], mean: sum / s.length, median: quantile(s, 0.5), p25: quantile(s, 0.25), p75: quantile(s, 0.75), sum };
}

function histogram(values: number[], bins = 8): { bucket: string; count: number }[] {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ bucket: fmt(min), count: values.length }];
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - min) / width))]++;
  return counts.map((c, i) => ({ bucket: `${fmt(min + i * width)}–${fmt(min + (i + 1) * width)}`, count: c }));
}

const fmt = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('vi-VN') : String(Math.round(n * 100) / 100));

const STOP = new Set(('và của là có cho các những được với không trong một này để thì khi đã sẽ rất cũng như từ theo về ra vào làm nên hay hoặc nhưng mà thêm nhiều hơn em tôi chúng ta mình bạn các_em học sinh nhà trường ở lại đó nào gì').split(/\s+/));

export function keywordFrequency(texts: string[], top = 25): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    const words = t.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
    // bigrams carry more meaning in Vietnamese (e.g. "robot lập_trình")
    const seen = new Set<string>();
    for (let i = 0; i < words.length; i++) {
      seen.add(words[i]);
      if (i < words.length - 1) seen.add(`${words[i]} ${words[i + 1]}`);
    }
    for (const w of seen) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([w, c]) => c > 1 || !w.includes(' ')).sort((a, b) => b[1] - a[1]).slice(0, top).map(([word, count]) => ({ word, count }));
}

export function questionStats(q: Question, responses: PreparedResponse[]): QuestionStats {
  const def = getType(q.type);
  const shownList = responses.filter((r) => r.shownCodes.has(q.code));
  const answeredList = shownList.filter((r) => !isEmptyValue(r.byCode[q.code]) || r.byCode[q.code] === true);
  const shown = shownList.length;
  const answered = answeredList.length;
  const stats: QuestionStats = { question: q, chart: def.chart, shown, answered, skipRate: shown ? (shown - answered) / shown : null };
  const values = answeredList.map((r) => r.byCode[q.code]);
  const optLabel = (code: string) => (code === OTHER_CODE ? q.settings?.otherLabel || 'Khác' : q.options?.find((o) => o.code === code)?.label ?? `${code} (đã xóa)`);

  const countOptions = (codes: string[][]) => {
    const counts = new Map<string, number>();
    for (const o of q.options ?? []) counts.set(o.code, 0);
    if (q.settings?.allowOther) counts.set(OTHER_CODE, 0);
    let total = 0;
    for (const arr of codes) for (const c of arr) { counts.set(c, (counts.get(c) ?? 0) + 1); total++; }
    stats.totalSelections = total;
    stats.options = [...counts.entries()].map(([code, count]) => ({
      code, label: optLabel(code), count,
      pctOfRespondents: answered ? count / answered : 0,
      pctOfSelections: total ? count / total : 0,
    }));
  };

  switch (q.type) {
    case 'single_choice': case 'dropdown': case 'yes_no': case 'likert':
      countOptions(values.map((v) => [String(v)]));
      if (q.type === 'likert') {
        const nums = values.map((v) => (q.options ?? []).findIndex((o) => o.code === v) + 1).filter((n) => n > 0);
        stats.numeric = numericStats(nums);
      }
      break;
    case 'multiple_choice':
      countOptions(values.map((v) => (v as string[]).map(String)));
      break;
    case 'consent':
      break;
    case 'rating': case 'nps': {
      const nums = values.map(Number).filter(Number.isFinite);
      stats.numeric = numericStats(nums);
      const lo = q.type === 'nps' ? 0 : 1;
      const hi = q.type === 'nps' ? 10 : q.settings?.scaleMax ?? 5;
      stats.distribution = [];
      for (let i = lo; i <= hi; i++) {
        const c = nums.filter((n) => n === i).length;
        stats.distribution.push({ value: String(i), count: c, pct: nums.length ? c / nums.length : 0 });
      }
      if (q.type === 'nps' && nums.length) {
        const p = nums.filter((n) => n >= 9).length / nums.length;
        const d = nums.filter((n) => n <= 6).length / nums.length;
        stats.nps = { promoters: p, passives: 1 - p - d, detractors: d, score: Math.round((p - d) * 100) };
      }
      break;
    }
    case 'number': case 'currency': case 'percentage': {
      const nums = values.map(Number).filter(Number.isFinite);
      stats.numeric = numericStats(nums);
      stats.histogram = histogram(nums);
      break;
    }
    case 'date': case 'datetime': {
      const m = new Map<string, number>();
      for (const v of values) { const d = String(v).slice(0, 10); m.set(d, (m.get(d) ?? 0) + 1); }
      stats.timeline = [...m.entries()].sort().map(([date, count]) => ({ date, count }));
      break;
    }
    case 'ranking': {
      const n = (q.options ?? []).length;
      stats.ranking = (q.options ?? []).map((o) => {
        const ranks = values.map((v) => (v as string[]).indexOf(o.code) + 1).filter((r) => r > 0);
        const avg = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : NaN;
        const borda = ranks.reduce((a, r) => a + (n - r + 1), 0);
        return { code: o.code, label: o.label, avgRank: avg, borda };
      }).sort((a, b) => a.avgRank - b.avgRank);
      break;
    }
    case 'matrix': case 'quantity_by_group': case 'category_level': case 'number_grid': case 'number_range': {
      const rows = q.type === 'number_range' ? [{ code: 'min', label: 'Tối thiểu' }, { code: 'max', label: 'Tối đa' }] : (q.rows ?? []).map((r) => ({ code: r.code, label: r.label }));
      const cols = q.type === 'quantity_by_group' || q.type === 'number_range' ? [{ code: 'qty', label: q.settings?.unit ? `Số lượng (${q.settings.unit})` : 'Số lượng' }] : (q.options ?? []).map((o) => ({ code: o.code, label: o.label }));
      const cells: Record<string, Record<string, number>> = {};
      const respondents: Record<string, Record<string, number>> = {};
      for (const r of rows) { cells[r.code] = {}; respondents[r.code] = {}; for (const c of cols) { cells[r.code][c.code] = 0; respondents[r.code][c.code] = 0; } }
      const add = (r: string, c: string, qty: number) => {
        if (!cells[r]) { cells[r] = {}; respondents[r] = {}; }
        cells[r][c] = (cells[r][c] ?? 0) + qty;
        respondents[r][c] = (respondents[r][c] ?? 0) + 1;
      };
      for (const v of values) {
        if (q.type === 'matrix') for (const [r, sel] of Object.entries(v as Record<string, unknown>)) for (const c of Array.isArray(sel) ? sel : [sel]) add(r, String(c), 1);
        if (q.type === 'quantity_by_group') for (const [r, n] of Object.entries(v as Record<string, unknown>)) { if (n !== '' && n != null) add(r, 'qty', Number(n)); }
        if (q.type === 'category_level') for (const [r, cs] of Object.entries(v as GridValue)) for (const [c, n] of Object.entries(cs ?? {})) if (Number(n) > 0) add(r, c, Number(n));
        if (q.type === 'number_grid') for (const [r, cs] of Object.entries(v as Record<string, Record<string, unknown>>)) for (const [c, n] of Object.entries(cs ?? {})) if (n !== '' && n != null && Number.isFinite(Number(n))) add(r, c, Number(n));
        if (q.type === 'number_range') for (const k of ['min', 'max']) { const n = (v as Record<string, unknown>)[k]; if (n !== '' && n != null && Number.isFinite(Number(n))) add(k, 'qty', Number(n)); }
      }
      const rowTotals: Record<string, number> = {};
      const colTotals: Record<string, number> = {};
      for (const [r, cs] of Object.entries(cells)) for (const [c, n] of Object.entries(cs)) { rowTotals[r] = (rowTotals[r] ?? 0) + n; colTotals[c] = (colTotals[c] ?? 0) + n; }
      stats.grid = { rows, cols, cells, respondents, rowTotals, colTotals };
      break;
    }
    case 'short_text': case 'long_text': case 'email': case 'phone': case 'url': case 'time': case 'address': case 'contact': case 'composite': {
      stats.texts = answeredList.map((r) => {
        const v = r.byCode[q.code];
        return { responseId: r.id, text: typeof v === 'object' ? Object.values(v as object).filter(Boolean).join(', ') : String(v) };
      });
      if (q.type === 'long_text') stats.keywords = keywordFrequency(stats.texts.map((t) => t.text));
      break;
    }
    case 'file_upload':
      stats.texts = answeredList.flatMap((r) => (Array.isArray(r.byCode[q.code]) ? (r.byCode[q.code] as any[]) : [r.byCode[q.code]]).map((f: any) => ({ responseId: r.id, text: f?.name ?? '' })));
      break;
  }
  // texts for "other" options
  if (q.settings?.allowOther) {
    const others = answeredList.filter((r) => r.otherByCode[q.code]).map((r) => ({ responseId: r.id, text: r.otherByCode[q.code] }));
    if (others.length) stats.texts = others;
  }
  return stats;
}

// ───────────────────────── Filtering ─────────────────────────

export interface AnswerFilter {
  questionCode: string;
  /** option code; for grids: "rowCode:colCode" ; for numbers: value */
  value: string;
  label?: string;
}

export function matchesFilter(r: PreparedResponse, f: AnswerFilter): boolean {
  const v = r.byCode[f.questionCode];
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.map(String).includes(f.value);
  if (typeof v === 'object') {
    const [row, col] = f.value.split(':');
    const cell = (v as Record<string, any>)[row];
    if (cell === undefined) return false;
    if (col === undefined || col === 'qty') return Number(cell) > 0 || (typeof cell === 'object' && !isEmptyValue(cell));
    if (Array.isArray(cell)) return cell.map(String).includes(col);
    if (typeof cell === 'object') return Number(cell[col]) > 0;
    return String(cell) === col;
  }
  return String(v) === f.value;
}

export function applyFilters(rs: PreparedResponse[], filters: AnswerFilter[]): PreparedResponse[] {
  return filters.length ? rs.filter((r) => filters.every((f) => matchesFilter(r, f))) : rs;
}

/** Questions of the latest schema, input-only, for analytics listing */
export function analyticQuestions(schema: SurveySchema): Question[] {
  return allQuestions(schema).filter((q) => isInputQuestion(q) && q.type !== 'consent');
}
