import { Fragment } from 'react'
import type { Scoresheet, SheetCell, SheetPlayer } from '../../data/scoresheet'
import { cx } from '../../lib/format'

const TONE: Record<SheetCell['tone'], string> = {
  hit: 'font-semibold text-accent',
  out: 'text-muted',
  on: 'text-ink',
  other: 'text-ink-2',
}

export const INNING_GRID_LEGEND = '格子前面的字是擊球方向（投 捕 一 二 三 游 左 中 右；三游＝三游間）；①②是打點'

interface GridRow { slot: number | null; firstInSlot: boolean; player: SheetPlayer; cells: Record<number, SheetCell[]> }

/** One row per player: slot order, then the order they appeared in the slot. */
function gridRows(sheet: Scoresheet): GridRow[] {
  const out: GridRow[] = []
  for (const line of sheet.lines) {
    line.players.forEach((player, n) => {
      const cells: Record<number, SheetCell[]> = {}
      for (const [inn, list] of Object.entries(line.cells)) {
        const mine = list.filter((c) => c.player === player.name)
        if (mine.length) cells[Number(inn)] = mine
      }
      out.push({ slot: line.order, firstInSlot: n === 0, player, cells })
    })
  }
  return out
}

const th = 'px-2 h-9 text-[12px] font-medium text-muted whitespace-nowrap'
const td = 'px-2 py-1.5 align-top'
const stick = 'sticky z-[1] bg-surface'

/**
 * 逐局表 (NPB style): players down, innings across, each cell that inning's plate appearances 「中安②」「游滾」.
 * 棒次 and 球員 stay pinned while the innings scroll sideways inside the card. The header never reads 打者 or 投手
 * (tools/gamesim finds the box score by those).
 */
export function InningGrid({ sheet, side, stat, onName }: {
  sheet: Scoresheet
  side: 'bat' | 'pit'
  /** the player's 打數 / 安打 / 打點 from the box score */
  stat: (name: string) => { ab: number; h: number; rbi: number } | undefined
  onName?: (name: string) => void
}) {
  const rows = gridRows(sheet)
  const innings = Array.from({ length: sheet.innings }, (_, i) => i + 1)
  const showPos = rows.some((r) => r.player.pos)
  const showRbi = side === 'bat'
  if (!rows.length) return <div className="text-[13px] text-muted px-4 py-8 text-center">沒有逐打席紀錄</div>
  return (
    <div>
      <div className="overflow-x-auto scroll-x">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className={cx(th, stick, 'left-0 w-10 min-w-10 text-center')}>棒次</th>
              <th className={cx(th, stick, 'left-10 text-left min-w-[5.5rem] border-r border-border')}>球員</th>
              {showPos && <th className={cx(th, 'text-left')}>守位</th>}
              {innings.map((i) => <th key={i} className={cx(th, 'text-center min-w-14')}>{i}</th>)}
              <th className={cx(th, 'text-right border-l border-border')}>打數</th>
              <th className={cx(th, 'text-right')}>安打</th>
              {showRbi && <th className={cx(th, 'text-right')}>打點</th>}
            </tr>
          </thead>
          <tbody className="tnum">
            {rows.map((r, k) => {
              const s = stat(r.player.name)
              return (
                <tr key={`${r.slot}-${r.player.name}-${k}`} className={cx('hover:bg-surface-2/60', r.firstInSlot ? 'border-t border-border' : '')}>
                  <td className={cx(td, stick, 'left-0 text-center text-ink-2')}>{r.firstInSlot ? (r.slot ?? '—') : ''}</td>
                  <td className={cx(td, stick, 'left-10 border-r border-border whitespace-nowrap', !r.firstInSlot && 'pl-4')}>
                    {onName ? <button type="button" onClick={() => onName(r.player.name)} className="min-h-9 pointer-fine:min-h-7 text-left font-medium text-ink hover:underline underline-offset-2 cursor-pointer">{r.player.name}</button> : <span className="font-medium text-ink">{r.player.name}</span>}
                    {r.player.sub && <span className="text-muted text-[11px] ml-0.5">（守備）</span>}
                  </td>
                  {showPos && <td className={cx(td, 'text-ink-2 whitespace-nowrap')}>{r.player.pos ?? ''}</td>}
                  {innings.map((i) => (
                    <td key={i} className={cx(td, 'text-center whitespace-nowrap')}>
                      {(r.cells[i] ?? []).map((c, n) => (
                        <Fragment key={n}>
                          <div title={c.title} className={cx('leading-5', TONE[c.tone])}>{c.text}</div>
                        </Fragment>
                      ))}
                    </td>
                  ))}
                  <td className={cx(td, 'text-right border-l border-border')}>{s?.ab ?? ''}</td>
                  <td className={cx(td, 'text-right')}>{s?.h ?? ''}</td>
                  {showRbi && <td className={cx(td, 'text-right')}>{s?.rbi ?? ''}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2.5 border-t border-border text-[11px] text-muted leading-4">{INNING_GRID_LEGEND}</p>
    </div>
  )
}
