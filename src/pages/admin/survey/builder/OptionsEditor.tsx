import { useState } from 'react';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ClipboardPaste, GripVertical, Plus, Trash2, EyeOff, Eye } from 'lucide-react';
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
  /** dấu hiển thị đầu dòng: tròn (chọn một) / vuông (chọn nhiều) */
  marker?: 'circle' | 'square';
  /** không cho thêm / xóa (VD: Có / Không) */
  fixed?: boolean;
}

export function OptionsEditor({ label, items, onChange, lockedCodes, prefix, disabled, marker, fixed }: Props) {
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const set = (i: number, patch: Partial<ChoiceOption>) => onChange(items.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    const from = items.findIndex((o) => o.id === e.active.id);
    const to = items.findIndex((o) => o.id === e.over?.id);
    if (from >= 0 && to >= 0 && from !== to) onChange(arrayMove(items, from, to));
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
        {!fixed && <button type="button" onClick={() => setBulk(!bulk)} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline" disabled={disabled}><ClipboardPaste className="h-3.5 w-3.5" />Dán danh sách / CSV</button>}
      </div>
      {bulk && (
        <div className="mb-3 rounded-lg border border-line bg-surface p-2.5">
          <Textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={'Mỗi dòng một lựa chọn. Có thể kèm mã:\nrobot,Robotics & lập trình\nai,Trí tuệ nhân tạo'} className="min-h-[110px] font-mono text-xs" />
          <div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setBulk(false)}>Hủy</Button><Button size="sm" onClick={applyBulk} disabled={!bulkText.trim()}>Thêm</Button></div>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((o) => o.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {items.map((o, i) => (
              <OptionRow key={o.id} o={o} locked={lockedCodes.has(o.code) || !!fixed} dup={dupCodes.has(o.code)} marker={marker} disabled={disabled} canDrag={!fixed && !disabled}
                onSet={(p) => set(i, p)} onRemove={() => onChange(items.filter((_, j) => j !== i))} hideToggle={!fixed} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {!fixed && <button type="button" onClick={() => add()} disabled={disabled} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"><Plus className="h-4 w-4" />Thêm {label.replace(/^Các /, '').toLowerCase()}</button>}
      {dupCodes.size > 0 && <p className="mt-1 text-xs text-red-600">Mã bị trùng: {[...dupCodes].join(', ')}</p>}
      {lockedCodes.size > 0 && !fixed && <p className="mt-2 text-xs text-muted">Lựa chọn đã có dữ liệu chỉ có thể ẩn, không xóa — để giữ ý nghĩa dữ liệu lịch sử.</p>}
    </div>
  );
}

function OptionRow({ o, locked, dup, marker, disabled, canDrag, onSet, onRemove, hideToggle }: {
  o: ChoiceOption; locked: boolean; dup: boolean; marker?: 'circle' | 'square'; disabled?: boolean; canDrag: boolean;
  onSet: (p: Partial<ChoiceOption>) => void; onRemove: () => void; hideToggle: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: o.id, disabled: !canDrag });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn('group flex items-center gap-1.5', o.active === false && 'opacity-50', isDragging && 'relative z-10')}>
      {canDrag && <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none text-slate-300 hover:text-ink active:cursor-grabbing" aria-label="Kéo để đổi thứ tự" title="Kéo để đổi thứ tự"><GripVertical className="h-4 w-4" /></button>}
      {marker && <span className={cn('h-3.5 w-3.5 shrink-0 border-2 border-slate-300', marker === 'circle' ? 'rounded-full' : 'rounded-[3px]')} aria-hidden />}
      <input className="h-8 min-w-0 flex-1 rounded-md border border-line bg-white px-2 text-sm focus:border-brand-400 focus:outline-none" value={o.label} onChange={(e) => onSet({ label: e.target.value })} disabled={disabled} aria-label="Nhãn" />
      <input className={cn('h-8 w-20 rounded-md border px-1.5 font-mono text-xs focus:outline-none', dup ? 'border-red-400 bg-red-50' : 'border-line bg-surface', locked && 'cursor-not-allowed text-muted')}
        value={o.code} onChange={(e) => onSet({ code: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })} disabled={disabled || locked} title={locked ? 'Mã đã dùng trong phiên bản đã xuất bản — không đổi được' : 'Mã lưu trong dữ liệu'} aria-label="Mã" />
      {locked ? (hideToggle
        ? <button type="button" onClick={() => onSet({ active: o.active === false })} className="rounded p-1 text-muted hover:bg-slate-100" title={o.active === false ? 'Hiện lại' : 'Ẩn (giữ dữ liệu lịch sử)'} disabled={disabled}>{o.active === false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
        : <span className="w-6" />
      ) : (
        <button type="button" onClick={onRemove} className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600" aria-label="Xóa" disabled={disabled}><Trash2 className="h-4 w-4" /></button>
      )}
    </div>
  );
}
