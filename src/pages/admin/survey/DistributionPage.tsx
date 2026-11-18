import { useRef, useState } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { Copy, Download, Globe, KeyRound, MailPlus, ShieldCheck, Ban, Save } from 'lucide-react';
import type { SurveySettings } from '@core/index.ts';
import { api, publicSurveyUrl, type InvitationRow } from '@/data';
import { useAsync } from '@/lib/useAsync';
import { fmtDateTime } from '@/lib/format';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, Switch, Textarea, cn, useToast } from '@/components/ui';
import { useSurvey } from './SurveyLayout';

const INV_LABEL: Record<InvitationRow['status'], [string, 'slate' | 'blue' | 'orange' | 'green' | 'red']> = {
  pending: ['Chưa mở', 'slate'], opened: ['Đã mở', 'blue'], started: ['Đang làm', 'orange'], completed: ['Đã gửi', 'green'], revoked: ['Đã thu hồi', 'red'], expired: ['Hết hạn', 'red'],
};

export default function DistributionPage() {
  const { survey, setSurvey, canEdit } = useSurvey();
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
    <div className="mx-auto max-w-5xl space-y-6 p-5 sm:p-8">
      {!survey.currentVersionId && <ErrorBox>Khảo sát chưa được xuất bản — link sẽ hoạt động sau khi bạn bấm “Xuất bản”.</ErrorBox>}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="p-5">
          <h2 className="font-semibold">Link khảo sát</h2>
          <div className="mt-3 flex gap-2">
            <Input readOnly value={url} className="font-mono text-sm" onFocus={(e) => e.target.select()} />
            <Button variant="outline" onClick={() => copy(url)}><Copy className="h-4 w-4" />Sao chép</Button>
          </div>
          <h3 className="mt-6 text-sm font-semibold">Phương thức tham gia</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {([['public', Globe, 'Công khai', 'Ai có link đều trả lời được'], ['code', KeyRound, 'Mã truy cập', 'Nhập mã chung trước khi làm'], ['invite', ShieldCheck, 'Chỉ người được mời', 'Mỗi người/đơn vị một link riêng']] as const).map(([v, Icon, t, d]) => (
              <button key={v} type="button" disabled={!canEdit} onClick={() => setSt({ ...st, access: { ...st.access, mode: v } })}
                className={cn('rounded-xl border p-3 text-left transition', mode === v ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-line hover:border-slate-300')}>
                <Icon className={cn('h-5 w-5', mode === v ? 'text-brand-600' : 'text-muted')} />
                <p className="mt-2 text-sm font-semibold">{t}</p><p className="text-xs text-muted">{d}</p>
              </button>
            ))}
          </div>
          {mode === 'code' && <Field label="Mã truy cập" className="mt-3"><Input value={st.access?.code ?? ''} onChange={(e) => setSt({ ...st, access: { mode: 'code', code: e.target.value } })} placeholder="VD: STEM2026" className="max-w-xs font-mono" disabled={!canEdit} /></Field>}

          <h3 className="mt-6 text-sm font-semibold">Giới hạn & thời gian</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <Field label="Mở từ"><Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} disabled={!canEdit} /></Field>
            <Field label="Tự động đóng lúc"><Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} disabled={!canEdit} /></Field>
            <Field label="Tối đa số phản hồi"><Input type="number" min={1} value={st.maxResponses ?? ''} placeholder="Không giới hạn" onChange={(e) => setSt({ ...st, maxResponses: e.target.value ? Number(e.target.value) : null })} disabled={!canEdit} /></Field>
          </div>
          <div className="mt-4 space-y-2.5">
            <Switch checked={st.allowResume !== false} onChange={(x) => setSt({ ...st, allowResume: x })} label="Tự động lưu nháp và cho phép tiếp tục sau" disabled={!canEdit} />
            <Switch checked={!!st.oneResponsePerDevice} onChange={(x) => setSt({ ...st, oneResponsePerDevice: x })} label="Mỗi thiết bị chỉ gửi một phản hồi (link công khai)" disabled={!canEdit} />
            <p className="pl-11 text-xs text-muted">Link mời riêng luôn chỉ dùng được một lần. Máy chủ giới hạn tần suất bắt đầu theo IP để chống spam.</p>
          </div>
          {canEdit && <div className="mt-5 flex justify-end"><Button onClick={save} loading={busy}><Save className="h-4 w-4" />Lưu cấu hình</Button></div>}
        </Card>

        <Card className="flex flex-col items-center p-5">
          <h2 className="self-start font-semibold">Mã QR</h2>
          <div ref={qrRef} className="mt-4 rounded-xl border border-line bg-white p-3">
            <QRCodeCanvas value={url} size={200} level="H" marginSize={1} imageSettings={{ src: import.meta.env.BASE_URL + 'brand/kdi-logo.png', height: 30, width: 64, excavate: true }} />
            <div className="hidden"><QRCodeSVG value={url} size={512} level="H" marginSize={2} /></div>
          </div>
          <div className="mt-4 flex gap-2"><Button size="sm" variant="outline" onClick={() => downloadQR('png')}><Download className="h-4 w-4" />PNG</Button><Button size="sm" variant="outline" onClick={() => downloadQR('svg')}><Download className="h-4 w-4" />SVG</Button></div>
          <p className="mt-3 text-center text-xs text-muted">In trên tài liệu, poster hoặc trình chiếu tại sự kiện.</p>
        </Card>
      </div>

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
