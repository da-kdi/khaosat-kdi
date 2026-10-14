import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Flag, Inbox, Search, X, Paperclip, ArrowUpDown } from 'lucide-react';
import {
  analyticQuestions, applyFilters, computeVisibility, formatAnswer, isEmptyValue, isInputQuestion,
  type AnswerFilter, type FileValue, type PreparedResponse, type ResponseFlag,
} from '@core/index.ts';
import { api } from '@/data';
import { FLAG_LABEL, fmtDateTime, fmtDuration } from '@/lib/format';
import { exportCsv, exportXlsx } from '@/lib/exporter';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageLoader, Select, Textarea, cn, useToast } from '@/components/ui';
import { useSurvey } from './SurveyLayout';
import { useSurveyData } from './useSurveyData';

const PAGE = 25;
type SortKey = 'startedAt' | 'submittedAt' | 'durationSeconds';

export default function ResponsesPage() {
  const { survey, versions } = useSurvey();
  const data = useSurveyData();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [flag, setFlag] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'startedAt', dir: -1 });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<PreparedResponse | null>(null);

  // drill-down filters from analytics: ?f=CODE~value~label (repeatable)
  const filters: AnswerFilter[] = params.getAll('f').map((s) => { const [questionCode, value, label] = s.split('~'); return { questionCode, value, label }; });
  const removeFilter = (i: number) => { const all = params.getAll('f'); all.splice(i, 1); const p = new URLSearchParams(); all.forEach((x) => p.append('f', x)); setParams(p); };

  const schema = data.schema;
  const qs = analyticQuestions(schema);
  const idCols = useMemo(() => qs.filter((x) => x.isPII || x.type === 'contact' || /NAME|SCHOOL|ORG|TEN/.test(x.code)).slice(0, 2), [qs]);

  const list = useMemo(() => {
    let rs = applyFilters(data.prepared, filters);
    if (status !== 'all') rs = rs.filter((r) => r.status === status);
    if (flag === 'none') rs = rs.filter((r) => !r.flag); else if (flag !== 'all') rs = rs.filter((r) => r.flag === flag);
    if (from) rs = rs.filter((r) => r.startedAt >= from);
    if (to) rs = rs.filter((r) => r.startedAt.slice(0, 10) <= to);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      rs = rs.filter((r) => r.code.toLowerCase().includes(needle) || (r.respondentRef ?? '').toLowerCase().includes(needle) || JSON.stringify(r.byCode).toLowerCase().includes(needle));
    }
    return [...rs].sort((a, b) => {
      const av = a[sort.key] ?? '', bv = b[sort.key] ?? '';
      return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir;
    });
  }, [data.prepared, filters.map((f) => f.questionCode + f.value).join(), status, flag, from, to, q, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const rows = list.slice(page * PAGE, page * PAGE + PAGE);
  const vno = (id: string) => versions.find((v) => v.id === id)?.versionNumber;
  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }));
  const fileBase = `${survey.slug}-phan-hoi`;

  if (data.loading && !data.data) return <PageLoader />;
  return (
    <div className="space-y-4 p-5 sm:p-8">
      {data.error && <ErrorBox>{data.error}</ErrorBox>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Mã phản hồi, tên trường, nội dung…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="Trạng thái">
          <option value="all">Mọi trạng thái</option><option value="submitted">Đã gửi</option><option value="in_progress">Đang làm dở</option>
        </Select>
        <Select className="w-auto" value={flag} onChange={(e) => { setFlag(e.target.value); setPage(0); }} aria-label="Xác minh">
          <option value="all">Mọi phản hồi</option><option value="none">Không gắn cờ</option>{Object.entries(FLAG_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Từ ngày" />
        <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Đến ngày" />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCsv(fileBase, 'wide', schema, list, data.versionMap)}><Download className="h-4 w-4" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportXlsx(fileBase, schema, list, data.versionMap)}><Download className="h-4 w-4" />Excel</Button>
        </div>
      </div>
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Lọc theo câu trả lời:</span>
          {filters.map((f, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-brand-700"><b>{f.questionCode}</b> = {f.label || f.value}<button onClick={() => removeFilter(i)} aria-label="Bỏ lọc"><X className="h-3.5 w-3.5" /></button></span>)}
        </div>
      )}
      <p className="text-sm text-muted">{list.length} phản hồi{list.length !== data.prepared.length && ` (trên tổng ${data.prepared.length})`}</p>

      <Card className="overflow-x-auto">
        {!rows.length ? <Empty icon={<Inbox className="h-10 w-10" />} title="Không có phản hồi phù hợp" /> : (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium">Mã</th>
                <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                {idCols.map((c) => <th key={c.code} className="px-3 py-2.5 font-medium">{c.reportLabel || c.title.slice(0, 24)}</th>)}
                <SortTh label="Bắt đầu" k="startedAt" sort={sort} onSort={sortBy} />
                <SortTh label="Gửi lúc" k="submittedAt" sort={sort} onSort={sortBy} />
                <SortTh label="Thời lượng" k="durationSeconds" sort={sort} onSort={sortBy} />
                <th className="px-3 py-2.5 font-medium">Phiên bản</th>
                <th className="px-5 py-2.5 font-medium">Xác minh</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => setOpen(r)} className="cursor-pointer border-t border-line hover:bg-brand-50/40">
                  <td className="px-5 py-2.5 font-mono text-xs font-medium">{r.code}</td>
                  <td className="px-3 py-2.5">{r.status === 'submitted' ? <Badge tone="green">Đã gửi</Badge> : <Badge tone="orange">Đang làm dở</Badge>}</td>
                  {idCols.map((c) => <td key={c.code} className="max-w-[200px] truncate px-3 py-2.5">{r.byCode[c.code] === undefined ? <span className="text-muted">—</span> : formatAnswer(c, r.byCode[c.code])}</td>)}
                  <td className="px-3 py-2.5 text-muted">{fmtDateTime(r.startedAt)}</td>
                  <td className="px-3 py-2.5 text-muted">{fmtDateTime(r.submittedAt)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmtDuration(r.durationSeconds)}</td>
                  <td className="px-3 py-2.5 text-muted">v{vno(r.versionId)}</td>
                  <td className="px-5 py-2.5">{r.flag ? <Badge tone="red"><Flag className="h-3 w-3" />{FLAG_LABEL[r.flag]}</Badge> : r.note ? <span className="text-xs text-muted">Có ghi chú</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Trang trước"><ChevronLeft className="h-4 w-4" /></Button>
          <span>Trang {page + 1}/{pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Trang sau"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
      {open && <ResponseDetail r={open} onClose={() => setOpen(null)} onChanged={() => { data.reload(); }} />}
    </div>
  );
}

function SortTh({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: number }; onSort: (k: SortKey) => void }) {
  return <th className="px-3 py-2.5 font-medium"><button onClick={() => onSort(k)} className={cn('inline-flex items-center gap-1 uppercase', sort.key === k && 'text-ink')}>{label}<ArrowUpDown className="h-3 w-3" /></button></th>;
}

function ResponseDetail({ r, onClose, onChanged }: { r: PreparedResponse; onClose: () => void; onChanged: () => void }) {
  const { versions, survey } = useSurvey();
  const toast = useToast();
  const v = versions.find((x) => x.id === r.versionId);
  const schema = v?.schema ?? survey.draftSchema;
  const vis = computeVisibility(schema, r.answers);
  const [flag, setFlag] = useState<string>(r.flag ?? '');
  const [reason, setReason] = useState(r.flagReason ?? '');
  const [note, setNote] = useState(r.note ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (flag && !reason.trim()) return toast('Vui lòng ghi lý do gắn cờ', 'error');
    setBusy(true);
    try { await api.flagResponse(r.id, (flag || null) as ResponseFlag, flag ? reason : null, note); toast('Đã cập nhật (dữ liệu gốc được giữ nguyên)'); onChanged(); onClose(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const openFile = async (f: FileValue) => {
    if (!f.path) return;
    const url = await api.getFileUrl(f.path);
    if (url) window.open(url, '_blank', 'noopener'); else toast('Không mở được tệp (chế độ demo không lưu nội dung tệp)', 'info');
  };
  return (
    <Modal open onClose={onClose} title={<span className="font-mono">{r.code}</span>} size="xl" footer={<><Button variant="outline" onClick={onClose}>Đóng</Button><Button onClick={save} loading={busy}>Lưu xác minh</Button></>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-5">
          <p className="text-xs text-muted">Hiển thị theo cấu trúc <b>phiên bản {v?.versionNumber ?? '?'}</b> — đúng phiên bản người trả lời đã dùng.</p>
          {schema.sections.filter((s) => vis.sections.has(s.id)).map((s) => (
            <div key={s.id}>
              <h3 className="mb-2 border-b border-line pb-1 text-sm font-semibold text-brand-700">{s.title}</h3>
              <dl className="space-y-2">
                {s.questions.filter((q) => isInputQuestion(q) && vis.questions.has(q.id)).map((q) => {
                  const val = r.answers[q.id];
                  return (
                    <div key={q.id} className="grid gap-1 text-sm sm:grid-cols-[1fr_1.3fr] sm:gap-4">
                      <dt className="text-muted"><span className="mr-1 font-mono text-[11px] text-slate-400">{q.code}</span>{q.title}</dt>
                      <dd className={cn(isEmptyValue(val) && val !== true && 'italic text-slate-400')}>
                        {q.type === 'file_upload' && Array.isArray(val) ? (val as FileValue[]).map((f, i) => <button key={i} onClick={() => openFile(f)} className="mr-2 inline-flex items-center gap-1 text-brand-700 hover:underline"><Paperclip className="h-3.5 w-3.5" />{f.name}</button>)
                          : isEmptyValue(val) && val !== true ? 'Không trả lời' : formatAnswer(q, val, r.answers)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
        <aside className="space-y-4 rounded-xl bg-surface p-4 text-sm">
          <div className="space-y-1.5">
            <p><span className="text-muted">Trạng thái:</span> {r.status === 'submitted' ? 'Đã gửi' : 'Đang làm dở'}</p>
            <p><span className="text-muted">Bắt đầu:</span> {fmtDateTime(r.startedAt)}</p>
            <p><span className="text-muted">Gửi lúc:</span> {fmtDateTime(r.submittedAt)}</p>
            <p><span className="text-muted">Thời lượng:</span> {fmtDuration(r.durationSeconds)}</p>
            {r.respondentRef && <p><span className="text-muted">Người tham gia:</span> {r.respondentRef}</p>}
          </div>
          <div className="space-y-3 border-t border-line pt-4">
            <Field label="Xác minh">
              <Select value={flag} onChange={(e) => setFlag(e.target.value)}>
                <option value="">Hợp lệ (không gắn cờ)</option>{Object.entries(FLAG_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            {flag && <Field label="Lý do"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: trùng trường, dữ liệu thử" /></Field>}
            <Field label="Ghi chú nội bộ"><Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[70px]" /></Field>
            <p className="text-xs text-muted">Gắn cờ không xóa dữ liệu. Phản hồi gắn cờ được loại khỏi phân tích mặc định.</p>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
