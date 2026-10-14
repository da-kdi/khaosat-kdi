import { useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardPaste, Plus, Trash2, EyeOff, Eye } from 'lucide-react';
import { uid, type ChoiceOption } from '@core/index.ts';
import { Button, Textarea, cn } from '@/components/ui';

interface Props {
  label: string;
  items: ChoiceOption[];
  onChange: (items: ChoiceOption[]) => void;
  /** codes already used in a published version — cannot be deleted, only hidden */
  lockedCodes: Set<string>;
  prefix: string;
  disabled?: boolean;
}

export function OptionsEditor({ label, items, onChange, lockedCodes, prefix, disabled }: Props) {
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const set = (i: number, patch: Partial<ChoiceOption>) => onChange(items.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const nextCode = (taken: Set<string>) => {
    let n = items.length + 1;
    while (taken.has(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
  };
  const add = (lbl = '') => {
    const taken = new Set(items.map((o) => o.code));
    onChange([...items, { id: uid(prefix), code: nextCode(taken), label: lbl || `Lựa chọn ${items.length + 1}`, active: true }]);
  };
  const applyBulk = () => {
    const lines = bulkText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const taken = new Set(items.map((o) => o.code));
    const added: ChoiceOption[] = [];
    for (const line of lines) {
      // accepted formats: "label" | "code,label" | "code;label" | "code<TAB>label"
      const m = line.match(/^([A-Za-z0-9_]{1,40})\s*[,;\t]\s*(.+)$/);
      let code = m ? m[1] : '';
      const lbl = m ? m[2] : line;
      if (!code || taken.has(code)) {
        let n = items.length + added.length + 1;
        while (taken.has(`${prefix}${n}`)) n++;
        code = `${prefix}${n}`;
      }
      taken.add(code);
      added.push({ id: uid(prefix), code, label: lbl, active: true });
    }
    onChange([...items, ...added]);
    setBulk(false);
    setBulkText('');
  };
  const dupCodes = new Set(items.map((o) => o.code).filter((c, i, a) => a.indexOf(c) !== i));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">{label} <span className="font-normal text-muted">({items.length})</span></p>
        <button type="button" onClick={() => setBulk(!bulk)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline" disabled={disabled}><ClipboardPaste className="h-3.5 w-3.5" />Dán danh sách / CSV</button>
      </div>
      {bulk && (
        <div className="mb-3 rounded-lg border border-line bg-surface p-2.5">
          <Textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={'Mỗi dòng một lựa chọn. Có thể kèm mã:\nrobot,Robotics & lập trình\nai,Trí tuệ nhân tạo'} className="min-h-[110px] font-mono text-xs" />
          <div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setBulk(false)}>Hủy</Button><Button size="sm" onClick={applyBulk} disabled={!bulkText.trim()}>Thêm</Button></div>
        </div>
      )}
      <div className="space-y-1.5">
        {items.map((o, i) => {
          const locked = lockedCodes.has(o.code);
          return (
            <div key={o.id} className={cn('group flex items-center gap-1.5', o.active === false && 'opacity-50')}>
              <div className="flex flex-col">
                <button type="button" onClick={() => move(i, -1)} className="text-slate-400 hover:text-ink disabled:opacity-20" disabled={i === 0 || disabled} aria-label="Lên"><ArrowUp className="h-3 w-3" /></button>
                <button type="button" onClick={() => move(i, 1)} className="text-slate-400 hover:text-ink disabled:opacity-20" disabled={i === items.length - 1 || disabled} aria-label="Xuống"><ArrowDown className="h-3 w-3" /></button>
              </div>
              <input className="h-8 min-w-0 flex-1 rounded-md border border-line px-2 text-sm focus:border-brand-400 focus:outline-none" value={o.label} onChange={(e) => set(i, { label: e.target.value })} disabled={disabled} aria-label="Nhãn" />
              <input className={cn('h-8 w-20 rounded-md border px-1.5 font-mono text-xs focus:outline-none', dupCodes.has(o.code) ? 'border-red-400 bg-red-50' : 'border-line bg-surface', locked && 'cursor-not-allowed text-muted')}
                value={o.code} onChange={(e) => set(i, { code: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })} disabled={disabled || locked} title={locked ? 'Mã đã dùng trong phiên bản đã xuất bản — không đổi được' : 'Mã lưu trong dữ liệu'} aria-label="Mã" />
              {locked ? (
                <button type="button" onClick={() => set(i, { active: o.active === false })} className="rounded p-1 text-muted hover:bg-slate-100" title={o.active === false ? 'Hiện lại' : 'Ẩn (giữ dữ liệu lịch sử)'} disabled={disabled}>{o.active === false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
              ) : (
                <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600" aria-label="Xóa" disabled={disabled}><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={() => add()} disabled={disabled} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"><Plus className="h-4 w-4" />Thêm</button>
      {dupCodes.size > 0 && <p className="mt-1 text-xs text-red-600">Mã bị trùng: {[...dupCodes].join(', ')}</p>}
      {lockedCodes.size > 0 && <p className="mt-2 text-xs text-muted">Lựa chọn đã có dữ liệu chỉ có thể ẩn, không xóa — để giữ ý nghĩa dữ liệu lịch sử.</p>}
    </div>
  );
}
