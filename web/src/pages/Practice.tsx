import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, BellOff, CalendarPlus, Check, ChevronDown, ClipboardCheck, MapPin, Pencil, Plus, Send, Trash2, X } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Tabs } from '../components/ui/Tabs'
import { EmptyState } from '../components/ui/EmptyState'
import { AuthDialog } from '../components/ui/AuthDialog'
import { Field, Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { PlayerSelect } from '../components/ui/PlayerSelect'
import { useDataStore } from '../store/data'
import {
  VOTE_LABEL, WEEKDAYS, addDays, attendanceRate, canVote, castVote, deleteBreak, deleteSeries, examBreak, generatePractices, isLateReply, loadPractice,
  notifyNow, practiceStart, saveBreak, saveSeries, setRollCall, taipeiToday, tally, updatePractice, weekdayOf,
  type Practice, type PracticeBreak, type PracticeData, type PracticeSeries, type Vote, type VoteStatus,
} from '../data/practice'
import { currentSubscription, needsInstall, pushConfigured, pushSupported, subscribePush, unsubscribePush } from '../data/push'
import { cx } from '../lib/format'

type Tab = 'next' | 'rate' | 'manage'
const err = (e: unknown) => (e instanceof Error ? e.message : String(e))
const daysUntil = (iso: string) => Math.round((new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${taipeiToday()}T00:00:00Z`).getTime()) / 86_400_000)
const whenLabel = (iso: string) => { const n = daysUntil(iso); return n === 0 ? '今天' : n === 1 ? '明天' : n === 2 ? '後天' : n > 0 ? `${n} 天後` : `${-n} 天前` }

function calendarUrl(p: Practice): string {
  const d = p.date.replace(/-/g, ''), t = p.time.replace(':', '').padEnd(6, '0')
  const endH = String(Math.min(23, Number(p.time.slice(0, 2)) + 2)).padStart(2, '0')
  const q = new URLSearchParams({ action: 'TEMPLATE', text: '系棒練球', dates: `${d}T${t}/${d}T${endH}${p.time.slice(3, 5)}00`, location: p.place ?? '', details: p.note ?? '' })
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}

/* ------------------------------------------------------------------ vote buttons */
function VoteButtons({ practice, mine, onVote, busy, size = 'md' }: { practice: Practice; mine: Vote | undefined; onVote: (s: VoteStatus, reason: string) => Promise<void>; busy: boolean; size?: 'sm' | 'md' }) {
  const [reason, setReason] = useState(mine?.reason ?? '')
  const [pick, setPick] = useState<VoteStatus | null>(null)
  useEffect(() => { setReason(mine?.reason ?? '') }, [mine?.reason])
  const open = canVote(practice)
  const late = isLateReply(practice)
  const choose = async (s: VoteStatus) => {
    if (s === 'yes') { setPick(null); await onVote('yes', '') ; return }
    setPick(s)
  }
  const cls = (s: VoteStatus) => cx(
    'inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-50 disabled:pointer-events-none',
    size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-[14px]',
    mine?.status === s && pick === null ? 'bg-ink text-bg' : pick === s ? 'bg-surface-3 text-ink ring-1 ring-[color-mix(in_srgb,var(--ink)_30%,transparent)]' : 'bg-surface-3/70 text-ink hover:bg-surface-3',
  )
  if (!open) return <span className="text-[13px] text-muted">{practice.status === 'cancelled' ? '這次停練' : '已開始，改看點名'}</span>
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        {(['yes', 'late', 'no'] as VoteStatus[]).map((s) => (
          <button key={s} type="button" className={cls(s)} disabled={busy} onClick={() => void choose(s)} aria-pressed={mine?.status === s}>
            {mine?.status === s && pick === null && <Check className="size-4" />}{VOTE_LABEL[s]}
          </button>
        ))}
      </div>
      {pick && (
        <div className="flex items-center gap-2">
          <Input size="sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={pick === 'late' ? '大概幾點到？（選填）' : '原因（選填，只有管理員看得到）'} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { void onVote(pick, reason); setPick(null) } }} />
          <Button size="sm" variant="primary" disabled={busy} onClick={() => { void onVote(pick, reason); setPick(null) }}>送出</Button>
          <Button size="sm" variant="ghost" icon={<X />} aria-label="取消" onClick={() => setPick(null)} />
        </div>
      )}
      {(size === 'md' || late || mine?.late_reply || mine?.by_proxy) && (
        <p className="text-[12px] text-muted">
          {late ? <span className="text-[color-mix(in_srgb,var(--warning)_45%,var(--ink))]">已過 09:00 截止時間，仍可回覆，但會標記為晚回。</span> : size === 'md' && `截止：${practice.date.slice(5).replace('-', '/')} 09:00，之後仍可改但算晚回。`}
          {mine?.late_reply && ' 你這次是晚回。'}
          {mine?.by_proxy && ' 這筆是管理員代填的。'}
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ push card */
function PushCard({ myName, signedIn, onLogin }: { myName: string | null; signedIn: boolean; onLogin: () => void }) {
  const [sub, setSub] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { void currentSubscription().then((s) => setSub(!!s)).catch(() => setSub(false)) }, [])
  const toggle = async () => {
    setBusy(true); setMsg(null)
    try {
      if (sub) { await unsubscribePush(); setSub(false); setMsg('已關閉這台裝置的通知。') }
      else { await subscribePush(myName); setSub(true); setMsg('開好了：練球前一天 18:00 會收到通知。') }
    } catch (e) { setMsg(err(e)) } finally { setBusy(false) }
  }
  const install = needsInstall()
  return (
    <Card title="練球通知" subtitle="前一天 18:00 推播到這台裝置，取消也會通知">
      {!pushConfigured ? <p className="text-[13px] text-muted">推播還沒設定好（管理員需要設定 VAPID 金鑰）。先用群組公告，投票照常在這裡。</p>
        : !pushSupported() && !install ? <p className="text-[13px] text-muted">這個瀏覽器不支援推播。</p>
        : install ? (
          <div className="text-[13px] text-ink-2 leading-relaxed">
            <p className="font-medium text-ink">iPhone 要先把網站加到主畫面才能收通知：</p>
            <ol className="list-decimal pl-5 mt-1.5 space-y-0.5">
              <li>用 Safari 開這個網站</li>
              <li>按下方「分享」<span className="text-muted">（方框加箭頭）</span></li>
              <li>選「加入主畫面」</li>
              <li>從主畫面開啟，回到這一頁按「開啟通知」</li>
            </ol>
          </div>
        ) : !signedIn ? <div className="flex items-center gap-3 flex-wrap"><p className="text-[13px] text-muted">登入後才能開通知（這樣管理員才知道是誰）。</p><Button size="sm" onClick={onLogin}>登入</Button></div>
        : (
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant={sub ? 'outline' : 'primary'} size="sm" icon={sub ? <BellOff /> : <Bell />} disabled={busy || sub === null} onClick={() => void toggle()}>{sub ? '關閉通知' : '開啟通知'}</Button>
            {sub && <span className="text-[13px] text-muted">這台裝置會收到通知</span>}
          </div>
        )}
      {msg && <p role="status" className="mt-2 text-[12px] text-ink-2">{msg}</p>}
    </Card>
  )
}

/* ------------------------------------------------------------------ practice row */
function PracticeRow({ p, data, activeNames, isEditor, myName, editorEmail, onChanged, onError }: {
  p: Practice; data: PracticeData; activeNames: string[]; isEditor: boolean; myName: string | null; editorEmail: string | null; onChanged: () => Promise<void>; onError: (m: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ time: p.time, place: p.place ?? '', note: p.note ?? '' })
  const [proxyName, setProxyName] = useState('')
  const [proxyStatus, setProxyStatus] = useState<VoteStatus>('no')
  const t = tally(p, data.votes, activeNames)
  const votes = data.votes.filter((v) => v.practice_id === p.id)
  const byStatus = (s: VoteStatus) => activeNames.filter((n) => votes.find((v) => v.player_name === n)?.status === s)
  const none = activeNames.filter((n) => !votes.some((v) => v.player_name === n))
  const rolls = data.rolls.filter((r) => r.practice_id === p.id)
  const n = daysUntil(p.date)
  const past = practiceStart(p).getTime() <= Date.now()
  const off = p.status === 'cancelled'
  const soon = !off && n >= 0 && n <= 1
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); onError(null); try { await fn(); await onChanged() } catch (e) { onError(err(e)) } finally { setBusy(false) } }
  const cancel = () => { if (!window.confirm(`把 ${p.date} 的練球標記為取消，並通知大家？`)) return; void run(async () => { await updatePractice(p.id, { status: 'cancelled' }); try { await notifyNow(p.id, 'cancelled') } catch { /* push not set up */ } }) }
  const restore = () => void run(() => updatePractice(p.id, { status: 'scheduled' }))
  const saveEdit = () => void run(async () => { await updatePractice(p.id, { time: form.time, place: form.place.trim() || null, note: form.note.trim() || null }); setEditing(false) })
  const roll = (name: string, present: boolean | null) => void run(() => setRollCall(p.id, name, present))
  const fillFromVotes = () => void run(async () => { for (const name of activeNames) { if (rolls.some((r) => r.player_name === name)) continue; const v = votes.find((x) => x.player_name === name); await setRollCall(p.id, name, v?.status === 'yes' || v?.status === 'late') } })
  const presentCount = rolls.filter((r) => r.present).length
  const canRoll = isEditor && !off && n <= 0
  const names = (list: string[]) => list.map((name) => { const v = votes.find((x) => x.player_name === name); return <span key={name} className="inline-flex items-center gap-1">{name}{v?.late_reply && <span className="text-muted" title="晚回">·晚</span>}{v?.reason && (isEditor || name === myName) && <span className="text-muted">（{v.reason}）</span>}</span> })

  return (
    <li className={cx('px-4 md:px-5 py-3', off && 'opacity-60')}>
      <div className="flex items-center gap-4">
        <div className={cx('w-14 shrink-0 text-center rounded-[10px] py-1.5 tnum', soon ? 'bg-ink text-bg' : 'bg-surface-2 text-ink')}>
          <div className="text-[11px] leading-3 opacity-80">{p.date.slice(5, 7)} 月</div>
          <div className="text-[20px] font-semibold leading-6">{Number(p.date.slice(8, 10))}</div>
          <div className="text-[11px] leading-3 opacity-80">週{weekdayOf(p.date)}</div>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left cursor-pointer" aria-expanded={open}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-ink tnum">{p.time}</span>
            {p.place && <span className="inline-flex items-center gap-1 text-[13px] text-ink-2"><MapPin className="size-3.5 text-muted" />{p.place}</span>}
            {off ? <Badge variant="critical">停練</Badge> : <span className={cx('text-[12px] font-medium', soon ? 'text-accent' : 'text-muted')}>{whenLabel(p.date)}</span>}
            {p.notified_at && !off && <span className="text-[11px] text-muted">已通知</span>}
          </div>
          <div className="text-[12.5px] text-ink-2 mt-1 flex items-center gap-x-3 gap-y-0.5 flex-wrap tnum">
            {!off && <>
              <span className="text-[color-mix(in_srgb,var(--good)_70%,var(--ink))]">出席 {t.yes}</span>
              <span className="text-[color-mix(in_srgb,var(--warning)_45%,var(--ink))]">小遲 {t.late}</span>
              <span>請假 {t.no}</span>
              <span className="text-muted">未回覆 {t.none}</span>
              {rolls.length > 0 && <span className="text-ink font-medium">點名到 {presentCount}</span>}
            </>}
            {p.note && <span className="text-muted">{p.note}</span>}
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {!off && !past && <Button variant="ghost" size="sm" href={calendarUrl(p)} icon={<CalendarPlus />} title="加到 Google 日曆" aria-label="加到 Google 日曆" />}
          <Button variant="ghost" size="sm" icon={<ChevronDown className={cx('transition-transform', open && 'rotate-180')} />} aria-label={open ? '收合' : '展開'} onClick={() => setOpen((o) => !o)} />
        </div>
      </div>

      {open && (
        <div className="mt-3 pl-0 md:pl-[72px] flex flex-col gap-3">
          {!off && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px] leading-relaxed">
              {(['yes', 'late', 'no'] as VoteStatus[]).map((s) => { const list = byStatus(s); return <div key={s}><span className="font-medium text-ink">{VOTE_LABEL[s]} {list.length}</span><div className="text-ink-2 flex flex-wrap gap-x-2 gap-y-0.5">{list.length ? names(list) : <span className="text-muted">—</span>}</div></div> })}
              <div><span className="font-medium text-ink">未回覆 {none.length}</span><div className="text-muted flex flex-wrap gap-x-2">{none.length ? none.join('、') : '—'}</div></div>
            </div>
          )}
          {isEditor && (
            <div className="rounded-[12px] bg-surface-2 p-3 flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {!off && !editing && <Button size="sm" icon={<Pencil />} onClick={() => setEditing(true)}>改時間／地點</Button>}
                {!off ? <Button size="sm" variant="ghost" className="text-critical" disabled={busy} onClick={cancel}>停練並通知</Button> : <Button size="sm" disabled={busy} onClick={restore}>恢復這次練球</Button>}
                {!off && !past && <Button size="sm" variant="ghost" icon={<Send />} disabled={busy} onClick={() => void run(async () => { const r = await notifyNow(p.id, p.notified_at ? 'reminder' : 'notify'); onError(r.sent ? null : '沒有人訂閱通知') })}>{p.notified_at ? '催未回覆的人' : '現在就通知'}</Button>}
                {canRoll && <Button size="sm" variant={rolls.length ? 'outline' : 'primary'} icon={<ClipboardCheck />} disabled={busy} onClick={fillFromVotes}>{rolls.length ? '未點的依投票填入' : '依投票預填點名'}</Button>}
              </div>
              {editing && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                  <Field label="時間"><Input size="sm" type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} className="tnum" /></Field>
                  <Field label="地點"><Input size="sm" value={form.place} onChange={(e) => setForm((f) => ({ ...f, place: e.target.value }))} /></Field>
                  <Field label="備註"><Input size="sm" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="例如 改打擊練習" /></Field>
                  <div className="flex gap-1"><Button size="sm" variant="primary" disabled={busy} onClick={saveEdit}>儲存</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>取消</Button></div>
                </div>
              )}
              {!off && !past && (
                <div className="flex items-end gap-2 flex-wrap">
                  <Field label="代填（球員沒手機時）"><PlayerSelect size="sm" value={proxyName} onChange={setProxyName} names={activeNames} className="w-44" /></Field>
                  <Select size="sm" value={proxyStatus} onChange={(e) => setProxyStatus(e.target.value as VoteStatus)} options={(['yes', 'late', 'no'] as VoteStatus[]).map((s) => ({ value: s, label: VOTE_LABEL[s] }))} />
                  <Button size="sm" disabled={busy || !proxyName} onClick={() => void run(() => castVote({ practice_id: p.id, player_name: proxyName, status: proxyStatus, late_reply: isLateReply(p), by_proxy: editorEmail ?? 'editor' }))}>代填</Button>
                </div>
              )}
              {canRoll && (
                <div>
                  <div className="text-[12px] font-medium text-ink-2 mb-1.5">點名（到 {presentCount} ／ 未到 {rolls.length - presentCount} ／ 未點 {activeNames.length - rolls.filter((r) => activeNames.includes(r.player_name)).length}）</div>
                  <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                    {activeNames.map((name) => {
                      const r = rolls.find((x) => x.player_name === name)
                      const v = votes.find((x) => x.player_name === name)
                      return (
                        <li key={name} className="flex items-center gap-1.5 rounded-[8px] bg-surface px-2 py-1">
                          <span className="min-w-0 flex-1 text-[13px] text-ink truncate">{name}{v && <span className="text-[11px] text-muted ml-1">{VOTE_LABEL[v.status]}</span>}</span>
                          <button type="button" disabled={busy} onClick={() => roll(name, r?.present === true ? null : true)} className={cx('size-7 rounded-full text-[12px] font-medium cursor-pointer', r?.present === true ? 'bg-ink text-bg' : 'bg-surface-3 text-ink-2')} aria-label={`${name} 到`} aria-pressed={r?.present === true}>到</button>
                          <button type="button" disabled={busy} onClick={() => roll(name, r?.present === false ? null : false)} className={cx('size-7 rounded-full text-[12px] font-medium cursor-pointer', r?.present === false ? 'bg-critical text-white' : 'bg-surface-3 text-ink-2')} aria-label={`${name} 沒到`} aria-pressed={r?.present === false}>沒</button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/* ------------------------------------------------------------------ manage */
function SeriesForm({ initial, onSave, onCancel }: { initial: PracticeSeries | null; onSave: (s: Omit<PracticeSeries, 'id'> & { id?: string }) => Promise<void>; onCancel: () => void }) {
  const t = taipeiToday()
  const [s, setS] = useState({ weekday: initial?.weekday ?? 2, time: initial?.time ?? '18:30', place: initial?.place ?? '', start_date: initial?.start_date ?? t, end_date: initial?.end_date ?? addDays(t, 120), note: initial?.note ?? '' })
  const [busy, setBusy] = useState(false)
  return (
    <div className="rounded-[12px] bg-surface-2 p-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Field label="星期"><Select size="sm" value={String(s.weekday)} onChange={(e) => setS((x) => ({ ...x, weekday: Number(e.target.value) }))} className="w-full" options={WEEKDAYS.map((w, i) => ({ value: String(i), label: `週${w}` }))} /></Field>
        <Field label="時間"><Input size="sm" type="time" value={s.time} onChange={(e) => setS((x) => ({ ...x, time: e.target.value }))} className="tnum" /></Field>
        <Field label="地點"><Input size="sm" value={s.place} onChange={(e) => setS((x) => ({ ...x, place: e.target.value }))} placeholder="例如 台大棒球場" /></Field>
        <Field label="從"><Input size="sm" type="date" value={s.start_date} onChange={(e) => setS((x) => ({ ...x, start_date: e.target.value }))} className="tnum" /></Field>
        <Field label="到（學期末）"><Input size="sm" type="date" value={s.end_date} onChange={(e) => setS((x) => ({ ...x, end_date: e.target.value }))} className="tnum" /></Field>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy || !s.time || s.end_date < s.start_date} onClick={() => { setBusy(true); void onSave({ id: initial?.id, ...s, place: s.place.trim() || null, note: s.note.trim() || null }).finally(() => setBusy(false)) }}>{busy ? '儲存中…' : '儲存'}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>取消</Button>
      </div>
    </div>
  )
}

function BreakForm({ onSave, onCancel }: { onSave: (b: Omit<PracticeBreak, 'id'>) => Promise<void>; onCancel: () => void }) {
  const t = taipeiToday()
  const [kind, setKind] = useState<'exam' | 'other'>('exam')
  const [label, setLabel] = useState('期中考')
  const [start, setStart] = useState(t)
  const [end, setEnd] = useState(addDays(t, 6))
  const [busy, setBusy] = useState(false)
  const range = kind === 'exam' ? examBreak(start, end) : { start_date: start, end_date: end }
  return (
    <div className="rounded-[12px] bg-surface-2 p-3 flex flex-col gap-2">
      <Tabs size="sm" aria-label="停練種類" value={kind} onChange={(k) => { setKind(k); setLabel(k === 'exam' ? '期中考' : '暑假') }} items={[{ value: 'exam', label: '考試週（自動含考前一週）' }, { value: 'other', label: '寒暑假／其他' }]} className="self-start" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Field label="名稱"><Input size="sm" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        <Field label={kind === 'exam' ? '考試週第一天' : '從'}><Input size="sm" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="tnum" /></Field>
        <Field label={kind === 'exam' ? '考試週最後一天' : '到'}><Input size="sm" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="tnum" /></Field>
        <div className="text-[12px] text-muted self-end pb-2 tnum">停練 {range.start_date} 到 {range.end_date}</div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" disabled={busy || !label.trim() || end < start} onClick={() => { setBusy(true); void onSave({ label: label.trim(), ...range }).finally(() => setBusy(false)) }}>{busy ? '儲存中…' : '儲存'}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>取消</Button>
      </div>
    </div>
  )
}

function ManagePanel({ data, onChanged, onError }: { data: PracticeData; onChanged: () => Promise<void>; onError: (m: string | null) => void }) {
  const [editingSeries, setEditingSeries] = useState<PracticeSeries | 'new' | null>(null)
  const [addingBreak, setAddingBreak] = useState(false)
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); onError(null); try { await fn(); await generatePractices(8); await onChanged() } catch (e) { onError(err(e)) } finally { setBusy(false) } }
  const today = taipeiToday()
  return (
    <>
      <Card title="每週固定練球" subtitle="存好後會自動排出未來 8 週的場次；之後每天通知時也會往前補。" action={editingSeries === null ? <Button size="sm" icon={<Plus />} onClick={() => setEditingSeries('new')}>新增</Button> : undefined}>
        {editingSeries === 'new' && <SeriesForm initial={null} onSave={async (s) => { await run(() => saveSeries(s)); setEditingSeries(null) }} onCancel={() => setEditingSeries(null)} />}
        {data.series.length ? (
          <ul className={cx('divide-y divide-[var(--border)]', editingSeries === 'new' && 'mt-3')}>
            {data.series.map((s) => editingSeries !== 'new' && editingSeries?.id === s.id ? <li key={s.id} className="py-2"><SeriesForm initial={s} onSave={async (x) => { await run(() => saveSeries(x)); setEditingSeries(null) }} onCancel={() => setEditingSeries(null)} /></li> : (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <span className="w-12 shrink-0 text-[15px] font-semibold text-ink">週{WEEKDAYS[s.weekday]}</span>
                <span className="min-w-0 flex-1 text-[13px] text-ink-2 tnum">{s.time}{s.place && ` ・ ${s.place}`}<span className="text-muted"> ・ {s.start_date} 到 {s.end_date}{s.end_date < today && '（已結束）'}</span></span>
                <Button variant="ghost" size="sm" icon={<Pencil />} aria-label="編輯" onClick={() => setEditingSeries(s)} />
                <Button variant="ghost" size="sm" icon={<Trash2 />} aria-label="刪除" className="text-critical" disabled={busy} onClick={() => { if (window.confirm(`刪除週${WEEKDAYS[s.weekday]}的固定練球？未來場次會一起移除，已點名的會保留。`)) void run(() => deleteSeries(s.id)) }} />
              </li>
            ))}
          </ul>
        ) : editingSeries === null && <p className="text-[13px] text-muted">還沒有固定練球。按「新增」設定每週的哪一天、幾點、在哪。</p>}
      </Card>
      <Card title="停練期間" subtitle="考試週會自動連同考前一週一起停練；寒暑假直接填起訖日。範圍內的場次會標成停練。" action={!addingBreak ? <Button size="sm" icon={<Plus />} onClick={() => setAddingBreak(true)}>新增</Button> : undefined}>
        {addingBreak && <BreakForm onSave={async (b) => { await run(() => saveBreak(b)); setAddingBreak(false) }} onCancel={() => setAddingBreak(false)} />}
        {data.breaks.length ? (
          <ul className={cx('divide-y divide-[var(--border)]', addingBreak && 'mt-3')}>
            {data.breaks.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-[13px]"><span className="font-medium text-ink">{b.label}</span><span className="text-muted tnum ml-2">{b.start_date} 到 {b.end_date}{b.end_date < today && '（已過）'}</span></span>
                <Button variant="ghost" size="sm" icon={<Trash2 />} aria-label="刪除" className="text-critical" disabled={busy} onClick={() => { if (window.confirm(`移除「${b.label}」停練？`)) void run(() => deleteBreak(b.id)) }} />
              </li>
            ))}
          </ul>
        ) : !addingBreak && <p className="text-[13px] text-muted">目前沒有停練期間。</p>}
      </Card>
      <Card title="怎麼運作" subtitle="給管理員的提醒">
        <ul className="text-[13px] text-ink-2 leading-relaxed list-disc pl-5 space-y-1">
          <li>每天 18:00 系統會通知隔天有練球的人；截止是練球當天 09:00，之後回覆會標「晚回」。</li>
          <li>臨時取消：展開那一場按「停練並通知」。臨時加練：先在固定練球新增一筆只涵蓋那天的，再按儲存。</li>
          <li>練球當天展開那一場就能點名；「依投票預填」後只要改沒來的人。出席率以點名為準，沒點名的場次用投票算。</li>
          <li>球員要用名單上的信箱登入才能投票：到「球員」頁「編輯名單」填 Email 欄。</li>
        </ul>
      </Card>
    </>
  )
}

/* ------------------------------------------------------------------ page */
export function PracticePage() {
  const cloud = useDataStore((s) => s.cloud)
  const roster = useDataStore((s) => s.base.roster)
  const isEditor = !!cloud.user && cloud.isEditor
  const signedIn = !!cloud.user
  const [data, setData] = useState<PracticeData | null | 'missing' | 'loading'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('next')
  const [login, setLogin] = useState(false)
  const [busy, setBusy] = useState(false)
  const today = taipeiToday()
  const activeNames = useMemo(() => roster.filter((p) => !p.status || p.status === '現役').map((p) => p.name), [roster])

  const refresh = useCallback(async () => {
    if (!cloud.configured) return
    try { const d = await loadPractice(addDays(today, -120), addDays(today, 56), isEditor, signedIn); setData(d ?? 'missing') }
    catch (e) { setError(err(e)); setData((d) => (d === 'loading' ? null : d)) }
  }, [cloud.configured, isEditor, signedIn, today])
  useEffect(() => { void refresh() }, [refresh])

  if (!cloud.configured) return <><PageHeader title="練球" description="練球時程、出席投票與點名。" /><Card><EmptyState title="練球點名需要雲端模式" description="這個功能的資料存在 Supabase；本機模式沒有練球資料。" /></Card></>
  if (data === 'loading') return <><PageHeader title="練球" description="練球時程、出席投票與點名。" /><Card><EmptyState compact title="讀取中…" /></Card></>
  if (data === 'missing' || data === null) return <><PageHeader title="練球" description="練球時程、出席投票與點名。" /><Card><EmptyState title="練球功能還沒開通" description={error ?? '管理員請在 Supabase SQL Editor 執行 supabase/migrations/2026-09-13_practice.sql。'} /></Card></>

  const d = data
  const myName = d.myName
  const upcoming = d.practices.filter((p) => p.date >= today)
  const next = upcoming.find((p) => canVote(p))
  const myVote = (p: Practice) => (myName ? d.votes.find((v) => v.practice_id === p.id && v.player_name === myName) : undefined)
  const vote = async (p: Practice, s: VoteStatus, reason: string) => {
    if (!myName) return
    setBusy(true); setError(null)
    try { await castVote({ practice_id: p.id, player_name: myName, status: s, reason, late_reply: isLateReply(p) }); await refresh() } catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  const mine = myName ? attendanceRate(myName, d.practices, d.votes, d.rolls) : null
  const teamRates = isEditor ? activeNames.map((n) => ({ name: n, ...attendanceRate(n, d.practices, d.votes, d.rolls) })).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || a.name.localeCompare(b.name, 'zh-Hant')) : []
  const heldCount = d.practices.filter((p) => p.status === 'scheduled' && practiceStart(p).getTime() <= Date.now()).length
  const tabs: Array<{ value: Tab; label: string }> = [{ value: 'next', label: '練球' }, { value: 'rate', label: '出席率' }, ...(isEditor ? [{ value: 'manage' as Tab, label: '管理' }] : [])]
  const rowProps = { data: d, activeNames, isEditor, myName, editorEmail: cloud.user?.email ?? null, onChanged: refresh, onError: setError }

  return (
    <>
      <PageHeader title="練球" description={next ? `下一次練球 ${next.date.slice(5).replace('-', '/')}（${weekdayOf(next.date)}）${next.time}${next.place ? `・${next.place}` : ''}，${whenLabel(next.date)}。回覆截止練球當天 09:00。` : '目前沒有排定的練球。'}
        actions={<Tabs size="sm" aria-label="練球頁分頁" value={tab} onChange={setTab} items={tabs} />} />
      {error && <div role="alert" className="rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--critical)_10%,var(--surface))] px-3 py-2.5 text-[13px] text-critical">{error}</div>}

      {tab === 'next' && (<>
        {next && (
          <Card title="你會來嗎？" subtitle={`${next.date}（${weekdayOf(next.date)}）${next.time}${next.place ? `・${next.place}` : ''}${next.note ? `・${next.note}` : ''}`}>
            {!signedIn ? (
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-[13px] text-ink-2">用名單上的信箱登入就能回覆（登入不會取得紀錄員權限）。</p>
                <Button variant="primary" size="sm" onClick={() => setLogin(true)}>登入回覆</Button>
              </div>
            ) : !myName ? (
              <p className="text-[13px] text-ink-2">你登入的信箱 <span className="font-medium text-ink">{cloud.user?.email}</span> 不在球員名單上。請管理員到「球員」頁「編輯名單」把你的 Email 填進去。</p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="text-[13px] text-muted">以 <span className="font-medium text-ink">{myName}</span> 的身分回覆</div>
                <VoteButtons practice={next} mine={myVote(next)} onVote={(s, r) => vote(next, s, r)} busy={busy} />
              </div>
            )}
          </Card>
        )}
        {myName && upcoming.filter((p) => p.id !== next?.id && canVote(p)).length > 0 && (
          <Card title="之後的練球先回覆" subtitle="已經知道要請假的，可以先填" flush>
            <ul className="divide-y divide-[var(--border)]">
              {upcoming.filter((p) => p.id !== next?.id && canVote(p)).map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 md:px-5 py-2.5 flex-wrap">
                  <span className="w-28 shrink-0 text-[13px] text-ink tnum">{p.date.slice(5).replace('-', '/')}（{weekdayOf(p.date)}）{p.time}</span>
                  <div className="min-w-0 flex-1"><VoteButtons size="sm" practice={p} mine={myVote(p)} onVote={(s, r) => vote(p, s, r)} busy={busy} /></div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="接下來 8 週" subtitle="點一場看誰來、誰請假；管理員可在這裡改時間、停練、點名" flush>
          {upcoming.length ? <ul className="divide-y divide-[var(--border)]">{upcoming.map((p) => <PracticeRow key={p.id} p={p} {...rowProps} />)}</ul>
            : <EmptyState compact title="沒有排定的練球" description={isEditor ? '到「管理」分頁設定每週固定練球。' : '等管理員排上練球。'} />}
        </Card>
        <PushCard myName={myName} signedIn={signedIn} onLogin={() => setLogin(true)} />
        {d.practices.some((p) => p.date < today) && (
          <Card title="最近的練球" subtitle="展開可看點名結果" flush>
            <ul className="divide-y divide-[var(--border)]">{d.practices.filter((p) => p.date < today).slice(-6).reverse().map((p) => <PracticeRow key={p.id} p={p} {...rowProps} />)}</ul>
          </Card>
        )}
      </>)}

      {tab === 'rate' && (<>
        <Card title={myName ? `${myName} 的出席` : '我的出席'} subtitle={`最近 120 天、已進行 ${heldCount} 次練球。出席與小遲都算到；請假不計入分母；沒回覆又沒到算缺席。`}>
          {!signedIn ? <div className="flex items-center gap-3 flex-wrap"><p className="text-[13px] text-ink-2">登入後看自己的出席率。</p><Button size="sm" onClick={() => setLogin(true)}>登入</Button></div>
            : !myName ? <p className="text-[13px] text-ink-2">你的信箱不在球員名單上，請管理員加上。</p>
            : mine && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[['出席率', mine.rate === null ? '—' : `${Math.round(mine.rate * 100)}%`], ['到', String(mine.attended)], ['請假', String(mine.excused)], ['缺席', String(mine.absent)]].map(([k, v]) => (
                  <div key={k} className="rounded-[12px] bg-surface-2 px-4 py-3"><div className="text-[12px] text-muted">{k}</div><div className="text-[22px] font-semibold text-ink tnum">{v}</div></div>
                ))}
              </div>
            )}
        </Card>
        {isEditor && (
          <Card title="全隊出席率" subtitle="依出席率排序；只有管理員看得到這張表" flush>
            {heldCount ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead><tr className="text-left text-[12px] text-muted"><th className="px-4 md:px-5 py-2 font-medium">球員</th><th className="px-3 py-2 font-medium text-right">出席率</th><th className="px-3 py-2 font-medium text-right">到</th><th className="px-3 py-2 font-medium text-right">請假</th><th className="px-3 py-2 font-medium text-right pr-4 md:pr-5">缺席</th></tr></thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {teamRates.map((r) => (
                      <tr key={r.name}>
                        <td className="px-4 md:px-5 py-2 font-medium text-ink">{r.name}</td>
                        <td className={cx('px-3 py-2 text-right tnum', r.rate !== null && r.rate < 0.6 && 'text-critical')}>{r.rate === null ? '—' : `${Math.round(r.rate * 100)}%`}</td>
                        <td className="px-3 py-2 text-right tnum">{r.attended}</td><td className="px-3 py-2 text-right tnum text-muted">{r.excused}</td><td className="px-3 py-2 text-right tnum pr-4 md:pr-5">{r.absent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState compact title="還沒有進行過的練球" />}
          </Card>
        )}
      </>)}

      {tab === 'manage' && isEditor && <ManagePanel data={d} onChanged={refresh} onError={setError} />}

      <AuthDialog open={login} onClose={() => setLogin(false)} title="球員登入" intro="用名單上的信箱登入來回覆練球；紀錄員也用同一個入口。" />
    </>
  )
}
