import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { BarChart3, Download, Filter, X, Info } from 'lucide-react';
import { analyticQuestions, applyFilters, computeKpis, sectionFunnel, type AnswerFilter } from '@core/index.ts';
import { AXIS, GRID, SINGLE } from '@/lib/charts';
import { fmtDuration, fmtNum, fmtPct } from '@/lib/format';
import { exportCsv, exportXlsx } from '@/lib/exporter';
import { Button, Card, Empty, ErrorBox, Input, PageLoader, Select, Stat, Switch } from '@/components/ui';
import { useSurvey } from './SurveyLayout';
import { useSurveyData } from './useSurveyData';
import { QuestionCard } from './analytics/QuestionCard';

export default function AnalyticsPage() {
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
  const [exportOpen, setExportOpen] = useState(false);
  const schema = data.schema;
  const qs = analyticQuestions(schema);

  // base = time / version / flag scope (used by KPIs — includes in-progress)
  const base = useMemo(() => data.prepared.filter((r) =>
    (!from || r.startedAt.slice(0, 10) >= from) && (!to || r.startedAt.slice(0, 10) <= to) &&
    (!version || r.versionId === version) && (includeFlagged || !r.flag)), [data.prepared, from, to, version, includeFlagged]);
  const kpis = useMemo(() => computeKpis(base), [base]);
  const funnel = useMemo(() => sectionFunnel(schema, base), [schema, base]);
  // analysed set = submitted (+ partial if chosen) + answer filters
  const analysed = useMemo(() => applyFilters(base.filter((r) => includePartial || r.status === 'submitted'), filters), [base, includePartial, filters]);

  const toggleFilter = (f: AnswerFilter) => setFilters((cur) => cur.some((x) => x.questionCode === f.questionCode && x.value === f.value) ? cur.filter((x) => !(x.questionCode === f.questionCode && x.value === f.value)) : [...cur, f]);
  const breakdownQ = qs.find((q) => q.code === breakdown);
  const shownQs = section ? schema.sections.find((s) => s.id === section)?.questions.filter((q) => qs.includes(q)) ?? [] : qs;
  const fileBase = `${survey.slug}-${new Date().toISOString().slice(0, 10)}`;

  if (data.loading && !data.data) return <PageLoader />;
  if (!versions.length) return <div className="p-8"><Card><Empty icon={<BarChart3 className="h-10 w-10" />} title="Chưa có dữ liệu">Xuất bản khảo sát và chia sẻ link để bắt đầu thu thập phản hồi.</Empty></Card></div>;

  return (
    <div className="space-y-6 p-5 sm:p-8">
      {data.error && <ErrorBox>{data.error}</ErrorBox>}
      {/* filters — one row above the charts */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Input type="date" className="h-9 w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Từ ngày" />
        <span className="text-muted">–</span>
        <Input type="date" className="h-9 w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Đến ngày" />
        <Select className="h-9 w-auto" value={version} onChange={(e) => setVersion(e.target.value)} aria-label="Phiên bản">
          <option value="">Mọi phiên bản</option>{versions.map((v) => <option key={v.id} value={v.id}>Phiên bản {v.versionNumber}</option>)}
        </Select>
        <Select className="h-9 w-auto" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Phần">
          <option value="">Mọi phần</option>{schema.sections.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.title}</option>)}
        </Select>
        <Select className="h-9 w-auto max-w-[240px]" value={breakdown} onChange={(e) => setBreakdown(e.target.value)} aria-label="Phân tách theo">
          <option value="">Phân tách theo… (cross-tab)</option>
          {qs.filter((q) => ['single_choice', 'dropdown', 'yes_no', 'likert', 'multiple_choice'].includes(q.type)).map((q) => <option key={q.code} value={q.code}>{q.reportLabel || q.title.slice(0, 40)}</option>)}
        </Select>
        <div className="flex flex-wrap gap-4 px-1">
          <Switch checked={includePartial} onChange={setIncludePartial} label="Gồm phản hồi dở dang" />
          <Switch checked={includeFlagged} onChange={setIncludeFlagged} label="Gồm phản hồi gắn cờ" />
        </div>
        <div className="relative ml-auto">
          <Button size="sm" variant="outline" onClick={() => setExportOpen(!exportOpen)}><Download className="h-4 w-4" />Xuất dữ liệu</Button>
          {exportOpen && (
            <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-line bg-white p-1.5 text-sm shadow-lg" onMouseLeave={() => setExportOpen(false)}>
              <button className="w-full rounded-lg px-3 py-2 text-left hover:bg-surface" onClick={() => { exportXlsx(fileBase, schema, analysed, data.versionMap); setExportOpen(false); }}><b>Excel đầy đủ</b><br /><span className="text-xs text-muted">5 sheet: wide, long, lượt chọn, tổng hợp, codebook</span></button>
              {(['wide', 'long', 'choices', 'summary'] as const).map((k) => (
                <button key={k} className="w-full rounded-lg px-3 py-2 text-left hover:bg-surface" onClick={() => { exportCsv(fileBase, k, schema, analysed, data.versionMap); setExportOpen(false); }}>
                  CSV · {k === 'wide' ? 'một dòng mỗi phản hồi' : k === 'long' ? 'một dòng mỗi câu trả lời' : k === 'choices' ? 'một dòng mỗi lượt chọn' : 'bảng tổng hợp'}
                </button>
              ))}
              <p className="px-3 py-1.5 text-[11px] text-muted">Xuất theo bộ lọc hiện tại ({analysed.length} phản hồi).</p>
            </div>
          )}
        </div>
      </Card>
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Filter className="h-4 w-4 text-brand-600" /><span className="text-muted">Đang lọc:</span>
          {filters.map((f, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-brand-700"><b>{f.questionCode}</b> = {f.label}<button onClick={() => toggleFilter(f)} aria-label="Bỏ lọc"><X className="h-3.5 w-3.5" /></button></span>)}
          <button onClick={() => setFilters([])} className="text-xs text-muted hover:underline">Xóa tất cả</button>
          <Link to={`/admin/surveys/${survey.id}/responses?${filters.map((f) => `f=${encodeURIComponent(`${f.questionCode}~${f.value}~${f.label ?? ''}`)}`).join('&')}`} className="ml-2 text-sm font-medium text-brand-700 hover:underline">Xem {analysed.length} phản hồi →</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Lượt bắt đầu" value={fmtNum(kpis.started)} hint="Mọi phiên đã tạo" />
        <Stat label="Đã gửi" value={fmtNum(kpis.submitted)} hint="Phản hồi hoàn thành" accent />
        <Stat label="Tỷ lệ hoàn thành" value={fmtPct(kpis.completionRate)} hint="Đã gửi ÷ lượt bắt đầu" />
        <Stat label="Đang làm dở" value={fmtNum(kpis.inProgress)} hint="Chưa gửi (có thể tiếp tục)" />
        <Stat label="Thời gian trả lời" value={fmtDuration(kpis.medianDurationSec)} hint={<>Trung vị · TB {fmtDuration(kpis.avgDurationSec)}</>} />
      </div>
      <p className="-mt-3 flex items-center gap-1.5 text-xs text-muted"><Info className="h-3.5 w-3.5" />KPI tính trên phạm vi thời gian/phiên bản đã chọn{includeFlagged ? '' : `, loại ${data.prepared.filter((r) => r.flag).length} phản hồi gắn cờ`}. Biểu đồ câu hỏi tính trên {fmtNum(analysed.length)} phản hồi {includePartial ? '(gồm dở dang)' : 'đã gửi'}{filters.length ? ' khớp bộ lọc' : ''}.</p>

      {funnel.length > 1 && (
        <Card className="p-5">
          <h3 className="font-semibold">Tỷ lệ bỏ dở theo phần</h3>
          <p className="mb-3 text-xs text-muted">Mẫu số = số phiên đã đến phần đó. Bỏ dở = phiên chưa gửi mà dừng tại phần này.</p>
          <div className="grid gap-6 md:grid-cols-[1fr_320px]">
            <div className="h-52">
              <ResponsiveContainer>
                <BarChart data={funnel.map((f, i) => ({ name: `${i + 1}. ${f.title.slice(0, 22)}`, reached: f.reached, drop: f.dropRate ?? 0 }))} margin={{ left: -18, right: 4, top: 8 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                  <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [v, 'Số phiên đến phần này']} />
                  <Bar dataKey="reached" radius={[4, 4, 0, 0]}>{funnel.map((_, i) => <Cell key={i} fill={SINGLE} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="h-fit w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="pb-1 font-medium">Phần</th><th className="pb-1 text-right font-medium">Đến</th><th className="pb-1 text-right font-medium">Dừng</th><th className="pb-1 text-right font-medium">Bỏ dở</th></tr></thead>
              <tbody>{funnel.map((f, i) => <tr key={f.sectionId} className="border-t border-line"><td className="max-w-[140px] truncate py-1.5">{i + 1}. {f.title}</td><td className="text-right tabular-nums">{f.reached}</td><td className="text-right tabular-nums">{f.droppedHere}</td><td className="text-right font-semibold tabular-nums">{fmtPct(f.dropRate, 0)}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid gap-5 2xl:grid-cols-2">
        {shownQs.map((q) => (
          <QuestionCard key={q.code} q={q} responses={analysed} filters={filters} onToggleFilter={toggleFilter} surveyId={survey.id}
            breakdown={breakdownQ ? { q: breakdownQ, responses: analysed } : null} />
        ))}
      </div>
    </div>
  );
}
