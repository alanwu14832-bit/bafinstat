/**
 * 「這次失誤算給」: who a 失誤 result is charged to (紀錄比賽 and 修改資料). The result's error goes to its 落點's fielder, so
 * picking someone else moves the 落點 to him — the error is still one, now his (a grounder to short that the first baseman
 * dropped is E3: 落點 3). Before this, recorders typed the real fielder as one more error and it counted twice.
 */
import type { ReactNode } from 'react'
import { cx } from '../../lib/format'
import { POSITION_BY_NUMBER, posNum } from '../../data/types'
import { FIELD_POSITIONS, fielderLoc } from '../../data/errors'
import { chipBtn } from '../../record/widgets'

export function ErrorFielderPicker({ loc, onPick, name, ours }: {
  loc?: number
  onPick: (loc: number) => void
  /** who stands at a position (our fielders): shown on the chip */
  name?: (pos: string) => ReactNode
  /** our error (we field) or theirs */
  ours: boolean
}) {
  const at = loc ? POSITION_BY_NUMBER[loc] : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[12px] text-ink-2">這次失誤算給
        <span className="text-muted ml-1.5">預設是落點的守位；例如游擊傳一壘、一壘漏接 → 點一壘（落點跟著改，失誤只算一次）{ours ? '' : '；不知道是誰就照落點'}</span>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="這次失誤算給">
        {FIELD_POSITIONS.map((pos) => {
          const on = at === pos
          return <button key={pos} type="button" aria-pressed={on} onClick={() => { const n = fielderLoc(pos); if (n && !on) onPick(n) }} className={cx(chipBtn(on), 'min-w-11 h-9 px-2.5 text-[12px]')}>{posNum(pos)}{name?.(pos)}</button>
        })}
      </div>
      {!!loc && !at && <p className="text-[11px] text-muted">落點在兩人之間：{ours ? '沒點的話，失誤不算給特定的人' : '算成不知道是誰的失誤'}</p>}
    </div>
  )
}
