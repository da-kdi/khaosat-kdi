import type { SurveySchema } from './types.ts';
import { OTHER_CODE } from './types.ts';
import type { PreparedResponse } from './analytics.ts';
import { analyticQuestions } from './analytics.ts';
import { formatAnswer, normalizeAnswers } from './normalize.ts';
import { getType } from './registry.ts';
import { computeVisibility } from './logic.ts';

type Row = Record<string, string | number | null>;

const meta = (r: PreparedResponse): Row => ({
  response_code: r.code,
  status: r.status,
  started_at: r.startedAt,
  submitted_at: r.submittedAt ?? null,
  duration_seconds: r.durationSeconds ?? null,
  flag: r.flag ?? null,
  version_id: r.versionId,
});

/** One row per response; one column per question code (labels resolved). Grid questions expand to code__row__col. */
export function exportWide(schema: SurveySchema, responses: PreparedResponse[], versions: Record<string, SurveySchema>): Row[] {
  const qs = analyticQuestions(schema);
  return responses.map((r) => {
    const row: Row = meta(r);
    const vSchema = versions[r.versionId] ?? schema;
    for (const q of qs) {
      const vq = analyticQuestions(vSchema).find((x) => x.code === q.code) ?? q;
      const v = r.byCode[q.code];
      if (q.type === 'category_level' || q.type === 'quantity_by_group') {
        for (const row_ of q.rows ?? []) {
          const cols: { code: string }[] = q.type === 'quantity_by_group' ? [{ code: '' }] : q.options ?? [];
          for (const c of cols) {
            const key = c.code ? `${q.code}__${row_.code}__${c.code}` : `${q.code}__${row_.code}`;
            const cell = v ? (v as any)[row_.code] : undefined;
            const n = c.code ? (cell ? cell[c.code] : undefined) : cell;
            row[key] = n === undefined || n === '' ? null : Number(n);
          }
        }
        continue;
      }
      const answersForOther: Record<string, unknown> = {};
      if (r.otherByCode[q.code]) answersForOther[`${vq.id}__other`] = r.otherByCode[q.code];
      row[q.code] = v === undefined ? null : formatAnswer(vq, v, answersForOther);
    }
    return row;
  });
}

/** One row per answer (long format) — ideal for Power BI. */
export function exportLong(responses: PreparedResponse[], versions: Record<string, SurveySchema>): Row[] {
  const out: Row[] = [];
  for (const r of responses) {
    const schema = versions[r.versionId];
    if (!schema) continue;
    const vis = computeVisibility(schema, r.answers);
    for (const a of normalizeAnswers(schema, r.answers)) {
      if (!vis.questions.has(a.question_client_id)) continue;
      const q = schema.sections.flatMap((s) => s.questions).find((x) => x.id === a.question_client_id)!;
      out.push({
        response_code: r.code,
        status: r.status,
        question_code: a.question_code,
        question_type: q.type,
        question_title: q.reportLabel || q.title,
        answer_text: a.answer_text,
        answer_number: a.answer_number,
        answer_date: a.answer_date,
        answer_display: formatAnswer(q, r.answers[q.id], r.answers),
      });
    }
  }
  return out;
}

/** One row per selected option / grid cell. */
export function exportChoices(responses: PreparedResponse[], versions: Record<string, SurveySchema>): Row[] {
  const out: Row[] = [];
  for (const r of responses) {
    const schema = versions[r.versionId];
    if (!schema) continue;
    for (const a of normalizeAnswers(schema, r.answers)) {
      const q = schema.sections.flatMap((s) => s.questions).find((x) => x.id === a.question_client_id)!;
      for (const o of a.options) {
        out.push({
          response_code: r.code,
          status: r.status,
          question_code: a.question_code,
          row_code: o.row_code,
          row_label: o.row_code ? q.rows?.find((x) => x.code === o.row_code)?.label ?? o.row_code : null,
          option_code: o.option_code,
          option_label: o.option_code === OTHER_CODE ? q.settings?.otherLabel || 'Khác' : q.options?.find((x) => x.code === o.option_code)?.label ?? o.option_code,
          rank: o.rank,
          quantity: o.quantity,
          other_text: o.other_text,
        });
      }
    }
  }
  return out;
}

/** Codebook: describes every question & option code. */
export function exportCodebook(schema: SurveySchema): Row[] {
  const out: Row[] = [];
  schema.sections.forEach((s, si) => {
    for (const q of s.questions) {
      const def = getType(q.type);
      if (!def.isInput) continue;
      out.push({ section: `${si + 1}. ${s.title}`, question_code: q.code, question_type: q.type, title: q.title, report_label: q.reportLabel ?? null, required: q.required ? 'yes' : 'no', is_pii: q.isPII ? 'yes' : 'no', kind: 'question', code: null, label: null });
      for (const r of q.rows ?? []) out.push({ section: null, question_code: q.code, question_type: null, title: null, report_label: null, required: null, is_pii: null, kind: 'row', code: r.code, label: r.label });
      for (const o of q.options ?? []) out.push({ section: null, question_code: q.code, question_type: null, title: null, report_label: null, required: null, is_pii: null, kind: 'option', code: o.code, label: o.label });
      if (q.settings?.allowOther) out.push({ section: null, question_code: q.code, question_type: null, title: null, report_label: null, required: null, is_pii: null, kind: 'option', code: OTHER_CODE, label: q.settings.otherLabel || 'Khác' });
    }
  });
  return out;
}
