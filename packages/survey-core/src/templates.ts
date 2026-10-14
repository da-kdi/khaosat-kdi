import type { ChoiceOption, Question, Section, SurveySchema } from './types.ts';

/** Deterministic option builder for templates (stable codes => comparable across waves) */
const o = (code: string, label: string): ChoiceOption => ({ id: `o_${code}`, code, label, active: true });
const q = (x: Partial<Question> & Pick<Question, 'id' | 'code' | 'type' | 'title'>): Question => ({ required: false, ...x });
const sec = (id: string, title: string, questions: Question[], description?: string, extra: Partial<Section> = {}): Section => ({ id, title, description, questions, ...extra });

export interface SurveyTemplate {
  key: string;
  title: string;
  description: string;
  category: string;
  schema: SurveySchema;
  theme?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

// ───────────── 1. Nhu cầu chủ đề STEM (seed chính) ─────────────
const stem: SurveySchema = {
  schemaVersion: 1,
  sections: [
    sec('s_intro', 'Giới thiệu', [
      q({ id: 'c_intro', code: 'C_INTRO', type: 'instruction', title: 'Mục đích khảo sát', description: 'Khảo sát nhằm tổng hợp nhu cầu triển khai các chủ đề giáo dục STEM năm học 2026–2027 của các nhà trường, làm cơ sở xây dựng kế hoạch tập huấn, học liệu và thiết bị phù hợp. Thời gian hoàn thành khoảng 7–10 phút.', settings: { tone: 'info' } }),
      q({ id: 'q_consent', code: 'CONSENT', type: 'consent', title: 'Đồng ý xử lý dữ liệu', required: true, settings: { consentText: 'Tôi xác nhận thông tin cung cấp là chính xác và đồng ý để KDI Education sử dụng dữ liệu cho mục đích tổng hợp nhu cầu, không chia sẻ cho bên thứ ba.' } }),
    ]),
    sec('s_school', 'Thông tin nhà trường', [
      q({ id: 'q_school', code: 'SCHOOL_NAME', type: 'short_text', title: 'Tên trường', required: true, placeholder: 'VD: Trường THCS Lê Lợi', reportLabel: 'Tên trường' }),
      q({ id: 'q_level', code: 'SCHOOL_LEVEL', type: 'single_choice', title: 'Cấp học', required: true, options: [o('mn', 'Mầm non'), o('th', 'Tiểu học'), o('thcs', 'THCS'), o('thpt', 'THPT'), o('lc', 'Liên cấp')] }),
      q({ id: 'q_addr', code: 'SCHOOL_ADDRESS', type: 'address', title: 'Địa chỉ trường', required: true, settings: { includeWard: true } }),
      q({ id: 'q_contact', code: 'CONTACT', type: 'contact', title: 'Người phụ trách khảo sát', required: true, isPII: true, settings: { contactFields: ['name', 'position', 'phone', 'email'] } }),
      q({ id: 'q_cls_th', code: 'CLASSES_PRIMARY', type: 'quantity_by_group', title: 'Số lớp theo khối (Tiểu học)', description: 'Nhập số lớp hiện có của từng khối.', rows: [o('k1', 'Khối 1'), o('k2', 'Khối 2'), o('k3', 'Khối 3'), o('k4', 'Khối 4'), o('k5', 'Khối 5')], validation: { max: 50 }, logic: { visibleIf: { op: 'and', rules: [{ questionId: 'q_level', operator: 'in', value: ['th', 'lc'] }] } } }),
      q({ id: 'q_cls_thcs', code: 'CLASSES_LOWER_SEC', type: 'quantity_by_group', title: 'Số lớp theo khối (THCS)', rows: [o('k6', 'Khối 6'), o('k7', 'Khối 7'), o('k8', 'Khối 8'), o('k9', 'Khối 9')], validation: { max: 50 }, logic: { visibleIf: { op: 'and', rules: [{ questionId: 'q_level', operator: 'in', value: ['thcs', 'lc'] }] } } }),
      q({ id: 'q_cls_thpt', code: 'CLASSES_UPPER_SEC', type: 'quantity_by_group', title: 'Số lớp theo khối (THPT)', rows: [o('k10', 'Khối 10'), o('k11', 'Khối 11'), o('k12', 'Khối 12')], validation: { max: 50 }, logic: { visibleIf: { op: 'and', rules: [{ questionId: 'q_level', operator: 'in', value: ['thpt', 'lc'] }] } } }),
    ]),
    sec('s_need', 'Nhu cầu chủ đề STEM', [
      q({ id: 'q_topics', code: 'STEM_TOPICS', type: 'category_level', title: 'Chọn chủ đề STEM nhà trường muốn triển khai và số lớp dự kiến theo cấp', description: 'Tích vào ô phù hợp và nhập số lớp dự kiến tham gia.', required: true,
        rows: [o('robot', 'Robotics & lập trình'), o('ai', 'Trí tuệ nhân tạo & khoa học dữ liệu'), o('energy', 'Năng lượng tái tạo'), o('env', 'Môi trường & biến đổi khí hậu'), o('mech', 'Cơ khí – mô hình kỹ thuật'), o('d3', 'Thiết kế & in 3D'), o('astro', 'Thiên văn học'), o('bio', 'Sinh học & sức khỏe')],
        options: [o('th', 'Tiểu học'), o('thcs', 'THCS'), o('thpt', 'THPT')],
        settings: { withQuantity: true, quantityLabel: 'Số lớp' } }),
      q({ id: 'q_mode', code: 'DELIVERY_MODE', type: 'multiple_choice', title: 'Hình thức triển khai mong muốn', required: true, options: [o('curr', 'Lồng ghép chính khóa'), o('club', 'Câu lạc bộ STEM'), o('extra', 'Hoạt động ngoại khóa'), o('visit', 'Trải nghiệm tại trung tâm KDI')], settings: { allowOther: true, otherLabel: 'Khác' } }),
      q({ id: 'q_time', code: 'TIMING', type: 'multiple_choice', title: 'Thời điểm triển khai', options: [o('hk1', 'Học kỳ I'), o('hk2', 'Học kỳ II'), o('summer', 'Hè 2027')] }),
      q({ id: 'q_lab', code: 'HAS_STEM_LAB', type: 'yes_no', title: 'Trường đã có phòng học STEM chưa?', required: true, options: [o('yes', 'Có'), o('no', 'Chưa')] }),
      q({ id: 'q_lab_support', code: 'LAB_SUPPORT', type: 'single_choice', title: 'Nhà trường có nhu cầu tư vấn xây dựng phòng STEM không?', options: [o('now', 'Có, trong năm học này'), o('later', 'Có, trong 1–2 năm tới'), o('no', 'Chưa có nhu cầu')], logic: { visibleIf: { op: 'and', rules: [{ questionId: 'q_lab', operator: 'equals', value: 'no' }] } }, required: true }),
      q({ id: 'q_budget', code: 'BUDGET', type: 'single_choice', title: 'Kinh phí dự kiến cho mỗi học sinh / năm', options: [o('b1', 'Dưới 300.000đ'), o('b2', '300.000 – 600.000đ'), o('b3', '600.000 – 1.000.000đ'), o('b4', 'Trên 1.000.000đ'), o('b0', 'Chưa xác định')] }),
    ]),
    sec('s_support', 'Ưu tiên & góp ý', [
      q({ id: 'q_rank', code: 'PRIORITIES', type: 'ranking', title: 'Xếp hạng mức độ ưu tiên hỗ trợ (1 = cao nhất)', options: [o('teacher', 'Tập huấn giáo viên'), o('device', 'Thiết bị & bộ kit'), o('material', 'Học liệu, giáo án'), o('cost', 'Chi phí hợp lý')] }),
      q({ id: 'q_interest', code: 'INTEREST', type: 'rating', title: 'Mức độ quan tâm của nhà trường với giáo dục STEM', settings: { scaleMax: 5 } }),
      q({ id: 'q_note', code: 'COMMENTS', type: 'long_text', title: 'Đề xuất / góp ý thêm', placeholder: 'Chủ đề khác, khó khăn hiện tại, mong muốn hỗ trợ…', validation: { maxLength: 2000 } }),
    ]),
  ],
};

// ───────────── 2. Hài lòng khóa học ─────────────
const satisfaction: SurveySchema = {
  schemaVersion: 1,
  sections: [
    sec('s1', 'Đánh giá khóa học', [
      q({ id: 'q_course', code: 'COURSE', type: 'dropdown', title: 'Khóa học bạn tham gia', required: true, options: [o('c1', 'Khóa A'), o('c2', 'Khóa B'), o('c3', 'Khóa C')], settings: { searchable: true } }),
      q({ id: 'q_overall', code: 'OVERALL', type: 'rating', title: 'Đánh giá chung', required: true, settings: { scaleMax: 5 } }),
      q({ id: 'q_mx', code: 'ASPECTS', type: 'matrix', title: 'Đánh giá từng khía cạnh', rows: [o('content', 'Nội dung'), o('teacher', 'Giảng viên'), o('facility', 'Cơ sở vật chất'), o('org', 'Tổ chức')], options: [o('1', 'Kém'), o('2', 'Trung bình'), o('3', 'Tốt'), o('4', 'Rất tốt')] }),
      q({ id: 'q_lk', code: 'APPLY', type: 'likert', title: 'Tôi có thể áp dụng kiến thức vào công việc', options: [o('1', 'Rất không đồng ý'), o('2', 'Không đồng ý'), o('3', 'Trung lập'), o('4', 'Đồng ý'), o('5', 'Rất đồng ý')] }),
      q({ id: 'q_nps', code: 'NPS', type: 'nps', title: 'Bạn có sẵn sàng giới thiệu khóa học cho đồng nghiệp?', required: true, settings: { minLabel: 'Không', maxLabel: 'Chắc chắn' } }),
      q({ id: 'q_why', code: 'NPS_REASON', type: 'long_text', title: 'Điều gì khiến bạn chưa hài lòng?', logic: { visibleIf: { op: 'and', rules: [{ questionId: 'q_nps', operator: 'lte', value: 6 }] } } }),
    ]),
  ],
};

// ───────────── 3. Đăng ký sự kiện ─────────────
const registration: SurveySchema = {
  schemaVersion: 1,
  sections: [
    sec('s1', 'Thông tin đăng ký', [
      q({ id: 'q_c', code: 'CONTACT', type: 'contact', title: 'Thông tin người đăng ký', required: true, isPII: true, settings: { contactFields: ['name', 'email', 'phone', 'organization'] } }),
      q({ id: 'q_role', code: 'ROLE', type: 'single_choice', title: 'Bạn là', required: true, options: [o('teacher', 'Giáo viên'), o('manager', 'Cán bộ quản lý'), o('parent', 'Phụ huynh'), o('student', 'Học sinh')], settings: { allowOther: true } }),
      q({ id: 'q_n', code: 'ATTENDEES', type: 'number', title: 'Số người tham dự', required: true, validation: { min: 1, max: 20 }, defaultValue: 1 }),
      q({ id: 'q_date', code: 'SESSION_DATE', type: 'date', title: 'Ngày tham dự mong muốn' }),
      q({ id: 'q_ok', code: 'CONSENT', type: 'consent', title: 'Xác nhận', required: true, settings: { consentText: 'Tôi đồng ý nhận thông tin về sự kiện qua email/điện thoại.' } }),
    ]),
  ],
};

export const TEMPLATES: SurveyTemplate[] = [
  { key: 'stem-needs', title: 'Khảo sát nhu cầu chủ đề STEM', description: 'Thu thập thông tin trường, số lớp theo khối, chủ đề STEM × cấp học và hình thức triển khai.', category: 'Giáo dục STEM', schema: stem, theme: { preset: 'education' }, settings: { estimatedMinutes: 8 } },
  { key: 'course-satisfaction', title: 'Khảo sát hài lòng khóa học', description: 'Rating, ma trận đánh giá, Likert và NPS có câu hỏi phân nhánh.', category: 'Mức độ hài lòng', schema: satisfaction, theme: { preset: 'feedback' }, settings: { estimatedMinutes: 3 } },
  { key: 'event-registration', title: 'Đăng ký tham gia sự kiện', description: 'Thông tin liên hệ, vai trò, số người tham dự và xác nhận.', category: 'Đăng ký', schema: registration, theme: { preset: 'event' }, settings: { estimatedMinutes: 2 } },
];

export function blankSchema(): SurveySchema {
  return { schemaVersion: 1, sections: [{ id: `s_${Date.now().toString(36)}`, title: 'Phần 1', questions: [] }] };
}

/** Deep-clone a schema and regenerate all internal ids (codes are kept stable). */
export function cloneSchemaWithNewIds(schema: SurveySchema): SurveySchema {
  const map = new Map<string, string>();
  const nid = (old: string, p: string) => {
    if (!map.has(old)) map.set(old, `${p}_${Math.random().toString(36).slice(2, 10)}`);
    return map.get(old)!;
  };
  // first pass assign question ids so logic references can be remapped
  for (const s of schema.sections) { nid(s.id, 's'); for (const qq of s.questions) nid(qq.id, 'q'); }
  const remap = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(remap);
    if (x && typeof x === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(x)) out[k] = (k === 'questionId' && typeof v === 'string') ? map.get(v) ?? v : remap(v);
      return out;
    }
    return x;
  };
  return {
    schemaVersion: 1,
    sections: schema.sections.map((s) => ({
      ...(remap(s) as Section),
      id: map.get(s.id)!,
      questions: s.questions.map((qq) => ({ ...(remap(qq) as Question), id: map.get(qq.id)! })),
    })),
  };
}
