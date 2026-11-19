import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { Copy, Download, Globe, KeyRound, MailPlus, ShieldCheck, Ban, Save, FileText, Printer } from 'lucide-react';
import type { ResponseRecord, SurveySettings } from '@core/index.ts';
import { api, publicSurveyUrl, type InvitationRow } from '@/data';
import { useAsync } from '@/lib/useAsync';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { downloadWord, formHtml, printPdf } from '@/lib/blankForm';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, Switch, Textarea, cn, useToast } from '@/components/ui';
import { useSurvey } from './SurveyLayout';

const INV_LABEL: Record<InvitationRow['status'], [string, 'slate' | 'blue' | 'orange' | 'green' | 'red']> = {
  pending: ['Chưa mở', 'slate'], opened: ['Đã mở', 'blue'], started: ['Đang làm', 'orange'], completed: ['Đã gửi', 'green'], revoked: ['Đã thu hồi', 'red'], expired: ['Hết hạn', 'red'],
};

export default function DistributionPage() {
  const { survey, setSurvey, canEdit, versions } = useSurvey();
  const resp = useAsync(() => api.listResponses(survey.id), [survey.id]);
  const toast = useToast();
  const url = publicSurveyUrl(survey.slug);
  const qrRef = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState<SurveySettings>(survey.settings);
  const [startAt, setStartAt] = useState(survey.startAt?.slice(0, 16) ?? '');
  const [endAt, setEndAt] = useState(survey.endAt?.slice(0, 16) ?? '');
  const [busy, setBusy] = useState(false);
  const inv = useAsync(() => (canEdit ? api.listInvitations(survey.id) : Promise.resolve([])), [survey.id]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const mode = st.access?.mode ?? 'public';

  const save = async () => {
    if (mode === 'code' && !(st.access?.code ?? '').trim()) return toast('Vui lòng nhập mã truy cập', 'error');
    if (startAt && endAt && startAt >= endAt) return toast('Thời gian kết thúc phải sau thời gian bắt đầu', 'error');
    setBusy(true);
    try {
      const patch = { settings: st, startAt: startAt ? new Date(startAt).toISOString() : null, endAt: endAt ? new Date(endAt).toISOString() : null };
      await api.updateSurvey(survey.id, patch);
      setSurvey({ ...survey, ...patch });
      toast('Đã lưu cấu hình phân phối (áp dụng ngay)');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const copy = (text: string) => { navigator.clipboard?.writeText(text); toast('Đã sao chép'); };
  const blank = (kind: 'word' | 'pdf') => {
    const html = formHtml(survey.title, versions[0]?.schema ?? survey.draftSchema, { meta: 'Phiếu trống để soạn trước. Sau khi thống nhất số liệu, vui lòng nhập lên hệ thống qua link khảo sát.' });
    if (kind === 'word') downloadWord(`phieu-trong-${survey.slug}`, html);
    else if (!printPdf(html)) toast('Trình duyệt chặn cửa sổ in, vui lòng cho phép cửa sổ bật lên', 'error');
  };
  const downloadQR = (fmt: 'png' | 'svg') => {
    if (fmt === 'png') {
      const c = qrRef.current?.querySelector('canvas');
      if (!c) return;
      const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `qr-${survey.slug}.png`; a.click();
    } else {
      const svg = qrRef.current?.querySelector('svg');
      if (!svg) return;
      const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `qr-${survey.slug}.svg`; a.click();
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5 sm:p-6">
      {!survey.currentVersionId && <ErrorBox>Khảo sát chưa được xuất bản — link sẽ hoạt động sau khi bạn bấm “Xuất bản”.</ErrorBox>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Link khảo sát</h2>
          <div className="flex gap-2">
            <Input readOnly value={url} className="font-mono text-sm" onFocus={(e) => e.target.select()} />
            <Button onClick={() => copy(url)}><Copy className="h-4 w-4" />Sao chép</Button>
          </div>
          <div className="flex flex-wrap items-start gap-4">
            <div ref={qrRef} className="rounded-lg border border-line bg-white p-2">
              <QRCodeCanvas value={url} size={132} level="H" marginSize={1} imageSettings={{ src: import.meta.env.BASE_URL + 'brand/kdi-logo.png', height: 20, width: 42, excavate: true }} />
              <div className="hidden"><QRCodeSVG value={url} size={512} level="H" marginSize={2} /></div>
            </div>
            <div className="grid min-w-[180px] flex-1 gap-2">
              <b className="text-sm">Mã QR</b>
              <span className="text-sm text-muted">In trên tài liệu, poster hoặc trình chiếu tại sự kiện.</span>
              <div className="flex gap-1.5"><Button size="sm" variant="outline" onClick={() => downloadQR('png')}><Download className="h-4 w-4" />PNG</Button><Button size="sm" variant="outline" onClick={() => downloadQR('svg')}><Download className="h-4 w-4" />SVG</Button></div>
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <h2 className="font-semibold">Phiếu trống để soạn trước</h2>
            <p className="mt-1 text-sm text-muted">Đơn vị tải về, họp tổ thống nhất số liệu rồi mới nhập lên hệ thống.</p>
            <div className="mt-2 flex gap-1.5"><Button size="sm" variant="outline" onClick={() => blank('word')}><FileText className="h-4 w-4" />Word</Button><Button size="sm" variant="outline" onClick={() => blank('pdf')}><Printer className="h-4 w-4" />PDF</Button></div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Ai được trả lời</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {([['public', Globe, 'Công khai', 'Ai có link đều trả lời được'], ['code', KeyRound, 'Mã truy cập', 'Nhập mã mới vào được'], ['invite', ShieldCheck, 'Lời mời riêng', 'Mỗi đơn vị một link riêng']] as const).map(([v, Icon, t, d]) => (
              <button key={v} type="button" disabled={!canEdit} onClick={() => setSt({ ...st, access: { ...st.access, mode: v } })}
                className={cn('rounded-md border p-3 text-left transition', mode === v ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-line hover:border-slate-300')}>
                <span className="flex items-center gap-1.5"><Icon className={cn('h-4 w-4', mode === v ? 'text-brand-600' : 'text-muted')} /><b className="text-sm">{t}</b></span>
                <small className="mt-1 block text-xs text-muted">{d}</small>
              </button>
            ))}
          </div>
          {mode === 'code' && <Field label="Mã truy cập"><Input value={st.access?.code ?? ''} onChange={(e) => setSt({ ...st, access: { mode: 'code', code: e.target.value } })} placeholder="VD: STEM2026" className="max-w-xs font-mono" disabled={!canEdit} /></Field>}

          <h2 className="border-t border-line pt-4 font-semibold">Giới hạn & thời gian</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Mở từ"><Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} disabled={!canEdit} /></Field>
            <Field label="Tự động đóng lúc"><Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} disabled={!canEdit} /></Field>
            <Field label="Tối đa số phản hồi"><Input type="number" min={1} value={st.maxResponses ?? ''} placeholder="Không giới hạn" onChange={(e) => setSt({ ...st, maxResponses: e.target.value ? Number(e.target.value) : null })} disabled={!canEdit} /></Field>
          </div>
          <div className="space-y-2.5">
            <Switch checked={st.allowResume !== false} onChange={(x) => setSt({ ...st, allowResume: x })} label="Tự động lưu nháp và cho phép tiếp tục sau" disabled={!canEdit} />
            <Switch checked={!!st.oneResponsePerDevice} onChange={(x) => setSt({ ...st, oneResponsePerDevice: x })} label="Mỗi thiết bị chỉ gửi một phản hồi (link công khai)" disabled={!canEdit} />
            <p className="pl-11 text-xs text-muted">Link mời riêng luôn chỉ dùng được một lần. Máy chủ giới hạn tần suất bắt đầu theo IP để chống spam.</p>
          </div>
          {canEdit && <div className="flex justify-end"><Button onClick={save} loading={busy}><Save className="h-4 w-4" />Lưu cấu hình</Button></div>}
        </Card>
      </div>

      {survey.currentVersionId && <Progress surveyId={survey.id} responses={resp.data ?? []} invitations={inv.data ?? []} maxResponses={st.maxResponses ?? null} endAt={survey.endAt ?? null} />}

      {canEdit && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <div><h2 className="font-semibold">Lời mời riêng</h2><p className="text-xs text-muted">Mỗi trường/người nhận một link có token ngẫu nhiên, dùng một lần, có thể thu hồi.</p></div>
            <Button onClick={() => setInviteOpen(true)}><MailPlus className="h-4 w-4" />Tạo lời mời</Button>
          </div>
          {inv.data?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-5 py-2 font-medium">Người nhận / đơn vị</th><th className="px-3 py-2 font-medium">Trạng thái</th><th className="px-3 py-2 font-medium">Tạo lúc</th><th className="px-3 py-2 font-medium">Hết hạn</th><th className="px-3 py-2 font-medium">Token</th><th className="px-5 py-2" /></tr></thead>
                <tbody>{inv.data.map((i) => (
                  <tr key={i.id} className="border-t border-line">
                    <td className="px-5 py-2.5"><p className="font-medium">{i.organization || i.recipientName || '—'}</p><p className="text-xs text-muted">{[i.recipientName, i.recipientEmail].filter(Boolean).join(' · ')}</p></td>
                    <td className="px-3 py-2.5"><Badge tone={INV_LABEL[i.status][1]}>{INV_LABEL[i.status][0]}</Badge></td>
                    <td className="px-3 py-2.5 text-muted">{fmtDateTime(i.invitedAt)}</td>
                    <td className="px-3 py-2.5 text-muted">{i.expiresAt ? fmtDateTime(i.expiresAt) : '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted">…{i.tokenHint}</td>
                    <td className="px-5 py-2.5 text-right">{!['completed', 'revoked'].includes(i.status) && <Button size="sm" variant="ghost" onClick={async () => { if (!confirm('Thu hồi lời mời này? Link sẽ không dùng được nữa.')) return; await api.revokeInvitation(i.id); inv.reload(); toast('Đã thu hồi'); }}><Ban className="h-4 w-4" />Thu hồi</Button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty title="Chưa có lời mời nào">Dùng lời mời riêng khi cần biết đơn vị nào đã/chưa trả lời.</Empty>}
        </Card>
      )}
      {inviteOpen && <InviteModal surveyId={survey.id} slug={survey.slug} onClose={() => { setInviteOpen(false); inv.reload(); }} />}
    </div>
  );
}

function InviteModal({ surveyId, slug, onClose }: { surveyId: string; slug: string; onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<InvitationRow[] | null>(null);
  const parse = () => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [organization, name, email] = l.split(/[,;\t]/).map((x) => x?.trim());
    return { organization, name, email };
  });
  const create = async () => {
    const rows = parse();
    if (!rows.length) return;
    if (rows.length > 500) return toast('Tối đa 500 lời mời mỗi lần', 'error');
    setBusy(true);
    try { setCreated(await api.createInvitations(surveyId, rows, expires ? new Date(expires).toISOString() : null)); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const csv = () => {
    const lines = [['organization', 'name', 'email', 'link'], ...(created ?? []).map((i) => [i.organization ?? '', i.recipientName ?? '', i.recipientEmail ?? '', publicSurveyUrl(slug, i.token)])];
    const blob = new Blob(['﻿' + lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `loi-moi-${slug}.csv`; a.click();
  };
  return (
    <Modal open onClose={onClose} title={created ? `Đã tạo ${created.length} lời mời` : 'Tạo lời mời riêng'} size="lg"
      footer={created ? <><Button variant="outline" onClick={csv}><Download className="h-4 w-4" />Tải CSV link</Button><Button onClick={onClose}>Xong</Button></> : <><Button variant="outline" onClick={onClose}>Hủy</Button><Button onClick={create} loading={busy} disabled={!text.trim()}>Tạo {parse().length || ''} lời mời</Button></>}>
      {!created ? (
        <div className="space-y-4">
          <Field label="Danh sách" hint="— mỗi dòng: Đơn vị, Người nhận, Email (2 cột sau tùy chọn)">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[160px] font-mono text-xs" placeholder={'THCS Lê Lợi, Nguyễn Văn A, a@leloi.edu.vn\nTH Ngô Quyền\nTHPT Trần Phú, Trần Thị B'} />
          </Field>
          <Field label="Hết hạn" hint="(tùy chọn)"><Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} className="max-w-xs" /></Field>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-700"><b>Lưu ngay danh sách link.</b> Vì lý do bảo mật, hệ thống chỉ lưu bản băm của token — không thể xem lại link đầy đủ sau khi đóng cửa sổ này.</div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-line">
            {created.map((i) => {
              const link = publicSurveyUrl(slug, i.token);
              return (
                <div key={i.id} className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-0">
                  <span className="w-40 shrink-0 truncate text-sm font-medium">{i.organization || i.recipientName}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{link}</span>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(link); toast('Đã sao chép'); }}><Copy className="h-3.5 w-3.5" /></Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Tiến độ thu thập: gộp vào cùng tab phát hành như mockup. */
function Progress({ surveyId, responses, invitations, maxResponses, endAt }: {
  surveyId: string; responses: ResponseRecord[]; invitations: InvitationRow[]; maxResponses: number | null; endAt: string | null;
}) {
  const submitted = responses.filter((r) => r.status === 'submitted').length;
  const inProgress = responses.length - submitted;
  const invited = invitations.filter((i) => i.status !== 'revoked');
  const target = invited.length || maxResponses || null;
  const pct = target ? Math.min(100, Math.round((submitted / target) * 100)) : null;
  const daysLeft = endAt ? Math.ceil((new Date(endAt).getTime() - Date.now()) / 864e5) : null;
  const days = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of responses) if (r.status === 'submitted' && r.submittedAt) { const d = r.submittedAt.slice(0, 10); m.set(d, (m.get(d) ?? 0) + 1); }
    const keys = [...m.keys()].sort();
    if (!keys.length) return [];
    const out: { d: string; n: number }[] = [];
    const end = new Date(keys[keys.length - 1]).getTime();
    for (let t = new Date(keys[0]).getTime(); t <= end; t += 864e5) { const d = new Date(t).toISOString().slice(0, 10); out.push({ d, n: m.get(d) ?? 0 }); }
    return out.slice(-30);
  }, [responses]);
  const max = Math.max(1, ...days.map((x) => x.n));
  const pending = invited.filter((i) => i.status !== 'completed');
  const csv = () => {
    const rows = [['STT', 'Đơn vị', 'Người nhận', 'Tình trạng', 'Hết hạn'], ...pending.map((i, k) => [k + 1, i.organization ?? '', i.recipientName ?? '', INV_LABEL[i.status][0], i.expiresAt ? fmtDateTime(i.expiresAt) : ''])];
    const blob = new Blob(['﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'don-vi-chua-hoan-thanh.csv'; a.click();
  };
  const step = Math.max(1, Math.ceil(days.length / 8));
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Tiến độ thu thập</h2><Link to={`/admin/surveys/${surveyId}/analytics`} className="text-sm font-medium text-brand-700 hover:underline">Xem báo cáo →</Link></div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-brand-700">{fmtNum(submitted)}{target ? `/${fmtNum(target)}` : ''}</span>
            <span className="text-sm text-muted">{invited.length ? 'đơn vị đã trả lời' : 'phản hồi đã gửi'}{pct !== null && ` (${pct}%)`}{target ? ` · còn ${fmtNum(Math.max(0, target - submitted))}` : ''}{daysLeft !== null && daysLeft >= 0 ? ` · còn ${daysLeft} ngày` : ''}</span>
          </div>
          {pct !== null && <div className="h-3 overflow-hidden rounded-full bg-slate-100"><i className="block h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} /></div>}
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-md bg-surface p-2.5"><p className="text-xs text-muted">Đã gửi</p><b className="tabular-nums">{fmtNum(submitted)}</b></div>
            <div className="rounded-md bg-surface p-2.5"><p className="text-xs text-muted">Đang làm dở</p><b className="tabular-nums">{fmtNum(inProgress)}</b></div>
            <div className="rounded-md bg-surface p-2.5"><p className="text-xs text-muted">Gắn cờ</p><b className="tabular-nums">{fmtNum(responses.filter((r) => r.flag).length)}</b></div>
          </div>
          {!target && <p className="text-xs text-muted">Đặt "Tối đa số phản hồi" hoặc dùng lời mời riêng để theo dõi theo chỉ tiêu.</p>}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Phản hồi mỗi ngày</h2>
          {days.length ? (
            <div className="mt-3">
              <div className="flex h-40 items-end gap-1">
                {days.map((x) => <div key={x.d} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${x.d}: ${x.n}`}><span className="text-[10px] tabular-nums text-muted">{x.n || ''}</span><i className="block w-full rounded-t bg-brand-500" style={{ height: `${(x.n / max) * 82}%`, minHeight: x.n ? 2 : 0 }} /></div>)}
              </div>
              <div className="mt-1 flex gap-1 text-[10px] text-muted">{days.map((x, i) => <span key={x.d} className="min-w-0 flex-1 truncate text-center">{i % step === 0 ? `${x.d.slice(8, 10)}/${x.d.slice(5, 7)}` : ''}</span>)}</div>
            </div>
          ) : <p className="py-10 text-center text-sm text-muted">Chưa có phản hồi đã gửi.</p>}
        </Card>
      </div>
      {invited.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <h2 className="font-semibold">Đơn vị chưa hoàn thành <span className="font-normal text-muted">({pending.length})</span></h2>
            <Button variant="outline" size="sm" onClick={csv} disabled={!pending.length}><Download className="h-4 w-4" />Tải danh sách</Button>
          </div>
          {pending.length ? (
            <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
              <thead className="bg-brand-600 text-left text-white"><tr><th className="px-3 py-2 text-center font-semibold">STT</th><th className="px-3 py-2 font-semibold">Đơn vị</th><th className="px-3 py-2 font-semibold">Người nhận</th><th className="px-3 py-2 font-semibold">Tình trạng</th><th className="px-3 py-2 font-semibold">Hết hạn</th></tr></thead>
              <tbody>{pending.slice(0, 50).map((i, k) => (
                <tr key={i.id} className="border-t border-line"><td className="px-3 py-2 text-center tabular-nums text-muted">{k + 1}</td><td className="px-3 py-2 font-medium">{i.organization || '—'}</td><td className="px-3 py-2 text-muted">{i.recipientName || '—'}</td><td className="px-3 py-2"><Badge tone={INV_LABEL[i.status][1]}>{INV_LABEL[i.status][0]}</Badge></td><td className="px-3 py-2 text-muted">{i.expiresAt ? fmtDateTime(i.expiresAt) : '—'}</td></tr>
              ))}{pending.length > 50 && <tr><td colSpan={5} className="px-3 py-2 text-center text-muted">… và {pending.length - 50} đơn vị khác (tải danh sách để xem đủ)</td></tr>}</tbody>
            </table></div>
          ) : <p className="px-5 pb-5 text-sm text-emerald-700">Tất cả đơn vị được mời đã trả lời.</p>}
        </Card>
      )}
    </>
  );
}
