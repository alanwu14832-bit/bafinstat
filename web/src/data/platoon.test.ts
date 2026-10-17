/** 對左右打（投手）／對左右投（打者）: one row per player, 全隊 first, the plates without the side counted apart. */
import { describe, expect, it } from 'vitest'
import { paContexts, platoonRows } from './splits'
import type { BattingPA, Dataset, PitchingPA } from './types'

const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G', inning: 1, pitcher: 'A', pitches: ['IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })
const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, order: 1, batter: 'X', pitches: ['IP'], result: '內滾', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })

describe('platoonRows', () => {
  it('splits a pitcher\'s plate appearances by the side his batter stood on', () => {
    const pitching = [pit({ oppBats: 'L', result: '一安' }), pit({ oppBats: 'L', result: '三振' }), pit({ oppBats: 'R', result: '內滾' }), pit({ result: '內滾' }), pit({ pitcher: 'B', oppBats: 'R', result: '二安' })]
    const ds = { batting: [], pitching } as unknown as Dataset
    const rows = platoonRows(pitching, paContexts(ds, 'pit'), 'pit', [])
    expect(rows.map((r) => r.name)).toEqual(['全隊', 'A', 'B'])
    const [all, a] = rows
    expect([all.L.pa, all.R.pa, all.unknown]).toEqual([2, 2, 1])
    expect([a.L.pa, a.R.pa, a.unknown]).toEqual([2, 1, 1])
    expect(a.L.h).toBe(1)
    expect(a.L.so).toBe(1)
  })
  it('splits a batter\'s plate appearances by the opponent pitcher\'s hand', () => {
    const batting = [bat({ oppHand: 'L', result: '一安' }), bat({ oppHand: 'R', result: '三振' }), bat({ oppHand: 'R', result: '全壘打' })]
    const ds = { batting, pitching: [] } as unknown as Dataset
    const [all] = platoonRows(batting, paContexts(ds, 'bat'), 'bat', [])
    expect([all.L.pa, all.R.pa, all.unknown]).toEqual([1, 2, 0])
    expect(all.R.hr).toBe(1)
  })
})
