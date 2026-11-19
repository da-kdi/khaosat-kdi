import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ArrowUpRight, Filter, Search } from 'lucide-react';
import { OTHER_CODE, questionStats, type AnswerFilter, type PreparedResponse, type Question, type QuestionStats } from '@core/index.ts';
import { AXIS, CATEGORICAL, GRID, NPS_COLORS, SINGLE, divergingScale, inkOn, seqColor } from '@/lib/charts';
import { fmtNum, fmtPct } from '@/lib/format';
import { Card, Input, cn } from '@/components/ui';

interface Props {
  q: Question;
  responses: PreparedResponse[];
  filters: AnswerFilter[];
  onToggleFilter: (f: AnswerFilter) => void;
  breakdown?: { q: Question; responses: PreparedResponse[] } | null;
  surveyId: string;
}

const tooltipStyle = { borderRadius: 8, border: '1px solid #e3e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(15,27,51,.08)' };

export function QuestionCard({ q, responses, filters, onToggleFilter, breakdown, surveyId }: Props) {
  const st = useMemo(() => questionStats(q, responses), [q, responses]);
  const active = (value: string) => filters.some((f) => f.questionCode === q.code && f.value === value);
  const drill = (value: string, label: string) => `/admin/surveys/${surveyId}/responses?f=${encodeURIComponent(`${q.code}~${value}~${label}`)}`;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-muted">{q.code}</p>
          <h3 className="font-semibold leading-snug">{q.reportLabel || q.title}</h3>
        </div>
        <div className="text-right text-xs text-muted" title="Mẫu số = số người được hiển thị câu hỏi (theo logic), trong tập phản hồi đang lọc">
          <p><b className="text-ink">{fmtNum(st.answered)}</b> / {fmtNum(st.shown)} người trả lời</p>
          <p>Bỏ trống: {fmtPct(st.skipRate, 0)}</p>
        </div>
      </div>
      {st.answered === 0 ? <p className="py-8 text-center text-sm text-muted">Chưa có câu trả lời trong tập dữ liệu đang lọc.</p> : <Body st={st} q={q} active={active} onToggle={(v, l) => onToggleFilter({ questionCode: q.code, value: v, label: l })} drill={drill} />}
      {breakdown && st.options && <CrossTab q={q} by={breakdown.q} responses={breakdown.responses} />}
    </Card>
  );
}

function Body({ st, q, active, onToggle, drill }: { st: QuestionStats; q: Question; active: (v: string) => boolean; onToggle: (v: string, l: string) => void; drill: (v: string, l: string) => string }) {
  switch (st.chart) {
    case 'bar': case 'donut': case 'multi_bar':
      return st.question.type === 'likert' ? <Likert st={st} active={active} onToggle={onToggle} drill={drill} /> : <Choices st={st} active={active} onToggle={onToggle} drill={drill} multi={st.chart === 'multi_bar'} />;
    case 'distribution':
      return st.question.type === 'likert' ? <Likert st={st} active={active} onToggle={onToggle} drill={drill} /> : <Distribution st={st} active={active} onToggle={onToggle} />;
    case 'nps':
      return <Nps st={st} active={active} onToggle={onToggle} />;
    case 'histogram':
      return <Histogram st={st} />;
    case 'timeline':
      return <SimpleBars data={(st.timeline ?? []).map((d) => ({ name: d.date, value: d.count }))} />;
    case 'matrix': case 'grid':
      return <Grid st={st} q={q} active={active} onToggle={onToggle} />;
    case 'ranking':
      return <Ranking st={st} />;
    case 'text': case 'files':
      return <Texts st={st} />;
    default:
      return null;
  }
}

function Choices({ st, active, onToggle, drill, multi }: { st: QuestionStats; active: (v: string) => boolean; onToggle: (v: string, l: string) => void; drill: (v: string, l: string) => string; multi: boolean }) {
  const opts = st.options ?? [];
  const donut = !multi && opts.length <= 5;
  const data = opts.map((o, i) => ({ ...o, pct: o.pctOfRespondents * 100, color: CATEGORICAL[i % CATEGORICAL.length] }));
  return (
    <div className={cn('grid gap-5', donut && 'md:grid-cols-[200px_1fr]')}>
      {donut ? (
        <div className="h-48">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data.filter((d) => d.count > 0)} dataKey="count" nameKey="label" innerRadius="58%" outerRadius="92%" paddingAngle={1.5} stroke="#fff" strokeWidth={2}
                onClick={(d: any) => onToggle(d.code, d.label)} className="cursor-pointer">
                {data.filter((d) => d.count > 0).map((d) => <Cell key={d.code} fill={d.color} opacity={active(d.code) || !data.some((x) => active(x.code)) ? 1 : 0.35} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, _n: any, p: any) => [`${v} (${fmtPct(p.payload.pctOfRespondents)})`, p.payload.label]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ height: Math.max(120, data.length * 34 + 20) }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ left: 4, right: 56, top: 0, bottom: 0 }} barCategoryGap={6}>
              <XAxis type="number" hide domain={[0, 100]} />
              <YAxis type="category" dataKey="label" width={170} tick={{ ...AXIS, fill: '#0f1b33' }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: '#f1f5fb' }} contentStyle={tooltipStyle} formatter={(_v: any, _n: any, p: any) => [`${p.payload.count} người · ${fmtPct(p.payload.pctOfRespondents)} người trả lời${multi ? ` · ${fmtPct(p.payload.pctOfSelections)} lượt chọn` : ''}`, '']} />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]} onClick={(d: any) => onToggle(d.code, d.label)} className="cursor-pointer" minPointSize={2}>
                {data.map((d) => <Cell key={d.code} fill={SINGLE} opacity={active(d.code) || !data.some((x) => active(x.code)) ? 1 : 0.35} />)}
                <LabelList dataKey="pct" position="right" formatter={(v: any) => `${Math.round(Number(v))}%`} style={{ fontSize: 12, fill: '#0f1b33', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <OptionTable opts={opts} multi={multi} total={st.totalSelections ?? 0} answered={st.answered} colors={donut ? data.map((d) => d.color) : undefined} active={active} onToggle={onToggle} drill={drill} />
    </div>
  );
}

function OptionTable({ opts, multi, total, answered, colors, active, onToggle, drill }: { opts: NonNullable<QuestionStats['options']>; multi: boolean; total: number; answered: number; colors?: string[]; active: (v: string) => boolean; onToggle: (v: string, l: string) => void; drill: (v: string, l: string) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr><th className="pb-1.5 font-medium">Lựa chọn</th><th className="pb-1.5 text-right font-medium">{multi ? 'Số người chọn' : 'Số lượng'}</th><th className="pb-1.5 text-right font-medium" title={`Mẫu số: ${answered} người đã trả lời câu này`}>% người trả lời</th>{multi && <th className="pb-1.5 text-right font-medium" title={`Mẫu số: ${total} lượt chọn`}>% lượt chọn</th>}<th /></tr>
        </thead>
        <tbody>
          {opts.map((o, i) => (
            <tr key={o.code} className={cn('border-t border-line', active(o.code) && 'bg-brand-50')}>
              <td className="py-1.5 pr-2">
                <button onClick={() => onToggle(o.code, o.label)} className="inline-flex items-center gap-2 text-left hover:text-brand-700" title="Lọc toàn bộ dashboard theo lựa chọn này">
                  {colors && <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colors[i] }} />}{o.label}{active(o.code) && <Filter className="h-3 w-3 text-brand-600" />}
                </button>
              </td>
              <td className="py-1.5 text-right tabular-nums">{fmtNum(o.count)}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums">{fmtPct(o.pctOfRespondents)}</td>
              {multi && <td className="py-1.5 text-right tabular-nums text-muted">{fmtPct(o.pctOfSelections)}</td>}
              <td className="py-1.5 pl-2 text-right">{o.count > 0 && <Link to={drill(o.code, o.label)} className="text-muted hover:text-brand-700" title="Xem các phản hồi"><ArrowUpRight className="h-4 w-4" /></Link>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {multi && <p className="mt-2 text-xs text-muted">Câu nhiều lựa chọn: tổng “% người trả lời” có thể vượt 100%. Tổng lượt chọn: {fmtNum(total)} trên {fmtNum(answered)} người.</p>}
    </div>
  );
}

function Likert({ st, active, onToggle, drill }: { st: QuestionStats; active: (v: string) => boolean; onToggle: (v: string, l: string) => void; drill: (v: string, l: string) => string }) {
  const opts = st.options?.filter((o) => o.code !== OTHER_CODE) ?? [];
  const colors = divergingScale(opts.length);
  const n = opts.length;
  const top2 = opts.slice(-2).reduce((a, o) => a + o.pctOfRespondents, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-6">
        <div><p className="text-2xl font-semibold tabular-nums">{st.numeric ? st.numeric.mean.toFixed(2) : '—'}<span className="text-sm font-normal text-muted"> / {n}</span></p><p className="text-xs text-muted">Điểm trung bình</p></div>
        <div><p className="text-2xl font-semibold tabular-nums">{fmtPct(top2, 0)}</p><p className="text-xs text-muted">Top-2-Box (2 mức cao nhất)</p></div>
      </div>
      <div className="flex h-9 w-full overflow-hidden rounded-md" role="img" aria-label="Phân bố mức độ">
        {opts.map((o, i) => o.pctOfRespondents > 0 && (
          <button key={o.code} onClick={() => onToggle(o.code, o.label)} title={`${o.label}: ${o.count} (${fmtPct(o.pctOfRespondents)})`}
            className="flex h-full items-center justify-center border-r-2 border-white text-xs font-semibold last:border-r-0" style={{ width: `${o.pctOfRespondents * 100}%`, background: colors[i], color: inkOn(colors[i]), opacity: active(o.code) || !opts.some((x) => active(x.code)) ? 1 : 0.4 }}>
            {o.pctOfRespondents >= 0.07 ? `${Math.round(o.pctOfRespondents * 100)}%` : ''}
          </button>
        ))}
      </div>
      <OptionTable opts={opts} multi={false} total={0} answered={st.answered} colors={colors} active={active} onToggle={onToggle} drill={drill} />
    </div>
  );
}

function Distribution({ st, active, onToggle }: { st: QuestionStats; active: (v: string) => boolean; onToggle: (v: string, l: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-6">
        <div><p className="text-2xl font-semibold tabular-nums">{st.numeric?.mean.toFixed(2)}<span className="text-sm font-normal text-muted"> / {st.question.settings?.scaleMax ?? 5}</span></p><p className="text-xs text-muted">Trung bình</p></div>
        <div><p className="text-2xl font-semibold tabular-nums">{st.numeric?.median}</p><p className="text-xs text-muted">Trung vị</p></div>
      </div>
      <SimpleBars data={(st.distribution ?? []).map((d) => ({ name: `${d.value}★`, value: d.count, code: d.value, pct: d.pct }))} onClick={(d) => onToggle(d.code!, `${d.code}★`)} isActive={(d) => active(d.code!)} />
    </div>
  );
}

function Nps({ st, active, onToggle }: { st: QuestionStats; active: (v: string) => boolean; onToggle: (v: string, l: string) => void }) {
  const n = st.nps!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-8">
        <div><p className={cn('text-4xl font-bold tabular-nums', n.score >= 30 ? 'text-emerald-700' : n.score >= 0 ? 'text-ink' : 'text-red-700')}>{n.score > 0 ? '+' : ''}{n.score}</p><p className="text-xs text-muted">NPS = % Promoter − % Detractor</p></div>
        {([['Detractor (0–6)', n.detractors, NPS_COLORS.detractor], ['Passive (7–8)', n.passives, NPS_COLORS.passive], ['Promoter (9–10)', n.promoters, NPS_COLORS.promoter]] as const).map(([l, v, c]) => (
          <div key={l}><p className="flex items-center gap-1.5 text-lg font-semibold tabular-nums"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{fmtPct(v, 0)}</p><p className="text-xs text-muted">{l}</p></div>
        ))}
      </div>
      <SimpleBars data={(st.distribution ?? []).map((d) => ({ name: d.value, value: d.count, code: d.value, color: Number(d.value) <= 6 ? NPS_COLORS.detractor : Number(d.value) <= 8 ? NPS_COLORS.passive : NPS_COLORS.promoter }))}
        onClick={(d) => onToggle(d.code!, `NPS ${d.code}`)} isActive={(d) => active(d.code!)} />
    </div>
  );
}

function Histogram({ st }: { st: QuestionStats }) {
  const s = st.numeric!;
  const f = (x: number) => fmtNum(x, 2);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        {([['TB', s.mean], ['Trung vị', s.median], ['Min', s.min], ['Max', s.max], ['P25', s.p25], ['Tổng', s.sum]] as const).map(([l, v]) => <div key={l} className="rounded-lg bg-surface p-2"><p className="font-semibold tabular-nums">{f(v)}</p><p className="text-[11px] text-muted">{l}</p></div>)}
      </div>
      <SimpleBars data={(st.histogram ?? []).map((h) => ({ name: h.bucket, value: h.count }))} />
    </div>
  );
}

function SimpleBars({ data, onClick, isActive }: { data: { name: string; value: number; code?: string; color?: string; pct?: number }[]; onClick?: (d: { code?: string }) => void; isActive?: (d: { code?: string }) => boolean }) {
  const anyActive = isActive && data.some((d) => isActive(d));
  return (
    <div className="h-48">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: -18, right: 4, top: 14, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: '#f1f5fb' }} contentStyle={tooltipStyle} formatter={(v: any) => [v, 'Số lượng']} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} onClick={onClick ? (d: any) => onClick(d) : undefined} className={onClick ? 'cursor-pointer' : ''}>
            {data.map((d, i) => <Cell key={i} fill={d.color ?? SINGLE} opacity={!anyActive || isActive!(d) ? 1 : 0.35} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Grid({ st, q, active, onToggle }: { st: QuestionStats; q: Question; active: (v: string) => boolean; onToggle: (v: string, l: string) => void }) {
  const g = st.grid!;
  const qty = q.type === 'quantity_by_group' || q.type === 'number_grid' || (q.type === 'category_level' && q.settings?.withQuantity);
  const [metric, setMetric] = useState<'qty' | 'resp' | 'avg'>(q.type === 'number_range' ? 'avg' : qty ? 'qty' : 'resp');
  const val = (r: string, c: string) => {
    if (metric === 'avg') { const n = g.respondents[r]?.[c] ?? 0; return n ? Math.round(((g.cells[r]?.[c] ?? 0) / n) * 10) / 10 : 0; }
    return (metric === 'qty' ? g.cells[r]?.[c] : g.respondents[r]?.[c]) ?? 0;
  };
  const max = Math.max(1, ...g.rows.flatMap((r) => g.cols.map((c) => val(r.code, c.code))));
  const rowTotal = (r: string) => g.cols.reduce((a, c) => a + val(r, c.code), 0);
  const colTotal = (c: string) => g.rows.reduce((a, r) => a + val(r.code, c), 0);
  return (
    <div>
      {q.type === 'number_grid' && (
        <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
          <button onClick={() => setMetric('qty')} className={cn('rounded-md px-2.5 py-1', metric === 'qty' && 'bg-white font-semibold shadow-sm')}>Tổng{q.settings?.unit ? ` (${q.settings.unit})` : ''}</button>
          <button onClick={() => setMetric('avg')} className={cn('rounded-md px-2.5 py-1', metric === 'avg' && 'bg-white font-semibold shadow-sm')}>Trung bình mỗi phiếu</button>
        </div>
      )}
      {q.type === 'number_range' && <p className="mb-2 text-xs text-muted">Trung bình các phiếu đã trả lời{q.settings?.unit ? ` (${q.settings.unit})` : ''}.</p>}
      {qty && q.type === 'category_level' && (
        <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
          <button onClick={() => setMetric('qty')} className={cn('rounded-md px-2.5 py-1', metric === 'qty' && 'bg-white font-semibold shadow-sm')}>Tổng {q.settings?.quantityLabel?.toLowerCase() || 'số lượng'}</button>
          <button onClick={() => setMetric('resp')} className={cn('rounded-md px-2.5 py-1', metric === 'resp' && 'bg-white font-semibold shadow-sm')}>Số đơn vị chọn</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 text-sm">
          <thead><tr><th />{g.cols.map((c) => <th key={c.code} className="px-2 pb-1 text-center text-xs font-medium text-muted">{c.label}</th>)}<th className="px-2 pb-1 text-right text-xs font-medium text-muted">Tổng</th></tr></thead>
          <tbody>
            {[...g.rows].sort((a, b) => rowTotal(b.code) - rowTotal(a.code)).map((r) => (
              <tr key={r.code}>
                <td className="py-1 pr-3 font-medium">{r.label}</td>
                {g.cols.map((c) => {
                  const v = val(r.code, c.code);
                  const t = v / max;
                  const key = `${r.code}:${c.code}`;
                  return (
                    <td key={c.code} className="p-0">
                      <button onClick={() => v > 0 && onToggle(key, `${r.label} – ${c.label}`)} title={`${r.label} – ${c.label}: ${v}`}
                        className={cn('h-9 w-full min-w-[56px] rounded text-xs font-semibold tabular-nums transition', active(key) && 'ring-2 ring-accent-400')}
                        style={{ background: seqColor(t), color: inkOn(seqColor(t)) }}>{v || ''}</button>
                    </td>
                  );
                })}
                <td className="px-2 text-right font-semibold tabular-nums">{fmtNum(rowTotal(r.code))}</td>
              </tr>
            ))}
            <tr><td className="pt-1 text-xs text-muted">Tổng</td>{g.cols.map((c) => <td key={c.code} className="pt-1 text-center text-xs font-semibold tabular-nums">{fmtNum(colTotal(c.code))}</td>)}<td className="pt-1 text-right text-xs font-bold tabular-nums">{fmtNum(g.cols.reduce((a, c) => a + colTotal(c.code), 0))}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Màu đậm = giá trị cao. {metric === 'qty' ? 'Ô hiển thị tổng số lượng khai báo.' : 'Ô hiển thị số phản hồi đã chọn.'} Bấm vào ô để lọc dashboard.</p>
    </div>
  );
}

function Ranking({ st }: { st: QuestionStats }) {
  const data = (st.ranking ?? []).map((r) => ({ name: r.label, value: r.borda, avg: r.avgRank }));
  return (
    <div>
      <div style={{ height: Math.max(120, data.length * 36 + 20) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 80 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={170} tick={{ ...AXIS, fill: '#0f1b33' }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: '#f1f5fb' }} contentStyle={tooltipStyle} formatter={(_v: any, _n: any, p: any) => [`Điểm Borda ${p.payload.value} · hạng TB ${p.payload.avg.toFixed(2)}`, '']} />
            <Bar dataKey="value" fill={SINGLE} radius={[0, 4, 4, 0]}><LabelList dataKey="avg" position="right" formatter={(v: any) => `hạng TB ${Number(v).toFixed(2)}`} style={{ fontSize: 12, fill: '#0f1b33' }} /></Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted">Sắp theo hạng trung bình (1 = ưu tiên cao nhất). Điểm Borda = tổng (số mục − hạng + 1).</p>
    </div>
  );
}

function Texts({ st }: { st: QuestionStats }) {
  const [f, setF] = useState('');
  const [kw, setKw] = useState('');
  const needle = (kw || f).toLowerCase();
  const list = (st.texts ?? []).filter((t) => t.text && (!needle || t.text.toLowerCase().includes(needle)));
  return (
    <div className="space-y-3">
      {st.keywords && st.keywords.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Từ khóa phổ biến (số phản hồi chứa từ)</p>
          <div className="flex flex-wrap gap-1.5">
            {st.keywords.slice(0, 18).map((k) => (
              <button key={k.word} onClick={() => setKw(kw === k.word ? '' : k.word)} className={cn('rounded-full border px-2.5 py-0.5 text-xs transition', kw === k.word ? 'border-brand-500 bg-brand-600 text-white' : 'border-line bg-white hover:border-brand-300')}>
                {k.word} <span className="opacity-70">{k.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input className="h-9 pl-9" placeholder="Tìm trong câu trả lời…" value={f} onChange={(e) => { setF(e.target.value); setKw(''); }} />
      </div>
      <ul className="thin-scroll max-h-64 space-y-1.5 overflow-y-auto">
        {list.slice(0, 100).map((t, i) => <li key={i} className="rounded-lg bg-surface px-3 py-2 text-sm">{highlight(t.text, needle)}</li>)}
        {!list.length && <li className="py-4 text-center text-sm text-muted">Không có kết quả.</li>}
      </ul>
      <p className="text-xs text-muted">{list.length} câu trả lời{list.length > 100 && ' (hiển thị 100 đầu tiên — xuất Excel để xem đủ)'}. Nội dung gốc, không qua chỉnh sửa.</p>
    </div>
  );
}

function highlight(text: string, needle: string) {
  if (!needle) return text;
  const i = text.toLowerCase().indexOf(needle);
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="rounded bg-accent-100 px-0.5">{text.slice(i, i + needle.length)}</mark>{text.slice(i + needle.length)}</>;
}

function CrossTab({ q, by, responses }: { q: Question; by: Question; responses: PreparedResponse[] }) {
  if (by.code === q.code) return null;
  const segs = (by.options ?? []).filter((o) => o.active !== false);
  const cols = segs.map((s) => {
    const sub = responses.filter((r) => { const v = r.byCode[by.code]; return Array.isArray(v) ? v.includes(s.code) : v === s.code; });
    return { seg: s, st: questionStats(q, sub) };
  }).filter((c) => c.st.answered > 0);
  if (!cols.length) return null;
  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Phân tách theo: {by.reportLabel || by.title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr><th />{cols.map((c) => <th key={c.seg.code} className="px-2 pb-1 text-right font-medium text-muted">{c.seg.label}<br /><span className="font-normal">n={c.st.answered}</span></th>)}</tr></thead>
          <tbody>
            {(q.options ?? []).map((o) => (
              <tr key={o.code} className="border-t border-line">
                <td className="py-1.5 pr-2">{o.label}</td>
                {cols.map((c) => { const p = c.st.options?.find((x) => x.code === o.code)?.pctOfRespondents ?? 0; return <td key={c.seg.code} className="px-2 py-1.5 text-right tabular-nums" style={{ background: seqColor(p * 0.9), color: inkOn(seqColor(p * 0.9)) }}>{fmtPct(p, 0)}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-muted">% trên số người trả lời câu này trong từng nhóm. Nhóm có n nhỏ cần thận trọng khi diễn giải.</p>
    </div>
  );
}
