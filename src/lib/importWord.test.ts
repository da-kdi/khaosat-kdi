import { describe, expect, it } from 'vitest';
import { docxBlocks, parseBlocks, rowsToSchema, type Block, type ImportQuestion } from './importQuestions';

const p = (text: string, num = false): Block => ({ t: 'p', text, num });
const qs = (rows: ReturnType<typeof parseBlocks>) => rows.filter((r): r is ImportQuestion => r.kind === 'q');

describe('nhập phiếu Word dạng phiếu giấy', () => {
  const rows = parseBlocks([
    p('SỞ GIÁO DỤC VÀ ĐÀO TẠO'),
    p('I  MỤC ĐÍCH VÀ HƯỚNG DẪN'),
    p('Mỗi trường lập một phiếu riêng.', true),
    p('II  THÔNG TIN TRƯỜNG'),
    p('01. Thông tin trường'),
    p('Tên trường hiện tại: ……………………', true),
    p('Cấp học hiện tại (nếu liên cấp chọn nhiều): ☐ Tiểu học  ☐ THCS  ☐ THPT', true),
    p('Số điểm trường: ………………', true),
    p('02. Người tổng hợp phiếu khảo sát'),
    p('Họ tên: ……………… Chức vụ: ………………'),
    p('III  HOẠT ĐỘNG GIÁO DỤC STEM'),
    p('03. Quy mô triển khai'),
    { t: 'table', rows: [['Cấp học', 'Tổng số lớp', 'Tổng số học sinh'], ['Tiểu học', '', ''], ['THCS', '', '']] },
    p('10. Đánh giá từng bước (1- rất khó khăn 5- rất thuận lợi)'),
    p('Xác định vấn đề', true),
    p('Chế tạo mô hình', true),
    p('14. Năng lực triển khai'),
    p('Chọn một phương án:'),
    p('☐ Chưa có GV'),
    p('☐ Phần lớn GV'),
    p('21. Tình trạng vật tư'),
    { t: 'table', rows: [['Nội dung', 'Chọn một phương án mỗi dòng'], ['Vật tư', '☐ Đủ  ☐ Thiếu'], ['Người phụ trách', '☐ Có  ☐ Không']] },
    p('23. Chi phí vật tư (điền số)'),
    p('Tối thiểu: _______', true),
    p('Tối đa: _______', true),
    p('31. Có cần nền tảng số không? ☐ Có ☐ Không.'),
  ]);
  const list = qs(rows);
  const by = (t: string) => list.find((x) => x.title.startsWith(t))!;

  it('nhận đề mục số La Mã và lời giới thiệu', () => {
    const secs = rows.filter((r) => r.kind === 'section');
    expect(secs.map((s) => s.title)).toEqual(['Mục đích và hướng dẫn', 'Thông tin trường', 'Hoạt động giáo dục STEM']);
    expect(secs[0].kind === 'section' && secs[0].hint).toMatch(/Mỗi trường/);
  });
  it('tách câu con trong câu lớn', () => {
    expect(rows.some((r) => r.kind === 'group' && r.title === 'Thông tin trường')).toBe(true);
    expect(by('Tên trường').type).toBe('short_text');
    expect(by('Cấp học').type).toBe('multiple_choice');
    expect(by('Cấp học').options).toEqual(['Tiểu học', 'THCS', 'THPT']);
    expect(by('Số điểm trường').type).toBe('number');
  });
  it('nhiều chỗ trống trên một dòng → câu ghép, đánh dấu dữ liệu cá nhân', () => {
    expect(by('Người tổng hợp').type).toBe('composite');
    expect(by('Người tổng hợp').fields?.map((f) => f.label)).toEqual(['Họ tên', 'Chức vụ']);
    expect(by('Người tổng hợp').isPII).toBe(true);
  });
  it('bảng trống → bảng số; thang 1–5 → ma trận; bảng ☐ → mỗi dòng một câu', () => {
    expect(by('Quy mô').type).toBe('number_grid');
    expect(by('Quy mô').rows).toEqual(['Tiểu học', 'THCS']);
    expect(by('Đánh giá từng bước').type).toBe('matrix');
    expect(by('Đánh giá từng bước').options[0]).toBe('1 – rất khó khăn');
    expect(by('Năng lực').type).toBe('single_choice');
    expect(by('Vật tư').options).toEqual(['Đủ', 'Thiếu']);
    expect(by('Người phụ trách').type).toBe('yes_no');
  });
  it('tối thiểu / tối đa → khoảng số; ☐ Có ☐ Không cùng dòng → Có/Không', () => {
    expect(by('Chi phí').type).toBe('number_range');
    expect(by('Có cần nền tảng').type).toBe('yes_no');
  });
  it('dựng được bảng hỏi', () => {
    const s = rowsToSchema(rows);
    expect(s.sections[0].questions[0].type).toBe('instruction');
    expect(s.sections[1].questions[0].type).toBe('heading');
  });
  it('đọc document.xml: đoạn, danh sách, bảng, ô Wingdings', () => {
    const xml = '<w:body><w:p><w:r><w:t>01. Câu</w:t></w:r></w:p><w:p w:rsidR="1"/><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:sym w:font="Wingdings" w:char="F0A8"/><w:t xml:space="preserve"> A &amp; B</w:t></w:r></w:p>'
      + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>x</w:t></w:r></w:p></w:tc><w:tc><w:p></w:p></w:tc></w:tr></w:tbl></w:body>';
    expect(docxBlocks(xml)).toEqual([{ t: 'p', text: '01. Câu', num: false }, { t: 'p', text: '☐ A & B', num: true }, { t: 'table', rows: [['x', '']] }]);
  });
});
