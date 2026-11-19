import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, BookmarkPlus, Check, Heading, Loader2, Plus, Redo2, Undo2, Upload } from 'lucide-react';
import {
  createQuestion, getType, isInputQuestion, lintSchema, uid,
  type Question, type QuestionType, type Section, type SurveySchema,
} from '@core/index.ts';
import { api } from '@/data';
import { Badge, Button, Field, Input, Modal, Textarea, cn, useToast } from '@/components/ui';
import { useSurvey } from './SurveyLayout';
import * as ops from './builder/schemaOps';
import { BlockCard, ICONS, QuestionCard, SectionRow, changeType } from './builder/QuestionCard';
import { ImportPanel } from '../ImportPanel';
import { rowWarning, rowsToSections, type ImportRow } from '@/lib/importQuestions';

/** Danh sách phẳng theo thứ tự hiển thị: phần, rồi các câu / khối trong phần. */
type Item = { kind: 'section'; id: string; section: Section; si: number } | { kind: 'q'; id: string; q: Question; si: number };

function flatten(schema: SurveySchema): Item[] {
  return schema.sections.flatMap((section, si) => [
    { kind: 'section' as const, id: section.id, section, si },
    ...section.questions.map((q) => ({ kind: 'q' as const, id: q.id, q, si })),
  ]);
}

/** Dựng lại schema từ danh sách id phẳng: câu nằm sau phần nào thì thuộc phần đó. */
function rebuild(schema: SurveySchema, ids: string[], extra: Section[] = []): SurveySchema {
  const secs = new Map([...schema.sections, ...extra].map((s) => [s.id, s]));
  const qs = new Map(schema.sections.flatMap((s) => s.questions).map((q) => [q.id, q]));
  const out: Section[] = [];
  const orphan: Question[] = [];
  for (const id of ids) {
    const sec = secs.get(id);
    if (sec) { out.push({ ...sec, questions: [] }); continue; }
    const q = qs.get(id);
    if (q) (out.length ? out[out.length - 1].questions : orphan).push(q);
  }
  if (orphan.length) { if (out.length) out[0].questions.unshift(...orphan); else out.push({ id: uid('s'), title: 'Phần 1', questions: orphan }); }
  return { ...schema, sections: out };
}

function cloneQuestion(src: Question, codes: string[]): Question {
  const copy: Question = JSON.parse(JSON.stringify(src));
  copy.id = uid('q');
  let n = 2;
  let code = `${src.code}_${n}`;
  while (codes.includes(code)) code = `${src.code}_${++n}`;
  copy.code = code;
  codes.push(code);
  copy.options = copy.options?.map((o) => ({ ...o, id: uid('opt') }));
  copy.rows = copy.rows?.map((o) => ({ ...o, id: uid('row') }));
  return copy;
}

const strip = (id: string) => id.replace(/^[co]:/, '');
/** chỉ va chạm với mục cùng danh sách (mục lục với mục lục, thẻ với thẻ) */
const sameList: CollisionDetection = (args) => {
  const p = String(args.active.id).slice(0, 2);
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith(p)) });
};

export default function BuilderPage() {
  const { survey, versions, setSurvey, canEdit } = useSurvey();
  const toast = useToast();
  const [schema, setSchemaRaw] = useState<SurveySchema>(survey.draftSchema);
  const [past, setPast] = useState<SurveySchema[]>([]);
  const [future, setFuture] = useState<SurveySchema[]>([]);
  const lastPush = useRef(0);
  const [focus, setFocus] = useState<string | null>(() => survey.draftSchema.sections[0]?.id ?? null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [dragging, setDragging] = useState<string | null>(null);
  const [saveTpl, setSaveTpl] = useState(false);
  const saveTimer = useRef<number>();

  // ── history-aware setter (typing within 700ms coalesces into one undo step)
  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  const lastKey = useRef<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const setSchema = useCallback((updater: (s: SurveySchema) => SurveySchema, coalesceKey?: string) => {
    const prev = schemaRef.current;
    const next = updater(prev);
    if (next === prev) return;
    const now = Date.now();
    if (!coalesceKey || coalesceKey !== lastKey.current || now - lastPush.current > 700) { setPast((p) => [...p.slice(-60), prev]); setFuture([]); }
    lastPush.current = now;
    lastKey.current = coalesceKey ?? null;
    schemaRef.current = next;
    setSchemaRaw(next);
    setSaveState('dirty');
  }, []);
  const undo = () => { if (!past.length) return; setFuture((f) => [schema, ...f]); schemaRef.current = past[past.length - 1]; setSchemaRaw(past[past.length - 1]); setPast((p) => p.slice(0, -1)); lastKey.current = null; setSaveState('dirty'); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, schema]); schemaRef.current = future[0]; setSchemaRaw(future[0]); setFuture((f) => f.slice(1)); lastKey.current = null; setSaveState('dirty'); };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  // ── autosave
  useEffect(() => {
    if (saveState !== 'dirty' || !canEdit) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        await api.updateSurvey(survey.id, { draftSchema: schema });
        setSurvey({ ...survey, draftSchema: schema, hasUnpublishedChanges: true });
        setSaveState('saved');
      } catch (e) { setSaveState('error'); toast((e as Error).message, 'error'); }
    }, 900);
    return () => window.clearTimeout(saveTimer.current);
  }, [schema, saveState]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (saveState === 'dirty' || saveState === 'saving') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [saveState]);

  // ── codes already used by published versions (protect historical meaning)
  const locked = useMemo(() => {
    const qCodes = new Set<string>();
    const opt = new Map<string, Set<string>>();
    const rows = new Map<string, Set<string>>();
    for (const v of versions) for (const s of v.schema.sections) for (const q of s.questions) {
      if (!isInputQuestion(q)) continue;
      qCodes.add(q.code);
      if (!opt.has(q.code)) opt.set(q.code, new Set());
      if (!rows.has(q.code)) rows.set(q.code, new Set());
      q.options?.forEach((o) => opt.get(q.code)!.add(o.code));
      q.rows?.forEach((o) => rows.get(q.code)!.add(o.code));
    }
    return { qCodes, opt, rows };
  }, [versions]);
  const empty = useMemo(() => new Set<string>(), []);

  const issues = useMemo(() => lintSchema(schema), [schema]);
  const issueBy = useMemo(() => { const m = new Map<string, string[]>(); for (const i of issues) m.set(i.questionId, [...(m.get(i.questionId) ?? []), i.message]); return m; }, [issues]);
  const items = useMemo(() => flatten(schema), [schema]);
  const numbers = useMemo(() => { const m = new Map<string, number>(); let n = 0; for (const it of items) if (it.kind === 'q' && isInputQuestion(it.q)) m.set(it.id, ++n); return m; }, [items]);
  const nInput = numbers.size;

  const scrollTo = (id: string) => requestAnimationFrame(() => document.getElementById(`qc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));

  // ── thêm sau mục đang chọn
  const insertAfterFocus = (s: SurveySchema, q: Question, atEnd?: boolean): SurveySchema => {
    if (!s.sections.length) { const r = ops.addSection(s); s = r.schema; }
    if (!atEnd && focus) {
      const loc = ops.locate(s, focus);
      if (loc) return ops.insertQuestion(s, s.sections[loc.si].id, loc.qi + 1, q);
      if (s.sections.some((x) => x.id === focus)) return ops.insertQuestion(s, focus, 0, q);
    }
    const last = s.sections[s.sections.length - 1];
    return ops.insertQuestion(s, last.id, last.questions.length, q);
  };
  const add = (type: QuestionType, atEnd?: boolean) => {
    if (!canEdit) return;
    const q = createQuestion(type, ops.allCodes(schema));
    setSchema((s) => insertAfterFocus(s, q, atEnd));
    setFocus(q.id);
    scrollTo(q.id);
  };
  const addSection = () => {
    if (!canEdit) return;
    const sec: Section = { id: uid('s'), title: `Phần ${schema.sections.length + 1}`, questions: [] };
    setSchema((s) => {
      const ids = flatten(s).map((x) => x.id);
      const at = focus ? ids.indexOf(focus) : -1;
      ids.splice(at < 0 ? ids.length : at + 1, 0, sec.id);
      return rebuild(s, ids, [sec]);
    });
    setFocus(sec.id);
    scrollTo(sec.id);
  };
  const dupQuestion = (id: string) => { const r = ops.duplicateQuestion(schema, id, ops.allCodes(schema)); setSchema(() => r.schema); setFocus(r.newId); scrollTo(r.newId); };
  const delQuestion = (q: Question) => {
    if (isInputQuestion(q) && locked.qCodes.has(q.code) && !confirm(`Câu "${q.title}" đã có trong phiên bản đã xuất bản. Xóa khỏi bản nháp? Dữ liệu cũ vẫn giữ nguyên.`)) return;
    const ids = items.map((x) => x.id); const i = ids.indexOf(q.id);
    setSchema((s) => ops.removeQuestion(s, q.id)); setFocus(ids[i - 1] ?? null);
  };
  const dupSection = (sec: Section) => {
    const codes = ops.allCodes(schema);
    const copy: Section = { ...JSON.parse(JSON.stringify(sec)), id: uid('s'), title: `${sec.title} (bản sao)`, questions: sec.questions.map((q) => cloneQuestion(q, codes)) };
    setSchema((s) => { const i = s.sections.findIndex((x) => x.id === sec.id); const sections = [...s.sections]; sections.splice(i + 1, 0, copy); return { ...s, sections }; });
    setFocus(copy.id); scrollTo(copy.id);
  };
  const delSection = (sec: Section) => {
    if (sec.questions.length && !confirm(`Xóa phần "${sec.title}" và ${sec.questions.length} mục bên trong?`)) return;
    setSchema((s) => ops.removeSection(s, sec.id)); setFocus(null);
  };

  // ── kéo thả (mục lục và thẻ dùng chung một danh sách)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragStart = (e: DragStartEvent) => setDragging(strip(String(e.active.id)));
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (!e.over || !canEdit) return;
    const a = strip(String(e.active.id));
    const o = strip(String(e.over.id));
    if (a === o) return;
    const isSec = schema.sections.some((s) => s.id === a);
    if (isSec) {
      // kéo một phần: chuyển cả phần (kèm câu bên trong) tới vị trí phần chứa mục đích
      const from = schema.sections.findIndex((s) => s.id === a);
      const target = items.find((x) => x.id === o);
      if (!target) return;
      setSchema((s) => ({ ...s, sections: arrayMove(s.sections, from, target.si) }));
    } else {
      const ids = items.map((x) => x.id);
      const next = arrayMove(ids, ids.indexOf(a), ids.indexOf(o));
      setSchema((s) => rebuild(s, next));
    }
    setFocus(a);
  };

  const dragItem = dragging ? items.find((x) => x.id === dragging) : undefined;
  const label = (it: Item) => (it.kind === 'section' ? it.section.title || 'Chưa đặt tên' : it.q.title || getType(it.q.type).label);

  const tb = (icon: typeof Plus, text: string, onClick: () => void) => {
    const I = icon;
    return <button type="button" onClick={onClick} disabled={!canEdit} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[13px] font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40"><I className="h-4 w-4" />{text}</button>;
  };

  return (
    <DndContext sensors={sensors} collisionDetection={sameList} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid h-[calc(100vh-140px)] min-h-[560px] grid-rows-[minmax(0,1fr)] gap-3.5 bg-surface px-3 py-3 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] sm:px-5">
        {/* TRÁI — mục lục */}
        <nav aria-label="Mục lục câu hỏi" className="thin-scroll hidden overflow-y-auto overscroll-contain rounded-md border border-line bg-white p-2 md:block">
          <SortableContext items={items.map((x) => `o:${x.id}`)} strategy={verticalListSortingStrategy}>
            {items.map((it) => (
              <OutlineRow key={it.id} it={it} n={numbers.get(it.id)} on={focus === it.id} canEdit={canEdit} text={label(it)} warn={issueBy.has(it.id)}
                onClick={() => { setFocus(it.id); scrollTo(it.id); }} />
            ))}
          </SortableContext>
          {!items.length && <p className="px-2 py-6 text-center text-sm text-muted">Chưa có câu hỏi nào.</p>}
          <div className="mt-2 grid gap-1.5 border-t border-line p-2 pt-3">
            <span className="text-xs text-muted">Kéo thả để đổi thứ tự. Số câu tự đánh lại.</span>
            <Button variant="outline" size="sm" onClick={() => setImporting(true)}><Upload className="h-4 w-4" />Nhập thêm từ file</Button>
          </div>
        </nav>

        {/* PHẢI — toàn bộ câu hỏi, sửa trực tiếp */}
        <div className="thin-scroll min-w-0 overflow-y-auto overscroll-contain" id="builder-pane">
          <div role="toolbar" aria-label="Thêm vào khảo sát" className="sticky top-0 z-30 mb-2.5 flex flex-wrap items-center gap-1 rounded-md border border-line bg-white/95 px-2.5 py-1.5 shadow-sm backdrop-blur">
            <span className="mr-1 text-[12.5px] text-muted">Thêm sau mục đang chọn:</span>
            {tb(Plus, 'Câu hỏi', () => add('single_choice'))}
            {tb(Heading, 'Phần mới', addSection)}
            <span className="mx-1 h-5 w-px bg-line" />
            {tb(ICONS.instruction, 'Đoạn hướng dẫn', () => add('instruction'))}
            {tb(ICONS.image, 'Hình ảnh', () => add('image'))}
            {tb(ICONS.video, 'Video', () => add('video'))}
            {tb(ICONS.link, 'Liên kết', () => add('link'))}
            <div className="ml-auto flex items-center gap-1">
              {issues.length > 0 && <Badge tone="red"><AlertTriangle className="h-3 w-3" />{issues.length} lỗi cấu hình</Badge>}
              <span className="px-1 text-xs text-muted">
                {saveState === 'saving' ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Đang lưu…</span>
                  : saveState === 'dirty' ? 'Chưa lưu' : saveState === 'error' ? <span className="text-red-600">Lỗi lưu</span>
                  : <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" />Đã lưu nháp</span>}
              </span>
              <Button size="icon" variant="ghost" onClick={undo} disabled={!past.length} title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác"><Undo2 className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={redo} disabled={!future.length} title="Làm lại (Ctrl+Shift+Z)" aria-label="Làm lại"><Redo2 className="h-4 w-4" /></Button>
              {canEdit && <Button size="icon" variant="ghost" onClick={() => setSaveTpl(true)} title="Lưu thành mẫu" aria-label="Lưu thành mẫu"><BookmarkPlus className="h-4 w-4" /></Button>}
            </div>
          </div>

          <SortableContext items={items.map((x) => `c:${x.id}`)} strategy={verticalListSortingStrategy}>
            <div className="grid content-start gap-2.5">
              {items.map((it) => it.kind === 'section' ? (
                <SectionRow key={it.id} section={it.section} idx={it.si} schema={schema} focused={focus === it.id} canEdit={canEdit} onFocus={() => setFocus(it.id)}
                  onChange={(p, k) => setSchema((s) => ops.updateSection(s, it.id, p), `s:${it.id}:${k ?? Object.keys(p).join()}`)}
                  onDup={() => dupSection(it.section)} onDel={() => delSection(it.section)} />
              ) : isInputQuestion(it.q) ? (
                <QuestionCard key={it.id} q={it.q} n={numbers.get(it.id) ?? 0} schema={schema} focused={focus === it.id} canEdit={canEdit} issues={issueBy.get(it.id)}
                  lockedOptions={locked.opt.get(it.q.code) ?? empty} lockedRows={locked.rows.get(it.q.code) ?? empty} codeLocked={locked.qCodes.has(it.q.code)}
                  onFocus={() => setFocus(it.id)}
                  onChange={(p, k) => setSchema((s) => ops.updateQuestion(s, it.id, p), `q:${it.id}:${k ?? Object.keys(p).join()}`)}
                  onType={(t) => setSchema((s) => ops.updateQuestion(s, it.id, (q) => changeType(q, t, ops.allCodes(s))))}
                  onDup={() => dupQuestion(it.id)} onDel={() => delQuestion(it.q)} />
              ) : (
                <BlockCard key={it.id} q={it.q} schema={schema} focused={focus === it.id} canEdit={canEdit} onFocus={() => setFocus(it.id)}
                  onChange={(p, k) => setSchema((s) => ops.updateQuestion(s, it.id, p), `q:${it.id}:${k ?? Object.keys(p).join()}`)}
                  onDup={() => dupQuestion(it.id)} onDel={() => delQuestion(it.q)} />
              ))}
            </div>
          </SortableContext>
          {canEdit && (
            <button type="button" onClick={() => add('single_choice', true)} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-white py-2.5 text-sm font-medium text-brand-700 hover:border-brand-400 hover:bg-brand-50">
              <Plus className="h-4 w-4" />Thêm câu hỏi vào cuối
            </button>
          )}
          <p className="py-3 text-center text-xs text-muted">{nInput} câu hỏi · {schema.sections.length} phần</p>
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{dragItem && <div className="max-w-xs truncate rounded-md border border-brand-300 bg-white px-3 py-2 text-sm font-medium shadow-lg">{label(dragItem)}</div>}</DragOverlay>
      <Modal open={importing} onClose={() => { setImporting(false); setImportRows(null); }} title="Nhập thêm câu hỏi từ file" size="xl"
        footer={<><Button variant="outline" onClick={() => { setImporting(false); setImportRows(null); }}>Hủy</Button><Button disabled={!importRows || importRows.some((r) => rowWarning(r))} onClick={() => {
          if (!importRows) return;
          setSchema((s) => { const add = rowsToSections(importRows, ops.allCodes(s), 'Phần nhập từ file'); return { ...s, sections: [...s.sections, ...add] }; });
          toast(`Đã thêm ${importRows.filter((r) => r.kind === 'q').length} câu vào cuối bảng hỏi`);
          setImporting(false); setImportRows(null);
        }}>Thêm vào cuối bảng hỏi</Button></>}>
        <ImportPanel rows={importRows} onRows={setImportRows} />
      </Modal>
      {saveTpl && <SaveTemplateModal schema={schema} onClose={() => setSaveTpl(false)} />}
    </DndContext>
  );
}

function OutlineRow({ it, n, on, canEdit, text, warn, onClick }: { it: Item; n?: number; on: boolean; canEdit: boolean; text: string; warn: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `o:${it.id}`, disabled: !canEdit });
  const style = { transform: CSS.Translate.toString(transform), transition };
  if (it.kind === 'section') {
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick} title="Kéo để đổi vị trí"
        className={cn('cursor-pointer truncate rounded px-2 pb-1 pt-2.5 text-xs font-bold uppercase tracking-wider text-muted hover:text-brand-700', on && 'text-brand-700', isDragging && 'opacity-50', canEdit && 'cursor-grab active:cursor-grabbing')}>
        {text}
      </div>
    );
  }
  const Icon = ICONS[it.q.type];
  const input = isInputQuestion(it.q);
  return (
    <button ref={setNodeRef} style={style} {...attributes} {...listeners} type="button" onClick={onClick}
      className={cn('flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface', on && 'bg-brand-50 font-semibold text-brand-700', isDragging && 'opacity-50', canEdit && 'active:cursor-grabbing')}>
      <span className="w-6 shrink-0 tabular-nums text-muted">{input ? `${n}.` : <Icon className="mt-0.5 h-3.5 w-3.5" />}</span>
      <span className={cn('min-w-0 flex-1 line-clamp-2', !input && 'text-muted')}>{text}</span>
      {warn && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />}
    </button>
  );
}

function SaveTemplateModal({ schema, onClose }: { schema: SurveySchema; onClose: () => void }) {
  const { survey } = useSurvey();
  const toast = useToast();
  const [title, setTitle] = useState(survey.title);
  const [desc, setDesc] = useState(survey.description ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.saveTemplate({ title, description: desc, category: survey.category, schema, theme: survey.theme, settings: { ...survey.settings, access: { mode: 'public' } } }); toast('Đã lưu vào thư viện mẫu'); onClose(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Lưu thành mẫu" footer={<><Button variant="outline" onClick={onClose}>Hủy</Button><Button onClick={save} loading={busy}>Lưu mẫu</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-muted">Mẫu lưu cấu trúc, giao diện và cài đặt (không gồm mã truy cập). Khảo sát tạo từ mẫu là bản sao độc lập.</p>
        <Field label="Tên mẫu"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Mô tả"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
