import {
  analyticQuestions, exportChoices, exportCodebook, exportLong, exportWide, questionStats,
  type PreparedResponse, type SurveySchema,
} from '@core/index.ts';

type Row = Record<string, unknown>;

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

export async function exportXlsx(fileBase: string, schema: SurveySchema, rs: PreparedResponse[], versions: Record<string, SurveySchema>) {
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

export function exportCsv(fileBase: string, kind: 'wide' | 'long' | 'choices' | 'summary', schema: SurveySchema, rs: PreparedResponse[], versions: Record<string, SurveySchema>) {
  const rows: Row[] = kind === 'wide' ? exportWide(schema, rs, versions) : kind === 'long' ? exportLong(rs, versions) : kind === 'choices' ? exportChoices(rs, versions) : summaryRows(schema, rs);
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`);
  const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${fileBase}-${kind}.csv`;
  a.click();
}
