import { eventText, situationText, type GameEvent } from '../../data/winTimeline'
import type { BattingPA, PitchingPA } from '../../data/types'
import { signedPts } from '../../lib/fmt'
import { cx } from '../../lib/format'

/**
 * 本場關鍵 5 打席: the plate appearances that moved our win probability most, as a list (never a table: the game
 * simulations find the box score by its 打者／投手 header). A tap opens that half-inning's 逐球.
 */
export function KeyPlays({ events, rows, onPick }: { events: GameEvent[]; rows: { bat: BattingPA[]; pit: PitchingPA[] }; onPick?: (e: GameEvent) => void }) {
  if (!events.length) return <p className="text-[13px] text-muted">這場沒有逐打席紀錄。</p>
  return (
    <ol className="flex flex-col divide-y divide-[var(--border)] -my-1">
      {events.map((e, i) => {
        const body = (
          <>
            <span className="size-6 shrink-0 rounded-full bg-surface-2 text-[12px] font-semibold text-ink-2 tnum inline-flex items-center justify-center mt-0.5">{i + 1}</span>
            <span className="min-w-0 flex-1 flex flex-col gap-0.5 text-left">
              <span className="text-[11px] text-muted tnum">{situationText(e)}</span>
              <span className="text-[14px] text-ink leading-snug">{eventText(e, rows, { count: true })}</span>
            </span>
            <span className="shrink-0 flex flex-col items-end gap-0.5">
              <span className={cx('text-[15px] font-semibold tnum', e.wpa > 0 ? 'text-good' : e.wpa < 0 ? 'text-critical' : 'text-ink-2')}>{signedPts(e.wpa)}</span>
              <span className="text-[11px] text-muted tnum">LI {e.li.toFixed(1)}</span>
            </span>
          </>
        )
        return (
          <li key={`${e.side}-${e.row}-${i}`}>
            {onPick
              ? <button type="button" onClick={() => onPick(e)} className="w-full min-h-11 py-2.5 flex items-start gap-3 cursor-pointer rounded-[6px] hover:bg-surface-2/60 transition-colors motion-reduce:transition-none" title={`看第 ${e.inning} 局${e.half === 'top' ? '上' : '下'}的逐球`}>{body}</button>
              : <div className="py-2.5 flex items-start gap-3">{body}</div>}
          </li>
        )
      })}
    </ol>
  )
}
