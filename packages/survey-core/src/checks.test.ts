import { describe, expect, it } from 'vitest';
import { createQuestion, formatAnswer, normalizeAnswers, runChecks, validateAnswers, type SurveySchema } from './index.ts';

const total = { ...createQuestion('quantity_by_group'), id: 'q_total', code: 'TOTAL' };
const stem = { ...createQuestion('number'), id: 'q_stem', code: 'STEM', settings: { unit: 'lớp' } };
const budget = { ...createQuestion('number_range'), id: 'q_budget', code: 'BUDGET', settings: { unit: 'triệu đồng' } };
const grid = { ...createQuestion('number_grid'), id: 'q_grid', code: 'GRID', required: true, settings: { requireAllCells: true } };
const comp = { ...createQuestion('composite'), id: 'q_comp', code: 'COMP', required: true };
const schema = (severity: 'warn' | 'block'): SurveySchema => ({
  schemaVersion: 1,
  sections: [{ id: 's1', title: 'A', questions: [total, stem, budget, grid, comp] }],
  checks: [{ id: 'c1', left: { questionId: 'q_stem' }, op: 'lte', right: { questionId: 'q_total' }, severity }],
});
const [g1, g2] = [grid.rows![0].code, grid.rows![1].code];
const [c1, c2] = [grid.options![0].code, grid.options![1].code];
const base = {
  q_total: { [total.rows![0].code]: 10, [total.rows![1].code]: 22 },
  q_grid: { [g1]: { [c1]: 2, [c2]: 60 }, [g2]: { [c1]: 3, [c2]: 90 } },
  q_comp: { f1: 'An', f2: 5 },
};

describe('loại câu mới & kiểm tra chéo', () => {
  it('khoảng số: tối thiểu > tối đa là lỗi', () => {
    const e = validateAnswers(schema('warn'), { ...base, q_budget: { min: 50, max: 30 } });
    expect(e.q_budget).toMatch(/lớn hơn tối đa/);
    expect(validateAnswers(schema('warn'), { ...base, q_budget: { min: 30, max: 50 } }).q_budget).toBeUndefined();
  });
  it('bảng số: bắt buộc mọi ô', () => {
    expect(validateAnswers(schema('warn'), { ...base, q_grid: { [g1]: { [c1]: 2 } } }).q_grid).toMatch(/3 ô/);
  });
  it('câu ghép: thiếu ô bắt buộc', () => {
    expect(validateAnswers(schema('warn'), { ...base, q_comp: { f1: 'An' } }).q_comp).toMatch(/Số năm/);
  });
  it('kiểm tra chéo: nhắc không chặn, chặn thì thành lỗi', () => {
    const a = { ...base, q_stem: 40 };
    expect(runChecks(schema('warn'), a)).toHaveLength(1);
    expect(validateAnswers(schema('warn'), a).q_stem).toBeUndefined();
    expect(validateAnswers(schema('block'), a).q_stem).toMatch(/Câu 2 ≤ Câu 1/);
    expect(runChecks(schema('block'), { ...base, q_stem: 30 })).toHaveLength(0);
    // thiếu một vế thì bỏ qua
    expect(runChecks(schema('block'), { q_stem: 40 })).toHaveLength(0);
  });
  it('chuẩn hóa và hiển thị', () => {
    const rows = normalizeAnswers(schema('warn'), { ...base, q_stem: 4, q_budget: { min: 30, max: 50 } });
    expect(rows.find((r) => r.question_code === 'BUDGET')?.answer_number).toBe(40);
    expect(rows.find((r) => r.question_code === 'GRID')?.answer_number).toBe(155);
    expect(rows.find((r) => r.question_code === 'GRID')?.options).toHaveLength(4);
    expect(formatAnswer(stem, 4)).toBe('4 lớp');
    expect(formatAnswer(budget, { min: 30, max: 50 })).toBe('30 – 50 triệu đồng');
    expect(formatAnswer(comp, { f1: 'An', f2: 5 })).toBe('Họ và tên: An; Số năm kinh nghiệm: 5 năm');
  });
});
