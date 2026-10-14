import { useState, type ReactNode } from 'react';
import { Upload, Lock } from 'lucide-react';
import { getType, isInputQuestion, type MediaRef, type Question, type QuestionSettings, type Section, type SurveySchema, type Validation } from '@core/index.ts';
import { api } from '@/data';
import { Field, Input, Select, Switch, Tabs, Textarea, cn, useToast } from '@/components/ui';
import { OptionsEditor } from './OptionsEditor';
import { LogicEditor } from './LogicEditor';
import { parseVideo } from '@/survey/theme';

type Tab = 'content' | 'options' | 'rules' | 'logic' | 'report';

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return <div className="space-y-3 border-t border-line pt-4 first:border-0 first:pt-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>{children}</div>;
}
const num = (v: string) => (v === '' ? undefined : Number(v));

export function QuestionInspector({ q, schema, onChange, lockedCodes, publishedQuestionCodes, disabled }: {
  q: Question;
  schema: SurveySchema;
  onChange: (patch: Partial<Question>) => void;
  lockedCodes: { options: Set<string>; rows: Set<string> };
  publishedQuestionCodes: Set<string>;
  disabled?: boolean;
}) {
  const def = getType(q.type);
  const input = def.isInput;
  const [tab, setTab] = useState<Tab>('content');
  const s = q.settings ?? {};
  const v = q.validation ?? {};
  const setS = (p: Partial<QuestionSettings>) => onChange({ settings: { ...s, ...p } });
  const setV = (p: Partial<Validation>) => onChange({ validation: { ...v, ...p } });
  // logic may only reference questions BEFORE this one
  const before: Question[] = [];
  for (const sec of schema.sections) for (const x of sec.questions) { if (x.id === q.id) break; if (isInputQuestion(x)) before.push(x); }
  // stop collecting after the current question is found
  const idxAll = schema.sections.flatMap((x) => x.questions).findIndex((x) => x.id === q.id);
  const sources = schema.sections.flatMap((x) => x.questions).slice(0, idxAll).filter(isInputQuestion);
  const codeLocked = publishedQuestionCodes.has(q.code);
  const codeDup = schema.sections.flatMap((x) => x.questions).filter((x) => x.code === q.code).length > 1;

  const tabs: { value: Tab; label: string }[] = [{ value: 'content', label: 'Nội dung' }];
  if (def.hasOptions || def.hasRows) tabs.push({ value: 'options', label: 'Lựa chọn' });
  if (input) tabs.push({ value: 'rules', label: 'Kiểm tra' });
  tabs.push({ value: 'logic', label: 'Logic' });
  if (input) tabs.push({ value: 'report', label: 'Dữ liệu' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">{def.label}</span>
        {input && <span className="font-mono text-xs text-muted">{q.code}</span>}
      </div>
      <Tabs value={tab} onChange={setTab} items={tabs} className="flex w-full flex-wrap [&>button]:flex-1 [&>button]:px-1.5 [&>button]:text-xs" />
      <fieldset disabled={disabled} className="space-y-4">
        {tab === 'content' && (
          <>
            <Field label={input ? 'Câu hỏi' : 'Tiêu đề'}><Textarea className="min-h-[60px]" value={q.title} onChange={(e) => onChange({ title: e.target.value })} /></Field>
            <Field label={input ? 'Mô tả / hướng dẫn' : q.type === 'paragraph' ? 'Nội dung' : 'Mô tả'}><Textarea className={q.type === 'paragraph' ? 'min-h-[140px]' : 'min-h-[60px]'} value={q.description ?? ''} onChange={(e) => onChange({ description: e.target.value || undefined })} /></Field>
            {input && !['single_choice', 'multiple_choice', 'yes_no', 'rating', 'likert', 'nps', 'ranking', 'matrix', 'category_level', 'quantity_by_group', 'consent', 'file_upload', 'address', 'contact'].includes(q.type) && (
              <Field label="Placeholder"><Input value={q.placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value || undefined })} /></Field>
            )}
            {input && <Switch checked={!!q.required} onChange={(r) => onChange({ required: r })} label="Bắt buộc trả lời" />}
            <TypeSettings q={q} s={s} setS={setS} onChange={onChange} />
            {(q.type === 'image' || q.type === 'video' || q.type === 'link') ? <MediaFields media={q.media ?? { kind: q.type === 'link' ? 'link' : q.type, url: '' }} onChange={(m) => onChange({ media: m })} /> : input && (
              <details className="rounded-lg border border-line p-3 text-sm">
                <summary className="cursor-pointer font-medium">Đính kèm hình ảnh / video / tài liệu</summary>
                <div className="mt-3 space-y-3">
                  <Select value={q.media?.kind ?? ''} onChange={(e) => onChange({ media: e.target.value ? { kind: e.target.value as MediaRef['kind'], url: q.media?.url ?? '' } : undefined })}>
                    <option value="">Không đính kèm</option><option value="image">Hình ảnh</option><option value="video">Video</option><option value="link">Liên kết</option><option value="file">Tài liệu (PDF…)</option>
                  </Select>
                  {q.media && <MediaFields media={q.media} onChange={(m) => onChange({ media: m })} />}
                </div>
              </details>
            )}
            {input && <Field label="Nội dung trợ giúp" hint="(hiện dưới câu hỏi)"><Input value={q.helpText ?? ''} onChange={(e) => onChange({ helpText: e.target.value || undefined })} /></Field>}
          </>
        )}

        {tab === 'options' && (
          <div className="space-y-5">
            {def.hasRows && <OptionsEditor label={q.type === 'matrix' ? 'Hàng (tiêu chí)' : q.type === 'quantity_by_group' ? 'Nhóm' : 'Danh mục'} items={q.rows ?? []} onChange={(rows) => onChange({ rows })} lockedCodes={lockedCodes.rows} prefix={q.type === 'quantity_by_group' ? 'grp' : q.type === 'matrix' ? 'row' : 'cat'} disabled={disabled} />}
            {def.hasOptions && q.type !== 'yes_no' && <OptionsEditor label={q.type === 'matrix' ? 'Cột (mức đánh giá)' : q.type === 'category_level' ? 'Cấp độ' : 'Lựa chọn'} items={q.options ?? []} onChange={(options) => onChange({ options })} lockedCodes={lockedCodes.options} prefix={q.type === 'category_level' ? 'lvl' : q.type === 'matrix' ? 'col' : q.type === 'likert' ? 'lk' : 'opt'} disabled={disabled} />}
            {q.type === 'yes_no' && <OptionsEditor label="Nhãn" items={q.options ?? []} onChange={(options) => onChange({ options })} lockedCodes={new Set((q.options ?? []).map((o) => o.code))} prefix="yn" disabled={disabled} />}
            {['single_choice', 'multiple_choice', 'dropdown'].includes(q.type) && (
              <Sub title="Tùy chọn">
                <Switch checked={!!s.allowOther} onChange={(x) => setS({ allowOther: x })} label='Cho phép "Khác" và nhập nội dung' />
                {s.allowOther && <Field label='Nhãn "Khác"'><Input value={s.otherLabel ?? ''} placeholder="Khác" onChange={(e) => setS({ otherLabel: e.target.value || undefined })} /></Field>}
                {q.type === 'multiple_choice' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Chọn tối thiểu"><Input type="number" min={0} value={s.minSelect ?? ''} onChange={(e) => setS({ minSelect: num(e.target.value) })} /></Field>
                      <Field label="Chọn tối đa"><Input type="number" min={0} value={s.maxSelect ?? ''} onChange={(e) => setS({ maxSelect: num(e.target.value) })} /></Field>
                    </div>
                    <Field label="Lựa chọn loại trừ" hint="(chọn thì bỏ các lựa chọn khác)">
                      <div className="flex flex-wrap gap-1">{(q.options ?? []).map((o) => {
                        const on = (s.exclusiveCodes ?? []).includes(o.code);
                        return <button type="button" key={o.id} onClick={() => setS({ exclusiveCodes: on ? (s.exclusiveCodes ?? []).filter((c) => c !== o.code) : [...(s.exclusiveCodes ?? []), o.code] })} className={cn('rounded-full border px-2 py-0.5 text-xs', on ? 'border-brand-500 bg-brand-600 text-white' : 'border-line')}>{o.label}</button>;
                      })}</div>
                    </Field>
                  </>
                )}
                {q.type === 'dropdown' && <Switch checked={!!s.searchable} onChange={(x) => setS({ searchable: x })} label="Cho phép tìm kiếm" />}
                {q.type !== 'multiple_choice' && (
                  <Field label="Lựa chọn mặc định">
                    <Select value={String(q.defaultValue ?? '')} onChange={(e) => onChange({ defaultValue: e.target.value || undefined })}>
                      <option value="">— Không —</option>{(q.options ?? []).map((o) => <option key={o.id} value={o.code}>{o.label}</option>)}
                    </Select>
                  </Field>
                )}
              </Sub>
            )}
          </div>
        )}

        {tab === 'rules' && (
          <div className="space-y-4">
            {['short_text', 'long_text', 'email', 'phone', 'url'].includes(q.type) && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Độ dài tối thiểu"><Input type="number" min={0} value={v.minLength ?? ''} onChange={(e) => setV({ minLength: num(e.target.value) })} /></Field>
                  <Field label="Độ dài tối đa"><Input type="number" min={0} value={v.maxLength ?? ''} onChange={(e) => setV({ maxLength: num(e.target.value) })} /></Field>
                </div>
                <Field label="Biểu thức chính quy" hint="(regex, tùy chọn)"><Input className="font-mono text-xs" value={v.pattern ?? ''} placeholder="^[0-9]{6}$" onChange={(e) => setV({ pattern: e.target.value || undefined })} /></Field>
                {v.pattern && <Field label="Thông báo khi sai định dạng"><Input value={v.patternMessage ?? ''} onChange={(e) => setV({ patternMessage: e.target.value || undefined })} /></Field>}
              </>
            )}
            {['number', 'currency', 'percentage', 'quantity_by_group'].includes(q.type) && (
              <div className="grid grid-cols-2 gap-2">
                {q.type !== 'quantity_by_group' && <Field label="Giá trị tối thiểu"><Input type="number" value={v.min ?? ''} onChange={(e) => setV({ min: num(e.target.value) })} /></Field>}
                <Field label={q.type === 'quantity_by_group' ? 'Tối đa mỗi nhóm' : 'Giá trị tối đa'}><Input type="number" value={v.max ?? ''} onChange={(e) => setV({ max: num(e.target.value) })} /></Field>
              </div>
            )}
            {['short_text', 'number', 'currency', 'percentage', 'date', 'email'].includes(q.type) && (
              <Field label="Giá trị mặc định"><Input value={String(q.defaultValue ?? '')} onChange={(e) => onChange({ defaultValue: e.target.value === '' ? undefined : ['number', 'currency', 'percentage'].includes(q.type) ? Number(e.target.value) : e.target.value })} /></Field>
            )}
            {q.type === 'category_level' && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Chọn tối thiểu (ô)"><Input type="number" min={0} value={s.minSelect ?? ''} onChange={(e) => setS({ minSelect: num(e.target.value) })} /></Field>
                <Field label="Chọn tối đa (ô)"><Input type="number" min={0} value={s.maxSelect ?? ''} onChange={(e) => setS({ maxSelect: num(e.target.value) })} /></Field>
              </div>
            )}
            <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">Kiểm tra định dạng (email, SĐT Việt Nam, URL, ngày, phạm vi số, mã lựa chọn hợp lệ) chạy ở cả trình duyệt và máy chủ khi gửi.</p>
          </div>
        )}

        {tab === 'logic' && (
          <div className="space-y-5">
            <Sub title="Hiển thị khi">
              <LogicEditor group={q.logic?.visibleIf} onChange={(g) => onChange({ logic: { ...q.logic, visibleIf: g } })} sources={sources} emptyText="Luôn hiển thị. Thêm điều kiện để chỉ hiện khi thỏa mãn." disabled={disabled} />
            </Sub>
            {input && !q.required && (
              <Sub title="Bắt buộc khi">
                <LogicEditor group={q.logic?.requiredIf} onChange={(g) => onChange({ logic: { ...q.logic, requiredIf: g } })} sources={sources} emptyText="Không bắt buộc. Thêm điều kiện để bắt buộc trong trường hợp cụ thể." disabled={disabled} />
              </Sub>
            )}
            <p className="text-xs text-muted">Câu hỏi bị ẩn sẽ không được tính là bắt buộc và câu trả lời của nó bị loại khi gửi. Dùng tab <b>Xem trước</b> để kiểm tra logic.</p>
          </div>
        )}

        {tab === 'report' && (
          <div className="space-y-4">
            <Field label="Mã câu hỏi" hint="(dùng trong export / Power BI)">
              <div className="relative">
                <Input className={cn('font-mono', codeDup && 'border-red-400')} value={q.code} disabled={codeLocked} onChange={(e) => onChange({ code: e.target.value.replace(/[^A-Za-z0-9_]/g, '').toUpperCase() })} />
                {codeLocked && <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />}
              </div>
              {codeLocked && <p className="mt-1 text-xs text-muted">Đã dùng trong phiên bản đã xuất bản — khóa để giữ khả năng so sánh dữ liệu.</p>}
              {codeDup && <p className="mt-1 text-xs text-red-600">Mã bị trùng với câu hỏi khác.</p>}
            </Field>
            <Field label="Nhãn báo cáo" hint="(ngắn gọn, hiện trên biểu đồ)"><Input value={q.reportLabel ?? ''} placeholder={q.title.slice(0, 40)} onChange={(e) => onChange({ reportLabel: e.target.value || undefined })} /></Field>
            <Switch checked={!!q.isPII} onChange={(x) => onChange({ isPII: x })} label="Dữ liệu cá nhân (PII) — ẩn trong view phân tích" />
          </div>
        )}
      </fieldset>
    </div>
  );
}

function TypeSettings({ q, s, setS, onChange }: { q: Question; s: QuestionSettings; setS: (p: Partial<QuestionSettings>) => void; onChange: (p: Partial<Question>) => void }) {
  switch (q.type) {
    case 'rating':
      return <Field label="Số sao tối đa"><Select value={s.scaleMax ?? 5} onChange={(e) => setS({ scaleMax: Number(e.target.value) })}>{[3, 4, 5, 7, 10].map((n) => <option key={n}>{n}</option>)}</Select></Field>;
    case 'nps':
      return <div className="grid grid-cols-2 gap-2"><Field label="Nhãn 0"><Input value={s.minLabel ?? ''} onChange={(e) => setS({ minLabel: e.target.value })} /></Field><Field label="Nhãn 10"><Input value={s.maxLabel ?? ''} onChange={(e) => setS({ maxLabel: e.target.value })} /></Field></div>;
    case 'matrix':
      return <Switch checked={!!s.multiPerRow} onChange={(x) => setS({ multiPerRow: x })} label="Cho phép chọn nhiều cột mỗi hàng" />;
    case 'category_level':
      return (
        <div className="space-y-3 rounded-lg bg-surface p-3">
          <Switch checked={!!s.withQuantity} onChange={(x) => setS({ withQuantity: x })} label="Nhập số lượng cho mỗi ô đã chọn" />
          {s.withQuantity && <Field label="Tên số lượng"><Input value={s.quantityLabel ?? ''} placeholder="VD: Số lớp" onChange={(e) => setS({ quantityLabel: e.target.value || undefined })} /></Field>}
        </div>
      );
    case 'currency':
      return <Field label="Đơn vị tiền"><Select value={s.currency ?? 'VND'} onChange={(e) => setS({ currency: e.target.value })}><option>VND</option><option>USD</option></Select></Field>;
    case 'file_upload':
      return (
        <div className="space-y-3 rounded-lg bg-surface p-3">
          <Field label="Định dạng cho phép"><Input value={s.accept ?? ''} onChange={(e) => setS({ accept: e.target.value })} placeholder=".pdf,.jpg,.png" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tối đa (MB)"><Input type="number" min={1} max={25} value={s.maxSizeMb ?? 10} onChange={(e) => setS({ maxSizeMb: Math.min(25, Number(e.target.value) || 1) })} /></Field>
            <Field label="Số tệp"><Input type="number" min={1} max={5} value={s.maxFiles ?? 1} onChange={(e) => setS({ maxFiles: Math.min(5, Number(e.target.value) || 1) })} /></Field>
          </div>
          <p className="text-xs text-muted">Tệp lưu trong kho riêng tư, chỉ truy cập bằng link có thời hạn.</p>
        </div>
      );
    case 'address':
      return <Switch checked={s.includeWard !== false} onChange={(x) => setS({ includeWard: x })} label="Hỏi cấp Xã / Phường" />;
    case 'contact': {
      const all = [['name', 'Họ tên'], ['email', 'Email'], ['phone', 'SĐT'], ['position', 'Chức vụ'], ['organization', 'Đơn vị']] as const;
      const cur = s.contactFields ?? ['name', 'email', 'phone'];
      return (
        <Field label="Trường thu thập">
          <div className="flex flex-wrap gap-1">{all.map(([k, l]) => {
            const on = cur.includes(k);
            return <button type="button" key={k} onClick={() => setS({ contactFields: on ? cur.filter((x) => x !== k) : [...cur, k] })} className={cn('rounded-full border px-2.5 py-1 text-xs', on ? 'border-brand-500 bg-brand-600 text-white' : 'border-line')}>{l}</button>;
          })}</div>
        </Field>
      );
    }
    case 'consent':
      return <Field label="Nội dung đồng ý"><Textarea value={s.consentText ?? ''} onChange={(e) => setS({ consentText: e.target.value })} /></Field>;
    case 'heading':
      return <Field label="Cỡ tiêu đề"><Select value={s.level ?? 2} onChange={(e) => setS({ level: Number(e.target.value) as 1 | 2 | 3 })}><option value={1}>Lớn</option><option value={2}>Vừa</option><option value={3}>Nhỏ</option></Select></Field>;
    case 'instruction':
      return <Field label="Kiểu hộp"><Select value={s.tone ?? 'info'} onChange={(e) => setS({ tone: e.target.value as 'info' })}><option value="info">Thông tin</option><option value="warning">Lưu ý</option><option value="success">Thành công</option></Select></Field>;
    default:
      void onChange;
      return null;
  }
}

function MediaFields({ media, onChange }: { media: MediaRef; onChange: (m: MediaRef) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const set = (p: Partial<MediaRef>) => { onChange({ ...media, ...p }); if (p.url !== undefined) setState('idle'); };
  const upload = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try { set({ url: await api.uploadMedia(f) }); toast('Đã tải lên'); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const video = media.kind === 'video' && media.url ? parseVideo(media.url) : null;
  return (
    <div className="space-y-3">
      <Field label={media.kind === 'image' ? 'URL hình ảnh' : media.kind === 'video' ? 'URL video (YouTube, Vimeo, .mp4)' : 'URL'}>
        <div className="flex gap-2">
          <Input value={media.url} onChange={(e) => set({ url: e.target.value.trim() })} placeholder="https://…" />
          {(media.kind === 'image' || media.kind === 'file') && (
            <label className={cn('inline-flex h-10 shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-line px-3 text-sm hover:bg-surface', busy && 'opacity-50')}>
              <Upload className="h-4 w-4" /><span className="sr-only">Tải lên</span>
              <input type="file" className="sr-only" accept={media.kind === 'image' ? 'image/*' : '.pdf,.doc,.docx,.xlsx,.pptx'} onChange={(e) => upload(e.target.files?.[0])} />
            </label>
          )}
        </div>
        {media.kind === 'image' && media.url && (
          <div className="mt-2 rounded-lg border border-line p-1.5">
            <img src={media.url} alt="" className="max-h-28 w-full rounded object-contain" onLoad={() => setState('ok')} onError={() => setState('fail')} />
            <p className={cn('mt-1 text-xs', state === 'fail' ? 'text-red-600' : 'text-muted')}>{state === 'fail' ? 'Không tải được ảnh — người trả lời sẽ thấy thông báo thay thế.' : state === 'ok' ? 'Ảnh tải thành công.' : 'Đang kiểm tra…'}</p>
          </div>
        )}
        {video && <p className={cn('mt-1 text-xs', video.kind === 'link' ? 'text-accent-700' : 'text-emerald-700')}>{video.kind === 'link' ? 'Nguồn này không nằm trong danh sách được phép nhúng — sẽ hiển thị dạng liên kết.' : `Sẽ nhúng trực tiếp (${video.kind}).`}</p>}
      </Field>
      {media.kind === 'image' && <Field label="Văn bản thay thế (alt)" hint="— cho người dùng trình đọc màn hình"><Input value={media.alt ?? ''} onChange={(e) => set({ alt: e.target.value })} /></Field>}
      {(media.kind === 'link' || media.kind === 'file') && <Field label="Văn bản hiển thị"><Input value={media.text ?? ''} onChange={(e) => set({ text: e.target.value })} /></Field>}
      <Field label="Chú thích"><Input value={media.caption ?? ''} onChange={(e) => set({ caption: e.target.value || undefined })} /></Field>
      {(media.kind === 'link' || media.kind === 'file') && <Switch checked={media.newTab !== false} onChange={(x) => set({ newTab: x })} label="Mở trong tab mới" />}
    </div>
  );
}

export function SectionInspector({ section, schema, onChange, disabled }: { section: Section; schema: SurveySchema; onChange: (p: Partial<Section>) => void; disabled?: boolean }) {
  const idx = schema.sections.findIndex((s) => s.id === section.id);
  const sources = schema.sections.slice(0, idx).flatMap((s) => s.questions).filter(isInputQuestion);
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <span className="rounded-md bg-accent-50 px-2 py-1 text-xs font-semibold text-accent-700">Phần {idx + 1}</span>
      <Field label="Tên phần"><Input value={section.title} onChange={(e) => onChange({ title: e.target.value })} /></Field>
      <Field label="Mô tả"><Textarea value={section.description ?? ''} onChange={(e) => onChange({ description: e.target.value || undefined })} /></Field>
      <Sub title="Hiển thị phần này khi">
        <LogicEditor group={section.logic?.visibleIf} onChange={(g) => onChange({ logic: { visibleIf: g } })} sources={sources} emptyText="Luôn hiển thị. Thêm điều kiện để bỏ qua phần này khi không phù hợp." disabled={disabled} />
      </Sub>
    </fieldset>
  );
}
