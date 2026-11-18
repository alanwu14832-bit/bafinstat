/**
 * 紀錄比賽 → 逐打席 → one plate appearance opened in the full editor (the 修改資料 panel) while the game goes on. The
 * rows come back changed; the game in progress has to stand on them again:
 * - a half-inning already over must still have its three outs (else the change is refused, with why);
 * - the half being played: its outs and the runners on base are worked out again from the changed plays (the batter
 *   up keeps his count). A change that would end it (a third out) is refused — that is 復原's job, or 修改資料's after
 *   the game; so is one made while the batter up has runner plays of his own not yet sent.
 * Rows are never added or removed here (the batting order would no longer follow).
 */
import type { BattingPA, PitchingPA } from '../data/types'
import { inferAll, midOf, type OnBase, type Step } from './timeline'
import { offense, type RecordState, type Runner } from './model'

const OUT = new Set(['I', 'II', 'III'])
const outsOf = (rows: Array<BattingPA | PitchingPA>, inning: number) => rows.filter((r) => r.inning === inning && OUT.has(r.code ?? '')).length
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Who is on base once a plate appearance is over (lead runner first). */
export function onBaseAfter(st: Step): OnBase[] {
  const on: OnBase[] = []
  for (const o of midOf(st)) { const d = st.dest[o.row] ?? o.base; if (typeof d === 'number') on.push({ row: o.row, base: d }) }
  if (typeof st.batter === 'number') on.push({ row: st.index, base: st.batter })
  return on.sort((a, b) => b.base - a.base)
}

export function applyLiveEdit(s: RecordState, batting: BattingPA[], pitching: PitchingPA[]): RecordState {
  if (batting.length !== s.batting.length || pitching.length !== s.pitching.length) throw new Error('比賽中只能修改打席的內容，不能新增或刪除打席；要補記或刪掉打席，請結束比賽後到「修改資料」。')
  const side = offense(s)
  const current = { bat: side === 'us', pit: side === 'opp' }
  // every half-inning already played still ends on its third out
  for (const [rows, key, label] of [[batting, 'bat', '我隊打擊'], [pitching, 'pit', '我隊守備']] as const) {
    for (const inning of new Set(rows.map((r) => r.inning))) {
      if (current[key] && inning === s.inning) continue
      const n = outsOf(rows, inning)
      if (n !== 3) throw new Error(`這樣改，第 ${inning} 局（${label}）會變成 ${n} 個出局；已經打完的半局要剛好三出局。請再檢查，或結束比賽後到「修改資料」改。`)
    }
  }
  const rows: Array<BattingPA | PitchingPA> = side === 'us' ? batting : pitching
  const was: Array<BattingPA | PitchingPA> = side === 'us' ? s.batting : s.pitching
  const idx = rows.flatMap((r, k) => (r.inning === s.inning ? [k] : []))
  const next = { ...s, batting, pitching }
  // the half being played did not change: the game goes on as it was
  if (!idx.length || idx.every((k) => same(rows[k], was[k]))) return next
  if (s.plays?.length) throw new Error('現在這位打者已經有跑壘事件（盜壘、暴投…）還沒送出：請先送出這個打席，再改這個半局的打席。')
  const outs = outsOf(rows, s.inning)
  if (outs >= 3) throw new Error('這樣改，這個半局就已經三出局了。請用「復原」退回到那個打席重記，或結束比賽後到「修改資料」改。')
  const half = inferAll(rows, side === 'us' ? 'bat' : 'pit').get(s.inning)
  const last = half?.steps.find((st) => st.index === idx[idx.length - 1])
  if (!half || !last) throw new Error('這樣改，這個半局的跑者接不起來（壘上人數或出局數對不上），請再檢查一次。')
  const nameOf = (row: number) => {
    const kept = s.runners.find((r) => r.row === row && r.side === side)
    if (kept) return kept.name
    const r = rows[row]
    return side === 'us' ? ((r as BattingPA).runner || (r as BattingPA).batter) : ((r as PitchingPA).runner || (r as PitchingPA).oppBatter || `對方 ${(r as PitchingPA).oppOrder ?? ''} 棒`.replace('  ', ' '))
  }
  const runners: Runner[] = onBaseAfter(last).map((o) => ({ base: o.base, side, row: o.row, name: nameOf(o.row) }))
  return { ...next, outs, runners }
}
