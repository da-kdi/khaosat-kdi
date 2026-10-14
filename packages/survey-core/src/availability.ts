export type SurveyStatus = 'draft' | 'published' | 'paused' | 'closed' | 'archived';
export type Availability = 'open' | 'not_found' | 'draft' | 'paused' | 'closed' | 'not_started' | 'ended' | 'full';

export function surveyAvailability(args: {
  status: SurveyStatus;
  hasVersion: boolean;
  startAt?: string | null;
  endAt?: string | null;
  maxResponses?: number | null;
  submittedCount?: number;
  now?: Date;
}): Availability {
  const now = args.now ?? new Date();
  if (args.status === 'draft' || !args.hasVersion) return 'draft';
  if (args.status === 'archived' || args.status === 'closed') return 'closed';
  if (args.status === 'paused') return 'paused';
  if (args.startAt && new Date(args.startAt) > now) return 'not_started';
  if (args.endAt && new Date(args.endAt) < now) return 'ended';
  if (args.maxResponses && (args.submittedCount ?? 0) >= args.maxResponses) return 'full';
  return 'open';
}

export const AVAILABILITY_MESSAGE: Record<Availability, string> = {
  open: '',
  not_found: 'Không tìm thấy khảo sát.',
  draft: 'Khảo sát chưa được xuất bản.',
  paused: 'Khảo sát đang tạm dừng nhận phản hồi. Vui lòng quay lại sau.',
  closed: 'Khảo sát đã đóng.',
  not_started: 'Khảo sát chưa đến thời gian mở.',
  ended: 'Khảo sát đã hết hạn nhận phản hồi.',
  full: 'Khảo sát đã nhận đủ số lượng phản hồi.',
};

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Human-friendly response code, e.g. KDI-7QX4M2PA */
export function makeResponseCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return 'KDI-' + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** URL-safe random token with ≥128 bits of entropy */
export function makeToken(bytes = 24): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
