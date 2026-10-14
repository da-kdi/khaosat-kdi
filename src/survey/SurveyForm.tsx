import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Clock, Loader2, Send, EyeOff, Pencil } from 'lucide-react';
import {
  PublicApiError, computeVisibility, formatAnswer, isInputQuestion, isRequired, validateAnswers, isEmptyValue,
  type Answers, type Question, type SurveySchema, type SurveySettings, type SurveyTheme,
} from '@core/index.ts';
import { cn } from '@/components/ui';
import { ContentBlock, MediaView, QuestionInput } from './fields';
import { resolveTheme, themeStyle } from './theme';

export interface FormSurvey {
  title: string;
  description?: string | null;
  settings: SurveySettings;
  theme: SurveyTheme;
  schema: SurveySchema;
}

interface Props {
  survey: FormSurvey;
  initialAnswers?: Answers;
  initialSectionId?: string | null;
  skipIntro?: boolean;
  onStart?: () => Promise<void>;
  onAnswersChange?: (answers: Answers, sectionId: string | null) => void;
  onSubmit: (answers: Answers) => Promise<void>;
  onUpload?: (questionId: string, file: File) => Promise<{ path: string }>;
  /** preview: show hidden questions greyed out + logic reasons */
  showHidden?: boolean;
  banner?: ReactNode;
  footerNote?: ReactNode;
  embedded?: boolean;
}

export function SurveyHeader({ survey, compact }: { survey: FormSurvey; compact?: boolean }) {
  const t = resolveTheme(survey.theme);
  return (
    <header className="border-b border-black/5 bg-white/90 backdrop-blur">
      <div className={cn('mx-auto flex max-w-3xl items-center gap-3 px-4', compact ? 'py-2' : 'py-3')}>
        <img src={t.logoUrl} alt="KDI Education" className="h-9 w-auto" onError={(e) => ((e.target as HTMLImageElement).src = '/brand/kdi-logo.png')} />
        <div className="h-6 w-px bg-line" />
        <span className="text-sm font-semibold text-brand-700">Hệ thống khảo sát STEM</span>
      </div>
    </header>
  );
}

export function SurveyForm({ survey, initialAnswers, initialSectionId, skipIntro, onStart, onAnswersChange, onSubmit, onUpload, showHidden, banner, footerNote, embedded }: Props) {
  const schema = survey.schema;
  const settings = survey.settings ?? {};
  const theme = resolveTheme(survey.theme);
  const [answers, setAnswers] = useState<Answers>(() => ({ ...defaultAnswers(schema), ...(initialAnswers ?? {}) }));
  const [stage, setStage] = useState<'intro' | 'form' | 'review'>(skipIntro ? 'form' : 'intro');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [formError, setFormError] = useState('');
  const vis = useMemo(() => computeVisibility(schema, answers), [schema, answers]);
  const visibleSections = schema.sections.filter((s) => vis.sections.has(s.id));
  const [sectionId, setSectionId] = useState<string | null>(() => (initialSectionId && schema.sections.some((s) => s.id === initialSectionId) ? initialSectionId : schema.sections[0]?.id ?? null));
  const topRef = useRef<HTMLDivElement>(null);

  // if current section becomes hidden, move to the nearest visible one
  const current = visibleSections.find((s) => s.id === sectionId) ?? visibleSections[0];
  const idx = current ? visibleSections.indexOf(current) : 0;
  const progress = stage === 'review' ? 1 : visibleSections.length ? idx / visibleSections.length : 0;

  const scrollTop = () => (embedded ? topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : window.scrollTo({ top: 0, behavior: 'smooth' }));

  const update = (key: string, v: unknown) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (v === undefined) delete next[key]; else next[key] = v;
      onAnswersChange?.(next, current?.id ?? null);
      return next;
    });
    if (errors[key]) setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  };

  const goto = (id: string) => { setSectionId(id); setStage('form'); onAnswersChange?.(answers, id); scrollTop(); };

  const next = () => {
    if (!current) return;
    const errs = validateAnswers(schema, answers, current.id);
    setErrors(errs);
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => document.getElementById(`q-${Object.keys(errs)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    const after = visibleSections[idx + 1];
    if (after) goto(after.id);
    else if (settings.requireReview !== false) { setStage('review'); onAnswersChange?.(answers, current.id); scrollTop(); }
    else submit();
  };
  const back = () => {
    if (stage === 'review') { setStage('form'); scrollTop(); return; }
    const prev = visibleSections[idx - 1];
    if (prev) goto(prev.id); else if (!skipIntro) setStage('intro');
  };

  const submit = async () => {
    const errs = validateAnswers(schema, answers);
    if (Object.keys(errs).length) {
      setErrors(errs);
      const first = schema.sections.find((s) => s.questions.some((q) => errs[q.id]));
      if (first) goto(first.id);
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await onSubmit(answers);
    } catch (e) {
      if (e instanceof PublicApiError && e.fieldErrors) {
        setErrors(e.fieldErrors);
        const first = schema.sections.find((s) => s.questions.some((q) => e.fieldErrors![q.id]));
        if (first) goto(first.id);
      }
      setFormError((e as Error).message || 'Không gửi được phản hồi. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const start = async () => {
    setStarting(true);
    setFormError('');
    try {
      await onStart?.();
      setStage('form');
      onAnswersChange?.(answers, current?.id ?? null);
      scrollTop();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => { if (formError) scrollTop(); }, [formError]); // eslint-disable-line react-hooks/exhaustive-deps

  const qCount = schema.sections.flatMap((s) => s.questions).filter(isInputQuestion).length;

  return (
    <div style={themeStyle(survey.theme)} className={cn(!embedded && 'min-h-screen')} ref={topRef}>
      {!embedded && <SurveyHeader survey={survey} />}
      {settings.showProgress !== false && stage !== 'intro' && (
        <div className={cn('z-20 h-1.5 bg-black/5', embedded ? 'sticky top-0' : 'sticky top-0')}>
          <div className="survey-progress h-full transition-all duration-500" style={{ width: `${Math.max(4, progress * 100)}%` }} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} />
        </div>
      )}
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:pt-10">
        {banner}
        {formError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{formError}</div>}

        {stage === 'intro' && (
          <section className="animate-in overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            {theme.coverUrl && <img src={theme.coverUrl} alt="" className="h-44 w-full object-cover sm:h-56" />}
            <div className="p-6 sm:p-10">
              <div className="mb-4 h-1.5 w-16 rounded-full survey-accent-bg" />
              <h1 className="text-2xl font-bold leading-tight sm:text-3xl survey-primary-text">{settings.introTitle || survey.title}</h1>
              {(settings.introText || survey.description) && <p className="prose-vi mt-4 whitespace-pre-line text-[15px] text-slate-700">{settings.introText || survey.description}</p>}
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
                {settings.estimatedMinutes ? <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" />Khoảng {settings.estimatedMinutes} phút</span> : null}
                <span>{visibleSections.length} phần · {qCount} câu hỏi</span>
                {settings.allowResume && <span>Có thể lưu và tiếp tục sau</span>}
              </div>
              <button onClick={start} disabled={starting} className="survey-btn mt-8 inline-flex h-12 items-center gap-2 rounded-xl px-7 text-base font-semibold shadow-sm transition disabled:opacity-60">
                {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}Bắt đầu khảo sát <ArrowRight className="h-5 w-5" />
              </button>
              {settings.contactInfo && <p className="mt-6 border-t border-line pt-4 text-sm text-muted whitespace-pre-line">{settings.contactInfo}</p>}
            </div>
          </section>
        )}

        {stage === 'form' && current && (
          <section key={current.id} className="animate-in">
            <div className="mb-5">
              <p className="text-sm font-medium text-muted">Phần {idx + 1}/{visibleSections.length}</p>
              <h2 className="mt-1 text-xl font-bold sm:text-2xl survey-primary-text">{current.title}</h2>
              {current.description && <p className="prose-vi mt-2 whitespace-pre-line text-slate-700">{current.description}</p>}
            </div>
            <div className="space-y-4">
              {current.questions.map((q) => {
                const visible = vis.questions.has(q.id);
                if (!visible && !showHidden) return null;
                return (
                  <QuestionCard key={q.id} q={q} hidden={!visible} required={isRequired(q, vis.effective)} error={errors[q.id]}>
                    {isInputQuestion(q) ? (
                      <QuestionInput q={q} value={answers[q.id]} answers={answers} onChange={(v) => update(q.id, v)} setAnswer={update} invalid={!!errors[q.id]}
                        onUpload={onUpload ? (f) => onUpload(q.id, f) : undefined} />
                    ) : <ContentBlock q={q} />}
                  </QuestionCard>
                );
              })}
            </div>
            <Nav onBack={back} canBack={idx > 0 || !skipIntro} onNext={next} nextLabel={idx === visibleSections.length - 1 ? (settings.requireReview !== false ? 'Xem lại' : 'Gửi khảo sát') : 'Tiếp tục'} busy={submitting} />
          </section>
        )}

        {stage === 'review' && (
          <section className="animate-in">
            <h2 className="text-xl font-bold sm:text-2xl survey-primary-text">Xem lại câu trả lời</h2>
            <p className="mt-1 text-sm text-muted">Kiểm tra trước khi gửi. Bấm “Sửa” để quay lại phần tương ứng.</p>
            <div className="mt-5 space-y-4">
              {visibleSections.map((s) => (
                <div key={s.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{s.title}</h3>
                    <button onClick={() => goto(s.id)} className="inline-flex items-center gap-1 text-sm font-medium survey-primary-text hover:underline"><Pencil className="h-3.5 w-3.5" />Sửa</button>
                  </div>
                  <dl className="divide-y divide-line">
                    {s.questions.filter((q) => isInputQuestion(q) && vis.questions.has(q.id)).map((q) => (
                      <div key={q.id} className="grid gap-1 py-2 text-sm sm:grid-cols-[1fr_1.2fr] sm:gap-4">
                        <dt className="text-muted">{q.title}</dt>
                        <dd className={cn('font-medium', isEmptyValue(answers[q.id]) && 'font-normal italic text-slate-400')}>{isEmptyValue(answers[q.id]) ? 'Không trả lời' : formatAnswer(q, answers[q.id], answers)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
            <div className="mt-8 flex items-center justify-between gap-3">
              <button onClick={back} className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium text-muted hover:bg-black/5"><ArrowLeft className="h-4 w-4" />Quay lại</button>
              <button onClick={submit} disabled={submitting} className="survey-btn inline-flex h-12 items-center gap-2 rounded-xl px-7 text-base font-semibold shadow-sm disabled:opacity-60">
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}Gửi khảo sát
              </button>
            </div>
          </section>
        )}
        {footerNote && <div className="mt-10 text-center text-xs text-muted">{footerNote}</div>}
      </main>
    </div>
  );
}

function QuestionCard({ q, hidden, required, error, children }: { q: Question; hidden: boolean; required: boolean; error?: string; children: ReactNode }) {
  const input = isInputQuestion(q);
  return (
    <div id={`q-${q.id}`} className={cn('rounded-2xl bg-white p-5 shadow-sm ring-1 transition sm:p-6', error ? 'ring-red-300' : 'ring-black/5', hidden && 'opacity-50 ring-dashed')}>
      {hidden && <p className="mb-2 inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-muted"><EyeOff className="h-3 w-3" />Đang ẩn theo logic</p>}
      {input && (
        <div className="mb-3">
          <p className="text-[16px] font-semibold leading-snug" id={`lbl-${q.id}`}>
            {q.title}{required && <span className="ml-1 text-red-500" aria-label="bắt buộc">*</span>}
          </p>
          {q.description && <p className="prose-vi mt-1 whitespace-pre-line text-sm text-muted">{q.description}</p>}
        </div>
      )}
      {input && q.media?.url && <MediaView media={q.media} />}
      <div role="group" aria-labelledby={input ? `lbl-${q.id}` : undefined}>{children}</div>
      {q.helpText && input && <p className="mt-2 text-xs text-muted">{q.helpText}</p>}
      {error && <p className="mt-2 text-sm font-medium text-red-600" role="alert">{error}</p>}
    </div>
  );
}

function Nav({ onBack, canBack, onNext, nextLabel, busy }: { onBack: () => void; canBack: boolean; onNext: () => void; nextLabel: string; busy?: boolean }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      {canBack ? <button onClick={onBack} className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium text-muted hover:bg-black/5"><ArrowLeft className="h-4 w-4" />Quay lại</button> : <span />}
      <button onClick={onNext} disabled={busy} className="survey-btn inline-flex h-12 items-center gap-2 rounded-xl px-6 text-base font-semibold shadow-sm disabled:opacity-60">
        {busy && <Loader2 className="h-5 w-5 animate-spin" />}{nextLabel}<ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );
}

function defaultAnswers(schema: SurveySchema): Answers {
  const a: Answers = {};
  for (const s of schema.sections) for (const q of s.questions) if (q.defaultValue !== undefined && q.defaultValue !== null && q.defaultValue !== '') a[q.id] = q.defaultValue;
  return a;
}
