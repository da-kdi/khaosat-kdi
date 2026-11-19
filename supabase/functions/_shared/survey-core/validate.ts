// AUTO-COPIED from packages/survey-core/src by scripts/sync-core.mjs — do not edit here.
import type { Answers, ChoiceOption, ContactValue, FileValue, GridValue, Question, SurveySchema } from './types.ts';
import { OTHER_CODE, otherKey } from './types.ts';
import { computeVisibility, isEmptyValue, isRequired } from './logic.ts';
import { isInputQuestion } from './registry.ts';
import { runChecks } from './checks.ts';

export type Errors = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// VN mobile/landline: 0xxxxxxxxx (10–11 digits) or +84
const PHONE = /^(\+84|0)\d{9,10}$/;

const activeCodes = (opts: ChoiceOption[] | undefined) => new Set((opts ?? []).filter((o) => o.active !== false).map((o) => o.code));

/** Validate a single (visible) question. Returns an error message or null. */
export function validateQuestion(q: Question, value: unknown, required: boolean, answers: Answers): string | null {
  if (!isInputQuestion(q)) return null;
  const empty = isEmptyValue(value);
  if (q.type === 'consent') {
    if (required && value !== true) return 'Bạn cần đồng ý để tiếp tục';
    return null;
  }
  if (empty) return required ? 'Câu hỏi này là bắt buộc' : null;

  const v = q.validation ?? {};
  const s = q.settings ?? {};

  switch (q.type) {
    case 'short_text':
    case 'long_text':
    case 'url':
    case 'email':
    case 'phone': {
      if (typeof value !== 'string') return 'Giá trị không hợp lệ';
      const t = value.trim();
      if (q.type === 'email' && !EMAIL.test(t)) return 'Email không hợp lệ';
      if (q.type === 'phone' && !PHONE.test(t.replace(/[\s.-]/g, ''))) return 'Số điện thoại không hợp lệ';
      if (q.type === 'url') {
        try {
          const u = new URL(t);
          if (!/^https?:$/.test(u.protocol)) return 'URL phải bắt đầu bằng http(s)://';
        } catch {
          return 'URL không hợp lệ';
        }
      }
      if (v.minLength !== undefined && t.length < v.minLength) return `Tối thiểu ${v.minLength} ký tự`;
      if (v.maxLength !== undefined && t.length > v.maxLength) return `Tối đa ${v.maxLength} ký tự`;
      if (v.pattern) {
        try {
          if (!new RegExp(v.pattern).test(t)) return v.patternMessage || 'Không đúng định dạng';
        } catch { /* invalid pattern configured: ignore */ }
      }
      return null;
    }
    case 'number':
    case 'currency':
    case 'percentage':
    case 'rating':
    case 'nps': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return 'Vui lòng nhập số';
      const min = q.type === 'nps' ? 0 : q.type === 'rating' ? 1 : v.min;
      const max = q.type === 'nps' ? 10 : q.type === 'rating' ? (s.scaleMax ?? 5) : v.max;
      if (min !== undefined && n < min) return `Giá trị tối thiểu là ${min}`;
      if (max !== undefined && n > max) return `Giá trị tối đa là ${max}`;
      if ((q.type === 'rating' || q.type === 'nps') && !Number.isInteger(n)) return 'Giá trị không hợp lệ';
      return null;
    }
    case 'date':
    case 'datetime':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? null : 'Ngày không hợp lệ';
    case 'time':
      return typeof value === 'string' && /^\d{2}:\d{2}/.test(value) ? null : 'Giờ không hợp lệ';
    case 'single_choice':
    case 'dropdown':
    case 'yes_no':
    case 'likert': {
      if (typeof value !== 'string') return 'Lựa chọn không hợp lệ';
      if (value === OTHER_CODE) {
        if (!s.allowOther) return 'Lựa chọn không hợp lệ';
        if (isEmptyValue(answers[otherKey(q.id)])) return 'Vui lòng ghi rõ lựa chọn "Khác"';
        return null;
      }
      return activeCodes(q.options).has(value) ? null : 'Lựa chọn không hợp lệ';
    }
    case 'multiple_choice': {
      if (!Array.isArray(value)) return 'Lựa chọn không hợp lệ';
      const codes = activeCodes(q.options);
      for (const c of value) {
        if (c === OTHER_CODE) {
          if (!s.allowOther) return 'Lựa chọn không hợp lệ';
          if (isEmptyValue(answers[otherKey(q.id)])) return 'Vui lòng ghi rõ lựa chọn "Khác"';
        } else if (!codes.has(String(c))) return 'Lựa chọn không hợp lệ';
      }
      if (new Set(value).size !== value.length) return 'Lựa chọn bị trùng';
      const excl = (s.exclusiveCodes ?? []).filter((c) => value.includes(c));
      if (excl.length && value.length > 1) return 'Lựa chọn này không thể chọn cùng các lựa chọn khác';
      if (s.minSelect && value.length < s.minSelect) return `Chọn ít nhất ${s.minSelect} lựa chọn`;
      if (s.maxSelect && value.length > s.maxSelect) return `Chọn tối đa ${s.maxSelect} lựa chọn`;
      return null;
    }
    case 'ranking': {
      if (!Array.isArray(value)) return 'Thứ tự không hợp lệ';
      const codes = activeCodes(q.options);
      if (value.length !== codes.size || !value.every((c) => codes.has(String(c)))) return 'Vui lòng xếp hạng tất cả các mục';
      return null;
    }
    case 'matrix': {
      if (typeof value !== 'object' || Array.isArray(value)) return 'Giá trị không hợp lệ';
      const rows = activeCodes(q.rows);
      const cols = activeCodes(q.options);
      const m = value as Record<string, unknown>;
      for (const [r, sel] of Object.entries(m)) {
        if (!rows.has(r)) return 'Hàng không hợp lệ';
        const arr = Array.isArray(sel) ? sel : [sel];
        if (!s.multiPerRow && arr.length > 1) return 'Mỗi hàng chỉ chọn một';
        if (!arr.every((c) => cols.has(String(c)))) return 'Cột không hợp lệ';
      }
      if (required) for (const r of rows) if (isEmptyValue(m[r])) return 'Vui lòng trả lời tất cả các hàng';
      return null;
    }
    case 'quantity_by_group': {
      if (typeof value !== 'object' || Array.isArray(value)) return 'Giá trị không hợp lệ';
      const rows = activeCodes(q.rows);
      for (const [r, n] of Object.entries(value as Record<string, unknown>)) {
        if (!rows.has(r)) return 'Nhóm không hợp lệ';
        if (n === '' || n === null || n === undefined) continue;
        const num = Number(n);
        if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return 'Số lượng phải là số nguyên ≥ 0';
        if (v.max !== undefined && num > v.max) return `Số lượng tối đa mỗi nhóm là ${v.max}`;
      }
      return null;
    }
    case 'category_level': {
      if (typeof value !== 'object' || Array.isArray(value)) return 'Giá trị không hợp lệ';
      const rows = activeCodes(q.rows);
      const cols = activeCodes(q.options);
      let selected = 0;
      for (const [r, cells] of Object.entries(value as GridValue)) {
        if (!rows.has(r)) return 'Danh mục không hợp lệ';
        for (const [c, qty] of Object.entries(cells ?? {})) {
          if (!cols.has(c)) return 'Cấp độ không hợp lệ';
          const n = Number(qty);
          if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return 'Số lượng phải là số nguyên ≥ 0';
          if (n > 0) selected++;
        }
      }
      if (required && selected === 0) return 'Vui lòng chọn ít nhất một mục';
      if (s.minSelect && selected < s.minSelect) return `Chọn ít nhất ${s.minSelect} mục`;
      if (s.maxSelect && selected > s.maxSelect) return `Chọn tối đa ${s.maxSelect} mục`;
      return null;
    }
    case 'number_range': {
      if (typeof value !== 'object' || Array.isArray(value)) return 'Giá trị không hợp lệ';
      const r = value as Record<string, unknown>;
      const lo = r.min === '' || r.min == null ? undefined : Number(r.min);
      const hi = r.max === '' || r.max == null ? undefined : Number(r.max);
      if ((lo !== undefined && !Number.isFinite(lo)) || (hi !== undefined && !Number.isFinite(hi))) return 'Vui lòng nhập số';
      if (required && (lo === undefined || hi === undefined)) return 'Vui lòng nhập cả hai giá trị';
      for (const n of [lo, hi]) {
        if (n === undefined) continue;
        if (v.min !== undefined && n < v.min) return `Giá trị tối thiểu là ${v.min}`;
        if (v.max !== undefined && n > v.max) return `Giá trị tối đa là ${v.max}`;
      }
      if (lo !== undefined && hi !== undefined && lo > hi) return `Tối thiểu (${lo}) đang lớn hơn tối đa (${hi})`;
      return null;
    }
    case 'number_grid': {
      if (typeof value !== 'object' || Array.isArray(value)) return 'Giá trị không hợp lệ';
      const rows = activeCodes(q.rows);
      const cols = activeCodes(q.options);
      const g = value as Record<string, Record<string, unknown>>;
      for (const [r, cells] of Object.entries(g)) {
        if (!rows.has(r)) return 'Dòng không hợp lệ';
        for (const [c, x] of Object.entries(cells ?? {})) {
          if (!cols.has(c)) return 'Cột không hợp lệ';
          if (x === '' || x === null || x === undefined) continue;
          const n = Number(x);
          if (!Number.isFinite(n)) return 'Vui lòng nhập số';
          if (v.min !== undefined && n < v.min) return `Mỗi ô tối thiểu là ${v.min}`;
          if (v.max !== undefined && n > v.max) return `Mỗi ô tối đa là ${v.max}`;
        }
      }
      if (required && s.requireAllCells) {
        let missing = 0;
        for (const r of rows) for (const c of cols) { const x = g[r]?.[c]; if (x === '' || x === null || x === undefined) missing++; }
        if (missing) return `Còn ${missing} ô chưa điền`;
      }
      return null;
    }
    case 'composite': {
      if (typeof value !== 'object' || Array.isArray(value)) return 'Giá trị không hợp lệ';
      const c = value as Record<string, unknown>;
      for (const f of s.fields ?? []) {
        const x = c[f.code];
        if (isEmptyValue(x)) { if (required && f.required !== false) return `Vui lòng điền “${f.label}”`; continue; }
        if (f.kind === 'number') {
          const n = Number(x);
          if (!Number.isFinite(n)) return `“${f.label}” phải là số`;
          if (f.min !== undefined && n < f.min) return `“${f.label}” tối thiểu là ${f.min}`;
          if (f.max !== undefined && n > f.max) return `“${f.label}” tối đa là ${f.max}`;
        }
        if (f.kind === 'date' && Number.isNaN(Date.parse(String(x)))) return `“${f.label}” không phải ngày hợp lệ`;
        if (f.kind === 'select' && f.choices?.length && !f.choices.includes(String(x))) return `“${f.label}” không hợp lệ`;
      }
      return null;
    }
    case 'address': {
      const a = value as Record<string, string>;
      if (required && (!a.province || (s.includeWard && !a.ward))) return 'Vui lòng nhập đủ địa chỉ';
      return null;
    }
    case 'contact': {
      const c = value as ContactValue;
      const fields = s.contactFields ?? ['name', 'email', 'phone'];
      if (required) for (const f of fields) if (isEmptyValue(c[f])) return 'Vui lòng nhập đủ thông tin liên hệ';
      if (c.email && !EMAIL.test(c.email)) return 'Email không hợp lệ';
      if (c.phone && !PHONE.test(c.phone.replace(/[\s.-]/g, ''))) return 'Số điện thoại không hợp lệ';
      return null;
    }
    case 'file_upload': {
      const files = (Array.isArray(value) ? value : [value]) as FileValue[];
      if (files.length > (s.maxFiles ?? 1)) return `Tối đa ${s.maxFiles ?? 1} tệp`;
      const maxBytes = (s.maxSizeMb ?? 10) * 1024 * 1024;
      const accept = (s.accept ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
      for (const f of files) {
        if (!f || typeof f.name !== 'string') return 'Tệp không hợp lệ';
        if (f.size > maxBytes) return `Tệp vượt quá ${s.maxSizeMb ?? 10}MB`;
        if (accept.length && !accept.some((a) => f.name.toLowerCase().endsWith(a))) return `Chỉ chấp nhận: ${accept.join(', ')}`;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Validate a set of answers against a schema. If `sectionId` is given, only that
 * section is validated (used for "Next" navigation).
 */
export function validateAnswers(schema: SurveySchema, answers: Answers, sectionId?: string): Errors {
  const vis = computeVisibility(schema, answers);
  const errors: Errors = {};
  for (const section of schema.sections) {
    if (sectionId && section.id !== sectionId) continue;
    if (!vis.sections.has(section.id)) continue;
    for (const q of section.questions) {
      if (!vis.questions.has(q.id)) continue;
      const err = validateQuestion(q, answers[q.id], isRequired(q, vis.effective), answers);
      if (err) errors[q.id] = err;
    }
  }
  // kiểm tra chéo loại "chặn gửi": gắn lỗi vào câu bên trái
  const inSection = sectionId ? new Set(schema.sections.find((s) => s.id === sectionId)?.questions.map((q) => q.id) ?? []) : null;
  for (const r of runChecks(schema, answers, 'block')) {
    if (inSection && !inSection.has(r.questionId)) continue;
    if (!errors[r.questionId]) errors[r.questionId] = r.message;
  }
  return errors;
}

/** Remove hidden questions, content blocks and unknown keys. Keeps "other" texts for visible questions. */
export function sanitizeAnswers(schema: SurveySchema, answers: Answers): Answers {
  const vis = computeVisibility(schema, answers);
  const out: Answers = {};
  for (const s of schema.sections) for (const q of s.questions) {
    if (!isInputQuestion(q) || !vis.questions.has(q.id)) continue;
    const v = answers[q.id];
    if (isEmptyValue(v) && v !== false) continue;
    out[q.id] = v;
    const ok = otherKey(q.id);
    const selectedOther = v === OTHER_CODE || (Array.isArray(v) && v.includes(OTHER_CODE));
    if (selectedOther && !isEmptyValue(answers[ok])) out[ok] = String(answers[ok]).slice(0, 1000);
  }
  return out;
}
