import { describe, expect, it } from 'vitest'
import { normalizeDataset } from './normalize'
import { reconcileFielding } from './edit'
import { fieldingLines } from './stats'
import type { Dataset, FieldingLine, Game, PitchingPA } from './types'

const game: Game = {
  id: 'G1', date: '2026-09-27', tournament: '測試', opponent: '對手', homeAway: '主',
  dayRoster: { starters: [{ name: '甲', pos: 'C', order: 5 }, { name: '丙', pos: 'SS', order: 1 }], bench: ['乙'], reentry: false, subs: [{ kind: 'DEF', in: '乙', out: '甲', pos: 'C', inning: 4, half: 'top' }] },
}
const pa = (inning: number, x: Partial<PitchingPA> = {}): PitchingPA => ({ gameId: 'G1', inning, pitcher: '投', pitches: ['B', 'X'], result: '一安', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...x })
const pitching = [pa(1, { sba: 2 }), pa(2, { cs: 1, pb: 1 }), pa(4, { sba: 1 }), pa(5, { cs: 1 })]
const ds = (fielding: FieldingLine[] = []): Dataset => ({ roster: [], games: [game], batting: [{ gameId: 'G1', inning: 1, batter: '甲', pos: 'C', pitches: ['X'], result: '一安', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 }], pitching, fielding })

describe('捕手的被盜壘 / 阻殺 / 捕逸', () => {
  it('come from the opponent\'s plate appearances, on whoever was catching', () => {
    const { dataset } = normalizeDataset(ds())
    const c = fieldingLines(dataset.fielding).filter((f) => f.positions.includes('C'))
    const by = Object.fromEntries(c.map((f) => [f.name, [f.sb, f.cs, f.pb, f.g]]))
    expect(by['甲']).toEqual([2, 1, 1, 1])
    // 乙 came in to catch in the 4th and never batted: he gets a C line of his own
    expect(by['乙']).toEqual([1, 1, 0, 1])
  })

  it('keep numbers typed into the 守備 table, and are idempotent', () => {
    const typed: FieldingLine = { gameId: 'G1', player: '甲', pos: 'C', po: 3, a: 0, e: 0, dp: 0, pb: 0, sb: 5, cs: 0 }
    expect(normalizeDataset(ds([typed])).dataset.fielding.find((f) => f.player === '甲')!.sb).toBe(5)
    const once = normalizeDataset(ds()).dataset
    expect(normalizeDataset(once).dataset.fielding).toEqual(once.fielding)
  })

  it('follow an edited plate appearance', () => {
    const lines = normalizeDataset(ds()).dataset.fielding
    const after = pitching.map((p, i) => (i === 2 ? { ...p, sba: 3 } : p))
    const out = reconcileFielding(lines, game, { batting: [], pitching }, { batting: [], pitching: after })
    expect(out.find((f) => f.player === '乙')!.sb).toBe(3)
    expect(out.find((f) => f.player === '甲')!.sb).toBe(2)
  })
})
