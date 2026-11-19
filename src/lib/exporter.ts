import {
  analyticQuestions, exportChoices, exportCodebook, exportLong, exportWide, questionStats,
  type PreparedResponse, type SurveySchema,
} from '@core/index.ts';

import { isPersonal } from './pii';

type Row = Record<string, unknown>;
export interface ExportOptions { /** bỏ câu trả lời của các câu chứa dữ liệu cá nhân (và mã người tham gia) */ hidePII?: boolean }

/** Bỏ dữ liệu cá nhân khỏi phản hồi trước khi xuất — dựa trên cấu trúc của chính phiên bản người trả lời đã dùng. */
export function stripPII(rs: PreparedResponse[], versions: Record<string, SurveySchema>, current: SurveySchema): PreparedResponse[] {
  const codes = new Set(current.sections.flatMap((s) => s.questions).filter(isPersonal).map((q) => q.code));
  for (const v of Object.values(versions)) for (const s of v.sections) for (const q of s.questions) if (isPersonal(q)) codes.add(q.code);
  return rs.map((r) => {
    const schema = versions[r.versionId] ?? current;
    const ids = new Set(schema.sections.flatMap((s) => s.questions).filter((q) => codes.has(q.code)).map((q) => q.id));
    const answers = Object.fromEntries(Object.entries(r.answers).filter(([k]) => !ids.has(k.replace(/__other$/, ''))));
    const byCode = Object.fromEntries(Object.entries(r.byCode).filter(([k]) => !codes.has(k)));
    const otherByCode = Object.fromEntries(Object.entries(r.otherByCode).filter(([k]) => !codes.has(k)));
    return { ...r, answers, byCode, otherByCode, respondentRef: null };
  });
}

function summaryRows(schema: SurveySchema, rs: PreparedResponse[]): Row[] {
  const out: Row[] = [];
  for (const q of analyticQuestions(schema)) {
    const st = questionStats(q, rs);
    const base = { question_code: q.code, question: q.reportLabel || q.title, shown: st.shown, answered: st.answered };
    if (st.options) for (const o of st.options) out.push({ ...base, item: o.label, option_code: o.code, count: o.count, pct_of_respondents: round(o.pctOfRespondents), pct_of_selections: round(o.pctOfSelections) });
    else if (st.grid) for (const r of st.grid.rows) for (const c of st.grid.cols) out.push({ ...base, item: `${r.label} | ${c.label}`, option_code: `${r.code}:${c.code}`, count: st.grid.respondents[r.code]?.[c.code] ?? 0, total_quantity: st.grid.cells[r.code]?.[c.code] ?? 0 });
    else if (st.ranking) for (const r of st.ranking) out.push({ ...base, item: r.label, option_code: r.code, avg_rank: round(r.avgRank, 2), borda: r.borda });
    else if (st.numeric) out.push({ ...base, item: 'numeric', mean: round(st.numeric.mean, 2), median: st.numeric.median, min: st.numeric.min, max: st.numeric.max, ...(st.nps ? { nps: st.nps.score } : {}) });
    else out.push(base);
  }
  return out;
}
const round = (n: number, d = 4) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);

export async function exportXlsx(fileBase: string, schema: SurveySchema, rs: PreparedResponse[], versions: Record<string, SurveySchema>, opt: ExportOptions = {}) {
  if (opt.hidePII) rs = stripPII(rs, versions, schema);
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Row[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: 'Không có dữ liệu' }]), name);
  add('Responses_wide', exportWide(schema, rs, versions));
  add('Answers_long', exportLong(rs, versions));
  add('Choices', exportChoices(rs, versions));
  add('Summary', summaryRows(schema, rs));
  add('Codebook', exportCodebook(schema));
  XLSX.writeFile(wb, `${fileBase}.xlsx`);
}

export function exportCsv(fileBase: string, kind: 'wide' | 'long' | 'choices' | 'summary', schema: SurveySchema, rs: PreparedResponse[], versions: Record<string, SurveySchema>, opt: ExportOptions = {}) {
  if (opt.hidePII) rs = stripPII(rs, versions, schema);
  const rows: Row[] = kind === 'wide' ? exportWide(schema, rs, versions) : kind === 'long' ? exportLong(rs, versions) : kind === 'choices' ? exportChoices(rs, versions) : summaryRows(schema, rs);
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`);
  const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${fileBase}-${kind}.csv`;
  a.click();
}
