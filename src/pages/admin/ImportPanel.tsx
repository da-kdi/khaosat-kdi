import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileUp, Trash2 } from 'lucide-react';
import { getType, typeList, type QuestionType } from '@core/index.ts';
import { SAMPLE_TEXT, downloadSampleExcel, parseText, readImportFile, rowWarning, type ImportRow } from '@/lib/importQuestions';
import { Button, ErrorBox, Select, Textarea, cn } from '@/components/ui';

/** Bước 1 (chọn file / dán chữ) và bước 2 (kiểm tra câu hỏi) của trình nhập. */
export function ImportPanel({ rows, onRows }: { rows: ImportRow[] | null; onRows: (r: ImportRow[] | null) => void }) {
  const [fmt, setFmt] = useState<'w' | 'x'>('w');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const read = async (f?: File) => {
    if (!f) return;
    setErr(''); setBusy(true); setFileName(f.name);
    try {
      const r = await readImportFile(f);
      if (!r.some((x) => x.kind === 'q')) throw new Error('Không tìm thấy câu hỏi nào. Kiểm tra lại cách đánh số câu (1. 2. …) hoặc cột "Câu hỏi".');
      onRows(r);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const fromText = () => {
    const r = parseText(text);
    if (!r.some((x) => x.kind === 'q')) return setErr('Không tìm thấy câu hỏi nào. Câu hỏi cần đánh số: 1. 2. …');
    setErr(''); setFileName(''); onRows(r);
  };

  if (rows) {
    const qs = rows.filter((r) => r.kind === 'q');
    const warn = rows.filter((r) => rowWarning(r)).length;
    const set = (id: string, patch: Partial<Extract<ImportRow, { kind: 'q' }>>) => onRows(rows.map((r) => (r.id === id && r.kind === 'q' ? { ...r, ...patch } : r)));
    let n = 0;
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />Đã nhận {qs.length} câu hỏi, {rows.filter((r) => r.kind === 'section').length || 1} phần</span>
            {warn ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800"><AlertTriangle className="h-4 w-4" />{warn} câu cần chọn lại loại</span> : <span className="text-muted">Không có lỗi</span>}
            {fileName && <span className="text-xs text-muted">· {fileName}</span>}
          </div>
          <Button size="sm" variant="outline" onClick={() => onRows(null)}>Chọn file khác</Button>
        </div>
        <div className="thin-scroll max-h-[46vh] overflow-auto rounded-md border border-line">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 bg-brand-600 text-left text-white"><tr><th className="px-2 py-2 text-center font-semibold">Câu</th><th className="px-2 py-2 font-semibold">Nội dung câu hỏi</th><th className="w-48 px-2 py-2 font-semibold">Loại câu hỏi</th><th className="px-2 py-2 font-semibold">Các lựa chọn</th><th className="px-2 py-2 text-center font-semibold">Bắt buộc</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => {
                if (r.kind === 'section') return <tr key={r.id} className="border-t border-line bg-brand-50"><td colSpan={6} className="px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-brand-700">{r.title}</td></tr>;
                n++;
                const w = rowWarning(r);
                return (
                  <tr key={r.id} className={cn('border-t border-line align-top', w && 'bg-amber-50/70')}>
                    <td className="px-2 py-2 text-center tabular-nums text-muted">{n}</td>
                    <td className="px-2 py-2"><b>{r.title}</b>{r.hint && <p className="text-xs text-muted">{r.hint}</p>}{w && <p className="text-xs font-medium text-amber-800">{w}</p>}</td>
                    <td className="px-2 py-1.5">
                      <Select className="h-8 text-sm" value={r.type} onChange={(e) => set(r.id, { type: e.target.value as QuestionType })} aria-label={`Loại câu ${n}`}>
                        {!r.type && <option value="">— Chọn loại —</option>}
                        {typeList.filter((t) => t.isInput).map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
                      </Select>
                    </td>
                    <td className="px-2 py-2 text-xs text-muted">{r.options.length ? r.options.join(' · ') : r.type === 'number_grid' ? 'Dòng, cột mẫu — sửa ở trang soạn' : r.type && getType(r.type).hasOptions ? <span className="text-amber-800">(chưa có)</span> : r.type === 'rating' ? `1 – ${r.scale ?? 5}` : '—'}</td>
                    <td className="px-2 py-2 text-center"><input type="checkbox" checked={r.required} onChange={(e) => set(r.id, { required: e.target.checked })} aria-label={`Câu ${n} bắt buộc`} /></td>
                    <td className="px-1 py-1.5"><button type="button" onClick={() => onRows(rows.filter((x) => x.id !== r.id))} className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600" aria-label={`Bỏ câu ${n}`}><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">Sau khi lưu, chị vẫn sửa được mọi chi tiết (lựa chọn, điều kiện, kiểm tra) ở trang Soạn câu hỏi.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); read(e.dataTransfer.files?.[0]); }}
          className={cn('flex items-center gap-3 rounded-md border-2 border-dashed p-4', drag ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface')}>
          <FileUp className="h-8 w-8 shrink-0 text-brand-500" />
          <div className="min-w-0 flex-1"><b className="text-sm">Kéo thả file vào đây</b><p className="text-xs text-muted">hoặc bấm để chọn file .docx, .xlsx, .csv (tối đa 5 MB)</p></div>
          <Button size="sm" variant="outline" onClick={() => input.current?.click()} loading={busy}>Chọn file</Button>
          <input ref={input} type="file" className="sr-only" accept=".docx,.xlsx,.xls,.csv,.txt" onChange={(e) => { read(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <p className="text-center text-xs text-muted">hoặc dán nội dung câu hỏi</p>
        <Textarea className="min-h-[140px] font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE_TEXT} />
        <div className="flex justify-end"><Button size="sm" onClick={fromText} disabled={!text.trim()}>Tách câu hỏi từ nội dung đã dán</Button></div>
        {err && <ErrorBox>{err}</ErrorBox>}
      </div>
      <div className="rounded-md border border-line bg-white p-4 text-sm">
        <div className="mb-2 flex items-center justify-between gap-2"><h3 className="font-semibold">Cách soạn file để nhận đúng</h3>
          <div className="flex gap-1"><Button size="sm" variant={fmt === 'w' ? 'primary' : 'outline'} onClick={() => setFmt('w')}>Word</Button><Button size="sm" variant={fmt === 'x' ? 'primary' : 'outline'} onClick={() => setFmt('x')}>Excel</Button></div>
        </div>
        {fmt === 'w' ? (
          <>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>Dòng bắt đầu bằng <code>Phần</code> là tên phần.</li>
              <li>Câu hỏi đánh số gõ tay: <code>1.</code> <code>2.</code> … (danh sách số tự động của Word không đọc được).</li>
              <li>Lựa chọn bắt đầu bằng <code>a)</code> hoặc <code>-</code>.</li>
              <li>Thêm <code>(*)</code> cuối câu nếu bắt buộc.</li>
              <li>Ghi <code>(chọn nhiều)</code>, <code>(1-5)</code>, <code>(đoạn văn)</code>, <code>(số)</code>, <code>(ngày)</code> để chọn loại câu.</li>
            </ul>
            <pre className="mt-3 whitespace-pre-wrap rounded bg-surface p-2.5 text-xs">{SAMPLE_TEXT}</pre>
          </>
        ) : (
          <>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>Mỗi dòng là một câu hỏi.</li>
              <li>Cột: <code>Phần</code> · <code>Câu hỏi</code> · <code>Loại</code> · <code>Lựa chọn</code> · <code>Bắt buộc</code> · <code>Ghi chú</code></li>
              <li>Các lựa chọn cách nhau bằng dấu <code>;</code></li>
              <li>Cột Bắt buộc ghi <code>x</code> nếu bắt buộc.</li>
            </ul>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => downloadSampleExcel()}><Download className="h-4 w-4" />Tải file mẫu Excel</Button>
          </>
        )}
      </div>
    </div>
  );
}
