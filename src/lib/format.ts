import type { SurveyStatus } from '@core/index.ts';

export const STATUS_LABEL: Record<SurveyStatus, string> = {
  draft: 'Bản nháp',
  published: 'Đang thu thập',
  paused: 'Tạm dừng',
  closed: 'Đã kết thúc',
  archived: 'Đã kết thúc (lưu trữ cũ)',
};
export const STATUS_TONE: Record<SurveyStatus, 'slate' | 'blue' | 'green' | 'orange' | 'red' | 'purple'> = {
  draft: 'slate',
  published: 'green',
  paused: 'orange',
  closed: 'blue',
  archived: 'purple',
};

export const FLAG_LABEL: Record<string, string> = { needs_review: 'Cần xác minh', invalid: 'Không hợp lệ', spam: 'Spam' };

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'khao-sat';
}

const dtf = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtDateTime = (s?: string | null) => (s ? dtf.format(new Date(s)) : '—');
export const fmtDate = (s?: string | null) => (s ? df.format(new Date(s)) : '—');
export const fmtNum = (n?: number | null, digits = 0) => (n === null || n === undefined || Number.isNaN(n) ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: digits }));
export const fmtPct = (n?: number | null, digits = 1) => (n === null || n === undefined || Number.isNaN(n) ? '—' : `${(n * 100).toLocaleString('vi-VN', { maximumFractionDigits: digits })}%`);
export function fmtDuration(sec?: number | null): string {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m} phút ${s.toString().padStart(2, '0')}s` : `${s}s`;
}
export function timeAgo(s: string): string {
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 60) return 'vừa xong';
  if (d < 3600) return `${Math.floor(d / 60)} phút trước`;
  if (d < 86400) return `${Math.floor(d / 3600)} giờ trước`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} ngày trước`;
  return fmtDate(s);
}

export const ACTION_LABEL: Record<string, string> = {
  'survey.create': 'tạo khảo sát',
  'survey.publish': 'xuất bản phiên bản',
  'survey.status': 'đổi trạng thái',
  'survey.duplicate': 'nhân bản khảo sát',
  'survey.delete': 'xóa bản nháp',
  'invitation.create': 'tạo lời mời',
  'invitation.revoke': 'thu hồi lời mời',
  'response.flag': 'gắn cờ phản hồi',
};

/** A draft that was never published can be deleted by its owner or an admin. */
export function canDeleteDraft(s: { status: string; currentVersionId?: string | null; myRole?: string | null }) {
  return s.status === 'draft' && !s.currentVersionId && (s.myRole === 'owner' || s.myRole === 'admin');
}
export const DELETE_DRAFT_CONFIRM = (title: string) => `Xóa vĩnh viễn bản nháp "${title}"?

Toàn bộ câu hỏi đã soạn sẽ bị xóa và KHÔNG thể khôi phục.`;
