import { useMemo, useState } from 'react'
import { CalendarPlus, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { useDataStore } from '../store/data'
import { useFilterOptions } from '../hooks/useStats'
import { nextGameId } from '../record/model'
import { TEAM_NAME } from '../data/seed'
import type { Game } from '../data/types'
import { cx } from '../lib/format'

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
const today = () => new Date().toISOString().slice(0, 10)
const dayOf = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return Number.isNaN(d.getTime()) ? '' : WEEKDAY[d.getDay()] }
const daysUntil = (iso: string) => Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86_400_000)
const whenLabel = (iso: string) => { const n = daysUntil(iso); return n === 0 ? '今天' : n === 1 ? '明天' : n === 2 ? '後天' : n > 0 ? `${n} 天後` : `${-n} 天前` }

/** Google Calendar "add event" link: no file download, works on every phone. */
function calendarUrl(g: Game): string {
  const d = g.date.replace(/-/g, '')
  const t = (g.time ?? '').replace(':', '')
  const start = t ? `${d}T${t.padEnd(6, '0')}` : d
  const endDate = t ? `${d}T${String(Math.min(23, Number(t.slice(0, 2)) + 3)).padStart(2, '0')}${t.slice(2, 4).padEnd(4, '0')}` : String(Number(d) + 1)
  const p = new URLSearchParams({ action: 'TEMPLATE', text: `${TEAM_NAME} vs ${g.opponent}${g.tournament ? `（${g.tournament}）` : ''}`, dates: `${start}/${endDate}`, location: g.venue ?? '', details: g.note ?? '' })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

/* ------------------------------------------------------------------ form */
function GameForm({ initial, onSave, onCancel, onDelete }: { initial: Game | null; onSave: (g: Game) => Promise<void>; onCancel: () => void; onDelete?: () => Promise<void> }) {
  const base = useDataStore((s) => s.base)
  const opts = useFilterOptions()
  const [g, setG] = useState<Game>(initial ?? { id: '', date: today(), tournament: opts.tournaments[0] ?? '友誼賽', opponent: '', homeAway: '主', innings: 7, status: 'scheduled' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Game>(k: K, v: Game[K]) => setG((x) => ({ ...x, [k]: v }))
  const submit = async () => {
    setError(null)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date)) { setError('請選日期'); return }
    if (!g.opponent.trim()) { setError('請填對手'); return }
    setBusy(true)
    try { await onSave({ ...g, id: g.id || nextGameId(g.date, base.games.map((x) => x.id)), opponent: g.opponent.trim(), tournament: g.tournament.trim() || '未分類', venue: g.venue?.trim() || undefined, note: g.note?.trim() || undefined, time: g.time || undefined }) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <Card still title={initial ? '編輯賽程' : '新增賽程'} subtitle="比賽當天在「紀錄比賽」選這場就能直接開始記，不用重填">
      <datalist id="sch-tournaments">{opts.tournaments.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="sch-opponents">{opts.opponents.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="日期"><Input type="date" value={g.date} onChange={(e) => set('date', e.target.value)} className="tnum" /></Field>
        <Field label="時間"><Input type="time" value={g.time ?? ''} onChange={(e) => set('time', e.target.value || undefined)} className="tnum" /></Field>
        <Field label="杯賽"><Input list="sch-tournaments" value={g.tournament} onChange={(e) => set('tournament', e.target.value)} /></Field>
        <Field label="對手"><Input list="sch-opponents" value={g.opponent} onChange={(e) => set('opponent', e.target.value)} placeholder="必填" /></Field>
        <Field label="主客"><Select value={g.homeAway} onChange={(e) => set('homeAway', e.target.value as Game['homeAway'])} className="w-full" options={[{ value: '主', label: '主場（對方先攻）' }, { value: '客', label: '客場（我隊先攻）' }]} /></Field>
        <Field label="場地"><Input value={g.venue ?? ''} onChange={(e) => set('venue', e.target.value)} placeholder="例如 台大棒球場" /></Field>
        <Field label="集合／備註" className="col-span-2"><Input value={g.note ?? ''} onChange={(e) => set('note', e.target.value)} placeholder="例如 12:30 球場集合、穿白色球衣" /></Field>
      </div>
      {error && <p className="mt-3 text-[13px] text-critical">{error}</p>}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <Button variant="primary" onClick={() => void submit()} disabled={busy}>{busy ? '儲存中…' : '儲存'}</Button>
        <Button variant="ghost" onClick={onCancel} icon={<X />}>取消</Button>
        {initial && <Button variant="ghost" onClick={() => void onSave({ ...g, status: g.status === 'cancelled' ? 'scheduled' : 'cancelled' })}>{g.status === 'cancelled' ? '恢復這場' : '標記為取消'}</Button>}
        {onDelete && <Button variant="ghost" className="ml-auto text-critical" icon={<Trash2 />} onClick={() => { if (window.confirm('刪除這筆賽程？')) void onDelete() }}>刪除</Button>}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ section */
/** The schedule half of the 比賽 page: what is coming, what still needs recording, what was called off. */
export function ScheduleSection() {
  const base = useDataStore((s) => s.base)
  const saveGame = useDataStore((s) => s.saveGame)
  const deleteGame = useDataStore((s) => s.deleteGame)
  const canEdit = useDataStore((s) => s.canEdit)()
  const [editing, setEditing] = useState<Game | null | 'new'>(null)
  const [error, setError] = useState<string | null>(null)
  const t = today()
  const upcoming = useMemo(() => base.games.filter((g) => g.status === 'scheduled' && g.date >= t).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')), [base.games, t])
  const missed = useMemo(() => base.games.filter((g) => g.status === 'scheduled' && g.date < t).sort((a, b) => b.date.localeCompare(a.date)), [base.games, t])
  const cancelled = useMemo(() => base.games.filter((g) => g.status === 'cancelled').sort((a, b) => b.date.localeCompare(a.date)), [base.games])
  const save = async (g: Game) => { try { await saveGame({ game: g, batting: [], pitching: [], fielding: [] }); setEditing(null); setError(null) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  const remove = async (id: string) => { try { await deleteGame(id); setEditing(null) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }

  const Row = ({ g, tone }: { g: Game; tone: 'up' | 'past' | 'off' }) => {
    const n = daysUntil(g.date)
    const soon = tone === 'up' && n >= 0 && n <= 2
    if (editing && editing !== 'new' && editing.id === g.id) return <li><GameForm initial={g} onSave={save} onCancel={() => setEditing(null)} onDelete={() => remove(g.id)} /></li>
    return (
      <li className={cx('flex items-center gap-4 px-4 md:px-5 py-3', tone === 'off' && 'opacity-60')}>
        <div className={cx('w-14 shrink-0 text-center rounded-[10px] py-1.5 tnum', soon ? 'bg-ink text-bg' : 'bg-surface-2 text-ink')}>
          <div className="text-[11px] leading-3 opacity-80">{g.date.slice(5, 7)} 月</div>
          <div className="text-[20px] font-semibold leading-6">{Number(g.date.slice(8, 10))}</div>
          <div className="text-[11px] leading-3 opacity-80">週{dayOf(g.date)}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-ink">vs {g.opponent}</span>
            <Badge>{g.homeAway === '主' ? '主場' : '客場'}</Badge>
            {g.tournament && <span className="text-[12px] text-muted">{g.tournament}</span>}
            {tone === 'up' && <span className={cx('text-[12px] font-medium', soon ? 'text-accent' : 'text-muted')}>{whenLabel(g.date)}</span>}
            {tone === 'off' && <Badge variant="critical">已取消</Badge>}
          </div>
          <div className="text-[13px] text-ink-2 mt-0.5 flex items-center gap-x-3 gap-y-0.5 flex-wrap tnum">
            {g.time && <span>{g.time}</span>}
            {g.venue && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5 text-muted" />{g.venue}</span>}
            {g.note && <span className="text-muted">{g.note}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {tone === 'up' && <Button variant="ghost" size="sm" href={calendarUrl(g)} icon={<CalendarPlus />} title="加到 Google 日曆" aria-label="加到 Google 日曆" />}
          {canEdit && <Button variant="ghost" size="sm" icon={<Pencil />} aria-label="編輯" onClick={() => setEditing(g)} />}
        </div>
      </li>
    )
  }

  return (
    <>
      {error && <div role="alert" className="rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--critical)_10%,var(--surface))] px-3 py-2.5 text-[13px] text-critical">{error}</div>}
      {editing === 'new' && <GameForm initial={null} onSave={save} onCancel={() => setEditing(null)} />}
      <Card title="接下來" subtitle={upcoming.length ? '點日曆圖示可加到 Google 日曆；比賽當天紀錄員在「紀錄比賽」選這場就能開始記' : undefined}
        action={canEdit && editing !== 'new' ? <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing('new')}>新增賽程</Button> : undefined} flush>
        {upcoming.length ? <ul className="divide-y divide-[var(--border)]">{upcoming.map((g) => <Row key={g.id} g={g} tone="up" />)}</ul>
          : <EmptyState compact title="沒有排定的比賽" description={canEdit ? '按右上角「新增賽程」。' : '等紀錄員排上賽程。'} />}
      </Card>
      {missed.length > 0 && (
        <Card title="日期已過、還沒記錄" subtitle="打完了就去「紀錄比賽」補記，或標記為取消" flush>
          <ul className="divide-y divide-[var(--border)]">{missed.map((g) => <Row key={g.id} g={g} tone="past" />)}</ul>
        </Card>
      )}
      {cancelled.length > 0 && <Card title="已取消" flush><ul className="divide-y divide-[var(--border)]">{cancelled.map((g) => <Row key={g.id} g={g} tone="off" />)}</ul></Card>}
    </>
  )
}

/** How soon the next scheduled game is, so the 比賽 page can open on the right tab. */
export function daysToNextGame(games: Game[]): number | null {
  const t = today()
  const next = games.filter((g) => g.status === 'scheduled' && g.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0]
  return next ? daysUntil(next.date) : null
}
