/** 資料完整度: shares of what the formulas need, and the batters whose 打擊慣用 is missing. */
import { describe, expect, it } from 'vitest'
import { completeness } from './completeness'
import type { BattingPA, PitchingPA } from './types'

const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, batter: '甲', pitches: ['IP'], result: '一安', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G', inning: 1, pitcher: '丙', pitches: ['IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })

describe('completeness', () => {
  const ds = {
    roster: [{ name: '甲', bats: 'R' as const }, { name: '乙' }],
    batting: [bat({ traj: 'L', loc: 8, quality: '中', outsBefore: 0, basesBefore: '無', order: 1, oppHand: 'R' }), bat({ batter: '乙', pitches: [] }), bat({ batter: '乙', result: '三振' })],
    pitching: [pit({ traj: 'G', loc: 6, oppOrder: 3, oppBats: 'L' }), pit({ result: '三振', pitches: ['SS', 'SS', 'SS'] })],
  }
  const c = completeness(ds)
  const row = (k: string) => c.rows.find((r) => r.key === k)!
  it('counts plate appearances for pitches, outs, bases, order and hands, batted balls for 軌跡／落點／強度', () => {
    expect(row('pitches').bat).toEqual({ n: 2, d: 3 })
    expect(row('traj').bat).toEqual({ n: 1, d: 2 })       // 三振 is no batted ball
    expect(row('traj').pit).toEqual({ n: 1, d: 1 })
    expect(row('quality').bat).toEqual({ n: 1, d: 2 })
    expect(row('outs').bat).toEqual({ n: 1, d: 3 })
    expect(row('bases').bat).toEqual({ n: 1, d: 3 })
    expect(row('order').bat).toEqual({ n: 1, d: 3 })
    expect(row('hand').bat).toEqual({ n: 1, d: 3 })
    expect(row('hand').pit).toEqual({ n: 1, d: 2 })
  })
  it('lists the batters with no 打擊慣用 and their batted balls', () => {
    expect(c.noBats).toEqual([{ name: '乙', bip: 1 }])
  })
})
