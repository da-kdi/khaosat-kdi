import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Eye, EyeOff, Flag, Inbox, Search, X, Paperclip, ArrowUpDown, Printer } from 'lucide-react';
import {
  analyticQuestions, applyFilters, computeVisibility, formatAnswer, isEmptyValue, isInputQuestion,
  type AnswerFilter, type FileValue, type PreparedResponse, type Question, type ResponseFlag,
} from '@core/index.ts';
import { api } from '@/data';
import { FLAG_LABEL, fmtDateTime, fmtDuration } from '@/lib/format';
import { exportCsv, exportXlsx } from '@/lib/exporter';
import { formHtml, printPdf } from '@/lib/blankForm';
import { isPersonal, maskText } from '@/lib/pii';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageLoader, Select, Textarea, cn, useToast } from '@/components/ui';
import { useSurvey } from './SurveyLayout';
import { useSurveyData } from './useSurveyData';

const PAGE = 25;
type SortKey = 'startedAt' | 'submittedAt' | 'durationSeconds';

/** Hiện câu trả lời, che nếu là dữ liệu cá nhân và đang bật chế độ che. */
function show(q: Question, val: unknown, answers: Record<string, unknown> | undefined, masked: boolean): string {
  const s = formatAnswer(q, val, answers);
  return masked && isPersonal(q) ? s.split(/\s*[;,]\s*/).map(maskText).join(', ') : s;
}

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
  const [openId, setOpenId] = useState<string | null>(null);
  // dữ liệu cá nhân luôn che mặc định; chỉ người soạn/quản trị mới được bật xem
  const canSeePII = ['admin', 'owner', 'editor'].includes(survey.myRole ?? '');
  const [reveal, setReveal] = useState(false);
  const masked = !(canSeePII && reveal);

  const filters: AnswerFilter[] = params.getAll('f').map((s) => { const [questionCode, value, label] = s.split('~'); return { questionCode, value, label }; });
  const removeFilter = (i: number) => { const all = params.getAll('f'); all.splice(i, 1); const p = new URLSearchParams(); all.forEach((x) => p.append('f', x)); setParams(p); };

  const schema = data.schema;
  const qs = analyticQuestions(schema);
  const idCols = useMemo(() => {
    const named = qs.filter((x) => /NAME|SCHOOL|ORG|TEN|UNIT|DON_?VI/.test(x.code) && !isPersonal(x));
    return (named.length ? named : qs.filter((x) => x.type === 'short_text')).slice(0, 1);
  }, [qs]);

  const list = useMemo(() => {
    let rs = applyFilters(data.prepared, filters);
    if (status !== 'all') rs = rs.filter((r) => r.status === status);
    if (flag === 'none') rs = rs.filter((r) => !r.flag); else if (flag === 'noted') rs = rs.filter((r) => !!r.note); else if (flag !== 'all') rs = rs.filter((r) => r.flag === flag);
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
  const open = data.prepared.find((r) => r.id === openId) ?? rows[0] ?? null;
  useEffect(() => { if (page >= pages) setPage(0); }, [page, pages]);
  const vno = (id: string) => versions.find((v) => v.id === id)?.versionNumber;
  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }));
  const fileBase = `${survey.slug}-phan-hoi`;
  const reset = () => setPage(0);

  if (data.loading && !data.data) return <PageLoader />;
  return (
    <div className="space-y-3 p-5 sm:p-6">
      {data.error && <ErrorBox>{data.error}</ErrorBox>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm"><b>Trạng thái:</b>
          <Select className="h-9 w-auto" value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}>
            <option value="all">Mọi trạng thái</option><option value="submitted">Đã gửi</option><option value="in_progress">Đang làm dở</option>
          </Select>
        </label>
        <label className="flex items-center gap-1.5 text-sm"><b>Xác minh:</b>
          <Select className="h-9 w-auto" value={flag} onChange={(e) => { setFlag(e.target.value); reset(); }}>
            <option value="all">Mọi phản hồi</option><option value="none">Hợp lệ (không gắn cờ)</option>{Object.entries(FLAG_LABEL).map(([k, l]) => <option key={k} value={k}>Gắn cờ: {l}</option>)}<option value="noted">Có ghi chú</option>
          </Select>
        </label>
        <label className="flex items-center gap-1.5 text-sm"><b>Ngày:</b>
          <Input type="date" className="h-9 w-auto" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} aria-label="Từ ngày" />
          <span className="text-muted">–</span>
          <Input type="date" className="h-9 w-auto" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} aria-label="Đến ngày" />
        </label>
        <div className="relative min-w-[200px] flex-1 sm:max-w-[300px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="h-9 pl-9" placeholder="Mã phản hồi, tên trường, nội dung" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} />
        </div>
        <div className="ml-auto flex gap-2">
          {canSeePII && <Button variant="outline" size="sm" onClick={() => setReveal(!reveal)} title="Chỉ người soạn và quản trị được xem dữ liệu cá nhân">{reveal ? <><EyeOff className="h-4 w-4" />Che dữ liệu cá nhân</> : <><Eye className="h-4 w-4" />Hiện dữ liệu cá nhân</>}</Button>}
          <Button variant="outline" size="sm" onClick={() => exportCsv(fileBase, 'wide', schema, list, data.versionMap, { hidePII: masked })}><Download className="h-4 w-4" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportXlsx(fileBase, schema, list, data.versionMap, { hidePII: masked })}><Download className="h-4 w-4" />Excel</Button>
        </div>
      </div>
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Lọc theo câu trả lời:</span>
          {filters.map((f, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-brand-700"><b>{f.questionCode}</b> = {f.label || f.value}<button onClick={() => removeFilter(i)} aria-label="Bỏ lọc"><X className="h-3.5 w-3.5" /></button></span>)}
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card className="overflow-hidden">
          {!rows.length ? <Empty icon={<Inbox className="h-10 w-10" />} title="Không có phản hồi phù hợp" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-brand-600 text-left text-white">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Mã</th>
                    {idCols.map((c) => <th key={c.code} className="px-3 py-2.5 font-semibold">{c.reportLabel || c.title.slice(0, 24)}</th>)}
                    <th className="px-3 py-2.5 font-semibold">Trạng thái</th>
                    <SortTh label="Gửi lúc" k="submittedAt" sort={sort} onSort={sortBy} />
                    <SortTh label="Thời lượng" k="durationSeconds" sort={sort} onSort={sortBy} />
                    <th className="px-3 py-2.5 font-semibold">Xác minh</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => setOpenId(r.id)} className={cn('cursor-pointer border-t border-line hover:bg-brand-50/40', open?.id === r.id && 'bg-brand-50')}>
                      <td className="px-3 py-2.5"><button type="button" className="font-mono text-xs font-semibold text-brand-700 hover:underline">{r.code}</button></td>
                      {idCols.map((c) => <td key={c.code} className="max-w-[220px] truncate px-3 py-2.5">{r.byCode[c.code] === undefined ? <span className="text-muted">—</span> : show(c, r.byCode[c.code], undefined, masked)}</td>)}
                      <td className="px-3 py-2.5">{r.status === 'submitted' ? <Badge tone="green">Đã gửi</Badge> : <Badge tone="orange">Đang làm dở</Badge>}</td>
                      <td className="px-3 py-2.5 tabular-nums text-muted">{fmtDateTime(r.submittedAt ?? r.startedAt)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtDuration(r.durationSeconds)}</td>
                      <td className="px-3 py-2.5">{r.flag ? <Badge tone="orange"><Flag className="h-3 w-3" />{FLAG_LABEL[r.flag]}</Badge> : r.status === 'submitted' ? <Badge tone="blue">Hợp lệ</Badge> : <span className="text-muted">—</span>}{r.note && <span className="ml-1 text-xs text-muted">· Có ghi chú</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-line px-3 py-2.5 text-sm">
            <span className="text-muted">{list.length ? `${page * PAGE + 1}–${Math.min(list.length, page * PAGE + PAGE)} / ${list.length}` : '0'}{list.length !== data.prepared.length && ` (trên tổng ${data.prepared.length})`}</span>
            <span className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" />Trang trước</Button>
              <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Trang sau<ChevronRight className="h-4 w-4" /></Button>
            </span>
          </div>
        </Card>
        {open && <ResponsePanel key={open.id} r={open} vno={vno(open.versionId)} masked={masked} canSeePII={canSeePII} onChanged={() => data.reload()} />}
      </div>
    </div>
  );
}

function SortTh({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: number }; onSort: (k: SortKey) => void }) {
  return <th className="px-3 py-2.5 font-semibold"><button onClick={() => onSort(k)} className={cn('inline-flex items-center gap-1', sort.key === k && 'underline')}>{label}<ArrowUpDown className="h-3 w-3" /></button></th>;
}

function ResponsePanel({ r, vno, masked, canSeePII, onChanged }: { r: PreparedResponse; vno?: number; masked: boolean; canSeePII: boolean; onChanged: () => void }) {
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
    try { await api.flagResponse(r.id, (flag || null) as ResponseFlag, flag ? reason : null, note); toast('Đã lưu xác minh (dữ liệu gốc được giữ nguyên)'); onChanged(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const openFile = async (f: FileValue) => {
    if (!f.path) return;
    const url = await api.getFileUrl(f.path);
    if (url) window.open(url, '_blank', 'noopener'); else toast('Không mở được tệp (chế độ demo không lưu nội dung tệp)', 'info');
  };
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const pdf = () => {
    const html = formHtml(survey.title, schema, {
      meta: `Phiếu ${r.code} · phiên bản ${vno ?? '?'} · gửi lúc ${fmtDateTime(r.submittedAt ?? r.startedAt)}${masked ? ' · đã che dữ liệu cá nhân' : ''}`,
      answer: (q) => (vis.questions.has(q.id) ? (isEmptyValue(r.answers[q.id]) && r.answers[q.id] !== true ? '<i>Không trả lời</i>' : esc(show(q, r.answers[q.id], r.answers, masked))) : '<i>(không hiện với người trả lời này)</i>'),
    });
    if (!printPdf(html)) toast('Trình duyệt chặn cửa sổ in, vui lòng cho phép cửa sổ bật lên', 'error');
  };
  let n = 0;
  return (
    <Card className="thin-scroll space-y-3 p-4 xl:sticky xl:top-3 xl:max-h-[calc(100vh-170px)] xl:overflow-y-auto">
      <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Phiếu <span className="font-mono">{r.code}</span></h2><Button size="sm" variant="outline" onClick={pdf}><Printer className="h-4 w-4" />Tải phiếu PDF</Button></div>
      {masked && <span className="inline-block rounded border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-700" title={canSeePII ? 'Bấm "Hiện dữ liệu cá nhân" ở thanh lọc để xem' : 'Vai trò của bạn không xem được dữ liệu cá nhân'}>Đang che dữ liệu cá nhân{canSeePII ? '' : ' · theo vai trò'}</span>}
      <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted">Trạng thái</dt><dd>{r.status === 'submitted' ? 'Đã gửi' : 'Đang làm dở'}</dd>
        <dt className="text-muted">Bắt đầu / gửi</dt><dd className="tabular-nums">{fmtDateTime(r.startedAt)} → {fmtDateTime(r.submittedAt)}</dd>
        <dt className="text-muted">Thời lượng</dt><dd>{fmtDuration(r.durationSeconds)}</dd>
        <dt className="text-muted">Phiên bản</dt><dd>{vno ?? '?'}</dd>
        {r.respondentRef && <><dt className="text-muted">Người tham gia</dt><dd>{masked ? maskText(r.respondentRef) : r.respondentRef}</dd></>}
      </dl>
      {schema.sections.filter((s) => vis.sections.has(s.id)).map((s) => (
        <div key={s.id}>
          <h3 className="mb-1.5 border-b border-line pb-1 text-sm font-semibold text-brand-700">{s.title}</h3>
          <dl className="space-y-1.5">
            {s.questions.filter((q) => isInputQuestion(q)).map((q) => {
              n++;
              if (!vis.questions.has(q.id)) return null;
              const val = r.answers[q.id];
              const empty = isEmptyValue(val) && val !== true;
              return (
                <div key={q.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 text-sm">
                  <dt className="text-muted">{n}. {q.reportLabel || q.title}</dt>
                  <dd className={cn(empty && 'italic text-slate-400', masked && isPersonal(q) && !empty && 'font-mono tracking-wide')}>
                    {q.type === 'file_upload' && Array.isArray(val) ? (masked ? `${(val as FileValue[]).length} tệp (đã ẩn)` : (val as FileValue[]).map((f, i) => <button key={i} onClick={() => openFile(f)} className="mr-2 inline-flex items-center gap-1 text-brand-700 hover:underline"><Paperclip className="h-3.5 w-3.5" />{f.name}</button>))
                      : empty ? 'Không trả lời' : show(q, val, r.answers, masked)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
      <div className="space-y-3 border-t border-line pt-3">
        <h3 className="text-sm font-semibold">Xác minh</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kết quả">
            <Select value={flag} onChange={(e) => setFlag(e.target.value)}>
              <option value="">Hợp lệ</option>{Object.entries(FLAG_LABEL).map(([k, l]) => <option key={k} value={k}>Gắn cờ: {l}</option>)}
            </Select>
          </Field>
          <Field label="Lý do"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: trùng trường, dữ liệu thử" disabled={!flag} /></Field>
        </div>
        <Field label="Ghi chú nội bộ"><Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[56px]" /></Field>
        <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted">Gắn cờ không xóa dữ liệu; phản hồi gắn cờ được loại khỏi báo cáo mặc định.</p><Button size="sm" onClick={save} loading={busy}>Lưu xác minh</Button></div>
      </div>
    </Card>
  );
}
