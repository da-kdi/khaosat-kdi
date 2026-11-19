import { useMemo, useState } from 'react';
import { Monitor, Smartphone, RotateCcw, Eye, EyeOff, CheckCircle2, Download } from 'lucide-react';
import { computeVisibility, describeCheck, runChecks, formatAnswer, isEmptyValue, isInputQuestion, normalizeAnswers, sanitizeAnswers, validateAnswers, type Answers } from '@core/index.ts';
import { formHtml, printPdf } from '@/lib/blankForm';
import { Badge, Button, Card, Modal, Select, Switch, Tabs, cn } from '@/components/ui';
import { SurveyForm, type FormStage } from '@/survey/SurveyForm';
import { useSurvey } from './SurveyLayout';
import { describeLogic } from './builder/LogicEditor';

export default function PreviewPage() {
  const { survey, versions } = useSurvey();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [source, setSource] = useState<string>('draft');
  const [showHidden, setShowHidden] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<Answers | null>(null);
  const [done, setDone] = useState<Answers | null>(null);
  const [stage, setStage] = useState<FormStage | 'done'>('intro');
  const [req, setReq] = useState<{ stage: FormStage; t: number } | undefined>();
  const restart = () => { setRun((r) => r + 1); setAnswers({}); setDone(null); setReq(undefined); setStage('intro'); };
  const goStage = (s: FormStage | 'done') => {
    if (s === 'done') { setDone(sanitizeAnswers(schema, answers)); setStage('done'); return; }
    setDone(null); setReq({ stage: s, t: Date.now() });
  };
  const v = versions.find((x) => x.id === source);
  const schema = v ? v.schema : survey.draftSchema;
  const formSurvey = { title: survey.title, description: survey.description, settings: v ? v.settings : survey.settings, theme: v ? v.theme : survey.theme, schema };

  const vis = useMemo(() => computeVisibility(schema, answers), [schema, answers]);
  const errs = useMemo(() => validateAnswers(schema, answers), [schema, answers]);
  const allQs = schema.sections.flatMap((s) => s.questions);
  const logicQs = allQs.filter((q) => q.logic?.visibleIf?.rules.length || q.logic?.requiredIf?.rules.length);
  const logicSecs = schema.sections.filter((s) => s.logic?.visibleIf?.rules.length);
  const failed = useMemo(() => new Set(runChecks(schema, answers).map((r) => r.check.id)), [schema, answers]);

  return (
    <div className="grid gap-0 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-5 py-2.5">
          <Tabs value={device} onChange={setDevice} items={[{ value: 'desktop', label: <span className="flex items-center gap-1.5"><Monitor className="h-4 w-4" />Máy tính</span> }, { value: 'mobile', label: <span className="flex items-center gap-1.5"><Smartphone className="h-4 w-4" />Điện thoại</span> }]} />
          <div className="inline-flex rounded-lg bg-surface p-0.5 text-sm" role="group" aria-label="Màn hình người trả lời">
            {([['intro', 'Giới thiệu'], ['form', 'Trả lời'], ['review', 'Kiểm tra trước khi gửi'], ['done', 'Đã gửi']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => goStage(k)} aria-pressed={stage === k} className={cn('rounded-md px-2.5 py-1.5 font-medium transition', stage === k ? 'bg-white text-brand-700 shadow-sm' : 'text-muted hover:text-ink')}>{l}</button>
            ))}
          </div>
          <Select className="h-9 w-auto text-sm" value={source} onChange={(e) => { setSource(e.target.value); restart(); }} aria-label="Phiên bản">
            <option value="draft">Bản nháp hiện tại</option>
            {versions.map((x) => <option key={x.id} value={x.id}>Phiên bản {x.versionNumber} (đã xuất bản)</option>)}
          </Select>
          <Switch checked={showHidden} onChange={setShowHidden} label="Hiện câu hỏi đang ẩn" />
          <Button size="sm" variant="ghost" className="ml-auto" onClick={restart}><RotateCcw className="h-4 w-4" />Làm lại từ đầu</Button>
        </div>
        <div className="flex justify-center bg-slate-100 p-4 sm:p-6">
          <div className={cn('w-full overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5 transition-all', device === 'mobile' ? 'max-w-[390px]' : 'max-w-4xl')}>
            <div className={cn('thin-scroll overflow-y-auto', device === 'mobile' ? 'h-[760px]' : 'h-[calc(100vh-227px)] min-h-[600px]')}>
              {done ? <DoneScreen survey={formSurvey} answers={done} onData={() => setResult(done)} onEdit={() => goStage('review')} /> : null}
              <div className={cn(done && 'hidden')}>
              <SurveyForm key={`${source}-${run}`} survey={formSurvey} embedded showHidden={showHidden} rail={device === 'desktop' ? 'always' : undefined}
                requestStage={req} onStageChange={(s) => { if (!done) setStage(s); }}
                banner={<div className="mb-4 rounded-lg bg-accent-50 px-3 py-2 text-xs text-accent-700">Chế độ xem trước — câu trả lời không được lưu.</div>}
                onAnswersChange={(a) => setAnswers(a)}
                onSubmit={async (a) => { setDone(sanitizeAnswers(schema, a)); setStage('done'); }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="thin-scroll border-l border-line bg-white p-4 xl:h-[calc(100vh-140px)] xl:overflow-y-auto">
        <h3 className="font-semibold">Kiểm tra logic</h3>
        <p className="mt-0.5 text-xs text-muted">Cập nhật theo câu trả lời thử bên trái.</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Card className="p-2"><p className="text-lg font-semibold">{vis.sections.size}/{schema.sections.length}</p><p className="text-[11px] text-muted">phần hiện</p></Card>
          <Card className="p-2"><p className="text-lg font-semibold">{allQs.filter((q) => isInputQuestion(q) && vis.questions.has(q.id)).length}/{allQs.filter(isInputQuestion).length}</p><p className="text-[11px] text-muted">câu hiện</p></Card>
          <Card className="p-2"><p className={cn('text-lg font-semibold', Object.keys(errs).length ? 'text-red-600' : 'text-emerald-600')}>{Object.keys(errs).length}</p><p className="text-[11px] text-muted">lỗi nếu gửi</p></Card>
        </div>
        <div className="mt-4 space-y-2">
          {!logicQs.length && !logicSecs.length && <p className="rounded-lg bg-surface p-3 text-sm text-muted">Khảo sát chưa có quy tắc hiển thị có điều kiện.</p>}
          {logicSecs.map((s) => (
            <RuleCard key={s.id} on={vis.sections.has(s.id)} title={`Phần: ${s.title}`} rule={describeLogic(s.logic?.visibleIf, allQs)} />
          ))}
          {logicQs.map((q) => (
            <RuleCard key={q.id} on={vis.questions.has(q.id)} title={`${q.code} · ${q.title}`} rule={describeLogic(q.logic?.visibleIf, allQs)} req={q.logic?.requiredIf?.rules.length ? describeLogic(q.logic.requiredIf, allQs) : undefined} />
          ))}
        </div>
        {!!schema.checks?.length && (
          <div className="mt-5">
            <h3 className="font-semibold">Kiểm tra chéo đang bật</h3>
            <div className="mt-2 space-y-2">
              {schema.checks.map((c) => (
                <div key={c.id} className={cn('flex items-start justify-between gap-2 rounded-lg border p-2.5 text-xs', failed.has(c.id) ? 'border-amber-300 bg-amber-50' : 'border-line bg-surface')}>
                  <span className="text-ink">{describeCheck(c, schema)}</span>
                  <Badge tone={c.severity === 'block' ? 'red' : 'orange'} className="shrink-0 !text-[10px]">{failed.has(c.id) ? 'Đang sai · ' : ''}{c.severity === 'block' ? 'Chặn gửi' : 'Nhắc'}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      <Modal open={!!result} onClose={() => setResult(null)} title="Dữ liệu sẽ được lưu" size="lg" footer={<Button onClick={() => setResult(null)}>Đóng</Button>}>
        {result && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Hợp lệ — đây là dữ liệu chuẩn hóa máy chủ sẽ ghi (câu ẩn đã bị loại).</p>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-xs">
                <thead className="bg-surface text-left text-muted"><tr><th className="px-3 py-2">question_code</th><th className="px-3 py-2">text / number</th><th className="px-3 py-2">option rows</th></tr></thead>
                <tbody>{normalizeAnswers(schema, result).map((r) => (
                  <tr key={r.question_code} className="border-t border-line align-top">
                    <td className="px-3 py-1.5 font-mono">{r.question_code}</td>
                    <td className="px-3 py-1.5">{r.answer_text ?? ''}{r.answer_number !== null ? ` [${r.answer_number}]` : ''}</td>
                    <td className="px-3 py-1.5 font-mono text-muted">{r.options.map((o) => [o.row_code, o.option_code, o.quantity ?? o.rank].filter((x) => x !== null).join(':')).join(', ')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function RuleCard({ on, title, rule, req }: { on: boolean; title: string; rule: string; req?: string }) {
  return (
    <div className={cn('rounded-lg border p-2.5 text-xs', on ? 'border-emerald-200 bg-emerald-50/50' : 'border-line bg-surface')}>
      <div className="flex items-center gap-1.5">
        {on ? <Eye className="h-3.5 w-3.5 text-emerald-600" /> : <EyeOff className="h-3.5 w-3.5 text-muted" />}
        <span className="truncate font-medium text-ink">{title}</span>
        <Badge tone={on ? 'green' : 'slate'} className="ml-auto !text-[10px]">{on ? 'Hiện' : 'Ẩn'}</Badge>
      </div>
      {rule && <p className="mt-1 text-muted">Hiện khi: {rule}</p>}
      {req && <p className="mt-0.5 text-red-700">Bắt buộc khi: {req}</p>}
    </div>
  );
}

function DoneScreen({ survey, answers, onData, onEdit }: { survey: { title: string; settings: { completionTitle?: string; completionText?: string }; schema: import('@core/index.ts').SurveySchema }; answers: Answers; onData: () => void; onEdit: () => void }) {
  const pdf = () => printPdf(formHtml(survey.title, survey.schema, { answer: (q) => (isEmptyValue(answers[q.id]) ? undefined : formatAnswer(q, answers[q.id], answers)) }));
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="animate-in rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        <h1 className="mt-4 text-2xl font-bold">{survey.settings.completionTitle || 'Cảm ơn bạn đã hoàn thành khảo sát!'}</h1>
        <p className="mt-3 whitespace-pre-line text-slate-700">{survey.settings.completionText || 'Phản hồi của bạn đã được ghi nhận thành công.'}</p>
        <p className="mt-5 inline-block rounded-lg bg-slate-100 px-4 py-2 text-sm">Mã phản hồi: <b className="font-mono tracking-wide">R-XEMTHU</b> <span className="text-muted">(xem trước)</span></p>
        <div className="mt-6 grid gap-2">
          <Button onClick={pdf}><Download className="h-4 w-4" />Tải phiếu đã gửi (PDF)</Button>
          <Button variant="outline" onClick={onEdit}>Quay lại sửa phiếu</Button>
          <Button variant="ghost" size="sm" onClick={onData}>Xem dữ liệu sẽ được lưu</Button>
        </div>
      </div>
    </div>
  );
}
