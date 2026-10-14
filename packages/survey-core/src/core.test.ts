import { describe, expect, it } from 'vitest';
import {
  TEMPLATES, computeVisibility, validateAnswers, sanitizeAnswers, normalizeAnswers, evaluateGroup,
  prepareResponses, questionStats, computeKpis, lintSchema, cloneSchemaWithNewIds, exportWide, exportChoices,
  OTHER_CODE, type ResponseRecord, type SurveySchema,
} from './index.ts';

const stem = TEMPLATES.find((t) => t.key === 'stem-needs')!.schema;
const sat = TEMPLATES.find((t) => t.key === 'course-satisfaction')!.schema;

const validStem = {
  q_consent: true,
  q_school: 'THCS Lê Lợi',
  q_level: 'thcs',
  q_addr: { province: 'Hải Phòng', ward: 'Lê Chân', street: '1 Trần Phú' },
  q_contact: { name: 'Nguyễn A', position: 'Hiệu phó', phone: '0912345678', email: 'a@truong.edu.vn' },
  q_cls_thcs: { k6: 5, k7: 5, k8: 4, k9: 4 },
  q_topics: { robot: { thcs: 3 }, ai: { thcs: 2 } },
  q_mode: ['club', OTHER_CODE],
  q_mode__other: 'Hội thi',
  q_lab: 'yes',
};

describe('logic engine', () => {
  it('evaluates AND/OR groups', () => {
    const a = { x: 'a', n: 5, m: ['p', 'q'] };
    expect(evaluateGroup({ op: 'and', rules: [{ questionId: 'x', operator: 'equals', value: 'a' }, { questionId: 'n', operator: 'gt', value: 3 }] }, a)).toBe(true);
    expect(evaluateGroup({ op: 'and', rules: [{ questionId: 'x', operator: 'equals', value: 'a' }, { questionId: 'n', operator: 'gt', value: 9 }] }, a)).toBe(false);
    expect(evaluateGroup({ op: 'or', rules: [{ questionId: 'x', operator: 'equals', value: 'z' }, { questionId: 'm', operator: 'contains_any', value: ['q'] }] }, a)).toBe(true);
    expect(evaluateGroup({ op: 'and', rules: [{ questionId: 'm', operator: 'contains_all', value: ['p', 'z'] }] }, a)).toBe(false);
    expect(evaluateGroup({ op: 'and', rules: [{ questionId: 'missing', operator: 'is_empty' }] }, a)).toBe(true);
  });

  it('shows grade grids according to school level', () => {
    const v = computeVisibility(stem, { q_level: 'thcs' });
    expect(v.questions.has('q_cls_thcs')).toBe(true);
    expect(v.questions.has('q_cls_th')).toBe(false);
    const lc = computeVisibility(stem, { q_level: 'lc' });
    expect(['q_cls_th', 'q_cls_thcs', 'q_cls_thpt'].every((id) => lc.questions.has(id))).toBe(true);
  });

  it('hidden answers do not trigger downstream logic', () => {
    // q_lab_support visible only when q_lab = no
    const v = computeVisibility(stem, { q_lab: 'no' });
    expect(v.questions.has('q_lab_support')).toBe(true);
    expect(computeVisibility(stem, { q_lab: 'yes' }).questions.has('q_lab_support')).toBe(false);
  });

  it('template schemas lint clean', () => {
    for (const t of TEMPLATES) expect(lintSchema(t.schema)).toEqual([]);
  });

  it('lint catches forward references and duplicate codes', () => {
    const bad: SurveySchema = { schemaVersion: 1, sections: [{ id: 's', title: 'S', questions: [
      { id: 'a', code: 'A', type: 'short_text', title: 'a', logic: { visibleIf: { op: 'and', rules: [{ questionId: 'b', operator: 'is_empty' }] } } },
      { id: 'b', code: 'A', type: 'short_text', title: 'b' },
    ] }] };
    const msgs = lintSchema(bad).map((i) => i.message).join('\n');
    expect(msgs).toMatch(/nằm sau/);
    expect(msgs).toMatch(/bị trùng/);
  });
});

describe('validation', () => {
  it('accepts a valid STEM response', () => {
    expect(validateAnswers(stem, validStem)).toEqual({});
  });

  it('requires conditionally visible required question only when shown', () => {
    const e = validateAnswers(stem, { ...validStem, q_lab: 'no' });
    expect(e.q_lab_support).toBeDefined();
  });

  it('rejects bad email / phone / unknown option / missing other text', () => {
    const e = validateAnswers(stem, { ...validStem, q_contact: { ...validStem.q_contact, email: 'x@', phone: '123' }, q_level: 'zzz' });
    expect(e.q_contact).toBeDefined();
    expect(e.q_level).toBeDefined();
    const e2 = validateAnswers(stem, { ...validStem, q_mode__other: '' });
    expect(e2.q_mode).toMatch(/Khác/);
  });

  it('rejects negative quantities and requires at least one topic', () => {
    expect(validateAnswers(stem, { ...validStem, q_cls_thcs: { k6: -1 } }).q_cls_thcs).toBeDefined();
    expect(validateAnswers(stem, { ...validStem, q_topics: {} }).q_topics).toBeDefined();
  });

  it('sanitize drops hidden answers and content', () => {
    const s = sanitizeAnswers(stem, { ...validStem, q_cls_th: { k1: 3 }, q_lab_support: 'now', junk: 1 });
    expect(s.q_cls_th).toBeUndefined();
    expect(s.q_lab_support).toBeUndefined();
    expect(s.junk).toBeUndefined();
    expect(s.q_mode__other).toBe('Hội thi');
  });
});

describe('normalize + analytics', () => {
  it('normalizes grid selections into option rows with quantity', () => {
    const rows = normalizeAnswers(stem, sanitizeAnswers(stem, validStem));
    const topics = rows.find((r) => r.question_code === 'STEM_TOPICS')!;
    expect(topics.options).toEqual(expect.arrayContaining([expect.objectContaining({ row_code: 'robot', option_code: 'thcs', quantity: 3 })]));
    expect(topics.answer_number).toBe(5);
    const mode = rows.find((r) => r.question_code === 'DELIVERY_MODE')!;
    expect(mode.options.find((o) => o.option_code === OTHER_CODE)?.other_text).toBe('Hội thi');
  });

  it('multiple-choice percentages use respondents vs selections correctly', () => {
    const versions = { v1: stem };
    const rs: ResponseRecord[] = [
      { id: '1', code: 'A', versionId: 'v1', status: 'submitted', startedAt: '', answers: { ...validStem, q_mode: ['club', 'curr'] } },
      { id: '2', code: 'B', versionId: 'v1', status: 'submitted', startedAt: '', answers: { ...validStem, q_mode: ['club'] } },
      { id: '3', code: 'C', versionId: 'v1', status: 'in_progress', startedAt: '', answers: {}, reachedSections: ['s_intro'] },
    ];
    const prepared = prepareResponses(rs, versions);
    const q = stem.sections[2].questions.find((x) => x.code === 'DELIVERY_MODE')!;
    const st = questionStats(q, prepared);
    expect(st.shown).toBe(2); // in-progress never reached the section
    const club = st.options!.find((o) => o.code === 'club')!;
    expect(club.count).toBe(2);
    expect(club.pctOfRespondents).toBe(1);
    expect(club.pctOfSelections).toBeCloseTo(2 / 3);
    const sumResp = st.options!.reduce((a, o) => a + o.pctOfRespondents, 0);
    expect(sumResp).toBeGreaterThan(1); // NOT forced to 100%
    expect(computeKpis(rs).completionRate).toBeCloseTo(2 / 3);
  });

  it('NPS score', () => {
    const versions = { v: sat };
    const scores = [10, 9, 8, 5, 3];
    const rs: ResponseRecord[] = scores.map((n, i) => ({ id: String(i), code: String(i), versionId: 'v', status: 'submitted', startedAt: '', answers: { q_course: 'c1', q_overall: 4, q_nps: n } }));
    const q = sat.sections[0].questions.find((x) => x.type === 'nps')!;
    const st = questionStats(q, prepareResponses(rs, versions));
    expect(st.nps!.score).toBe(0); // 40% promoters - 40% detractors
  });

  it('clone keeps codes, remaps ids and logic references', () => {
    const c = cloneSchemaWithNewIds(stem);
    const lvl = c.sections[1].questions.find((x) => x.code === 'SCHOOL_LEVEL')!;
    const grid = c.sections[1].questions.find((x) => x.code === 'CLASSES_PRIMARY')!;
    expect(lvl.id).not.toBe('q_level');
    expect((grid.logic!.visibleIf!.rules[0] as any).questionId).toBe(lvl.id);
  });

  it('exports wide and choice tables', () => {
    const versions = { v1: stem };
    const prepared = prepareResponses([{ id: '1', code: 'R1', versionId: 'v1', status: 'submitted', startedAt: '', answers: validStem }], versions);
    const wide = exportWide(stem, prepared, versions);
    expect(wide[0]['STEM_TOPICS__robot__thcs']).toBe(3);
    expect(wide[0]['SCHOOL_LEVEL']).toBe('THCS');
    expect(exportChoices(prepared, versions).some((r) => r.option_code === 'club')).toBe(true);
  });
});
