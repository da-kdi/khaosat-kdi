import type { Question } from '@core/index.ts';

/** Câu chứa dữ liệu cá nhân: đánh dấu isPII, hoặc loại thông tin liên hệ / email / SĐT. */
export const isPersonal = (q: Pick<Question, 'isPII' | 'type'>) => !!q.isPII || q.type === 'contact' || q.type === 'email' || q.type === 'phone';

/** Che chuỗi: giữ chữ đầu mỗi từ, số giữ 3 chữ số cuối. VD "Nguyễn Thị Hoa" → "Ng*** T*** H***", "0905123412" → "09** *** 412". */
export function maskText(s: string): string {
  const t = s.trim();
  if (!t) return t;
  if (/^[\d\s.+()-]{6,}$/.test(t)) { const d = t.replace(/\D/g, ''); return `${d.slice(0, 2)}** *** ${d.slice(-3)}`; }
  if (t.includes('@')) { const [u, dom] = t.split('@'); return `${u.slice(0, 1)}***@${dom}`; }
  return t.split(/\s+/).map((w) => (w.length <= 1 ? w : `${w.slice(0, Math.min(2, w.length - 1))}***`)).join(' ');
}
