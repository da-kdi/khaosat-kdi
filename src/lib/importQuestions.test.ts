import { describe, expect, it } from 'vitest';
import { SAMPLE_TEXT, parseTable, parseText, rowWarning, rowsToSchema } from './importQuestions';

describe('nhập câu hỏi', () => {
  it('tách văn bản theo quy ước', () => {
    const rows = parseText(SAMPLE_TEXT);
    const qs = rows.filter((r) => r.kind === 'q');
    expect(rows.filter((r) => r.kind === 'section').map((r) => r.title)).toEqual(['Thông tin nhà trường', 'Nhu cầu chủ đề STEM']);
    expect(qs.map((q) => q.kind === 'q' && q.type)).toEqual(['short_text', 'single_choice', 'multiple_choice', 'rating', 'long_text']);
    expect(qs[2].kind === 'q' && qs[2].required).toBe(true);
    expect(qs[2].kind === 'q' && qs[2].title).toBe('Chủ đề STEM nhà trường quan tâm');
    expect(qs[1].kind === 'q' && qs[1].options).toEqual(['Tiểu học', 'THCS', 'THPT']);
    expect(rows.some(rowWarning)).toBe(false);
    const s = rowsToSchema(rows);
    expect(s.sections).toHaveLength(2);
    expect(s.sections[0].questions[1].options?.map((o) => o.label)).toEqual(['Tiểu học', 'THCS', 'THPT']);
  });
  it('đọc bảng Excel', () => {
    const rows = parseTable([
      ['Phần', 'Câu hỏi', 'Loại', 'Lựa chọn', 'Bắt buộc'],
      ['A', 'Cấp học', 'Chọn một', 'Tiểu học; THCS', 'x'],
      ['A', 'Số giáo viên', 'Số', '', ''],
      ['B', 'Lạ', 'Kiểu gì đó', '', ''],
    ]);
    expect(rows.map((r) => (r.kind === 'q' ? r.type : 'S'))).toEqual(['S', 'single_choice', 'number', 'S', '']);
    expect(rows.filter(rowWarning)).toHaveLength(1);
  });
});
