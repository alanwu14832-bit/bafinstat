/**
 * 跑壘（打擊球上）: how our runners did on the hits — Baseball-Reference's XBT% (Extra Bases Taken: a runner who goes
 * first-to-third or second-to-home on a single, first-to-home on a double, over the times he could have) — and the outs on
 * the bases on a ball that put the batter on (被刺殺: a runner thrown out taking the base, the batter put out stretching it;
 * a 盜壘失敗 or a 牽制 is not one). Read off the runner timeline of each inning (record/timeline inferHalf), so only the
 * innings that can be followed count; credited to the runner (代跑 included, as in battingLines).
 */
import { inferHalf, inningsOf, midOf, reachedOn } from '../record/timeline'
import { HIT_BASE_COUNT, isPA, isSingle, type BattingPA } from './types'

export interface RunnerPlays {
  /** the chances: a runner on 1B or 2B for a single, on 1B for a double (a ground-rule double moves everyone exactly two) */
  xbtOpp: number
  /** …the times he took the extra base (3B or home from 1B on a single, home from 2B, home from 1B on a double) */
  xbt: number
  /** …the times he was put out trying for it */
  xbtOut: number
  /** outs on the bases on a ball that put the batter on: runners thrown out taking a base, and the batter put out after reaching */
  thrownOut: number
}
const empty = (): RunnerPlays => ({ xbtOpp: 0, xbt: 0, xbtOut: 0, thrownOut: 0 })

/** A ball that put the batter on and that someone can be put out on the bases after (a hit but not a home run, or an error). */
const liveBall = (result: string) => (result in HIT_BASE_COUNT && result !== '全壘打') || result === '失誤'

const cache = new WeakMap<BattingPA[], Map<string, RunnerPlays>>()

/** Per runner (his name, or his 代跑's) over these plate appearances (whole games' rows, in order). */
export function runnerPlays(pas: BattingPA[]): Map<string, RunnerPlays> {
  const hit = cache.get(pas)
  if (hit) return hit
  const out = new Map<string, RunnerPlays>()
  const of = (name: string) => out.get(name) ?? out.set(name, empty()).get(name)!
  const games = new Map<string, BattingPA[]>()
  for (const p of pas) (games.get(p.gameId) ?? games.set(p.gameId, []).get(p.gameId)!).push(p)
  for (const rows of games.values()) {
    for (const idx of inningsOf(rows).values()) {
      const half = inferHalf(rows, idx, 'bat')
      if (!half) continue
      for (const st of half.steps) {
        const r = rows[st.index]
        if (!isPA(r)) continue
        const who = (row: number) => rows[row].runner || rows[row].batter
        const single = isSingle(r.result), double = r.result === '二安'
        for (const o of midOf(st)) {
          const d = st.dest[o.row]
          if (single || double) {
            if (single ? o.base <= 2 : o.base === 1) {
              const need = single && o.base === 1 ? 3 : 4        // 1B→3B or home on a single, 2B→home; 1B→home on a double
              const c = of(who(o.row))
              c.xbtOpp++
              if (d === 'out') c.xbtOut++
              else if (d === 'home' || (typeof d === 'number' && d >= need)) c.xbt++
            }
          }
          if (d === 'out' && liveBall(r.result)) of(who(o.row)).thrownOut++
        }
        if (st.batter === 'out' && reachedOn(r.result) && liveBall(r.result)) of(r.batter).thrownOut++
      }
    }
  }
  cache.set(pas, out)
  return out
}
