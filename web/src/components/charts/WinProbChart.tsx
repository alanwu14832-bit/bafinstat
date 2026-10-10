import { useId, useMemo, useRef, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { axisCommon, chartClick, primeTouch, useChartAnimation, useChartTheme } from './common'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { eventText, situationText, type GameEvent } from '../../data/winTimeline'
import type { BattingPA, PitchingPA } from '../../data/types'
import { signedPtsBetween } from '../../lib/fmt'

interface Point { x: number; v: number; event?: GameEvent }

const pct = (w: number) => `${Math.round(w * 100)}%`
const halfLabel = (e: GameEvent) => `${e.inning}${e.half === 'top' ? '上' : '下'}`

export interface WinProbChartProps {
  events: GameEvent[]
  rows: { bat: BattingPA[]; pit: PitchingPA[] }
  /** our team's name, for the screen-reader summary */
  teamName: string
  /** 勝 / 敗 / 和 at the end of the line */
  resultLabel: string
  /** a point was picked: open that half-inning */
  onPick?: (e: GameEvent) => void
}

/**
 * 獲勝機率走勢: our win probability after every plate appearance and runner play, straight lines between them, team
 * colour above 50% and grey below, a faint line where each half-inning starts. Tap / hover for what happened.
 */
export function WinProbChart({ events, rows, teamName, resultLabel, onPick }: WinProbChartProps) {
  const mobile = useIsMobile()
  const anim = useChartAnimation()
  const theme = useChartTheme()
  const gradId = useId().replace(/:/g, '')
  // a finger has no hover: its tap shows the point's tooltip and offers the jump below the chart; a mouse click
  // (the tooltip already read on hover) jumps straight away
  const pointer = useRef<string>('mouse')
  const [tap, setTap] = useState<{ e: GameEvent | null; of: GameEvent[] } | null>(null)
  const tapped = tap?.of === events ? tap.e : null
  const pick = (p: Point) => {
    if (pointer.current !== 'mouse') setTap({ e: p.event ?? null, of: events })
    else if (p.event) onPick?.(p.event)
  }
  const points = useMemo<Point[]>(() => (events.length ? [{ x: 0, v: events[0].weBefore * 100 }, ...events.map((e, i) => ({ x: i + 1, v: e.weAfter * 100, event: e }))] : []), [events])
  // half-inning starts: the point just before each half's first event
  const starts = useMemo(() => events.map((e, i) => ({ e, x: i })).filter(({ e }) => e.halfStart), [events])
  const n = points.length - 1
  const labels = new Map<number, string>()
  for (const { e, x } of starts) {
    if (x === 0) continue
    if (mobile) { if (e.half === 'top') labels.set(x, String(e.inning)) }
    else labels.set(x, halfLabel(e))
  }
  labels.set(0, '開賽')
  labels.set(n, resultLabel)
  const ticks = [...labels.keys()].sort((a, z) => a - z)
  // the fill splits at 50%: the area runs from the line to the 50% line, so its box is [min(v, 50), max(v, 50)]
  const hi = Math.max(50, ...points.map((p) => p.v)), lo = Math.min(50, ...points.map((p) => p.v))
  const split = hi === lo ? 0.5 : (hi - 50) / (hi - lo)
  const [above, below] = [theme.series[0], theme.series[1]]
  // screen readers: the start, the end of each inning, the end
  const summary = useMemo(() => {
    if (!events.length) return ''
    const parts = [`開賽時${teamName}獲勝機率 ${pct(events[0].weBefore)}`]
    const lastOf = new Map<number, GameEvent>()
    for (const e of events) if (e.kind !== 'end') lastOf.set(e.inning, e)
    for (const [inning, e] of lastOf) parts.push(`第 ${inning} 局結束 ${pct(e.weAfter)}`)
    parts.push(`比賽結束 ${pct(events[events.length - 1].weAfter)}（${resultLabel}）`)
    return parts.join('；')
  }, [events, teamName, resultLabel])
  if (!events.length) return <p className="text-[13px] text-muted">這場沒有逐打席紀錄，畫不出走勢。</p>
  const height = mobile ? 200 : 240
  return (
    <>
      <div style={{ height, width: '100%' }} className="min-w-0" onPointerDownCapture={(e) => { pointer.current = e.pointerType; primeTouch(e) }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 10, right: 12, bottom: 0, left: 0 }} {...chartClick(points, onPick && pick)}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor={above} stopOpacity={0.3} />
                <stop offset={split} stopColor={above} stopOpacity={0.08} />
                <stop offset={split} stopColor={below} stopOpacity={0.08} />
                <stop offset={1} stopColor={below} stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--grid)" strokeDasharray="0" vertical={false} />
            <XAxis dataKey="x" type="number" domain={[0, n]} ticks={ticks} interval="preserveStartEnd" minTickGap={4} tickFormatter={(v: number) => labels.get(v) ?? ''} {...axisCommon} axisLine={{ stroke: 'var(--axis)' }} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v: number) => `${v}%`} {...axisCommon} width={40} />
            {starts.filter(({ x }) => x > 0).map(({ x }) => <ReferenceLine key={x} x={x} stroke="var(--grid)" strokeWidth={1} />)}
            <ReferenceLine y={50} stroke="var(--axis)" strokeDasharray="4 4" strokeWidth={1} />
            <Tooltip cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }} content={({ active, payload }) => <WinTooltip active={active} point={payload?.[0]?.payload as Point | undefined} rows={rows} />} />
            <Area type="linear" dataKey="v" name="獲勝機率" baseValue={50} stroke="var(--series-1)" strokeWidth={2} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} {...anim} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {onPick && tapped && (
        <div className="flex justify-end -mt-1">
          <button type="button" onClick={() => onPick(tapped)} className="min-h-9 px-3 rounded-[6px] text-[13px] font-medium text-accent hover:bg-surface-2/60 cursor-pointer">
            看第 {tapped.inning} 局{tapped.half === 'top' ? '上' : '下'}的逐球 →
          </button>
        </div>
      )}
      <p className="sr-only">{summary}</p>
    </>
  )
}

function WinTooltip({ active, point, rows }: { active?: boolean; point?: Point; rows: { bat: BattingPA[]; pit: PitchingPA[] } }) {
  if (!active || !point) return null
  const e = point.event
  return (
    <div className="rounded-[var(--radius-sm)] bg-surface border border-border shadow-[var(--shadow-hover)] px-3 py-2 text-xs max-w-[260px] flex flex-col gap-1">
      {!e ? (
        <><span className="text-muted font-medium">開賽</span><span className="text-ink tnum">獲勝機率 {pct(point.v / 100)}</span></>
      ) : (
        <>
          {e.kind !== 'end' && <span className="text-muted font-medium tnum">{situationText(e)}</span>}
          <span className="text-ink font-medium">{eventText(e, rows)}</span>
          <span className="text-ink tnum">獲勝機率 {pct(e.weBefore)} → {pct(e.weAfter)}（{signedPtsBetween(e.weBefore, e.weAfter)}）</span>
          {(e.kind === 'pa' || e.kind === 'play') && <span className="text-muted tnum">關鍵程度 LI {e.li.toFixed(1)}</span>}
        </>
      )}
    </div>
  )
}
