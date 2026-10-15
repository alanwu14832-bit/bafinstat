/**
 * 修改資料, batch 17: who stood where in each inning we fielded (the 當日登錄名單 with every change, data/gameRoster
 * defenseTimeline), a 守位變動 added by hand when 紀錄比賽 missed it, and the 守備 lines' 失誤 put back on the players who
 * stood at those positions (data/edit fieldingErrorFixes). Errors, putouts and assists follow this alignment.
 */
import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'
import { Select } from './Select'
import { cx } from '../../lib/format'
import { defenseTimeline } from '../../data/gameRoster'
import { FIELD_POSITIONS, posNum, type DayRosterSub, type GameDayRoster, type HomeAway } from '../../data/types'
import type { ErrorFix } from '../../data/edit'

const chip = (on: boolean) => cx('h-9 pointer-fine:h-8 min-w-9 px-2.5 rounded-[var(--radius-sm)] border text-[12px] font-medium tnum cursor-pointer transition-colors', on ? 'border-ink bg-ink text-bg' : 'border-border bg-surface text-ink-2 hover:bg-surface-2')

/** 每局守備: pick an inning, see who stood at each position, add a 守位變動 from that inning on. */
export function DefenseByInning({ roster, innings, homeAway, names, onAdd }: {
  roster?: Pick<GameDayRoster, 'starters' | 'subs'>
  innings: number
  homeAway: HomeAway
  /** everyone who can be put at a position */
  names: string[]
  onAdd: (sub: DayRosterSub) => void
}) {
  const [inning, setInning] = useState(1)
  const [who, setWho] = useState('')
  const [pos, setPos] = useState('')
  // someone who is not in the game at that inning comes in for a player (a 守備 substitution, not a 守位變動)
  const [forWho, setForWho] = useState('')
  const half: 'top' | 'bottom' = homeAway === '客' ? 'bottom' : 'top'
  const timeline = useMemo(() => defenseTimeline(roster), [roster])
  const n = Math.max(1, innings)
  const at = Math.min(inning, n)
  const d = timeline?.(at, half)
  if (!timeline) return <p className="text-[12px] text-muted">先發填了守位，這裡就會列出每一局誰守哪裡（失誤、刺殺、助殺依這個算給球員）。</p>
  const entering = !!who && !d?.inGame.has(who)
  const out = entering ? forWho : who
  // the batting slot goes with the change (the Box Score and 逐局表 place him by it): his own, or the one he takes over
  const slot = d?.slot.get(out)
  const add = () => {
    if (!who || !pos || !out) return
    onAdd({ kind: 'DEF', in: who, out, pos, inning: at, half, ...(slot === undefined ? {} : { slot }) })
    setWho(''); setPos(''); setForWho('')
  }
  const inGame = [...(d?.inGame ?? [])]
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="看哪一局的守備">
        {Array.from({ length: n }, (_, i) => i + 1).map((k) => <button key={k} type="button" aria-pressed={k === at} onClick={() => setInning(k)} className={chip(k === at)}>{k}</button>)}
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[13px]" aria-label={`第 ${at} 局守備`}>
        {FIELD_POSITIONS.filter((p) => p !== 'P').map((p) => (
          <li key={p} className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] text-muted tnum shrink-0 w-11">{posNum(p)}</span>
            <span className={cx('truncate', d?.byPos.get(p) ? 'text-ink font-medium' : 'text-muted')}>{d?.byPos.get(p) ?? '—'}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted">投手的失誤算給那個打席的投手。守位不對：從這一局起改守位（例如代打留下來守游擊）；沒上場的人換上來守，再選「替誰」。</p>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="誰" value={who} onChange={(e) => { setWho(e.target.value); setForWho('') }} options={[{ value: '', label: '誰' }, ...[...inGame, ...names.filter((x) => !d?.inGame.has(x))].map((x) => ({ value: x, label: d?.byName.get(x) ? `${x}（${d.byName.get(x)}）` : d?.inGame.has(x) ? x : `${x}（換上場）` }))]} className="w-[140px]" />
        {entering && <Select aria-label="替誰" value={forWho} onChange={(e) => setForWho(e.target.value)} options={[{ value: '', label: '替誰' }, ...inGame.map((x) => ({ value: x, label: d?.byName.get(x) ? `${x}（${d.byName.get(x)}）` : x }))]} className="w-[140px]" />}
        <Select aria-label="改守" value={pos} onChange={(e) => setPos(e.target.value)} options={[{ value: '', label: entering ? '守' : '改守' }, ...FIELD_POSITIONS.filter((p) => p !== 'P').map((p) => ({ value: p, label: posNum(p) }))]} className="w-[96px]" />
        <Button size="sm" variant="outline" onClick={add} disabled={!who || !pos || !out}>{entering ? `從第 ${at} 局起換上場` : `從第 ${at} 局起改守位`}</Button>
      </div>
    </div>
  )
}

/** The 守備 lines' 失誤 do not match who stood there: list them and fix with one tap. */
export function ErrorFixNotice({ fixes, onApply }: { fixes: ErrorFix[]; onApply: () => void }) {
  if (!fixes.length) return null
  return (
    <div role="status" className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2.5 text-[12px] text-ink">
      <div className="flex items-start gap-2"><AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning" /><span>守備表的失誤和逐打席紀錄＋登錄名單的守位對不起來（換人後的守位以前沒有記下來）：</span></div>
      <ul className="flex flex-col gap-0.5 pl-6 tnum">
        {fixes.map((f) => <li key={`${f.player}|${f.pos}`}>{f.player} {f.pos}：失誤 {f.from} → {f.to}</li>)}
      </ul>
      <div className="pl-6"><Button size="sm" variant="outline" onClick={onApply}>依登錄名單重算失誤</Button><span className="ml-2 text-muted">按「儲存修改」才會生效</span></div>
    </div>
  )
}
