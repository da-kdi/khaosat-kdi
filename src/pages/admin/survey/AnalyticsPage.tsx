import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { BarChart3, Download, Filter, X, Info, FileText, Printer, Sheet, FileSpreadsheet, Search } from 'lucide-react';
import {
  analyticQuestions, applyFilters, computeKpis, formatAnswer, getType, isEmptyValue, keywordFrequency, questionStats, sectionFunnel,
  type AnswerFilter, type PreparedResponse, type Question, type SurveySchema,
} from '@core/index.ts';
import { api, type InvitationRow } from '@/data';
import { AXIS, GRID, SINGLE } from '@/lib/charts';
import { fmtDateTime, fmtDuration, fmtNum, fmtPct } from '@/lib/format';
import { exportCsv, exportXlsx, stripPII } from '@/lib/exporter';
import { downloadWord, formHtml, printPdf } from '@/lib/blankForm';
import { isPersonal } from '@/lib/pii';
import { useAsync } from '@/lib/useAsync';
import { Button, Card, Empty, ErrorBox, Input, PageLoader, Select, Stat, Switch, cn, useToast } from '@/components/ui';
import { useSurvey } from './SurveyLayout';
import { useSurveyData } from './useSurveyData';
import { QuestionCard } from './analytics/QuestionCard';

const TABS = [['tong', 'Tổng hợp chung'], ['cau', 'Từng câu hỏi'], ['nhom', 'So sánh theo nhóm'], ['ykien', 'Ý kiến góp ý'], ['pt', 'Phân tích chi tiết'], ['xuat', 'Xuất dữ liệu']] as const;
type TabKey = (typeof TABS)[number][0];
const CHOICE = ['single_choice', 'multiple_choice', 'dropdown', 'yes_no', 'likert'];

/** Thanh ngang đơn giản như mockup. */
function HBars({ rows, color = 'bg-brand-600', fmt }: { rows: { label: ReactNode; value: number; max?: number; text: string }[]; color?: string; fmt?: never }) {
  void fmt;
  const mx = Math.max(1, ...rows.map((r) => r.max ?? r.value));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
          <span className="truncate" title={typeof r.label === 'string' ? r.label : undefined}>{r.label}</span>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100"><i className={cn('block h-full rounded-full', color)} style={{ width: `${(r.value / (r.max ?? mx)) * 100}%` }} /></div>
          <span className="whitespace-nowrap text-right text-xs tabular-nums text-muted">{r.text}</span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const { versions } = useSurvey();
  const data = useSurveyData();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([k]) => k === params.get('t')) ? params.get('t') : 'tong') as TabKey;
  const setTab = (t: TabKey) => { const p = new URLSearchParams(params); p.set('t', t); setParams(p, { replace: true }); };
  const schema = data.schema;
  // mặc định: phản hồi đã gửi, không gắn cờ
  const clean = useMemo(() => data.prepared.filter((r) => r.status === 'submitted' && !r.flag), [data.prepared]);
  const numbers = useMemo(() => { const m = new Map<string, number>(); let n = 0; for (const s of schema.sections) for (const q of s.questions) if (getType(q.type).isInput) m.set(q.code, ++n); return m; }, [schema]);

  if (data.loading && !data.data) return <PageLoader />;
  if (!versions.length) return <div className="p-8"><Card><Empty icon={<BarChart3 className="h-10 w-10" />} title="Chưa có dữ liệu">Xuất bản khảo sát và chia sẻ link để bắt đầu thu thập phản hồi.</Empty></Card></div>;

  return (
    <div className="space-y-4 p-5 sm:p-6">
      {data.error && <ErrorBox>{data.error}</ErrorBox>}
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium transition', tab === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-muted hover:border-brand-300 hover:text-brand-700')}>{l}</button>
        ))}
      </div>
      {tab === 'tong' && <Overview schema={schema} all={data.prepared} rs={clean} numbers={numbers} />}
      {tab === 'cau' && <ByQuestion schema={schema} rs={clean} />}
      {tab === 'nhom' && <Compare schema={schema} rs={clean} numbers={numbers} />}
      {tab === 'ykien' && <Opinions schema={schema} rs={clean} numbers={numbers} />}
      {tab === 'pt' && <Detail />}
      {tab === 'xuat' && <Export numbers={numbers} />}
    </div>
  );
}

/* ───────────── Tổng hợp chung ───────────── */

function insights(schema: SurveySchema, rs: PreparedResponse[], all: PreparedResponse[], numbers: Map<string, number>): ReactNode[] {
  const out: ReactNode[] = [];
  for (const q of analyticQuestions(schema)) {
    if (out.length >= 4 || isPersonal(q)) continue;
    const st = questionStats(q, rs);
    if (!st.answered) continue;
    const n = numbers.get(q.code);
    const name = q.reportLabel || q.title;
    if (st.options && CHOICE.includes(q.type)) {
      const top = [...st.options].sort((a, b) => b.count - a.count)[0];
      if (top?.count) out.push(<><b>{top.label}</b> được chọn nhiều nhất ở câu {n} ({name}): {fmtNum(top.count)}/{fmtNum(st.answered)} phản hồi ({fmtPct(top.pctOfRespondents, 0)}).</>);
    } else if (st.numeric && ['rating', 'likert', 'nps', 'number'].includes(q.type)) {
      out.push(<>Câu {n} ({name}): trung bình <b>{st.numeric.mean.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</b>{q.type === 'rating' ? `/${q.settings?.scaleMax ?? 5}` : ''}, thấp nhất {fmtNum(st.numeric.min)}, cao nhất {fmtNum(st.numeric.max)}.</>);
    }
  }
  const prog = all.filter((r) => r.status !== 'submitted').length;
  if (prog) out.push(<>Còn <b>{fmtNum(prog)}</b> phiếu đang làm dở, chưa tính vào số liệu.</>);
  return out;
}

function Overview({ schema, all, rs, numbers }: { schema: SurveySchema; all: PreparedResponse[]; rs: PreparedResponse[]; numbers: Map<string, number> }) {
  const { survey } = useSurvey();
  const kpis = useMemo(() => computeKpis(all.filter((r) => !r.flag)), [all]);
  const complete = rs.filter((r) => [...r.shownCodes].every((c) => !isEmptyValue(r.byCode[c]) || r.byCode[c] === true)).length;
  const opinions = analyticQuestions(schema).filter((q) => q.type === 'long_text' && !isPersonal(q)).reduce((a, q) => a + rs.filter((r) => typeof r.byCode[q.code] === 'string' && (r.byCode[q.code] as string).trim()).length, 0);
  const target = survey.settings.maxResponses ?? null;
  const first = analyticQuestions(schema).find((q) => !isPersonal(q) && (q.type === 'multiple_choice' || q.type === 'single_choice'));
  const fst = first ? questionStats(first, rs) : null;
  const pts = insights(schema, rs, all, numbers);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Đã trả lời" value={target ? `${fmtNum(rs.length)}/${fmtNum(target)}` : fmtNum(rs.length)} hint={target ? `${fmtPct(rs.length / target, 0)} chỉ tiêu` : `Trên ${fmtNum(kpis.started)} lượt bắt đầu`} accent />
        <Stat label="Trả lời đầy đủ" value={rs.length ? fmtPct(complete / rs.length, 0) : '–'} hint={`${fmtNum(rs.length - complete)} phiếu bỏ trống câu không bắt buộc`} />
        <Stat label="Thời gian làm trung bình" value={fmtDuration(kpis.medianDurationSec)} hint="Trung vị" />
        <Stat label="Ý kiến góp ý" value={fmtNum(opinions)} hint="Câu trả lời dạng đoạn văn" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Điểm chính rút ra</h2>
          {pts.length ? (
            <ol className="space-y-2.5">
              {pts.map((p, i) => <li key={i} className="flex gap-3 text-sm"><b className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs text-brand-700">{i + 1}</b><span>{p}</span></li>)}
            </ol>
          ) : <p className="text-sm text-muted">Chưa đủ dữ liệu.</p>}
          <p className="mt-3 text-xs text-muted">Hệ thống tự viết các câu này từ số liệu đã gửi, không gồm phiếu gắn cờ.</p>
        </Card>
        <Card className="p-5">
          {first && fst?.options ? (
            <>
              <h2 className="mb-3 font-semibold">{first.reportLabel || first.title}</h2>
              <HBars rows={[...fst.options].sort((a, b) => b.count - a.count).slice(0, 8).map((o) => ({ label: o.label, value: o.count, text: `${o.count} · ${fmtPct(o.pctOfRespondents, 0)}` }))} />
              {first.type === 'multiple_choice' && <p className="mt-3 text-xs text-muted">Câu hỏi chọn nhiều: tổng phần trăm có thể vượt 100%.</p>}
            </>
          ) : <p className="text-sm text-muted">Chưa có câu hỏi lựa chọn để tóm tắt.</p>}
        </Card>
      </div>
    </>
  );
}

/* ───────────── Từng câu hỏi ───────────── */

function ByQuestion({ schema, rs }: { schema: SurveySchema; rs: PreparedResponse[] }) {
  const { survey } = useSurvey();
  const [filters, setFilters] = useState<AnswerFilter[]>([]);
  const toggle = (f: AnswerFilter) => setFilters((cur) => cur.some((x) => x.questionCode === f.questionCode && x.value === f.value) ? cur.filter((x) => !(x.questionCode === f.questionCode && x.value === f.value)) : [...cur, f]);
  const analysed = useMemo(() => applyFilters(rs, filters), [rs, filters]);
  return (
    <>
      <FilterChips filters={filters} onToggle={toggle} onClear={() => setFilters([])} count={analysed.length} surveyId={survey.id} />
      <p className="flex items-center gap-1.5 text-xs text-muted"><Info className="h-3.5 w-3.5" />Tính trên {fmtNum(analysed.length)} phản hồi đã gửi, không gồm phiếu gắn cờ. Bấm vào một cột để lọc các câu khác theo câu trả lời đó.</p>
      <div className="grid gap-4 2xl:grid-cols-2">
        {analyticQuestions(schema).map((q) => <QuestionCard key={q.code} q={q} responses={analysed} filters={filters} onToggleFilter={toggle} surveyId={survey.id} breakdown={null} />)}
      </div>
    </>
  );
}

function FilterChips({ filters, onToggle, onClear, count, surveyId }: { filters: AnswerFilter[]; onToggle: (f: AnswerFilter) => void; onClear: () => void; count: number; surveyId: string }) {
  if (!filters.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Filter className="h-4 w-4 text-brand-600" /><span className="text-muted">Đang lọc:</span>
      {filters.map((f, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-brand-700"><b>{f.questionCode}</b> = {f.label}<button onClick={() => onToggle(f)} aria-label="Bỏ lọc"><X className="h-3.5 w-3.5" /></button></span>)}
      <button onClick={onClear} className="text-xs text-muted hover:underline">Xóa tất cả</button>
      <Link to={`/admin/surveys/${surveyId}/responses?${filters.map((f) => `f=${encodeURIComponent(`${f.questionCode}~${f.value}~${f.label ?? ''}`)}`).join('&')}`} className="ml-2 text-sm font-medium text-brand-700 hover:underline">Xem {count} phản hồi →</Link>
    </div>
  );
}

/* ───────────── So sánh theo nhóm ───────────── */

const picked = (v: unknown, code: string) => (Array.isArray(v) ? v.includes(code) : v === code);

function Compare({ schema, rs, numbers }: { schema: SurveySchema; rs: PreparedResponse[]; numbers: Map<string, number> }) {
  const qs = analyticQuestions(schema).filter((q) => !isPersonal(q) && CHOICE.includes(q.type) && q.options?.length);
  const groups = qs.filter((q) => q.type !== 'multiple_choice');
  const [g, setG] = useState(groups[0]?.code ?? '');
  const targets = qs.filter((q) => q.code !== g);
  const [t, setT] = useState('');
  const gq = groups.find((q) => q.code === g);
  const tq = targets.find((q) => q.code === t) ?? targets[0];
  if (!gq || !tq) return <Card><Empty title="Cần ít nhất hai câu lựa chọn">So sánh theo nhóm dùng một câu chọn một (VD: cấp học) để chia nhóm và một câu lựa chọn khác để so sánh.</Empty></Card>;
  const opts = (tq.options ?? []).filter((o) => o.active !== false);
  const rows = (gq.options ?? []).filter((o) => o.active !== false).map((go) => {
    const inGroup = rs.filter((r) => picked(r.byCode[gq.code], go.code) && !isEmptyValue(r.byCode[tq.code]));
    return { go, n: inGroup.length, cells: opts.map((o) => (inGroup.length ? inGroup.filter((r) => picked(r.byCode[tq.code], o.code)).length / inGroup.length : null)) };
  }).filter((r) => r.n > 0);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5"><b>So sánh theo:</b><Select className="h-9 w-auto max-w-[280px]" value={g} onChange={(e) => setG(e.target.value)}>{groups.map((q) => <option key={q.code} value={q.code}>Câu {numbers.get(q.code)}. {q.reportLabel || q.title}</option>)}</Select></label>
        <label className="flex items-center gap-1.5"><b>Câu hỏi:</b><Select className="h-9 w-auto max-w-[320px]" value={tq.code} onChange={(e) => setT(e.target.value)}>{targets.map((q) => <option key={q.code} value={q.code}>Câu {numbers.get(q.code)}. {q.reportLabel || q.title}</option>)}</Select></label>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-brand-600 text-white"><tr><th className="px-3 py-2.5 text-left font-semibold">{gq.reportLabel || gq.title}</th><th className="px-3 py-2.5 text-center font-semibold">Số phiếu</th>{opts.map((o) => <th key={o.code} className="px-3 py-2.5 text-center font-semibold">{o.label}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.go.code} className="border-t border-line">
              <td className="px-3 py-2.5 font-semibold">{r.go.label}</td><td className="px-3 py-2.5 text-center tabular-nums">{r.n}</td>
              {r.cells.map((p, i) => <td key={i} className="px-3 py-2.5 text-center font-medium tabular-nums" style={{ background: p === null ? undefined : `rgba(21,75,152,${(0.08 + p * 0.82).toFixed(2)})`, color: p !== null && p > 0.55 ? '#fff' : undefined }}>{p === null ? '–' : fmtPct(p, 0)}</td>)}
            </tr>
          ))}</tbody>
        </table>
        {!rows.length && <p className="p-5 text-center text-sm text-muted">Chưa có phiếu trả lời cả hai câu.</p>}
      </Card>
      <p className="text-xs text-muted">Ô càng đậm, tỉ lệ phiếu trong nhóm chọn phương án đó càng cao. Đọc ngang để biết mỗi nhóm quan tâm gì nhất.{tq.type === 'multiple_choice' && ' Câu chọn nhiều: tổng mỗi dòng có thể vượt 100%.'}</p>
    </>
  );
}

/* ───────────── Ý kiến góp ý ───────────── */

function Opinions({ schema, rs, numbers }: { schema: SurveySchema; rs: PreparedResponse[]; numbers: Map<string, number> }) {
  const qs = analyticQuestions(schema).filter((q) => (q.type === 'long_text' || q.type === 'short_text') && !isPersonal(q));
  const [code, setCode] = useState(qs.find((q) => q.type === 'long_text')?.code ?? qs[0]?.code ?? '');
  const [kw, setKw] = useState('');
  const q = qs.find((x) => x.code === code);
  const texts = useMemo(() => (q ? rs.map((r) => ({ id: r.id, code: r.code, at: r.submittedAt, text: typeof r.byCode[q.code] === 'string' ? (r.byCode[q.code] as string).trim() : '' })).filter((x) => x.text) : []), [q, rs]);
  const words = useMemo(() => keywordFrequency(texts.map((x) => x.text), 10), [texts]);
  if (!q) return <Card><Empty title="Không có câu hỏi trả lời tự do">Thêm câu "Đoạn văn" để thu ý kiến góp ý.</Empty></Card>;
  const shown = texts.filter((x) => !kw || x.text.toLowerCase().includes(kw.toLowerCase()));
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5"><b>Câu hỏi:</b><Select className="h-9 w-auto max-w-[360px]" value={code} onChange={(e) => { setCode(e.target.value); setKw(''); }}>{qs.map((x) => <option key={x.code} value={x.code}>Câu {numbers.get(x.code)}. {x.reportLabel || x.title}</option>)}</Select></label>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input className="h-9 pl-9" placeholder="Tìm trong ý kiến" value={kw} onChange={(e) => setKw(e.target.value)} /></div>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{fmtNum(texts.length)} ý kiến · từ khóa nổi bật</h2>
          {words.length ? <HBars color="bg-accent-400" rows={words.map((w) => ({ label: <button type="button" className="hover:text-brand-700 hover:underline" onClick={() => setKw(w.word)}>{w.word}</button>, value: w.count, text: String(w.count) }))} /> : <p className="text-sm text-muted">Chưa có ý kiến.</p>}
          <p className="mt-3 text-xs text-muted">Bấm vào một từ khóa để lọc các ý kiến có từ đó.</p>
        </Card>
        <Card className="thin-scroll max-h-[560px] space-y-2.5 overflow-y-auto p-5">
          {kw && <p className="text-sm text-muted">{shown.length} ý kiến có “{kw}” <button className="ml-1 text-brand-700 hover:underline" onClick={() => setKw('')}>Bỏ lọc</button></p>}
          {shown.slice(0, 200).map((x) => (
            <blockquote key={x.id} className="border-l-4 border-brand-200 bg-surface px-3 py-2 text-sm">
              <p className="whitespace-pre-line">{x.text}</p>
              <footer className="mt-1 font-mono text-[11px] text-muted">{x.code} · {fmtDateTime(x.at)}</footer>
            </blockquote>
          ))}
          {!shown.length && <p className="text-sm text-muted">Không có ý kiến phù hợp.</p>}
        </Card>
      </div>
    </>
  );
}

/* ───────────── Phân tích chi tiết (bản cũ: bộ lọc, KPI, bỏ dở theo phần, bảng chéo) ───────────── */

function Detail() {
  const { survey, versions } = useSurvey();
  const data = useSurveyData();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [version, setVersion] = useState('');
  const [section, setSection] = useState('');
  const [includeFlagged, setIncludeFlagged] = useState(false);
  const [includePartial, setIncludePartial] = useState(false);
  const [filters, setFilters] = useState<AnswerFilter[]>([]);
  const [breakdown, setBreakdown] = useState('');
  const schema = data.schema;
  const qs = analyticQuestions(schema);
  const base = useMemo(() => data.prepared.filter((r) =>
    (!from || r.startedAt.slice(0, 10) >= from) && (!to || r.startedAt.slice(0, 10) <= to) &&
    (!version || r.versionId === version) && (includeFlagged || !r.flag)), [data.prepared, from, to, version, includeFlagged]);
  const kpis = useMemo(() => computeKpis(base), [base]);
  const funnel = useMemo(() => sectionFunnel(schema, base), [schema, base]);
  const analysed = useMemo(() => applyFilters(base.filter((r) => includePartial || r.status === 'submitted'), filters), [base, includePartial, filters]);
  const toggleFilter = (f: AnswerFilter) => setFilters((cur) => cur.some((x) => x.questionCode === f.questionCode && x.value === f.value) ? cur.filter((x) => !(x.questionCode === f.questionCode && x.value === f.value)) : [...cur, f]);
  const breakdownQ = qs.find((q) => q.code === breakdown);
  const shownQs = section ? schema.sections.find((s) => s.id === section)?.questions.filter((q) => qs.includes(q)) ?? [] : qs;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5"><b>Phiên bản:</b><Select className="h-9 w-auto" value={version} onChange={(e) => setVersion(e.target.value)}><option value="">Mọi phiên bản</option>{versions.map((v) => <option key={v.id} value={v.id}>Phiên bản {v.versionNumber}</option>)}</Select></label>
        <label className="flex items-center gap-1.5"><b>Phần:</b><Select className="h-9 w-auto max-w-[200px]" value={section} onChange={(e) => setSection(e.target.value)}><option value="">Mọi phần</option>{schema.sections.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.title}</option>)}</Select></label>
        <label className="flex items-center gap-1.5"><b>Từ ngày:</b><Input type="date" className="h-9 w-auto" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-1.5"><b>Đến ngày:</b><Input type="date" className="h-9 w-auto" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <Switch checked={includePartial} onChange={setIncludePartial} label="Gồm phản hồi dở dang" />
        <Switch checked={includeFlagged} onChange={setIncludeFlagged} label="Gồm phản hồi gắn cờ" />
      </div>
      <FilterChips filters={filters} onToggle={toggleFilter} onClear={() => setFilters([])} count={analysed.length} surveyId={survey.id} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Lượt bắt đầu" value={fmtNum(kpis.started)} hint="Mọi phiên đã tạo" />
        <Stat label="Đã gửi" value={fmtNum(kpis.submitted)} hint="Phản hồi hoàn thành" accent />
        <Stat label="Đang làm dở" value={fmtNum(kpis.inProgress)} hint="Chưa gửi (có thể tiếp tục)" />
        <Stat label="Tỷ lệ hoàn thành" value={fmtPct(kpis.completionRate)} hint="Đã gửi ÷ lượt bắt đầu" />
        <Stat label="Thời gian trả lời" value={fmtDuration(kpis.medianDurationSec)} hint={<>Trung vị · TB {fmtDuration(kpis.avgDurationSec)}</>} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Tỷ lệ bỏ dở theo phần</h2>
          <p className="mb-3 text-xs text-muted">Mẫu số = số phiên đã đến phần đó. Bỏ dở = phiên chưa gửi mà dừng tại phần này.</p>
          {funnel.length ? <HBars color="bg-red-400" rows={funnel.map((f, i) => ({ label: `${i + 1}. ${f.title}`, value: f.dropRate ?? 0, max: Math.max(0.01, ...funnel.map((x) => x.dropRate ?? 0)), text: `${f.droppedHere}/${f.reached} · ${fmtPct(f.dropRate, 0)}` }))} /> : <p className="text-sm text-muted">Chưa có dữ liệu.</p>}
          {funnel.length > 1 && (
            <div className="mt-4 h-40">
              <ResponsiveContainer>
                <BarChart data={funnel.map((f, i) => ({ name: `${i + 1}`, reached: f.reached }))} margin={{ left: -18, right: 4, top: 8 }}>
                  <CartesianGrid vertical={false} stroke={GRID} /><XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} /><YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [v, 'Số phiên đến phần này']} />
                  <Bar dataKey="reached" radius={[4, 4, 0, 0]}>{funnel.map((_, i) => <Cell key={i} fill={SINGLE} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Phân tách theo… (bảng chéo)</h2>
          <p className="mb-3 text-xs text-muted">Chọn một câu để chia mọi biểu đồ bên dưới theo câu trả lời của câu đó.</p>
          <Select value={breakdown} onChange={(e) => setBreakdown(e.target.value)} aria-label="Phân tách theo">
            <option value="">Không phân tách</option>
            {qs.filter((q) => CHOICE.includes(q.type) && !isPersonal(q)).map((q) => <option key={q.code} value={q.code}>{q.reportLabel || q.title.slice(0, 60)}</option>)}
          </Select>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Biểu đồ tính trên {fmtNum(analysed.length)} phản hồi {includePartial ? '(gồm dở dang)' : 'đã gửi'}{filters.length ? ' khớp bộ lọc' : ''}{includeFlagged ? '' : `, đã loại ${data.prepared.filter((r) => r.flag).length} phản hồi gắn cờ`}.</p>
        </Card>
      </div>
      <div className="grid gap-4 2xl:grid-cols-2">
        {shownQs.map((q) => <QuestionCard key={q.code} q={q} responses={analysed} filters={filters} onToggleFilter={toggleFilter} surveyId={survey.id} breakdown={breakdownQ ? { q: breakdownQ, responses: analysed } : null} />)}
      </div>
    </>
  );
}

/* ───────────── Xuất dữ liệu ───────────── */

function reportHtml(title: string, schema: SurveySchema, rs: PreparedResponse[], numbers: Map<string, number>, hidePII: boolean): string {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const parts = analyticQuestions(schema).map((q: Question) => {
    if (hidePII && isPersonal(q)) return '';
    const st = questionStats(q, rs);
    const head = `<h3>Câu ${numbers.get(q.code)}. ${esc(q.reportLabel || q.title)}</h3><p class="hint">${st.answered}/${st.shown} phiếu trả lời</p>`;
    if (st.options) return head + `<table><tr><th>Phương án</th><th>Số phiếu</th><th>Tỉ lệ</th></tr>${st.options.map((o) => `<tr><td>${esc(o.label)}</td><td>${o.count}</td><td>${fmtPct(o.pctOfRespondents, 0)}</td></tr>`).join('')}</table>`;
    if (st.numeric) return head + `<table><tr><th>Nhỏ nhất</th><th>Trung bình</th><th>Trung vị</th><th>Lớn nhất</th></tr><tr><td>${fmtNum(st.numeric.min)}</td><td>${st.numeric.mean.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</td><td>${fmtNum(st.numeric.median)}</td><td>${fmtNum(st.numeric.max)}</td></tr></table>`;
    if (st.grid) return head + `<table><tr><th></th>${st.grid.cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr>${st.grid.rows.map((r) => `<tr><td>${esc(r.label)}</td>${st.grid!.cols.map((c) => `<td>${st.grid!.respondents[r.code]?.[c.code] ?? 0}</td>`).join('')}</tr>`).join('')}</table>`;
    if (st.texts) return head + st.texts.slice(0, 30).map((t) => `<p>– ${esc(t.text)}</p>`).join('');
    return head;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:'Times New Roman',serif;font-size:12.5pt;max-width:800px;margin:24px auto;padding:0 16px}h1{text-align:center;font-size:16pt}h3{font-size:13pt;margin:16px 0 2px}.hint{font-style:italic;color:#444;margin:0 0 4px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #000;padding:3px 6px;font-size:11pt}th{background:#eee}</style></head><body><h1>Báo cáo tổng hợp: ${esc(title)}</h1><p style="text-align:center">${rs.length} phiếu · xuất ngày ${new Date().toLocaleDateString('vi-VN')}${hidePII ? ' · đã ẩn dữ liệu cá nhân' : ''}</p>${parts}</body></html>`;
}

function Export({ numbers }: { numbers: Map<string, number> }) {
  const { survey, canEdit } = useSurvey();
  const data = useSurveyData();
  const toast = useToast();
  const canSeePII = ['admin', 'owner', 'editor'].includes(survey.myRole ?? '');
  const [partial, setPartial] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [hide, setHide] = useState(true);
  const hidePII = hide || !canSeePII;
  const inv = useAsync(() => (canEdit ? api.listInvitations(survey.id) : Promise.resolve([] as InvitationRow[])), [survey.id]);
  const schema = data.schema;
  const rs = useMemo(() => data.prepared.filter((r) => (partial || r.status === 'submitted') && (flagged || !r.flag)), [data.prepared, partial, flagged]);
  const fileBase = `${survey.slug}-${new Date().toISOString().slice(0, 10)}`;
  const pending = (inv.data ?? []).filter((i) => !['completed', 'revoked'].includes(i.status));
  const blocked = () => toast('Trình duyệt chặn cửa sổ in, vui lòng cho phép cửa sổ bật lên', 'error');
  const items: { icon: typeof FileText; tag: string; title: string; desc: string; act: () => void; disabled?: boolean }[] = [
    { icon: FileText, tag: 'DOC', title: 'Báo cáo tổng hợp (Word)', desc: 'Số liệu từng câu hỏi dạng bảng. Dùng gửi lãnh đạo.', act: () => downloadWord(`bao-cao-${fileBase}`, reportHtml(survey.title, schema, rs, numbers, hidePII)) },
    { icon: Printer, tag: 'PDF', title: 'Báo cáo tổng hợp (PDF)', desc: 'Như bản Word, mở hộp thoại in để lưu PDF.', act: () => { if (!printPdf(reportHtml(survey.title, schema, rs, numbers, hidePII))) blocked(); } },
    { icon: FileSpreadsheet, tag: 'XLSX', title: 'Excel đầy đủ', desc: 'Mỗi phiếu một dòng, mỗi câu một cột, kèm mã câu hỏi, bảng tổng hợp và codebook.', act: () => exportXlsx(fileBase, schema, rs, data.versionMap, { hidePII }) },
    { icon: Sheet, tag: 'CSV', title: 'Dữ liệu CSV', desc: 'Dùng cho Power BI hoặc phần mềm thống kê (một dòng mỗi phiếu).', act: () => exportCsv(fileBase, 'wide', schema, rs, data.versionMap, { hidePII }) },
    { icon: Sheet, tag: 'CSV', title: 'CSV dạng dài', desc: 'Một dòng mỗi câu trả lời, tiện ghép bảng.', act: () => exportCsv(fileBase, 'long', schema, rs, data.versionMap, { hidePII }) },
    { icon: FileSpreadsheet, tag: 'CSV', title: 'Danh sách chưa trả lời', desc: pending.length ? `${pending.length} đơn vị được mời chưa gửi. Để gọi điện hoặc nhắc lại.` : 'Chỉ có khi phát hành bằng lời mời riêng.', disabled: !pending.length,
      act: () => { const rows = [['Đơn vị', 'Người nhận', 'Email', 'Tình trạng'], ...pending.map((i) => [i.organization ?? '', i.recipientName ?? '', hidePII ? '' : i.recipientEmail ?? '', i.status])]; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })); a.download = `chua-tra-loi-${fileBase}.csv`; a.click(); } },
    { icon: Printer, tag: 'PDF', title: 'Phiếu đã gửi (PDF)', desc: 'Từng phiếu đúng như người trả lời đã thấy, mỗi phiếu một trang.', disabled: !rs.length,
      act: () => {
        const list = hidePII ? stripPII(rs, data.versionMap, schema) : rs;
        const bodies = list.slice(0, 300).map((r) => {
          const sch = data.versionMap[r.versionId] ?? schema;
          const html = formHtml(survey.title, sch, { meta: `Phiếu ${r.code} · gửi lúc ${fmtDateTime(r.submittedAt ?? r.startedAt)}`, answer: (q) => { const v = r.answers[q.id]; return isEmptyValue(v) && v !== true ? '<i>Không trả lời</i>' : formatAnswer(q, v, r.answers).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!); } });
          return html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
        });
        const first = formHtml(survey.title, schema);
        const all = first.slice(0, first.indexOf('<body>') + 6) + bodies.join('<div style="page-break-after:always"></div>') + '</body></html>';
        if (!printPdf(all)) blocked();
      } },
  ];
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Switch checked={partial} onChange={setPartial} label="Gồm phản hồi dở dang" />
        <Switch checked={flagged} onChange={setFlagged} label="Gồm phản hồi gắn cờ" />
        <Switch checked={hidePII} onChange={setHide} disabled={!canSeePII} label="Ẩn dữ liệu cá nhân (họ tên, số điện thoại, email)" />
        <span className="text-sm text-muted">· {fmtNum(rs.length)} phiếu</span>
      </div>
      {!canSeePII && <p className="text-xs text-muted">Vai trò của bạn chỉ được xuất dữ liệu đã ẩn thông tin cá nhân.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((x) => (
          <Card key={x.title} className="grid content-between gap-2.5 p-4">
            <div className="flex items-center gap-2.5"><span className="rounded bg-brand-50 px-1.5 py-1 font-mono text-[10px] font-bold text-brand-700">{x.tag}</span><b className="min-w-0 flex-1">{x.title}</b></div>
            <p className="text-sm text-muted">{x.desc}</p>
            <div><Button size="sm" onClick={x.act} disabled={x.disabled}><Download className="h-4 w-4" />Tải xuống</Button></div>
          </Card>
        ))}
      </div>
      <p className="rounded border border-dashed border-line bg-white px-3 py-2 text-xs text-muted"><b>Kết nối:</b> dữ liệu tổng hợp vẫn đưa sang Power BI như trước (docs/POWER_BI.md).</p>
    </>
  );
}
