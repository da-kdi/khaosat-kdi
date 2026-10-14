import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Copy, KeyRound, Lock, RotateCcw, SearchX } from 'lucide-react';
import type { Answers, GetSurveyResult, PublicSurvey } from '@core/index.ts';
import { publicApi, isDemo } from '@/data';
import { SurveyForm, SurveyHeader } from '@/survey/SurveyForm';
import { themeStyle } from '@/survey/theme';
import { Spinner } from '@/components/ui';

interface Session { responseId: string; resumeToken: string; responseCode: string }
const sessKey = (slug: string) => `kdi-resp:${slug}`;
const doneKey = (slug: string) => `kdi-done:${slug}`;
const ls = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* blocked */ } },
};

function Shell({ children, survey }: { children: React.ReactNode; survey?: { title: string; theme: any; settings: any; schema: any } }) {
  return (
    <div className="min-h-screen" style={themeStyle(survey?.theme)}>
      {survey ? <SurveyHeader survey={survey} /> : (
        <header className="border-b border-black/5 bg-white"><div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3"><img src="/brand/kdi-logo.png" alt="KDI Education" className="h-9" /><div className="h-6 w-px bg-line" /><span className="text-sm font-semibold text-brand-700">Hệ thống khảo sát STEM</span></div></header>
      )}
      <main className="mx-auto max-w-xl px-4 py-14">{children}</main>
    </div>
  );
}

export function PublicSurveyPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') ?? undefined;
  const navigate = useNavigate();
  const [result, setResult] = useState<GetSurveyResult | null>(null);
  const [resumed, setResumed] = useState<{ answers: Answers; sectionId: string | null; survey: PublicSurvey } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [loadErr, setLoadErr] = useState('');
  const saveTimer = useRef<number>();
  const pending = useRef<{ answers: Answers; sectionId: string | null } | null>(null);

  const load = useCallback(async (accessCode?: string) => {
    setLoadErr('');
    try {
      // resume an unfinished session on this device first
      const s = ls.get<Session>(sessKey(slug));
      if (s && !accessCode) {
        try {
          const r = await publicApi.resume(slug, s.resumeToken);
          if (r.survey.settings.allowResume !== false) {
            setSession(s);
            setResumed({ answers: r.answers, sectionId: r.lastSectionId, survey: r.survey });
            return;
          }
        } catch { ls.del(sessKey(slug)); }
      }
      const res = await publicApi.get(slug, { token, code: accessCode });
      if (res.state === 'open' && res.survey.settings.oneResponsePerDevice && ls.get(doneKey(slug)) && !token) {
        setResult({ state: 'closed', title: res.survey.title, message: 'Bạn đã gửi phản hồi cho khảo sát này trên thiết bị này. Cảm ơn bạn!' });
        return;
      }
      setResult(res);
    } catch (e) {
      if (accessCode) setCodeErr((e as Error).message); else setLoadErr((e as Error).message);
    }
  }, [slug, token]);

  useEffect(() => { load(); }, [load]);

  const flush = useCallback(async () => {
    if (!session || !pending.current) return;
    const p = pending.current;
    pending.current = null;
    try { await publicApi.save(session.responseId, session.resumeToken, p.answers, p.sectionId); } catch { /* retried on next change */ }
  }, [session]);

  useEffect(() => () => { window.clearTimeout(saveTimer.current); }, []);
  useEffect(() => {
    const h = () => { if (pending.current) flush(); };
    window.addEventListener('pagehide', h);
    return () => window.removeEventListener('pagehide', h);
  }, [flush]);

  if (loadErr) return <Shell><Message icon={<SearchX className="h-10 w-10" />} title="Không tải được khảo sát">{loadErr}<button onClick={() => load()} className="mt-4 block w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white">Thử lại</button></Message></Shell>;
  if (!result && !resumed) return <div className="flex h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>;

  if (result && result.state === 'requires_code') {
    return (
      <Shell survey={{ title: result.title, theme: result.theme, settings: {}, schema: { schemaVersion: 1, sections: [] } }}>
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <KeyRound className="h-9 w-9 survey-primary-text" />
          <h1 className="mt-3 text-xl font-bold">{result.title}</h1>
          <p className="mt-1 text-sm text-muted">Khảo sát yêu cầu mã truy cập do đơn vị tổ chức cung cấp.</p>
          <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); setCodeErr(''); load(code); }}>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Nhập mã truy cập" className="h-11 flex-1 rounded-lg border border-line px-3" autoFocus aria-label="Mã truy cập" />
            <button className="survey-btn h-11 rounded-lg px-5 font-semibold">Tiếp tục</button>
          </form>
          {codeErr && <p className="mt-2 text-sm text-red-600">{codeErr}</p>}
        </div>
      </Shell>
    );
  }
  if (result && result.state !== 'open' && !resumed) {
    const isInv = result.state === 'invalid_invitation';
    return <Shell><Message icon={isInv ? <Lock className="h-10 w-10" /> : <SearchX className="h-10 w-10" />} title={'title' in result && result.title ? result.title : isInv ? 'Không thể truy cập' : 'Khảo sát không khả dụng'}>{result.message}</Message></Shell>;
  }

  const survey = resumed?.survey ?? (result as Extract<GetSurveyResult, { state: 'open' }>).survey;

  const onChange = (answers: Answers, sectionId: string | null) => {
    if (!session) return;
    pending.current = { answers, sectionId };
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 1200);
  };

  const start = async () => {
    const r = await publicApi.start(slug, { token, code: code || undefined });
    const s = { responseId: r.responseId, resumeToken: r.resumeToken, responseCode: r.responseCode };
    setSession(s);
    if (survey.settings.allowResume !== false) ls.set(sessKey(slug), s);
    await publicApi.save(s.responseId, s.resumeToken, {}, survey.schema.sections[0]?.id ?? null);
  };

  const submit = async (answers: Answers) => {
    if (!session) throw new Error('Phiên trả lời chưa được khởi tạo');
    window.clearTimeout(saveTimer.current);
    pending.current = null;
    const r = await publicApi.submit(session.responseId, session.resumeToken, answers);
    ls.del(sessKey(slug));
    ls.set(doneKey(slug), { code: r.responseCode, at: Date.now() });
    navigate(`/s/${slug}/complete`, { replace: true, state: { code: r.responseCode, settings: survey.settings, title: survey.title, theme: survey.theme } });
  };

  const upload = async (questionId: string, file: File) => {
    if (!session) throw new Error('Phiên trả lời chưa được khởi tạo');
    return publicApi.uploadFile(session.responseId, session.resumeToken, questionId, file);
  };

  return (
    <SurveyForm
      survey={survey}
      initialAnswers={resumed?.answers}
      initialSectionId={resumed?.sectionId}
      skipIntro={!!resumed}
      onStart={start}
      onAnswersChange={onChange}
      onSubmit={submit}
      onUpload={upload}
      banner={resumed && session ? <ResumeBanner slug={slug} token={session.resumeToken} onRestart={() => { ls.del(sessKey(slug)); window.location.reload(); }} /> : session && survey.settings.allowResume !== false ? <ResumeHint slug={slug} token={session.resumeToken} /> : null}
      footerNote={<>© KDI Education · Dữ liệu được xử lý theo Nghị định 13/2023/NĐ-CP{isDemo && ' · Chế độ demo'}</>}
    />
  );
}

function ResumeBanner({ slug, token, onRestart }: { slug: string; token: string; onRestart: () => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm">
      <span>Đang tiếp tục phiên trả lời trước của bạn.</span>
      <span className="flex gap-3">
        <CopyResume slug={slug} token={token} />
        <button onClick={onRestart} className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink"><RotateCcw className="h-3.5 w-3.5" />Làm lại từ đầu</button>
      </span>
    </div>
  );
}
function ResumeHint({ slug, token }: { slug: string; token: string }) {
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 px-4 py-2.5 text-sm text-muted ring-1 ring-black/5"><span>Câu trả lời được tự động lưu. Bạn có thể quay lại sau trên thiết bị này hoặc dùng link tiếp tục.</span><CopyResume slug={slug} token={token} /></div>;
}
function CopyResume({ slug, token }: { slug: string; token: string }) {
  const [ok, setOk] = useState(false);
  const url = `${window.location.origin}/s/${slug}/resume?r=${encodeURIComponent(token)}`;
  return (
    <button onClick={async () => { try { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 2000); } catch { window.prompt('Sao chép link tiếp tục:', url); } }}
      className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"><Copy className="h-3.5 w-3.5" />{ok ? 'Đã sao chép' : 'Sao chép link tiếp tục'}</button>
  );
}

function Message({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
      <div className="mx-auto mb-3 flex justify-center text-brand-300">{icon}</div>
      <h1 className="text-xl font-bold">{title}</h1>
      <div className="mt-2 text-muted">{children}</div>
    </div>
  );
}

export function SurveyCompletePage() {
  const { slug = '' } = useParams();
  const { state } = useLocation() as { state?: { code: string; settings: any; title: string; theme: any } };
  const done = state ?? (() => { const d = ls.get<{ code: string }>(doneKey(slug)); return d ? { code: d.code, settings: {}, title: '', theme: {} } : null; })();
  return (
    <Shell survey={done?.title ? { title: done.title, theme: done.theme, settings: done.settings, schema: { schemaVersion: 1, sections: [] } } : undefined}>
      <div className="animate-in rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5 sm:p-10">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        <h1 className="mt-4 text-2xl font-bold survey-primary-text">{done?.settings?.completionTitle || 'Cảm ơn bạn đã hoàn thành khảo sát!'}</h1>
        <p className="prose-vi mt-3 whitespace-pre-line text-slate-700">{done?.settings?.completionText || 'Phản hồi của bạn đã được ghi nhận thành công.'}</p>
        {done?.code && <p className="mt-6 inline-block rounded-lg bg-slate-100 px-4 py-2 text-sm">Mã phản hồi: <b className="font-mono tracking-wide">{done.code}</b></p>}
        {done?.settings?.contactInfo && <p className="mt-6 whitespace-pre-line text-sm text-muted">{done.settings.contactInfo}</p>}
      </div>
    </Shell>
  );
}

export function SurveyResumePage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [tok, setTok] = useState(params.get('r') ?? '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (t: string) => {
    setBusy(true); setErr('');
    try {
      const r = await publicApi.resume(slug, t.trim());
      ls.set(sessKey(slug), { responseId: r.responseId, resumeToken: t.trim(), responseCode: r.responseCode });
      navigate(`/s/${slug}`, { replace: true });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { if (params.get('r')) go(params.get('r')!); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Shell>
      <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/5">
        <h1 className="text-xl font-bold">Tiếp tục khảo sát</h1>
        <p className="mt-1 text-sm text-muted">Dán link hoặc mã tiếp tục bạn đã lưu.</p>
        <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); const m = tok.match(/[?&]r=([^&]+)/); go(m ? decodeURIComponent(m[1]) : tok); }}>
          <input value={tok} onChange={(e) => setTok(e.target.value)} className="h-11 flex-1 rounded-lg border border-line px-3 font-mono text-sm" placeholder="Mã tiếp tục" aria-label="Mã tiếp tục" />
          <button disabled={busy || !tok} className="h-11 rounded-lg bg-brand-600 px-5 font-semibold text-white disabled:opacity-50">Tiếp tục</button>
        </form>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <Link to={`/s/${slug}`} className="mt-6 inline-block text-sm text-brand-700 hover:underline">← Bắt đầu phiên mới</Link>
      </div>
    </Shell>
  );
}
