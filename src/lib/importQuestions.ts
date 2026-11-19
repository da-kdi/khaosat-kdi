import { createQuestion, getType, makeOptions, typeList, uid, type QuestionType, type Section, type SurveySchema } from '@core/index.ts';

/** Một dòng sau khi tách từ file — người dùng sửa lại được trước khi lưu. */
export type ImportRow =
  | { kind: 'section'; id: string; title: string }
  | { kind: 'q'; id: string; title: string; type: QuestionType | ''; options: string[]; required: boolean; hint?: string; scale?: number };

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Đoán loại câu từ chữ trong ngoặc / cột "Loại". Trả '' nếu không chắc. */
export function guessType(marker: string, hasOptions: boolean): { type: QuestionType | ''; scale?: number } {
  const m = norm(marker);
  const scale = m.match(/\b1\s*[-–]\s*(\d{1,2})\b/);
  if (scale) return { type: 'rating', scale: Number(scale[1]) };
  const byLabel = typeList.find((t) => t.isInput && norm(t.label) === m);
  if (byLabel) return { type: byLabel.type };
  const rules: [RegExp, QuestionType][] = [
    [/chọn nhiều|nhiều lựa chọn|checkbox/, 'multiple_choice'],
    [/chọn một|một lựa chọn|radio/, 'single_choice'],
    [/thả xuống|dropdown|danh sách chọn/, 'dropdown'],
    [/có\s*\/\s*không|yes\s*\/\s*no/, 'yes_no'],
    [/likert|mức độ đồng ý/, 'likert'],
    [/nps|giới thiệu cho/, 'nps'],
    [/xếp hạng|thứ tự ưu tiên/, 'ranking'],
    [/bảng số|dòng\s*[×x]\s*cột/, 'number_grid'],
    [/khoảng số|từ\s*[-–]\s*đến|min\s*[-–]\s*max/, 'number_range'],
    [/câu ghép|nhiều ô/, 'composite'],
    [/ma trận|lưới/, 'matrix'],
    [/đoạn văn|văn bản dài|ý kiến|góp ý/, 'long_text'],
    [/trả lời ngắn|văn bản ngắn|ngắn/, 'short_text'],
    [/email|thư điện tử/, 'email'],
    [/điện thoại|sđt/, 'phone'],
    [/phần trăm|%/, 'percentage'],
    [/tiền|vnđ|đồng\b/, 'currency'],
    [/^số|số lượng|\bsố\b/, 'number'],
    [/ngày giờ/, 'datetime'],
    [/ngày|date/, 'date'],
    [/giờ|time/, 'time'],
    [/địa chỉ/, 'address'],
    [/liên hệ/, 'contact'],
    [/tệp|file|đính kèm/, 'file_upload'],
    [/đồng ý/, 'consent'],
  ];
  for (const [re, t] of rules) if (re.test(m)) return { type: t };
  if (!m) return { type: hasOptions ? 'single_choice' : 'short_text' };
  return { type: '' };
}

/** Câu thiếu lựa chọn hoặc chưa rõ loại → cần người dùng chọn lại. */
export function rowWarning(r: ImportRow): string | null {
  if (r.kind !== 'q') return null;
  if (!r.title.trim()) return 'Thiếu nội dung câu hỏi';
  if (!r.type) return 'Chưa nhận ra loại câu, vui lòng chọn';
  const d = getType(r.type);
  if (d.hasOptions && r.type !== 'yes_no' && r.type !== 'likert' && r.type !== 'number_grid' && !r.options.length) return 'Loại này cần các lựa chọn';
  return null;
}

/** Tách văn bản theo quy ước: "Phần …", "1. Câu hỏi (*) (chọn nhiều)", "a) lựa chọn" / "- lựa chọn". */
export function parseText(text: string): ImportRow[] {
  const rows: ImportRow[] = [];
  let cur: Extract<ImportRow, { kind: 'q' }> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/ /g, ' ').trim();
    if (!line) continue;
    if (/^phần\s+[\divxlc]+\b|^phần\s*[:.]/i.test(line)) { rows.push({ kind: 'section', id: uid('s'), title: line.replace(/^phần\s+[\divxlc]+\s*[.:)–-]?\s*/i, '').trim() || line }); cur = null; continue; }
    const q = line.match(/^(?:câu\s*)?(\d{1,3})\s*[.):]\s+(.+)$/i);
    if (q) {
      let title = q[2];
      const required = /\(\s*\*\s*\)|\*\s*$/.test(title);
      title = title.replace(/\(\s*\*\s*\)/g, '').replace(/\*\s*$/, '');
      const markers = [...title.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]).filter((m) => guessType(m, false).type);
      for (const m of markers) title = title.replace(`(${m})`, '');
      const g = guessType(markers.join(' '), false);
      cur = { kind: 'q', id: uid('r'), title: title.replace(/\s{2,}/g, ' ').trim(), type: markers.length ? g.type : '', options: [], required, scale: g.scale };
      rows.push(cur);
      continue;
    }
    const opt = line.match(/^(?:[a-zA-Zđ]\s*[).]|[-–•*+□☐○◯])\s*(.+)$/);
    if (opt && cur) { cur.options.push(opt[1].trim()); continue; }
    if (cur) cur.hint = cur.hint ? `${cur.hint} ${line}` : line;
  }
  // loại chưa có dấu hiệu: có lựa chọn → chọn một, không có → trả lời ngắn
  for (const r of rows) if (r.kind === 'q' && !r.type) r.type = r.options.length ? 'single_choice' : 'short_text';
  return rows;
}

/** Bảng Excel/CSV: cột Phần · Câu hỏi · Loại · Lựa chọn (cách nhau bằng ;) · Bắt buộc (x). */
export function parseTable(table: unknown[][]): ImportRow[] {
  const head = (table[0] ?? []).map((c) => norm(String(c ?? '')));
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const cSec = col(/^phần|section/), cQ = col(/câu hỏi|nội dung|question/), cT = col(/^loại|type/), cO = col(/lựa chọn|phương án|options?/), cR = col(/bắt buộc|required/), cH = col(/ghi chú|gợi ý|hint/);
  if (cQ < 0) throw new Error('Không thấy cột "Câu hỏi" ở dòng đầu của file.');
  const rows: ImportRow[] = [];
  let lastSec = '';
  for (const r of table.slice(1)) {
    const get = (i: number) => (i < 0 ? '' : String(r[i] ?? '').trim());
    const sec = get(cSec);
    if (sec && sec !== lastSec) { rows.push({ kind: 'section', id: uid('s'), title: sec }); lastSec = sec; }
    const title = get(cQ);
    if (!title) continue;
    const options = get(cO).split(/\s*[;\n|]\s*/).filter(Boolean);
    const g = guessType(get(cT), options.length > 0);
    rows.push({ kind: 'q', id: uid('r'), title, type: g.type, options, required: /^(x|có|co|yes|y|1|true|✓)$/i.test(get(cR)), hint: get(cH) || undefined, scale: g.scale });
  }
  return rows;
}

/** Đọc .docx: lấy chữ từng đoạn trong word/document.xml (dùng bộ giải nén có sẵn trong thư viện xlsx). */
async function docxText(buf: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx');
  const zip = XLSX.CFB.read(new Uint8Array(buf), { type: 'array' });
  const entry = XLSX.CFB.find(zip, 'word/document.xml') ?? XLSX.CFB.find(zip, '/word/document.xml');
  if (!entry?.content) throw new Error('Không đọc được nội dung file Word.');
  const xml = new TextDecoder('utf-8').decode(entry.content as Uint8Array);
  const dec = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return xml.split(/<\/w:p>/).map((p) => {
    // danh sách đánh số tự động của Word không có trong chữ → giữ nguyên, người dùng sửa ở bước kiểm tra
    const t = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\/>/g)].map((m) => (m[1] === undefined ? ' ' : dec(m[1]))).join('');
    return t;
  }).join('\n');
}

export async function readImportFile(file: File): Promise<ImportRow[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error('File lớn hơn 5 MB.');
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return parseText(await docxText(await file.arrayBuffer()));
  if (name.endsWith('.txt')) return parseText(await file.text());
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
    const XLSX = await import('xlsx');
    const wb = name.endsWith('.csv') ? XLSX.read(await file.text(), { type: 'string' }) : XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return parseTable(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]);
  }
  if (name.endsWith('.doc')) throw new Error('File .doc (Word cũ) chưa đọc được. Vui lòng lưu lại dạng .docx hoặc dán nội dung.');
  throw new Error('Chỉ nhận file .docx, .xlsx, .csv hoặc .txt.');
}

/** Dựng các phần từ dòng đã kiểm tra. Mã câu nối tiếp các mã đã có. */
export function rowsToSections(rows: ImportRow[], existingCodes: string[] = [], firstTitle = 'Phần 1'): Section[] {
  const codes = [...existingCodes];
  const out: Section[] = [];
  for (const r of rows) {
    if (r.kind === 'section') { out.push({ id: uid('s'), title: r.title, questions: [] }); continue; }
    if (!r.type) continue;
    if (!out.length) out.push({ id: uid('s'), title: firstTitle, questions: [] });
    const q = createQuestion(r.type, codes);
    codes.push(q.code);
    q.title = r.title;
    q.required = r.required || undefined;
    if (r.hint) q.description = r.hint;
    const d = getType(r.type);
    if (d.hasOptions && r.options.length && r.type !== 'yes_no') q.options = makeOptions(r.options, r.type === 'likert' ? 'lk' : 'opt');
    if (r.type === 'rating' && r.scale) q.settings = { ...q.settings, scaleMax: Math.min(10, Math.max(3, r.scale)) };
    out[out.length - 1].questions.push(q);
  }
  return out.filter((s) => s.questions.length || out.length === 1);
}

export function rowsToSchema(rows: ImportRow[]): SurveySchema {
  const sections = rowsToSections(rows);
  return { schemaVersion: 1, sections: sections.length ? sections : [{ id: uid('s'), title: 'Phần 1', questions: [] }] };
}

/** File mẫu để người dùng tải về soạn theo. */
export async function downloadSampleExcel() {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['Phần', 'Câu hỏi', 'Loại', 'Lựa chọn', 'Bắt buộc', 'Ghi chú'],
    ['Thông tin nhà trường', 'Tên trường', 'Văn bản ngắn', '', 'x', ''],
    ['Thông tin nhà trường', 'Cấp học', 'Chọn một', 'Tiểu học; THCS; THPT', 'x', ''],
    ['Nhu cầu', 'Chủ đề STEM quan tâm', 'Chọn nhiều', 'Robotics; Năng lượng tái tạo; Trí tuệ nhân tạo', 'x', 'Chọn tất cả chủ đề phù hợp'],
    ['Nhu cầu', 'Mức độ sẵn sàng của giáo viên', 'Thang điểm 1-5', '', 'x', '1 = rất thấp, 5 = rất cao'],
    ['Góp ý', 'Ý kiến khác', 'Đoạn văn', '', '', ''],
  ]);
  ws['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 16 }, { wch: 46 }, { wch: 9 }, { wch: 28 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cau hoi');
  XLSX.writeFile(wb, 'mau-cau-hoi-khao-sat.xlsx');
}

export const SAMPLE_TEXT = `Phần 1. Thông tin nhà trường
1. Tên trường (*)
2. Cấp học (*)
a) Tiểu học
b) THCS
c) THPT
Phần 2. Nhu cầu chủ đề STEM
3. Chủ đề STEM nhà trường quan tâm (chọn nhiều) (*)
a) Robotics & lập trình
b) Năng lượng tái tạo
4. Mức độ sẵn sàng của giáo viên (1-5) (*)
5. Ý kiến khác (đoạn văn)`;
