import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Field, Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { useOutings } from '../components/ui/RestHint'
import { TEAM } from '../config/team'
import { backOn, md, mdWeek, restBoard, rulesText, type RestStatus } from '../data/pitchRest'
import { scheduledGames } from '../data/schedule'
import { localDate } from '../lib/dates'
import { useDataStore } from '../store/data'

/** One pitcher: name and badge, when he may pitch again, his latest outings, and the reminders. */
function PitcherRow({ s, number }: { s: RestStatus; number?: string }) {
  const last = s.days[s.days.length - 1]
  const recent = s.days.flatMap((d) => d.games).slice(-3).reverse()
  return (
    <li className="px-4 py-3 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        {number && <span className="text-[12px] text-muted tnum shrink-0">#{number}</span>}
        <Link to={`/players?player=${encodeURIComponent(s.name)}`} className="text-[14px] font-medium text-ink truncate leading-9 pointer-fine:leading-5 hover:underline underline-offset-2">{s.name}</Link>
        <Badge variant={s.available ? 'good' : 'warning'} className="shrink-0">{s.available ? '可出賽' : '休息中'}</Badge>
      </div>
      <div className="text-[13px] text-ink-2">
        {s.available ? (last ? `上次 ${md(last.date)} 投 ${last.pitches} 球` : '') : `${backOn(s)}・${s.reason ?? ''}`}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {recent.map((o) => (
          <Link key={o.gameId} to={`/games?game=${encodeURIComponent(o.gameId)}`} className="inline-flex items-center h-9 pointer-fine:h-7 px-2 rounded-[6px] bg-surface-2 text-[12px] text-ink hover:bg-surface-3 tnum">
            {md(o.date)} vs {o.opponent} {o.pitches} 球
          </Link>
        ))}
        <span className="text-[12px] text-muted tnum">近 7 天 {s.last7} 球</span>
      </div>
      {s.warnings.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {s.warnings.map((w) => <li key={w} className="text-[12px] text-warning leading-snug">{w}</li>)}
        </ul>
      )}
    </li>
  )
}

/**
 * 投手休息表 (/pitching/rest): who may pitch on a given day after his recent outings, following the team's rules
 * (MLB Pitch Smart 19–22 歲建議 by default). Real games only, never the demo data; the filters above do not apply.
 */
export function PitcherRestPage() {
  const base = useDataStore((s) => s.base)
  const all = useOutings()
  const today = localDate()
  const upcoming = useMemo(() => scheduledGames(base.games).filter((g) => g.date >= today).slice(0, 5), [base.games, today])
  const [pick, setPick] = useState('today')
  const [custom, setCustom] = useState(today)
  const asOf = pick === 'custom' ? custom || today : upcoming.find((g) => g.id === pick)?.date ?? today
  const rules = TEAM.pitchRest
  const board = useMemo(() => restBoard(base, asOf, rules, all), [base, asOf, rules, all])
  const numbers = useMemo(() => new Map(base.roster.map((p) => [p.name, p.number])), [base.roster])
  const options = [
    { value: 'today', label: `今天 ${mdWeek(today)}` },
    ...upcoming.map((g) => ({ value: g.id, label: `${mdWeek(g.date)}vs ${g.opponent}` })),
    { value: 'custom', label: '自訂日期' },
  ]
  const rows = (list: RestStatus[]) => <ul className="divide-y divide-[var(--border)]">{list.map((s) => <PitcherRow key={s.name} s={s} number={numbers.get(s.name)} />)}</ul>
  const empty = (text: string) => <p className="px-4 py-3 text-[13px] text-muted">{text}</p>
  // 可以出賽 counts everyone who may pitch on asOf: those who pitched lately and are rested, plus the roster's
  // pitchers with no outing in the window (named in one line at the bottom of the card)
  const canPitch = board.available.length + board.idle.length
  return (
    <>
      <PageHeader title="投手休息表" description="依 MLB Pitch Smart 19–22 歲的建議（不是聯盟規定）：每位投手最近出賽的用球數、要休幾天、最早哪天可以再投。不受上方篩選影響。" />
      <Card bodyClassName="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <Field label="看哪一天" className="sm:w-[280px]"><Select value={pick} onChange={(e) => setPick(e.target.value)} options={options} className="w-full" /></Field>
          {pick === 'custom' && <Field label="日期" className="sm:w-[200px]"><Input type="date" value={custom} onChange={(e) => setCustom(e.target.value)} className="tnum w-full" /></Field>}
          <span className="text-[12px] text-muted sm:pb-2">{asOf === today ? '今天' : mdWeek(asOf)}能不能投，只是提醒，不會擋住換投</span>
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 items-start">
        <Card still title={`可以出賽（${canPitch} 人）`} flush>
          <div className="divide-y divide-[var(--border)]">
            {board.available.length > 0 && rows(board.available)}
            {board.idle.length > 0 && <p className="px-4 py-3 text-[13px] text-ink-2">最近 {rules.windowDays} 天沒出賽：{board.idle.join('、')}（都可以出賽）</p>}
            {!canPitch && empty(board.resting.length ? '最近有出賽的投手都還在休息' : `最近 ${rules.windowDays} 天沒有投手出賽`)}
          </div>
        </Card>
        <Card still title={`休息中（${board.resting.length} 人）`} flush>{board.resting.length ? rows(board.resting) : empty('沒有人在休息')}</Card>
      </div>
      <Card still title="規則" subtitle={rules.source}>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px] text-ink">
          {rulesText(rules).map((l) => <li key={l}>{l}</li>)}
        </ul>
        <p className="text-[12px] text-muted mt-3 leading-relaxed">用球數是紀錄的每一球加總；打席還沒結束就換局（例如盜壘出局結束半局）的那幾球沒有算進去。雙重賽同一天的用球數會加在一起。</p>
      </Card>
    </>
  )
}
