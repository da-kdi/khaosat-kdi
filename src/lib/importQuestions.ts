import { createQuestion, getType, makeOptions, typeList, uid, type QuestionType, type Section, type SurveySchema } from '@core/index.ts';

/** Một ô trong câu ghép (VD: Họ tên, Chức vụ…). */
export interface ImportField { label: string; kind: 'text' | 'number' | 'date'; unit?: string }

/** Một câu hỏi sau khi tách từ file — người dùng sửa lại được trước khi lưu. */
export interface ImportQuestion {
  kind: 'q';
  id: string;
  title: string;
  type: QuestionType | '';
  /** lựa chọn; với ma trận / bảng số là các cột */
  options: string[];
  required: boolean;
  hint?: string;
  scale?: number;
  /** ma trận / bảng số: các dòng */
  rows?: string[];
  /** câu ghép: các ô */
  fields?: ImportField[];
  /** có lựa chọn "Khác (ghi rõ)" */
  otherLabel?: string;
  isPII?: boolean;
  unit?: string;
}

export type ImportRow =
  | { kind: 'section'; id: string; title: string; hint?: string }
  /** tiêu đề nhóm cho các câu con của một câu lớn (VD: "01. Thông tin trường") */
  | { kind: 'group'; id: string; title: string }
  | ImportQuestion;

/** Đoạn văn hoặc bảng đọc được từ file Word theo đúng thứ tự. */
export type Block = { t: 'p'; text: string; num?: boolean } | { t: 'table'; rows: string[][] };

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
  if (r.type === 'matrix' && (!r.rows?.length || !r.options.length)) return 'Ma trận cần các dòng và các cột';
  const d = getType(r.type);
  if (d.hasOptions && !['yes_no', 'likert', 'number_grid', 'matrix'].includes(r.type) && !r.options.length) return 'Loại này cần các lựa chọn';
  return null;
}

// ───────────────────────── nhận diện từng dòng ─────────────────────────

/** ô đánh dấu trong phiếu giấy */
const BOX_G = /[☐□❑◻▢⬜☑☒○◯]/g;
const HAS_BOX = /[☐□❑◻▢⬜☑☒○◯]/;
/** chỗ trống để điền: ……  ....  ___ (một dấu … đơn lẻ trong câu không tính) */
const BLANK_G = /(?:…{2,}|…\.+|\.{4,}|_{3,})[….\s_]*/g;
const HAS_BLANK = /…{2,}|…\.+|\.{4,}|_{3,}/;
const QHEAD = /^(?:câu\s*)?(\d{1,3})\s*[.):\-–]\s*(\S.*)$/i;
const OLD_OPT = /^(?:[a-zđ]\s*[).]|[-–•*+])\s+(.+)$/i;
const TYPE_PAREN = /\(\s*(có thể chọn nhiều|chọn nhiều|chọn một|lựa chọn|chọn|điền số|điền|đoạn văn|văn bản dài|trả lời ngắn|số|ngày|giờ|email|sđt|số điện thoại|\*|1\s*[-–]\s*\d{1,2})\s*\)/gi;
const ACRONYMS = ['STEM', 'AI', 'IOT', 'IoT', 'THCS', 'THPT', 'GV', 'HS', 'KHKT', 'CNTT', 'UBND'];

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s:;,.–-]+|[\s:;,.]+$/g, '').trim();

const upperRatio = (s: string) => {
  const L = s.replace(/[^\p{L}]/gu, '');
  if (L.length < 4) return 0;
  return [...L].filter((c) => c === c.toLocaleUpperCase('vi') && c !== c.toLocaleLowerCase('vi')).length / L.length;
};
/** "THÔNG TIN TRƯỜNG" → "Thông tin trường" (giữ chữ viết tắt như STEM, THCS) */
function sentence(s: string) {
  const t = clean(s);
  if (upperRatio(t) < 0.8) return t;
  const low = t.toLocaleLowerCase('vi');
  let out = low.charAt(0).toLocaleUpperCase('vi') + low.slice(1);
  for (const a of ACRONYMS) out = out.replace(new RegExp(`(^|[^\\p{L}])${a.toLowerCase()}(?=[^\\p{L}]|$)`, 'giu'), `$1${a === 'IoT' ? 'IoT' : a}`);
  return out;
}

function sectionTitle(line: string): string | null {
  let m = line.match(/^phần\s+([\divxlc]+)\b\s*[.:)–-]?\s*(.*)$/i);
  if (m) return clean(m[2]) || line;
  if (/^phần\s*[:.]/i.test(line)) return clean(line.replace(/^phần\s*[:.]/i, '')) || line;
  // "II  THÔNG TIN …", "V. HIỆN TRẠNG …" — số La Mã + chữ in hoa
  m = line.match(/^([IVX]{1,4})(?:\s*[.)\-–:]\s*|\s+)(\S.*)$/);
  if (m && upperRatio(m[2]) >= 0.8) return sentence(m[2]);
  return null;
}

/** Thang điểm trong ngoặc: "(1- rất khó khăn 5- rất thuận lợi)", "(1 ưu tiên thấp nhất, 3 ưu tiên cao nhất)" */
function scaleOf(s: string) {
  const m = s.match(/\(\s*1\s*[-–=:]?\s*([^()]*?)[,;]?\s+(\d{1,2})\s*[-–=:]?\s*([^()]*)\)/);
  if (!m) return null;
  const max = Number(m[2]);
  if (max < 2 || max > 10) return null;
  return { max, lo: clean(m[1]), hi: clean(m[3]), raw: m[0] };
}
const scaleLabels = (sc: { max: number; lo: string; hi: string }) =>
  Array.from({ length: sc.max }, (_, i) => (i === 0 && sc.lo ? `1 – ${sc.lo}` : i === sc.max - 1 && sc.hi ? `${sc.max} – ${sc.hi}` : String(i + 1)));

const PII = /họ (và )?tên|điện thoại|email|sđt|cccd|cmnd|ngày sinh/i;
const OTHER = /^(các |những )?(nội dung |lựa chọn |ý kiến )?khác\b/i;

function fieldKind(label: string, wantNum: boolean): ImportField {
  const unitM = label.match(/\((?:số|đơn vị)\s+([^)]+)\)/i);
  const l = norm(label);
  if (/%|tỉ lệ|tỷ lệ/.test(l)) return { label: clean(label), kind: 'number', unit: '%' };
  if (unitM) return { label: clean(label.replace(unitM[0], ' ')), kind: 'number', unit: unitM[1].trim() };
  if ((wantNum && !/khác/.test(l)) || /^(số|tổng số)(?=\s|$)|số lượng|bao nhiêu|thời lượng|tối thiểu|tối đa|kinh phí|chi phí/.test(l)) return { label: clean(label), kind: 'number' };
  if (/^ngày\b|ngày sinh/.test(l)) return { label: clean(label), kind: 'date' };
  return { label: clean(label), kind: 'text' };
}

/** Loại câu cho một chỗ trống đứng riêng. */
function valueType(f: ImportField, title: string): { type: QuestionType; unit?: string } {
  const l = norm(title);
  if (f.kind === 'number') return f.unit === '%' ? { type: 'percentage' } : { type: 'number', unit: f.unit };
  if (f.kind === 'date') return { type: 'date' };
  if (/email/.test(l) && !/điện thoại/.test(l)) return { type: 'email' };
  if (/điện thoại|sđt/.test(l) && !/email/.test(l)) return { type: 'phone' };
  if (/liệt kê|mong muốn|ý kiến|góp ý|đề xuất|hạng mục|lý do|mô tả|kiến nghị|\(điền\)/.test(l)) return { type: 'long_text' };
  return { type: 'short_text' };
}

interface LineInfo { prefix: string; opts: string[]; other?: string; fields: ImportField[]; codes?: string[] }

/** Tách một dòng thành: nhãn đứng trước, các ô ☐, các chỗ trống "Nhãn: ……". */
function analyzeLine(text: string, wantNum = false): LineInfo {
  // bảng mã: "Mỗi dòng ghi một mã: 0 = Chưa có; 1 = Có, dùng được; …; KDL = Chưa rõ."
  if ((text.match(/(?:^|[\s;:])[0-9A-ZĐ]{1,4}\s*=\s*\S/g) ?? []).length >= 2) {
    const body = text.includes(':') ? text.slice(text.indexOf(':') + 1) : text;
    const codes = body.split(';').map((x) => x.match(/^\s*([0-9A-ZĐ]{1,4})\s*=\s*(.+)$/)).filter(Boolean).map((m) => `${m![1]} – ${clean(m![2])}`);
    if (codes.length >= 2) return { prefix: '', opts: [], fields: [], codes };
  }
  const info: LineInfo = { prefix: '', opts: [], fields: [] };
  if (HAS_BOX.test(text)) {
    const parts = text.split(BOX_G);
    info.prefix = clean(parts[0]);
    for (const seg of parts.slice(1)) {
      const blank = HAS_BLANK.test(seg);
      const label = clean(seg.replace(BLANK_G, ' '));
      if (!label) continue;
      if (OTHER.test(label) && (blank || /:\s*$/.test(seg.trim()))) info.other = label;
      else if (blank) info.fields.push(fieldKind(label, wantNum));
      else info.opts.push(label);
    }
    return info;
  }
  if (HAS_BLANK.test(text)) {
    const segs = text.split(BLANK_G);
    for (const seg of segs.slice(0, -1)) { const label = clean(seg); if (label) info.fields.push(fieldKind(label, wantNum)); }
    const tail = clean(segs[segs.length - 1]);
    if (tail && !info.fields.length) info.prefix = tail;
  }
  return info;
}

// ───────────────────────── gom một câu lớn ─────────────────────────

type Part = { t: 'field'; f: ImportField } | { t: 'choice'; label: string; opts: string[]; other?: string };
interface Group {
  title: string; hints: string[]; opts: string[]; optLines: number; other?: string; src?: 'box' | 'list' | 'inline';
  parts: Part[]; rows: string[]; table?: string[][]; codes?: string[]; multi?: boolean; single?: boolean; sub: boolean;
}
const newGroup = (title: string, sub: boolean): Group => ({ title, hints: [], opts: [], optLines: 0, parts: [], rows: [], sub });

interface Head { text: string; items: ({ k: 'line'; text: string; num: boolean } | { k: 'table'; rows: string[][] })[] }

function q(title: string, type: QuestionType | '', extra: Partial<ImportQuestion> = {}): ImportQuestion {
  return { kind: 'q', id: uid('r'), title, type, options: [], required: false, ...extra };
}

function buildQuestion(H: Head): ImportRow[] {
  // tiêu đề câu: bỏ ký hiệu loại câu, tách thang điểm, ô ☐ và chỗ trống ngay trên dòng
  let t = H.text;
  const required = /\(\s*\*\s*\)|\*\s*$/.test(t);
  const sc = scaleOf(t);
  if (sc) t = t.replace(sc.raw, ' ');
  const low = norm(t);
  const hMulti = /chọn nhiều/.test(low), hSingle = /chọn một/.test(low), wantNum = /điền số/.test(low);
  const markers = [...t.matchAll(TYPE_PAREN)].map((m) => m[1]);
  const marker = markers.length ? guessType(markers.join(' '), false) : { type: '' as const };
  t = t.replace(TYPE_PAREN, ' ').replace(/\*\s*$/, '');
  const head = analyzeLine(t, wantNum);
  const title = clean(head.opts.length || head.other ? head.prefix : head.fields.length ? t.replace(BLANK_G, ' ') : t) || clean(t);

  const groups: Group[] = [];
  let g = newGroup(title, false);
  groups.push(g);
  if (head.opts.length) { g.opts = head.opts; g.other = head.other; g.src = 'inline'; g.optLines = 1; }
  let headValue: ImportField | null = null;
  if (!head.opts.length && head.fields.length === 1) headValue = head.fields[0];
  else if (!head.opts.length && head.fields.length > 1) g.parts.push(...head.fields.map((f) => ({ t: 'field' as const, f })));

  for (const it of H.items) {
    if (it.k === 'table') { if (g.table || g.opts.length || g.rows.length) { g = newGroup(title, true); groups.push(g); } g.table = it.rows; continue; }
    const text = it.text;
    const L = analyzeLine(text, wantNum);
    const filled = g.opts.length > 0 || !!g.table || g.rows.length > 0 || g.parts.length > 0;
    if (L.codes) { g.codes = L.codes; g.hints.push(text); continue; }
    if (L.opts.length || L.other) {
      if (L.prefix) g.parts.push({ t: 'choice', label: L.prefix, opts: L.opts, other: L.other });
      else {
        if (g.table || g.parts.length) { g = newGroup(title, true); groups.push(g); }
        g.opts.push(...L.opts); if (L.other) g.other = L.other; g.src ??= 'box'; g.optLines++;
      }
      for (const f of L.fields) g.parts.push({ t: 'field', f });
      continue;
    }
    if (L.fields.length) {
      // chỗ trống đứng sau một danh sách lựa chọn / bảng → câu con mới
      if (g.opts.length || g.table || g.rows.length) { g = newGroup(L.fields[0].label, true); groups.push(g); }
      for (const f of L.fields) g.parts.push({ t: 'field', f });
      continue;
    }
    // dòng chữ thường
    if (/^chọn\b/i.test(text) && /:\s*$/.test(text)) { if (/nhiều/i.test(text)) g.multi = true; else if (/một/i.test(text)) g.single = true; continue; }
    if (/[:?]\s*$/.test(text) && !it.num) {
      if (filled) { g = newGroup(clean(text), true); groups.push(g); } else g.hints.push(clean(text));
      continue;
    }
    if (sc && !g.table && g === groups[0] && !g.opts.length) { g.rows.push(clean(text)); continue; }
    if (/\((?:số|đơn vị)\s+[^)]+\)/i.test(text)) { g.parts.push({ t: 'field', f: fieldKind(text, true) }); continue; }
    const o = text.match(OLD_OPT);
    if (o) { g.opts.push(clean(o[1])); g.src ??= 'list'; g.optLines++; continue; }
    if (it.num && !g.table && !g.parts.length && !headValue) { g.opts.push(clean(text)); g.src ??= 'list'; g.optLines++; continue; }
    g.hints.push(text);
  }

  const out: ImportRow[] = [];
  for (const gr of groups) {
    const isHead = gr === groups[0];
    const made: ImportRow[] = [];
    const hint = gr.hints.join('\n') || undefined;
    const choiceType = (opts: string[], multi: boolean): QuestionType =>
      opts.length === 2 && norm(opts[0]) === 'có' && norm(opts[1]) === 'không' ? 'yes_no' : multi ? 'multiple_choice' : 'single_choice';

    if (gr.table) made.push(...tableQuestions(gr));
    else if (gr.opts.length && isHead && sc) made.push(q(gr.title, 'matrix', { rows: gr.opts, options: scaleLabels(sc), hint: [scaleHint(sc), hint].filter(Boolean).join('\n') }));
    else if (gr.opts.length) {
      const multi = gr.multi || (isHead && hMulti) || (!gr.single && !(isHead && hSingle) && gr.src === 'box' && !(gr.sub && gr.optLines <= 1));
      made.push(q(gr.title, choiceType(gr.opts, multi), { options: gr.opts, otherLabel: gr.other, hint }));
    } else if (gr.rows.length && sc) made.push(q(gr.title, 'matrix', { rows: gr.rows, options: scaleLabels(sc), hint: [scaleHint(sc), hint].filter(Boolean).join('\n') }));

    if (gr.parts.length) {
      const fields = gr.parts.filter((p): p is Extract<Part, { t: 'field' }> => p.t === 'field').map((p) => p.f);
      if (fields.length === gr.parts.length && !made.length) {
        if (fields.length === 2 && /tối thiểu|từ/i.test(fields[0].label) && /tối đa|đến/i.test(fields[1].label)) made.push(q(gr.title, 'number_range', { hint }));
        else if (fields.length === 1) { const v = valueType(fields[0], fields[0].label); made.push(q(gr.sub ? fields[0].label : gr.title, v.type, { unit: v.unit, isPII: PII.test(fields[0].label) || undefined, hint: gr.sub || fields[0].label === gr.title ? hint : [fields[0].label, hint].filter(Boolean).join('\n') })); }
        else made.push(q(gr.title, 'composite', { fields, isPII: fields.some((f) => PII.test(f.label)) || undefined, hint }));
      } else {
        // câu lớn gồm nhiều câu con khác loại → mỗi câu con một câu, có tiêu đề nhóm
        for (const p of gr.parts) {
          if (p.t === 'field') { const v = valueType(p.f, p.f.label); made.push(q(p.f.label, v.type, { unit: v.unit, isPII: PII.test(p.f.label) || undefined })); }
          else made.push(q(clean(p.label.replace(TYPE_PAREN, ' ')), choiceType(p.opts, /chọn nhiều/i.test(p.label)), { options: p.opts, otherLabel: p.other }));
        }
        if (hint && made[0]?.kind === 'q') (made[0] as ImportQuestion).hint = hint;
      }
    }

    if (!made.length) {
      if (isHead && headValue) { const v = valueType(headValue, title); made.push(q(title, v.type, { unit: v.unit, isPII: PII.test(title) || undefined, hint })); }
      else if (isHead && marker.type) made.push(q(gr.title, marker.type, { scale: marker.scale, hint }));
      else made.push(q(gr.title, valueType({ label: gr.title, kind: 'text' }, gr.title).type, { hint }));
    }

    // nhiều câu mà không câu nào mang tên nhóm → thêm tiêu đề nhóm
    const qs = made.filter((r): r is ImportQuestion => r.kind === 'q');
    if (qs.length > 1 && !qs.some((x) => x.title === gr.title) && !made.some((r) => r.kind === 'group')) out.push({ kind: 'group', id: uid('g'), title: gr.title });
    out.push(...made);
  }
  if (required) for (const r of out) if (r.kind === 'q') r.required = true;
  return out;
}

const scaleHint = (sc: { max: number; lo: string; hi: string }) => (sc.lo || sc.hi ? `1 = ${sc.lo || 'thấp nhất'}; ${sc.max} = ${sc.hi || 'cao nhất'}` : '');

/** Bảng trong phiếu: bảng số để trống, bảng mã, hoặc mỗi dòng chọn một ô ☐. */
function tableQuestions(g: Group): ImportRow[] {
  const rows = (g.table ?? []).map((r) => r.map((c) => c.replace(/\s+/g, ' ').trim())).filter((r) => r.some(Boolean));
  if (rows.length < 2) return [q(g.title, 'short_text', { hint: g.hints.join('\n') || undefined })];
  const [header, ...body] = rows;
  const hint = g.hints.join('\n') || undefined;
  if (body.some((r) => r.slice(1).some((c) => HAS_BOX.test(c)))) {
    const multi = /chọn nhiều/i.test(header.join(' '));
    const out: ImportRow[] = [{ kind: 'group', id: uid('g'), title: g.title }];
    body.forEach((r, i) => {
      const L = analyzeLine(r.slice(1).join(' '));
      out.push(q(clean(r[0]), L.opts.length === 2 && norm(L.opts[0]) === 'có' && norm(L.opts[1]) === 'không' ? 'yes_no' : multi ? 'multiple_choice' : 'single_choice', { options: L.opts, otherLabel: L.other, hint: i === 0 ? hint : undefined }));
    });
    return out;
  }
  const empty = body.every((r) => r.slice(1).every((c) => !c || !c.replace(BLANK_G, '').trim()));
  if (empty) {
    const rowLabels = body.map((r) => clean(r[0])).filter(Boolean);
    if (header.length === 2 && g.codes?.length) return [q(g.title, 'matrix', { rows: rowLabels, options: g.codes, hint })];
    return [q(g.title, 'number_grid', { rows: rowLabels, options: header.slice(1).map(clean).filter(Boolean), hint })];
  }
  return [q(g.title, 'long_text', { hint: [hint, rows.map((r) => r.join(' | ')).join('\n')].filter(Boolean).join('\n') })];
}

/** Tách các đoạn / bảng theo quy ước phiếu giấy. */
export function parseBlocks(blocks: Block[]): ImportRow[] {
  const out: ImportRow[] = [];
  let sec: Extract<ImportRow, { kind: 'section' }> | null = null;
  let H: Head | null = null;
  const flush = () => { if (H) out.push(...buildQuestion(H)); H = null; };
  for (const b of blocks) {
    if (b.t === 'table') { if (H) (H as Head).items.push({ k: 'table', rows: b.rows }); continue; }
    for (const raw of b.text.split('\n')) {
      const line = raw.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
      if (!line) continue;
      const st = sectionTitle(line);
      if (st) { flush(); sec = { kind: 'section', id: uid('s'), title: st }; out.push(sec); continue; }
      const m = line.match(QHEAD);
      if (m) { flush(); H = { text: m[2], items: [] }; continue; }
      if (H) { (H as Head).items.push({ k: 'line', text: line, num: !!b.num }); continue; }
      // lời giới thiệu ngay dưới tên phần
      if (sec) sec.hint = sec.hint ? `${sec.hint}\n${line}` : line;
    }
  }
  flush();
  return out;
}

/** Tách văn bản dán vào (hoặc .txt) theo cùng quy ước. */
export function parseText(text: string): ImportRow[] {
  return parseBlocks(text.split(/\r?\n/).map((line) => ({ t: 'p' as const, text: line })));
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
    rows.push(q(title, g.type, { options, required: /^(x|có|co|yes|y|1|true|✓)$/i.test(get(cR)), hint: get(cH) || undefined, scale: g.scale }));
  }
  return rows;
}

// ───────────────────────── đọc file .docx ─────────────────────────

const decode = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** ký hiệu ô vuông từ phông Wingdings */
const SYM_BOX = new Set(['F0A8', 'F06F', 'F071', 'F072', 'F0FE', 'F0A3', '2610', '25A1']);

function paraText(p: string): string {
  return [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w:sym\b[^>]*w:char="([0-9A-Fa-f]+)"[^>]*\/>/g)]
    .map((m) => (m[1] !== undefined ? decode(m[1]) : m[2] ? (SYM_BOX.has(m[2].toUpperCase()) ? '☐' : '') : m[0].startsWith('<w:br') ? '\n' : ' '))
    .join('');
}

/** Đọc document.xml thành đoạn và bảng theo thứ tự. Đoạn thuộc danh sách tự động được đánh dấu num. */
export function docxBlocks(xml: string): Block[] {
  const body = xml.slice(Math.max(0, xml.indexOf('<w:body')));
  const out: Block[] = [];
  for (const m of body.matchAll(/<w:tbl[ >][\s\S]*?<\/w:tbl>|<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)) {
    const x = m[0];
    if (x.startsWith('<w:tbl')) {
      const rows = (x.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? []).map((tr) =>
        (tr.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? []).map((tc) => (tc.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? []).map(paraText).join(' ').trim()));
      out.push({ t: 'table', rows });
    } else if (!x.endsWith('/>')) {
      const pPr = x.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
      out.push({ t: 'p', text: paraText(x), num: /<w:numPr>/.test(pPr) });
    }
  }
  return out;
}

async function docxXml(buf: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx');
  const zip = XLSX.CFB.read(new Uint8Array(buf), { type: 'array' });
  const entry = XLSX.CFB.find(zip, 'word/document.xml') ?? XLSX.CFB.find(zip, '/word/document.xml');
  if (!entry?.content) throw new Error('Không đọc được nội dung file Word.');
  return new TextDecoder('utf-8').decode(entry.content as Uint8Array);
}

export async function readImportFile(file: File): Promise<ImportRow[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error('File lớn hơn 5 MB.');
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return parseBlocks(docxBlocks(await docxXml(await file.arrayBuffer())));
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

// ───────────────────────── dựng bảng hỏi ─────────────────────────

/** Dựng các phần từ dòng đã kiểm tra. Mã câu nối tiếp các mã đã có. */
export function rowsToSections(rows: ImportRow[], existingCodes: string[] = [], firstTitle = 'Phần 1'): Section[] {
  const codes = [...existingCodes];
  const out: Section[] = [];
  const cur = () => { if (!out.length) out.push({ id: uid('s'), title: firstTitle, questions: [] }); return out[out.length - 1]; };
  for (const r of rows) {
    if (r.kind === 'section') { out.push({ id: uid('s'), title: r.title, description: r.hint, questions: [] }); continue; }
    if (r.kind === 'group') {
      const h = createQuestion('heading', codes);
      h.title = r.title;
      h.settings = { ...h.settings, level: 3 };
      cur().questions.push(h);
      continue;
    }
    if (!r.type) continue;
    const q = createQuestion(r.type, codes);
    codes.push(q.code);
    q.title = r.title;
    q.required = r.required || undefined;
    if (r.hint) q.description = r.hint;
    if (r.isPII) q.isPII = true;
    const d = getType(r.type);
    if (r.type === 'matrix' || r.type === 'number_grid') {
      if (r.rows?.length) q.rows = makeOptions(r.rows, 'row');
      if (r.options.length) q.options = makeOptions(r.options, 'col');
    } else if (r.type === 'composite') {
      if (r.fields?.length) q.settings = { ...q.settings, fields: r.fields.map((f, i) => ({ code: `f${i + 1}`, label: f.label, kind: f.kind, unit: f.unit })) };
    } else if (d.hasOptions && r.options.length && r.type !== 'yes_no') q.options = makeOptions(r.options, r.type === 'likert' ? 'lk' : 'opt');
    if (r.otherLabel && ['single_choice', 'multiple_choice', 'dropdown'].includes(r.type)) q.settings = { ...q.settings, allowOther: true, otherLabel: r.otherLabel };
    if (r.unit && ['number', 'number_range', 'number_grid'].includes(r.type)) q.settings = { ...q.settings, unit: r.unit };
    if (r.type === 'rating' && r.scale) q.settings = { ...q.settings, scaleMax: Math.min(10, Math.max(3, r.scale)) };
    cur().questions.push(q);
  }
  // phần chỉ có lời giới thiệu (VD "Mục đích và hướng dẫn") → hộp hướng dẫn
  for (const s of out) if (!s.questions.length && s.description) {
    const b = createQuestion('instruction', codes);
    b.title = s.title;
    b.description = s.description;
    s.description = undefined;
    s.questions.push(b);
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
