/**
 * 依跑壘紀錄修正盜壘: in a game recorded pitch by pitch, the runner plays (events) are the record of every steal.
 * Older editor versions could leave a steal on the runner's count after the play itself was dropped, so the count
 * grew each time it was added back. This lowers each count that is higher than the plays show — never raises one —
 * and says exactly what it would change, for the recorder to confirm.
 */
import { inferAll, playCounts } from '../record/timeline'
import type { BattingPA, PitchingPA } from './types'

export interface StealFix { side: 'bat' | 'pit'; index: number; inning: number; name: string; from: number; to: number }

export function stealRepairs(batting: BattingPA[], pitching: PitchingPA[]): StealFix[] {
  const out: StealFix[] = []
  const run = <T extends BattingPA | PitchingPA>(rows: T[], side: 'bat' | 'pit') => {
    if (!rows.some((r) => r.events?.length)) return
    for (const half of inferAll(rows, side).values()) {
      if (!half) continue
      const counts = playCounts(half, side)
      for (const st of half.steps) {
        // our runners' steals sit on the row where each reached; the opponent's on the plate appearance
        const rowsHere = side === 'bat' ? [st.index, ...st.before.map((o) => o.row)] : [st.index]
        for (const i of new Set(rowsHere)) {
          const r = rows[i] as BattingPA & PitchingPA
          const have = side === 'bat' ? r.sb : r.sba
          const should = counts.get(i)?.[side === 'bat' ? 'sb' : 'sba'] ?? 0
          if (have > should && !out.some((f) => f.side === side && f.index === i)) {
            out.push({ side, index: i, inning: r.inning, name: side === 'bat' ? (r.runner || r.batter) : `對方${r.oppBatter ? ` ${r.oppBatter}` : r.oppOrder ? `第 ${r.oppOrder} 棒` : ''}（投手 ${r.pitcher}）`, from: have, to: should })
          }
        }
      }
    }
  }
  run(batting, 'bat')
  run(pitching, 'pit')
  return out
}

export function applyStealRepairs(batting: BattingPA[], pitching: PitchingPA[], fixes: StealFix[]): { batting: BattingPA[]; pitching: PitchingPA[] } {
  return {
    batting: batting.map((p, i) => { const f = fixes.find((x) => x.side === 'bat' && x.index === i); return f ? { ...p, sb: f.to } : p }),
    pitching: pitching.map((p, i) => { const f = fixes.find((x) => x.side === 'pit' && x.index === i); return f ? { ...p, sba: f.to } : p }),
  }
}
