import type { ChoiceOption, LogicOperator, Question, QuestionType } from './types.ts';

export type TypeGroup = 'text' | 'choice' | 'structured' | 'content';
export type StorageKind = 'text' | 'number' | 'date' | 'options' | 'json' | 'file' | 'none';
export type ChartKind =
  | 'bar' | 'donut' | 'multi_bar' | 'distribution' | 'nps' | 'histogram'
  | 'timeline' | 'matrix' | 'ranking' | 'grid' | 'text' | 'files' | 'none';

export interface TypeDef {
  type: QuestionType;
  label: string;
  group: TypeGroup;
  storage: StorageKind;
  operators: LogicOperator[];
  chart: ChartKind;
  /** whether it captures an answer */
  isInput: boolean;
  hasOptions?: boolean;
  hasRows?: boolean;
  /** factory for a new question of this type */
  defaults?: () => Partial<Question>;
}

const TEXT_OPS: LogicOperator[] = ['equals', 'not_equals', 'is_empty', 'is_not_empty'];
const NUM_OPS: LogicOperator[] = ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'];
const SINGLE_OPS: LogicOperator[] = ['equals', 'not_equals', 'in', 'not_in', 'is_empty', 'is_not_empty'];
const MULTI_OPS: LogicOperator[] = ['contains_any', 'contains_all', 'is_empty', 'is_not_empty'];
const ANY_OPS: LogicOperator[] = ['is_empty', 'is_not_empty'];

let seq = 0;
export function uid(prefix = 'id'): string {
  seq = (seq + 1) % 1e6;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rnd}${seq.toString(36)}`;
}

export function makeOptions(labels: string[], prefix = 'opt'): ChoiceOption[] {
  return labels.map((label, i) => ({ id: uid(prefix), code: `${prefix}${i + 1}`, label, active: true }));
}

const LIKERT = ['Rất không đồng ý', 'Không đồng ý', 'Trung lập', 'Đồng ý', 'Rất đồng ý'];

const defs: TypeDef[] = [
  // A
  { type: 'short_text', label: 'Văn bản ngắn', group: 'text', storage: 'text', operators: TEXT_OPS, chart: 'text', isInput: true },
  { type: 'long_text', label: 'Văn bản dài', group: 'text', storage: 'text', operators: ANY_OPS, chart: 'text', isInput: true },
  { type: 'email', label: 'Email', group: 'text', storage: 'text', operators: TEXT_OPS, chart: 'text', isInput: true },
  { type: 'phone', label: 'Số điện thoại', group: 'text', storage: 'text', operators: TEXT_OPS, chart: 'text', isInput: true },
  { type: 'url', label: 'URL', group: 'text', storage: 'text', operators: ANY_OPS, chart: 'text', isInput: true },
  { type: 'number', label: 'Số', group: 'text', storage: 'number', operators: NUM_OPS, chart: 'histogram', isInput: true },
  { type: 'currency', label: 'Tiền tệ', group: 'text', storage: 'number', operators: NUM_OPS, chart: 'histogram', isInput: true, defaults: () => ({ settings: { currency: 'VND' } }) },
  { type: 'percentage', label: 'Phần trăm', group: 'text', storage: 'number', operators: NUM_OPS, chart: 'histogram', isInput: true, defaults: () => ({ validation: { min: 0, max: 100 } }) },
  { type: 'date', label: 'Ngày', group: 'text', storage: 'date', operators: ['gt', 'lt', 'is_empty', 'is_not_empty'], chart: 'timeline', isInput: true },
  { type: 'time', label: 'Giờ', group: 'text', storage: 'text', operators: ANY_OPS, chart: 'text', isInput: true },
  { type: 'datetime', label: 'Ngày giờ', group: 'text', storage: 'date', operators: ['gt', 'lt', 'is_empty', 'is_not_empty'], chart: 'timeline', isInput: true },
  // B
  { type: 'single_choice', label: 'Chọn một', group: 'choice', storage: 'options', operators: SINGLE_OPS, chart: 'bar', isInput: true, hasOptions: true, defaults: () => ({ options: makeOptions(['Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3']) }) },
  { type: 'multiple_choice', label: 'Chọn nhiều', group: 'choice', storage: 'options', operators: MULTI_OPS, chart: 'multi_bar', isInput: true, hasOptions: true, defaults: () => ({ options: makeOptions(['Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3']) }) },
  { type: 'dropdown', label: 'Danh sách thả xuống', group: 'choice', storage: 'options', operators: SINGLE_OPS, chart: 'bar', isInput: true, hasOptions: true, defaults: () => ({ options: makeOptions(['Lựa chọn 1', 'Lựa chọn 2']), settings: { searchable: true } }) },
  { type: 'yes_no', label: 'Có / Không', group: 'choice', storage: 'options', operators: SINGLE_OPS, chart: 'donut', isInput: true, hasOptions: true, defaults: () => ({ options: [{ id: uid('opt'), code: 'yes', label: 'Có', active: true }, { id: uid('opt'), code: 'no', label: 'Không', active: true }] }) },
  { type: 'rating', label: 'Đánh giá sao', group: 'choice', storage: 'number', operators: NUM_OPS, chart: 'distribution', isInput: true, defaults: () => ({ settings: { scaleMax: 5 } }) },
  { type: 'likert', label: 'Thang Likert', group: 'choice', storage: 'options', operators: SINGLE_OPS, chart: 'distribution', isInput: true, hasOptions: true, defaults: () => ({ options: makeOptions(LIKERT, 'lk') }) },
  { type: 'nps', label: 'NPS 0–10', group: 'choice', storage: 'number', operators: NUM_OPS, chart: 'nps', isInput: true, defaults: () => ({ settings: { minLabel: 'Không có khả năng', maxLabel: 'Chắc chắn giới thiệu' } }) },
  { type: 'ranking', label: 'Xếp hạng', group: 'choice', storage: 'options', operators: ANY_OPS, chart: 'ranking', isInput: true, hasOptions: true, defaults: () => ({ options: makeOptions(['Mục A', 'Mục B', 'Mục C']) }) },
  { type: 'matrix', label: 'Ma trận / Lưới', group: 'choice', storage: 'options', operators: ANY_OPS, chart: 'matrix', isInput: true, hasOptions: true, hasRows: true, defaults: () => ({ rows: makeOptions(['Tiêu chí 1', 'Tiêu chí 2'], 'row'), options: makeOptions(['Kém', 'Trung bình', 'Tốt', 'Rất tốt'], 'col') }) },
  // C
  { type: 'quantity_by_group', label: 'Số lượng theo nhóm', group: 'structured', storage: 'options', operators: ANY_OPS, chart: 'grid', isInput: true, hasRows: true, defaults: () => ({ rows: makeOptions(['Nhóm 1', 'Nhóm 2'], 'grp') }) },
  { type: 'category_level', label: 'Danh mục × cấp độ', group: 'structured', storage: 'options', operators: ANY_OPS, chart: 'grid', isInput: true, hasOptions: true, hasRows: true, defaults: () => ({ rows: makeOptions(['Danh mục 1', 'Danh mục 2'], 'cat'), options: makeOptions(['Cấp 1', 'Cấp 2', 'Cấp 3'], 'lvl'), settings: { withQuantity: false } }) },
  { type: 'address', label: 'Địa chỉ', group: 'structured', storage: 'json', operators: ANY_OPS, chart: 'text', isInput: true, defaults: () => ({ settings: { includeWard: true } }) },
  { type: 'contact', label: 'Thông tin liên hệ', group: 'structured', storage: 'json', operators: ANY_OPS, chart: 'text', isInput: true, defaults: () => ({ isPII: true, settings: { contactFields: ['name', 'email', 'phone'] } }) },
  { type: 'file_upload', label: 'Tải tệp lên', group: 'structured', storage: 'file', operators: ANY_OPS, chart: 'files', isInput: true, defaults: () => ({ settings: { accept: '.pdf,.jpg,.png,.docx', maxSizeMb: 10, maxFiles: 1 } }) },
  { type: 'consent', label: 'Đồng ý điều khoản', group: 'structured', storage: 'options', operators: ANY_OPS, chart: 'none', isInput: true, defaults: () => ({ required: true, title: 'Đồng ý xử lý dữ liệu cá nhân', settings: { consentText: 'Tôi đồng ý cho KDI Education xử lý dữ liệu cá nhân cho mục đích khảo sát này.' } }) },
  // D
  { type: 'heading', label: 'Tiêu đề', group: 'content', storage: 'none', operators: [], chart: 'none', isInput: false, defaults: () => ({ settings: { level: 2 } }) },
  { type: 'paragraph', label: 'Đoạn văn', group: 'content', storage: 'none', operators: [], chart: 'none', isInput: false },
  { type: 'instruction', label: 'Hộp hướng dẫn', group: 'content', storage: 'none', operators: [], chart: 'none', isInput: false, defaults: () => ({ settings: { tone: 'info' } }) },
  { type: 'image', label: 'Hình ảnh', group: 'content', storage: 'none', operators: [], chart: 'none', isInput: false, defaults: () => ({ media: { kind: 'image', url: '', alt: '' } }) },
  { type: 'video', label: 'Video', group: 'content', storage: 'none', operators: [], chart: 'none', isInput: false, defaults: () => ({ media: { kind: 'video', url: '' } }) },
  { type: 'link', label: 'Liên kết / Tài liệu', group: 'content', storage: 'none', operators: [], chart: 'none', isInput: false, defaults: () => ({ media: { kind: 'link', url: '', text: 'Mở liên kết', newTab: true } }) },
  { type: 'divider', label: 'Đường phân cách', group: 'content', storage: 'none', operators: [], chart: 'none', isInput: false },
];

export const registry: Record<QuestionType, TypeDef> = Object.fromEntries(defs.map((d) => [d.type, d])) as Record<QuestionType, TypeDef>;
export const typeList = defs;

export const GROUP_LABELS: Record<TypeGroup, string> = {
  text: 'A · Văn bản & giá trị',
  choice: 'B · Lựa chọn',
  structured: 'C · Dữ liệu có cấu trúc',
  content: 'D · Khối nội dung',
};

export function getType(type: QuestionType): TypeDef {
  const d = registry[type];
  if (!d) throw new Error(`Unknown question type: ${type}`);
  return d;
}

export function isInputQuestion(q: Question): boolean {
  return registry[q.type]?.isInput ?? false;
}

export function createQuestion(type: QuestionType, existingCodes: string[] = []): Question {
  const def = getType(type);
  let n = existingCodes.length + 1;
  let code = `Q${n}`;
  while (existingCodes.includes(code)) code = `Q${++n}`;
  const base: Question = {
    id: uid('q'),
    code: def.isInput ? code : `C_${uid('c').slice(-6)}`,
    type,
    title: def.isInput ? 'Câu hỏi mới' : def.label,
    required: false,
  };
  return { ...base, ...(def.defaults?.() ?? {}) } as Question;
}
