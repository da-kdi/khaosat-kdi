// Synthetic data for demo mode only. Generates plausible answers for any schema.
import {
  TEMPLATES, cloneSchemaWithNewIds, computeVisibility, isInputQuestion, makeResponseCode, sanitizeAnswers,
  type Answers, type Question, type ResponseRecord, type SurveySchema,
} from '@core/index.ts';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const SCHOOLS = ['THCS Lê Lợi', 'TH Ngô Quyền', 'THPT Trần Phú', 'THCS Chu Văn An', 'TH Lê Văn Tám', 'THPT Thái Phiên', 'Liên cấp Đoàn Thị Điểm', 'THCS Hồng Bàng', 'TH Đằng Hải', 'THPT Ngô Quyền', 'THCS Kiến An', 'TH Hùng Vương', 'THCS Ngô Gia Tự', 'THPT Lê Quý Đôn'];
const WARDS = ['Lê Chân', 'Ngô Quyền', 'Hồng Bàng', 'Hải An', 'Kiến An', 'Dương Kinh', 'Đồ Sơn'];
const NAMES = ['Nguyễn Thu Hà', 'Trần Minh Đức', 'Lê Thị Lan', 'Phạm Quốc Huy', 'Vũ Thanh Hương', 'Đỗ Văn Nam', 'Hoàng Mai Anh'];
const COMMENTS = [
  'Mong muốn có thêm tập huấn giáo viên về robotics và lập trình.',
  'Nhà trường cần hỗ trợ thiết bị cho phòng STEM, đặc biệt là bộ kit năng lượng tái tạo.',
  'Chi phí cần hợp lý để phụ huynh đồng thuận, ưu tiên mô hình câu lạc bộ.',
  'Đề xuất thêm chủ đề trí tuệ nhân tạo cho học sinh THCS.',
  'Giáo viên còn thiếu kinh nghiệm, cần giáo án mẫu và học liệu chi tiết.',
  'Muốn tổ chức trải nghiệm tại trung tâm cho học sinh khối 6 và 7.',
  'Cần lịch triển khai linh hoạt theo học kỳ II.',
  'Thiết bị in 3D rất hấp dẫn học sinh, mong có lớp tập huấn.',
  '',
];

function pick<T>(r: () => number, arr: T[]): T { return arr[Math.floor(r() * arr.length)]; }

function answerFor(q: Question, r: () => number, i: number): unknown {
  const opts = (q.options ?? []).filter((o) => o.active !== false);
  const rows = (q.rows ?? []).filter((o) => o.active !== false);
  switch (q.type) {
    case 'short_text': return q.code === 'SCHOOL_NAME' ? `${SCHOOLS[i % SCHOOLS.length]}${i >= SCHOOLS.length ? ` (${Math.floor(i / SCHOOLS.length) + 1})` : ''}` : `Trả lời mẫu ${i + 1}`;
    case 'long_text': return pick(r, COMMENTS);
    case 'email': return `user${i}@example.edu.vn`;
    case 'phone': return `09${String(10000000 + Math.floor(r() * 89999999))}`;
    case 'url': return 'https://kdi.edu.vn';
    case 'number': return Math.max(q.validation?.min ?? 1, Math.min(q.validation?.max ?? 20, Math.round(1 + r() * 4)));
    case 'currency': return Math.round(r() * 20) * 50000;
    case 'percentage': return Math.round(r() * 100);
    case 'date': case 'datetime': { const d = new Date(Date.now() + (r() * 60 - 10) * 864e5); return d.toISOString().slice(0, q.type === 'date' ? 10 : 16); }
    case 'time': return `${String(7 + Math.floor(r() * 10)).padStart(2, '0')}:00`;
    case 'single_choice': case 'dropdown': case 'likert': {
      // skew toward later options for likert, earlier for others
      const w = q.type === 'likert' ? Math.min(opts.length - 1, Math.floor(Math.sqrt(r()) * opts.length)) : Math.floor(Math.pow(r(), 1.4) * opts.length);
      return opts[w]?.code;
    }
    case 'yes_no': return r() < 0.35 ? opts[0]?.code : opts[1]?.code;
    case 'multiple_choice': {
      const sel = opts.filter(() => r() < 0.45).map((o) => o.code);
      return sel.length ? sel : [opts[0].code];
    }
    case 'rating': return Math.min(q.settings?.scaleMax ?? 5, Math.max(1, Math.round(2.5 + r() * 3)));
    case 'nps': return Math.min(10, Math.max(0, Math.round(5 + r() * 6 - (r() < 0.2 ? 4 : 0))));
    case 'ranking': return [...opts].sort(() => r() - 0.5).map((o) => o.code);
    case 'matrix': return Object.fromEntries(rows.map((row) => [row.code, opts[Math.min(opts.length - 1, Math.floor(Math.sqrt(r()) * opts.length))].code]));
    case 'quantity_by_group': return Object.fromEntries(rows.map((row) => [row.code, 2 + Math.floor(r() * 7)]));
    case 'category_level': {
      const v: Record<string, Record<string, number>> = {};
      for (const row of rows) {
        if (r() < 0.4) continue;
        const col = pick(r, opts);
        v[row.code] = { [col.code]: q.settings?.withQuantity ? 1 + Math.floor(r() * 5) : 1 };
      }
      if (!Object.keys(v).length) v[rows[0].code] = { [opts[0].code]: 2 };
      return v;
    }
    case 'address': return { province: 'Hải Phòng', ward: pick(r, WARDS), street: `${1 + Math.floor(r() * 200)} đường ${pick(r, ['Trần Phú', 'Lạch Tray', 'Tô Hiệu'])}` };
    case 'contact': return { name: pick(r, NAMES), email: `gv${i}@truong.edu.vn`, phone: `09${String(10000000 + Math.floor(r() * 89999999))}`, position: pick(r, ['Hiệu trưởng', 'Phó hiệu trưởng', 'Tổ trưởng chuyên môn']), organization: pick(r, SCHOOLS) };
    case 'consent': return true;
    case 'file_upload': return undefined;
    default: return undefined;
  }
}

/** Fill answers section by section, respecting live logic. */
export function syntheticAnswers(schema: SurveySchema, r: () => number, i: number, stopAfterSection?: number): { answers: Answers; reached: string[] } {
  const answers: Answers = {};
  const reached: string[] = [];
  schema.sections.forEach((s, si) => {
    if (stopAfterSection !== undefined && si > stopAfterSection) return;
    const vis = computeVisibility(schema, answers);
    if (!vis.sections.has(s.id)) return;
    reached.push(s.id);
    for (const q of s.questions) {
      if (!isInputQuestion(q)) continue;
      const v2 = computeVisibility(schema, answers);
      if (!v2.questions.has(q.id)) continue;
      if (!q.required && r() < 0.12) continue; // some skips
      const v = answerFor(q, r, i);
      if (v !== undefined) answers[q.id] = v;
    }
  });
  return { answers: stopAfterSection === undefined ? sanitizeAnswers(schema, answers) : answers, reached };
}

export function syntheticResponses(schema: SurveySchema, versionId: string, n: number, seed: number, inProgressShare = 0.15): ResponseRecord[] {
  const r = rng(seed);
  const out: ResponseRecord[] = [];
  for (let i = 0; i < n; i++) {
    const inProgress = r() < inProgressShare;
    const started = new Date(Date.now() - (n - i) * 3.1 * 3600_000 - r() * 3600_000);
    const stop = inProgress ? Math.floor(r() * Math.max(1, schema.sections.length - 1)) : undefined;
    const { answers, reached } = syntheticAnswers(schema, r, i, stop);
    const duration = Math.round(180 + r() * 600);
    out.push({
      id: `resp_${seed}_${i}`,
      code: makeResponseCode(),
      versionId,
      status: inProgress ? 'in_progress' : 'submitted',
      startedAt: started.toISOString(),
      submittedAt: inProgress ? null : new Date(started.getTime() + duration * 1000).toISOString(),
      durationSeconds: inProgress ? null : duration,
      answers,
      flag: !inProgress && r() < 0.04 ? 'needs_review' : null,
      reachedSections: reached,
    });
  }
  return out;
}

export function demoTemplates() {
  return TEMPLATES.map((t) => ({ ...t, schema: cloneSchemaWithNewIds(t.schema) }));
}
