// AUTO-COPIED from packages/survey-core/src by scripts/sync-core.mjs — do not edit here.
// ─────────────────────────────────────────────────────────────
// survey-core: pure TypeScript, zero runtime dependencies.
// Shared by the React app (browser) and the Supabase Edge Function (Deno).
// ─────────────────────────────────────────────────────────────

export type QuestionType =
  // A — text / value
  | 'short_text' | 'long_text' | 'email' | 'phone' | 'url'
  | 'number' | 'currency' | 'percentage' | 'date' | 'time' | 'datetime'
  // B — choice
  | 'single_choice' | 'multiple_choice' | 'dropdown' | 'yes_no'
  | 'rating' | 'likert' | 'nps' | 'ranking' | 'matrix'
  // C — structured
  | 'quantity_by_group' | 'category_level' | 'address' | 'contact' | 'file_upload' | 'consent'
  | 'number_range' | 'number_grid' | 'composite'
  // D — content (not questions)
  | 'heading' | 'paragraph' | 'instruction' | 'image' | 'video' | 'link' | 'divider';

export interface ChoiceOption {
  /** stable internal id (never changes) */
  id: string;
  /** stable code used in DB / exports / Power BI */
  code: string;
  label: string;
  active?: boolean;
  /** optional score for scoring surveys */
  score?: number;
}

export type LogicOperator =
  | 'equals' | 'not_equals' | 'in' | 'not_in'
  | 'contains_any' | 'contains_all'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'is_empty' | 'is_not_empty';

export interface LogicRule {
  questionId: string;
  operator: LogicOperator;
  value?: string | number | (string | number)[];
}

export interface LogicGroup {
  op: 'and' | 'or';
  rules: (LogicRule | LogicGroup)[];
}

export interface Validation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  patternMessage?: string;
}

export interface MediaRef {
  kind: 'image' | 'video' | 'link' | 'file';
  url: string;
  alt?: string;
  caption?: string;
  /** link text / file label */
  text?: string;
  newTab?: boolean;
}

export interface QuestionSettings {
  allowOther?: boolean;
  otherLabel?: string;
  minSelect?: number;
  maxSelect?: number;
  /** option codes that clear all other selections (e.g. "Không có") */
  exclusiveCodes?: string[];
  searchable?: boolean;
  shuffle?: boolean;
  /** rating: max stars; likert uses options */
  scaleMax?: number;
  minLabel?: string;
  maxLabel?: string;
  /** matrix: allow multiple per row */
  multiPerRow?: boolean;
  /** category_level: ask a quantity for each selected cell */
  withQuantity?: boolean;
  quantityLabel?: string;
  /** currency code */
  currency?: string;
  /** đơn vị hiển thị sau ô số: lớp, học sinh, triệu đồng… (number, number_range, number_grid, quantity_by_group) */
  unit?: string;
  /** number_grid: mọi ô phải điền khi câu bắt buộc */
  requireAllCells?: boolean;
  /** number_grid: hiện dòng / cột tổng */
  showTotals?: boolean;
  /** composite: các ô nhỏ trong một câu */
  fields?: CompositeField[];
  /** file upload */
  accept?: string;
  maxSizeMb?: number;
  maxFiles?: number;
  /** address */
  includeWard?: boolean;
  /** contact fields */
  contactFields?: ('name' | 'email' | 'phone' | 'position' | 'organization')[];
  /** consent */
  consentText?: string;
  /** content */
  level?: 1 | 2 | 3;
  tone?: 'info' | 'warning' | 'success';
}

export interface CompositeField {
  /** mã ổn định, dùng khi xuất dữ liệu: CODE__field */
  code: string;
  label: string;
  kind: 'text' | 'number' | 'date' | 'select';
  unit?: string;
  /** select: các lựa chọn */
  choices?: string[];
  required?: boolean;
  min?: number;
  max?: number;
}

export interface Question {
  id: string;
  code: string;
  type: QuestionType;
  title: string;
  description?: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  /** choices / columns / levels */
  options?: ChoiceOption[];
  /** matrix rows, groups, categories */
  rows?: ChoiceOption[];
  settings?: QuestionSettings;
  validation?: Validation;
  logic?: { visibleIf?: LogicGroup; requiredIf?: LogicGroup };
  media?: MediaRef;
  reportLabel?: string;
  isPII?: boolean;
  defaultValue?: unknown;
}

export interface Section {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
  logic?: { visibleIf?: LogicGroup };
}

/** Một vế của phép kiểm tra chéo: một phần của câu trả lời (× hệ số) hoặc một hằng số. */
export type CheckOperand = { questionId: string; part?: string; factor?: number } | { value: number };

/** Kiểm tra chéo giữa các câu, ví dụ: số lớp có STEM ≤ tổng số lớp. */
export interface CrossCheck {
  id: string;
  left: CheckOperand;
  op: 'lte' | 'lt' | 'gte' | 'gt' | 'eq';
  right: CheckOperand;
  /** warn: nhắc nhưng vẫn cho gửi; block: phải sửa mới gửi được */
  severity: 'warn' | 'block';
  message?: string;
}

export interface SurveySchema {
  schemaVersion: 1;
  sections: Section[];
  checks?: CrossCheck[];
}

export type Answers = Record<string, unknown>;

export interface AddressValue { province?: string; ward?: string; street?: string }
export interface ContactValue { name?: string; email?: string; phone?: string; position?: string; organization?: string }
export interface FileValue { name: string; size: number; type: string; path?: string }
/** category_level / matrix-with-quantity: rowCode -> optionCode -> qty (1 when no quantity) */
export type GridValue = Record<string, Record<string, number>>;
/** number_range */
export interface RangeValue { min?: number; max?: number }

/** Survey-level settings (stored in surveys.settings, snapshotted per version) */
export interface SurveySettings {
  access?: { mode: 'public' | 'code' | 'invite'; code?: string };
  maxResponses?: number | null;
  allowResume?: boolean;
  oneResponsePerDevice?: boolean;
  estimatedMinutes?: number;
  introTitle?: string;
  introText?: string;
  completionTitle?: string;
  completionText?: string;
  contactInfo?: string;
  showProgress?: boolean;
  requireReview?: boolean;
  /** retention in days for responses / files (documented; enforced by scheduled job) */
  retentionDays?: number | null;
}

export interface SurveyTheme {
  preset?: string;
  primary?: string;
  accent?: string;
  background?: string;
  logoUrl?: string;
  coverUrl?: string;
  font?: 'be-vietnam' | 'system' | 'serif';
}

/** Strip secrets before sending settings to respondents */
export function publicSettings(s: SurveySettings): SurveySettings {
  const { access, ...rest } = s ?? {};
  return { ...rest, access: access ? { mode: access.mode } : undefined };
}

export const OTHER_CODE = '__other';
export const otherKey = (questionId: string) => `${questionId}__other`;
