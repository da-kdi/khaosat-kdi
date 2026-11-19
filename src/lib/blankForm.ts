import { getType, isInputQuestion, type Question, type SurveySchema } from '@core/index.ts';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const CSS = `body{font-family:'Times New Roman',serif;font-size:13pt;line-height:1.45;color:#000;max-width:780px;margin:24px auto;padding:0 16px}
h1{font-size:16pt;text-align:center;margin:0 0 4px}h2{font-size:13.5pt;margin:18px 0 6px;border-bottom:1px solid #444}
.q{margin:10px 0;page-break-inside:avoid}.q b{font-weight:bold}.hint{font-style:italic;font-size:11.5pt;color:#333}
.line{border-bottom:1px dotted #000;height:22px;margin:4px 0}.opt{margin:2px 0 2px 18px}
table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #000;padding:4px 6px;font-size:11.5pt;vertical-align:top}th{background:#eee}
.meta{text-align:center;font-size:11pt;color:#333;margin-bottom:14px}.ans{margin:2px 0 0 18px}
@media print{body{margin:0}}`;

/** Thân một câu hỏi trên phiếu giấy (trống để điền tay). */
function blankBody(q: Question): string {
  const box = q.type === 'multiple_choice' ? '☐' : '○';
  const opts = (q.options ?? []).filter((o) => o.active !== false);
  const rows = (q.rows ?? []).filter((o) => o.active !== false);
  switch (q.type) {
    case 'single_choice': case 'multiple_choice': case 'dropdown': case 'yes_no': case 'likert':
      return opts.map((o) => `<div class="opt">${box} ${esc(o.label)}</div>`).join('') + (q.settings?.allowOther ? `<div class="opt">${box} ${esc(q.settings.otherLabel || 'Khác')}: ……………………………</div>` : '');
    case 'ranking':
      return opts.map((o) => `<div class="opt">[ &nbsp; ] ${esc(o.label)}</div>`).join('');
    case 'rating': case 'nps': {
      const max = q.type === 'nps' ? 10 : q.settings?.scaleMax ?? 5;
      const from = q.type === 'nps' ? 0 : 1;
      return `<div class="opt">${Array.from({ length: max - from + 1 }, (_, i) => `○ ${i + from}`).join(' &nbsp; ')}</div>`;
    }
    case 'matrix': case 'category_level':
      return `<table><tr><th></th>${opts.map((o) => `<th>${esc(o.label)}</th>`).join('')}</tr>${rows.map((r) => `<tr><td>${esc(r.label)}</td>${opts.map(() => '<td></td>').join('')}</tr>`).join('')}</table>`;
    case 'number_grid':
      return `<table><tr><th></th>${opts.map((o) => `<th>${esc(o.label)}</th>`).join('')}</tr>${rows.map((r) => `<tr><td>${esc(r.label)}</td>${opts.map(() => '<td></td>').join('')}</tr>`).join('')}</table>${q.settings?.unit ? `<div class="hint">Đơn vị: ${esc(q.settings.unit)}</div>` : ''}`;
    case 'number_range':
      return `<div class="opt">Từ ……………… đến ……………… ${esc(q.settings?.unit ?? '')}</div>`;
    case 'number':
      return `<div class="opt">……………………… ${esc(q.settings?.unit ?? '')}</div>`;
    case 'composite':
      return (q.settings?.fields ?? []).map((f) => `<div class="opt">${esc(f.label)}: ${f.kind === 'select' && f.choices?.length ? f.choices.map((c) => `○ ${esc(c)}`).join(' &nbsp; ') : `…………………………… ${esc(f.unit ?? '')}`}</div>`).join('');
    case 'quantity_by_group':
      return `<table><tr><th>Nhóm</th><th>Số lượng</th></tr>${rows.map((r) => `<tr><td>${esc(r.label)}</td><td></td></tr>`).join('')}</table>`;
    case 'long_text':
      return '<div class="line"></div><div class="line"></div><div class="line"></div>';
    case 'consent':
      return `<div class="opt">☐ ${esc(q.settings?.consentText || 'Tôi đồng ý')}</div>`;
    case 'contact': {
      const L: Record<string, string> = { name: 'Họ tên', email: 'Email', phone: 'Số điện thoại', position: 'Chức vụ', organization: 'Đơn vị' };
      return (q.settings?.contactFields ?? ['name', 'email', 'phone']).map((k) => `<div class="opt">${L[k]}: …………………………………………</div>`).join('');
    }
    case 'address':
      return '<div class="opt">Tỉnh/Thành: ……………… Xã/Phường: ……………… Địa chỉ: ………………………</div>';
    case 'file_upload':
      return '<div class="hint">(Đính kèm tệp khi nhập lên hệ thống)</div>';
    default:
      return '<div class="line"></div>';
  }
}

function contentBlock(q: Question): string {
  if (q.type === 'divider') return '<hr>';
  if (q.type === 'heading') return `<h3>${esc(q.title)}</h3>${q.description ? `<p>${esc(q.description)}</p>` : ''}`;
  if (q.type === 'image' || q.type === 'video' || q.type === 'link') return q.media?.caption || q.title ? `<p class="hint">[${esc(getType(q.type).label)}] ${esc(q.media?.caption || q.title)}</p>` : '';
  return `<p>${q.title ? `<b>${esc(q.title)}</b><br>` : ''}${esc(q.description ?? '').replace(/\n/g, '<br>')}</p>`;
}

/** Dựng HTML phiếu. answer(q) trả về HTML câu trả lời (phiếu đã điền) hoặc undefined (phiếu trống). */
export function formHtml(title: string, schema: SurveySchema, opts: { meta?: string; answer?: (q: Question) => string | undefined } = {}): string {
  let n = 0;
  const body = schema.sections.map((s, si) => `<h2>Phần ${si + 1}. ${esc(s.title)}</h2>${s.description ? `<p class="hint">${esc(s.description)}</p>` : ''}${s.questions.map((q) => {
    if (!isInputQuestion(q)) return contentBlock(q);
    n++;
    const ans = opts.answer?.(q);
    return `<div class="q"><b>${n}. ${esc(q.title)}</b>${q.required ? ' (*)' : ''}${q.description ? `<div class="hint">${esc(q.description)}</div>` : ''}${ans !== undefined ? `<div class="ans">${ans}</div>` : blankBody(q)}</div>`;
  }).join('')}`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body><h1>${esc(title)}</h1>${opts.meta ? `<div class="meta">${opts.meta}</div>` : ''}${body}</body></html>`;
}

/** Tải phiếu dạng Word (.doc — Word mở trực tiếp được HTML). */
export function downloadWord(fileBase: string, html: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/msword' }));
  a.download = `${fileBase}.doc`;
  a.click();
}

/** Mở cửa sổ in — người dùng chọn "Lưu thành PDF". */
export function printPdf(html: string) {
  const w = window.open('', '_blank', 'noopener=no,width=900,height=1000');
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  let done = false;
  const go = () => { if (done) return; done = true; try { w.focus(); w.print(); } catch { /* cửa sổ đã đóng */ } };
  w.onload = go;
  setTimeout(go, 600);
  return true;
}
