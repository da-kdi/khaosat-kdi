import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, Copy, GitBranch, GripVertical, Loader2, Plus, Redo2, Search, Trash2, Undo2,
  Type, AlignLeft, Mail, Phone, Link2, Hash, Banknote, Percent, Calendar, Clock, CalendarClock, CircleDot, CheckSquare, ChevronDownSquare,
  ToggleLeft, Star, SlidersHorizontal, Gauge, ListOrdered, Grid3x3, Calculator, LayoutGrid, MapPin, Contact, Paperclip, ShieldCheck,
  Heading, Pilcrow, Info, Image, Video, ExternalLink, Minus, BookmarkPlus,
} from 'lucide-react';
import {
  GROUP_LABELS, createQuestion, getType, isInputQuestion, lintSchema, typeList,
  type Question, type QuestionType, type SurveySchema,
} from '@core/index.ts';
import { api } from '@/data';
import { Badge, Button, Field, Input, Modal, Textarea, cn, useToast } from '@/components/ui';
import { ContentBlock, QuestionInput } from '@/survey/fields';
import { themeStyle } from '@/survey/theme';
import { useSurvey } from './SurveyLayout';
import { QuestionInspector, SectionInspector } from './builder/Inspector';
import { describeLogic } from './builder/LogicEditor';
import * as ops from './builder/schemaOps';

const ICONS: Record<QuestionType, typeof Type> = {
  short_text: Type, long_text: AlignLeft, email: Mail, phone: Phone, url: Link2, number: Hash, currency: Banknote, percentage: Percent,
  date: Calendar, time: Clock, datetime: CalendarClock, single_choice: CircleDot, multiple_choice: CheckSquare, dropdown: ChevronDownSquare,
  yes_no: ToggleLeft, rating: Star, likert: SlidersHorizontal, nps: Gauge, ranking: ListOrdered, matrix: Grid3x3,
  quantity_by_group: Calculator, category_level: LayoutGrid, address: MapPin, contact: Contact, file_upload: Paperclip, consent: ShieldCheck,
  heading: Heading, paragraph: Pilcrow, instruction: Info, image: Image, video: Video, link: ExternalLink, divider: Minus,
};

type Selection = { kind: 'question' | 'section'; id: string } | null;

function useMedia(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const h = () => setM(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, [q]);
  return m;
}

export default function BuilderPage() {
  const { survey, versions, setSurvey, canEdit } = useSurvey();
  const toast = useToast();
  const [schema, setSchemaRaw] = useState<SurveySchema>(survey.draftSchema);
  const [past, setPast] = useState<SurveySchema[]>([]);
  const [future, setFuture] = useState<SurveySchema[]>([]);
  const lastPush = useRef(0);
  const [sel, setSel] = useState<Selection>(() => (survey.draftSchema.sections[0] ? { kind: 'section', id: survey.draftSchema.sections[0].id } : null));
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saveTpl, setSaveTpl] = useState(false);
  const wide = useMedia('(min-width: 1180px)');
  const saveTimer = useRef<number>();

  // ── history-aware setter (typing within 700ms coalesces into one undo step)
  // keep the latest schema in a ref so updates are computed synchronously (no side effects inside state updaters)
  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  const lastKey = useRef<string | null>(null);
  /** coalesceKey: consecutive edits to the same item within 700ms become one undo step */
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
  const undo = () => { if (!past.length) return; setFuture((f) => [schema, ...f]); schemaRef.current = past[past.length - 1]; setSchemaRaw(past[past.length - 1]); setPast((p) => p.slice(0, -1)); setSaveState('dirty'); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, schema]); schemaRef.current = future[0]; setSchemaRaw(future[0]); setFuture((f) => f.slice(1)); setSaveState('dirty'); };

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

  const issues = useMemo(() => lintSchema(schema), [schema]);
  const issueBy = useMemo(() => { const m = new Map<string, string[]>(); for (const i of issues) m.set(i.questionId, [...(m.get(i.questionId) ?? []), i.message]); return m; }, [issues]);
  const allQs = schema.sections.flatMap((s) => s.questions);

  // ── add / move
  const addQuestion = (type: QuestionType, sectionId?: string, index?: number) => {
    if (!canEdit) return;
    const q = createQuestion(type, ops.allCodes(schema));
    setSchema((s) => {
      let target = sectionId;
      let idx = index;
      if (!target) {
        if (sel?.kind === 'question') { const loc = ops.locate(s, sel.id); if (loc) { target = s.sections[loc.si].id; idx = loc.qi + 1; } }
        else if (sel?.kind === 'section') target = sel.id;
        target ??= s.sections[s.sections.length - 1]?.id;
      }
      if (!target) { const r = ops.addSection(s); s = r.schema; target = r.id; }
      return ops.insertQuestion(s, target, idx ?? Number.MAX_SAFE_INTEGER, q);
    });
    setSel({ kind: 'question', id: q.id });
    setPaletteOpen(false);
    requestAnimationFrame(() => document.getElementById(`bq-${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setDragLabel(id.startsWith('new:') ? getType(id.slice(4) as QuestionType).label : allQs.find((q) => q.id === id)?.title ?? '');
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragLabel(null);
    const { active, over } = e;
    if (!over || !canEdit) return;
    const a = String(active.id);
    const o = String(over.id);
    let sectionId: string;
    let index: number;
    if (o.startsWith('sec:')) {
      sectionId = o.slice(4);
      index = schema.sections.find((s) => s.id === sectionId)?.questions.length ?? 0;
    } else {
      const loc = ops.locate(schema, o);
      if (!loc) return;
      sectionId = schema.sections[loc.si].id;
      const from = ops.locate(schema, a);
      index = from && from.si === loc.si && from.qi < loc.qi ? loc.qi + 1 : loc.qi;
    }
    if (a.startsWith('new:')) addQuestion(a.slice(4) as QuestionType, sectionId, index);
    else if (a !== o) setSchema((s) => ops.moveQuestion(s, a, sectionId, index));
  };

  const selectedQ = sel?.kind === 'question' ? allQs.find((q) => q.id === sel.id) : undefined;
  const selectedS = sel?.kind === 'section' ? schema.sections.find((s) => s.id === sel.id) : undefined;

  const inspector = selectedQ ? (
    <QuestionInspector key={selectedQ.id} q={selectedQ} schema={schema} disabled={!canEdit}
      onChange={(p) => setSchema((s) => ops.updateQuestion(s, selectedQ.id, p), `q:${selectedQ.id}:${Object.keys(p).join()}`)}
      lockedCodes={{ options: locked.opt.get(selectedQ.code) ?? new Set(), rows: locked.rows.get(selectedQ.code) ?? new Set() }}
      publishedQuestionCodes={locked.qCodes} />
  ) : selectedS ? (
    <SectionInspector key={selectedS.id} section={selectedS} schema={schema} disabled={!canEdit} onChange={(p) => setSchema((s) => ops.updateSection(s, selectedS.id, p), `s:${selectedS.id}:${Object.keys(p).join()}`)} />
  ) : <p className="py-10 text-center text-sm text-muted">Chọn một câu hỏi hoặc phần để cấu hình.</p>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex h-[calc(100vh-113px)] min-h-[560px]">
        {/* LEFT — palette & outline */}
        {wide && (
          <aside className="thin-scroll w-60 shrink-0 overflow-y-auto border-r border-line bg-white p-3">
            <Palette onAdd={(t) => addQuestion(t)} disabled={!canEdit} />
          </aside>
        )}

        {/* CENTER — canvas */}
        <div className="thin-scroll min-w-0 flex-1 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-white/95 px-4 py-2 backdrop-blur">
            {!wide && canEdit && <Button size="sm" onClick={() => setPaletteOpen(true)}><Plus className="h-4 w-4" />Thêm</Button>}
            <Button size="icon" variant="ghost" onClick={undo} disabled={!past.length} title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác"><Undo2 className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={redo} disabled={!future.length} title="Làm lại (Ctrl+Shift+Z)" aria-label="Làm lại"><Redo2 className="h-4 w-4" /></Button>
            <span className="text-xs text-muted">
              {saveState === 'saving' ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Đang lưu…</span>
                : saveState === 'dirty' ? 'Chưa lưu' : saveState === 'error' ? <span className="text-red-600">Lỗi lưu</span>
                : <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" />Đã lưu bản nháp</span>}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {issues.length > 0 && <Badge tone="red"><AlertTriangle className="h-3 w-3" />{issues.length} lỗi cấu hình</Badge>}
              <span className="hidden text-xs text-muted sm:inline">{allQs.filter(isInputQuestion).length} câu hỏi · {schema.sections.length} phần</span>
              {canEdit && <Button size="sm" variant="ghost" onClick={() => setSaveTpl(true)} title="Lưu thành mẫu"><BookmarkPlus className="h-4 w-4" /></Button>}
            </div>
          </div>

          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6" style={themeStyle(survey.theme)}>
            {schema.sections.map((sec, si) => (
              <SectionBlock key={sec.id} sectionId={sec.id} selected={sel?.kind === 'section' && sel.id === sec.id}
                header={
                  <div className="flex items-start gap-2" onClick={() => setSel({ kind: 'section', id: sec.id })}>
                    <div className="min-w-0 flex-1 cursor-pointer">
                      <p className="text-xs font-semibold uppercase tracking-wide text-accent-600">Phần {si + 1}/{schema.sections.length}</p>
                      <h3 className="text-lg font-bold text-brand-700">{sec.title || 'Chưa đặt tên'}</h3>
                      {sec.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{sec.description}</p>}
                      {sec.logic?.visibleIf?.rules.length ? <p className="mt-1 inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-700"><GitBranch className="h-3 w-3" />Hiện khi: {describeLogic(sec.logic.visibleIf, allQs)}</p> : null}
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 gap-0.5">
                        <IconBtn onClick={() => setSchema((s) => ops.moveSection(s, sec.id, -1))} disabled={si === 0} label="Lên"><ArrowUp className="h-4 w-4" /></IconBtn>
                        <IconBtn onClick={() => setSchema((s) => ops.moveSection(s, sec.id, 1))} disabled={si === schema.sections.length - 1} label="Xuống"><ArrowDown className="h-4 w-4" /></IconBtn>
                        <IconBtn danger onClick={() => { if (sec.questions.length && !confirm(`Xóa phần "${sec.title}" và ${sec.questions.length} câu hỏi bên trong?`)) return; setSchema((s) => ops.removeSection(s, sec.id)); setSel(null); }} label="Xóa phần"><Trash2 className="h-4 w-4" /></IconBtn>
                      </div>
                    )}
                  </div>
                }>
                <SortableContext items={sec.questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                  {sec.questions.map((q, qi) => (
                    <SortableQuestion key={q.id} q={q} selected={sel?.kind === 'question' && sel.id === q.id} canEdit={canEdit} issues={issueBy.get(q.id)}
                      logicText={describeLogic(q.logic?.visibleIf, allQs)}
                      onSelect={() => setSel({ kind: 'question', id: q.id })}
                      onDuplicate={() => { const r = ops.duplicateQuestion(schema, q.id, ops.allCodes(schema)); setSchema(() => r.schema); setSel({ kind: 'question', id: r.newId }); }}
                      onDelete={() => { setSchema((s) => ops.removeQuestion(s, q.id)); setSel({ kind: 'section', id: sec.id }); }}
                      onMove={(d) => {
                        const target = qi + d;
                        if (target < 0 && si > 0) setSchema((s) => ops.moveQuestion(s, q.id, schema.sections[si - 1].id, schema.sections[si - 1].questions.length));
                        else if (target >= sec.questions.length && si < schema.sections.length - 1) setSchema((s) => ops.moveQuestion(s, q.id, schema.sections[si + 1].id, 0));
                        else if (target >= 0 && target < sec.questions.length) setSchema((s) => ops.moveQuestion(s, q.id, sec.id, d > 0 ? target + 1 : target));
                      }} />
                  ))}
                </SortableContext>
                {!sec.questions.length && <p className="rounded-xl border-2 border-dashed border-line py-8 text-center text-sm text-muted">Kéo câu hỏi từ thanh bên trái vào đây{!wide && ' hoặc bấm "Thêm"'}</p>}
                {canEdit && <button onClick={() => { setSel({ kind: 'section', id: sec.id }); wide ? addQuestion('short_text', sec.id) : setPaletteOpen(true); }} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2 text-sm text-muted transition hover:border-brand-300 hover:text-brand-700"><Plus className="h-4 w-4" />Thêm câu hỏi vào phần này</button>}
              </SectionBlock>
            ))}
            {canEdit && <Button variant="outline" className="w-full border-dashed" onClick={() => { const r = ops.addSection(schema); setSchema(() => r.schema); setSel({ kind: 'section', id: r.id }); }}><Plus className="h-4 w-4" />Thêm phần mới</Button>}
          </div>
        </div>

        {/* RIGHT — inspector */}
        {wide ? (
          <aside className="thin-scroll w-[360px] shrink-0 overflow-y-auto border-l border-line bg-white p-4">{inspector}</aside>
        ) : (
          <Modal open={!!sel} onClose={() => setSel(null)} title={selectedQ ? 'Cấu hình câu hỏi' : 'Cấu hình phần'}>{inspector}</Modal>
        )}
      </div>
      <DragOverlay dropAnimation={null}>{dragLabel && <div className="rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm font-medium shadow-lg">{dragLabel}</div>}</DragOverlay>
      <Modal open={paletteOpen} onClose={() => setPaletteOpen(false)} title="Thêm câu hỏi / nội dung" size="lg"><Palette onAdd={(t) => addQuestion(t)} grid /></Modal>
      {saveTpl && <SaveTemplateModal schema={schema} onClose={() => setSaveTpl(false)} />}
    </DndContext>
  );
}

function IconBtn({ children, onClick, disabled, label, danger }: { children: ReactNode; onClick: () => void; disabled?: boolean; label: string; danger?: boolean }) {
  return <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled} aria-label={label} title={label}
    className={cn('rounded-md p-1.5 text-muted transition disabled:opacity-25', danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-slate-100 hover:text-ink')}>{children}</button>;
}

function Palette({ onAdd, disabled, grid }: { onAdd: (t: QuestionType) => void; disabled?: boolean; grid?: boolean }) {
  const [q, setQ] = useState('');
  const groups = (['text', 'choice', 'structured', 'content'] as const).map((g) => ({ g, items: typeList.filter((t) => t.group === g && (!q || t.label.toLowerCase().includes(q.toLowerCase()))) }));
  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input className="h-9 pl-8" placeholder="Tìm loại câu hỏi…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {groups.filter((g) => g.items.length).map(({ g, items }) => (
        <div key={g} className="mb-4">
          <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{GROUP_LABELS[g]}</p>
          <div className={cn(grid ? 'grid grid-cols-2 gap-1.5 sm:grid-cols-3' : 'space-y-0.5')}>
            {items.map((t) => <PaletteItem key={t.type} type={t.type} label={t.label} onAdd={onAdd} disabled={disabled} draggable={!grid} />)}
          </div>
        </div>
      ))}
      {!grid && <p className="mt-2 px-1 text-xs text-muted">Kéo vào canvas hoặc bấm để thêm sau mục đang chọn.</p>}
    </div>
  );
}

function PaletteItem({ type, label, onAdd, disabled, draggable }: { type: QuestionType; label: string; onAdd: (t: QuestionType) => void; disabled?: boolean; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `new:${type}`, disabled: disabled || !draggable });
  const Icon = ICONS[type];
  return (
    <button ref={setNodeRef} type="button" onClick={() => onAdd(type)} disabled={disabled} {...(draggable ? listeners : {})} {...(draggable ? attributes : {})}
      className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 transition hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40', isDragging && 'opacity-40', draggable && 'cursor-grab active:cursor-grabbing')}>
      <Icon className="h-4 w-4 shrink-0 text-brand-500" />{label}
    </button>
  );
}

function SectionBlock({ sectionId, header, children, selected }: { sectionId: string; header: ReactNode; children: ReactNode; selected: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `sec:${sectionId}` });
  return (
    <section ref={setNodeRef} className={cn('rounded-2xl border bg-white/60 p-4 transition', selected ? 'border-accent-400 ring-1 ring-accent-400' : 'border-line', isOver && 'bg-brand-50/60')}>
      <div className="mb-3">{header}</div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function SortableQuestion({ q, selected, onSelect, onDuplicate, onDelete, onMove, canEdit, issues, logicText }: {
  q: Question; selected: boolean; onSelect: () => void; onDuplicate: () => void; onDelete: () => void; onMove: (d: -1 | 1) => void; canEdit: boolean; issues?: string[]; logicText: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id, disabled: !canEdit });
  const def = getType(q.type);
  const Icon = ICONS[q.type];
  return (
    <div id={`bq-${q.id}`} ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group relative rounded-xl border bg-white transition', selected ? 'border-brand-500 shadow-md ring-1 ring-brand-500' : 'border-line hover:border-slate-300', isDragging && 'z-20 opacity-60', issues && 'border-red-300')}
      onClick={onSelect}>
      <div className="flex items-center gap-1.5 border-b border-line/70 px-2 py-1.5">
        {canEdit && <button type="button" {...attributes} {...listeners} className="cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100 active:cursor-grabbing" aria-label="Kéo để sắp xếp" onClick={(e) => e.stopPropagation()}><GripVertical className="h-4 w-4" /></button>}
        <Icon className="h-3.5 w-3.5 text-brand-500" />
        <span className="text-xs font-medium text-muted">{def.label}</span>
        {def.isInput && <span className="font-mono text-[11px] text-slate-400">{q.code}</span>}
        {q.required && <Badge tone="red" className="!py-0">Bắt buộc</Badge>}
        {logicText && <span className="inline-flex max-w-[45%] items-center gap-1 truncate rounded bg-violet-50 px-1.5 text-[11px] text-violet-700" title={logicText}><GitBranch className="h-3 w-3 shrink-0" /><span className="truncate">{logicText}</span></span>}
        {q.logic?.requiredIf?.rules.length ? <span className="rounded bg-red-50 px-1.5 text-[11px] text-red-700">Bắt buộc có điều kiện</span> : null}
        {canEdit && (
          <div className={cn('ml-auto flex gap-0.5 transition', selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100')}>
            <IconBtn onClick={() => onMove(-1)} label="Lên"><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
            <IconBtn onClick={() => onMove(1)} label="Xuống"><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
            <IconBtn onClick={onDuplicate} label="Nhân bản"><Copy className="h-3.5 w-3.5" /></IconBtn>
            <IconBtn danger onClick={onDelete} label="Xóa"><Trash2 className="h-3.5 w-3.5" /></IconBtn>
          </div>
        )}
      </div>
      <div className="pointer-events-none p-4">
        {def.isInput ? (
          <>
            <p className="font-semibold leading-snug">{q.title || <span className="text-muted">Chưa có nội dung</span>}{q.required && <span className="ml-1 text-red-500">*</span>}</p>
            {q.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{q.description}</p>}
            <div className="mt-3 select-none" aria-hidden><QuestionInput q={q} value={q.defaultValue} onChange={() => {}} answers={{}} setAnswer={() => {}} disabled /></div>
          </>
        ) : <ContentBlock q={q} />}
      </div>
      {issues && <div className="border-t border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">{issues.join(' · ')}</div>}
    </div>
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

