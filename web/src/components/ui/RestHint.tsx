import { useMemo } from 'react'
import { TEAM } from '../../config/team'
import { md, mdWeek, outings, restStatus, type Outing } from '../../data/pitchRest'
import { cx } from '../../lib/format'
import { useDataStore } from '../../store/data'

/** Every recorded outing (real games only: base, never the demo data), computed once per change of the data. */
export function useOutings(): Outing[] {
  const base = useDataStore((s) => s.base)
  return useMemo(() => outings(base), [base])
}

/**
 * One 12px line under a 先發投手 field: amber when the pitcher should still rest on `asOf` (the game's date), grey with
 * his last outing otherwise, nothing when he has no outing in the last 30 days. A reminder only (Pitch Smart 建議).
 */
export function RestHint({ name, asOf, excludeGameId, className }: { name: string; asOf: string; excludeGameId?: string; className?: string }) {
  const all = useOutings()
  const s = useMemo(() => (name && asOf ? restStatus(name, all, asOf, TEAM.pitchRest, { excludeGameId }) : null), [name, asOf, all, excludeGameId])
  const last = s?.days[s.days.length - 1]
  if (!s || !last) return null
  return (
    <p className={cx('text-[12px] leading-snug', s.available ? 'text-muted' : 'text-warning', className)}>
      {s.available ? `${name} 上次 ${md(last.date)} 投 ${last.pitches} 球，可以出賽` : `${name} ${s.reason ?? ''}，${mdWeek(s.earliest)}起可投（Pitch Smart 建議）`}
    </p>
  )
}
