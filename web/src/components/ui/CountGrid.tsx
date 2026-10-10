/**
 * 球數格: the 12 ball–strike counts as a 4 × 3 grid of buttons (rows 0–3 壞, columns 0–2 好), each with its OPS (被 OPS
 * for our pitchers) and plate appearances. 「經過這個球數」 counts every plate appearance that was ever in that count,
 * 「在這個球數結束」 the ones whose last pitch came in it. The deeper the colour, the better for us; counts with fewer
 * than 10 plate appearances are greyed out and not coloured. Tapping a count spells its numbers out in a live line.
 */
import { useMemo, useState } from 'react'
import { cx } from '../../lib/format'
import { f3, pct0 } from '../../lib/fmt'
import { countGrid, countLabel, type PaContext, type SplitSide } from '../../data/splits'
import type { BattingPA, PitchingPA, Player } from '../../data/types'
import { Tabs } from './Tabs'

type Mode = 'passed' | 'final'

export function CountGrid({ rows, ctx, side, roster }: { rows: Array<BattingPA | PitchingPA>; ctx: WeakMap<object, PaContext>; side: SplitSide; roster: Player[] }) {
  const [mode, setMode] = useState<Mode>('passed')
  const [picked, setPicked] = useState<string | null>(null)
  const cells = useMemo(() => countGrid(rows, ctx, side, mode, roster), [rows, ctx, side, mode, roster])
  // colour: OPS for our batters, the lower the better for our pitchers; scaled over the counts with enough plate appearances
  const good = (ops: number) => (side === 'bat' ? ops : -ops)
  const scored = cells.filter((c) => !c.small && c.line.ops !== null).map((c) => good(c.line.ops!))
  const lo = Math.min(...scored), hi = Math.max(...scored)
  const shade = (ops: number | null, small: boolean) => {
    if (small || ops === null || !scored.length) return undefined
    const t = hi > lo ? (good(ops) - lo) / (hi - lo) : 0.5
    return `color-mix(in srgb, var(--accent) ${Math.round(t * 30)}%, transparent)`
  }
  const opp = side === 'pit' ? '被' : ''
  const cell = picked ? cells.find((c) => c.key === picked) : undefined
  const say = cell
    ? `${countLabel(cell.key)}${mode === 'passed' ? '之後' : '時結束'}：${cell.line.pa} 打席${cell.line.pa ? `，${opp}打擊率 ${f3(cell.line.avg)}、${opp}上壘率 ${f3(cell.line.obp)}、${opp}長打率 ${f3(cell.line.slg)}、三振率 ${pct0(cell.line.kPct)}` : ''}${cell.small && cell.line.pa ? '（樣本少）' : ''}`
    : '點一格看那個球數的完整數字'
  return (
    <div className="flex flex-col gap-2.5">
      <Tabs size="sm" aria-label="球數格的算法" value={mode} onChange={(m) => { setMode(m); setPicked(null) }} items={[{ value: 'passed', label: '經過這個球數' }, { value: 'final', label: '在這個球數結束' }]} />
      <table aria-label="球數格" className="w-full max-w-[420px] table-fixed border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-10" aria-label="壞球" />
            {[0, 1, 2].map((s) => <th key={s} scope="col" className="text-[11px] font-medium text-muted">{s} 好</th>)}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3].map((b) => (
            <tr key={b}>
              <th scope="row" className="text-[11px] font-medium text-muted text-left">{b} 壞</th>
              {cells.filter((c) => c.balls === b).map((c) => (
                <td key={c.key} className="p-0">
                  <button type="button" onClick={() => setPicked(c.key)} aria-pressed={picked === c.key} aria-label={`${countLabel(c.key)}：${c.line.pa} 打席，${opp}OPS ${f3(c.line.ops)}`}
                    style={{ background: shade(c.line.ops, c.small) }}
                    className={cx('w-full min-h-12 rounded-[var(--radius-sm)] border flex flex-col items-center justify-center py-1 cursor-pointer transition-colors motion-reduce:transition-none',
                      picked === c.key ? 'border-ink' : 'border-border hover:border-[color-mix(in_srgb,var(--ink)_30%,transparent)]',
                      c.small ? 'text-muted' : 'text-ink')}>
                    <span className="figure text-[16px] font-semibold leading-5 tnum">{c.line.pa ? f3(c.line.ops) : '—'}</span>
                    <span className="text-[10px] leading-3 text-muted tnum">{c.line.pa} 打席</span>
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p aria-live="polite" className="text-[12px] text-ink-2 min-h-4">{say}</p>
      <p className="text-[11px] text-muted leading-4">經過：打席中出現過這個球數（例如 1壞1好 之後），看整個打席最後的結果。結束：最後一球是在這個球數投的。顏色越深對我們越有利；打席不到 10 個不上色。大字是{opp}OPS。</p>
    </div>
  )
}
