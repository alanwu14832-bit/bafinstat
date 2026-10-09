import { describe, expect, it } from 'vitest'
import { oppBattingLines, oppKey, oppTotals, scoutLines, scoutSummary } from './opponent'
import { SEED_DATASET } from './seed'
import { summarizeGame } from './stats'
import { EMPTY_DATASET, type Dataset, type Game, type PitchingPA } from './types'

const prow = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G1', inning: 1, pitcher: '甲', oppOrder: 1, pitches: ['IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })

describe('opponent batting', () => {
  it('one slot without names: one line with the site\'s formulas', () => {
    const [l] = oppBattingLines([prow({ result: '一安' }), prow({ result: '三振', pitches: ['S', 'S', 'S'] })])
    expect(l).toMatchObject({ label: '第 1 棒', slot: 1, pa: 2, ab: 2, h: 1, so: 1 })
    expect(l.avg).toBe(0.5)
  })
  it('named and unnamed batters of one slot are separate, in first-appearance order', () => {
    const lines = oppBattingLines([prow({ oppOrder: 3, oppBatter: '王' }), prow({ oppOrder: 2 }), prow({ oppOrder: 3 })])
    expect(lines.map((l) => l.label)).toEqual(['第 2 棒', '王', '第 3 棒'])
  })
  it('placeholder names count as no name; runs from R / ER; no slot last', () => {
    expect(oppKey({ oppBatter: '對方 3 棒', oppOrder: 3 })).toBe('第 3 棒')
    expect(oppKey({ oppBatter: '3棒', oppOrder: 3 })).toBe('第 3 棒')
    expect(oppKey({ oppBatter: ' 12號 ', oppOrder: 3 })).toBe('12號')
    expect(oppKey({ oppBatter: '7', oppOrder: 3 })).toBe('第 3 棒')
    expect(oppKey({})).toBe('棒次未記')
    const lines = oppBattingLines([prow({ oppOrder: undefined, result: '一安', code: 'R' }), prow({ result: '全壘打', code: 'ER' }), prow({ result: '一安', code: 'L' })])
    expect(lines.map((l) => [l.label, l.r])).toEqual([['第 1 棒', 1], ['棒次未記', 1]])
  })
  it('a tie-break runner counts only his run', () => {
    const [l] = oppBattingLines([prow({ result: '突破僵局', pitches: [], code: 'R' })])
    expect(l).toMatchObject({ pa: 0, r: 1 })
  })
  it('the 合計 row matches the line score of every seed game', () => {
    for (const g of SEED_DATASET.games.filter((x) => !x.status)) {
      const s = summarizeGame(SEED_DATASET, g)
      const t = oppTotals(SEED_DATASET.pitching.filter((p) => p.gameId === g.id))
      expect(t.r).toBe(s.runsOpp)
      expect(t.h).toBe(s.hitsOpp)
    }
  })
})

describe('scoutLines', () => {
  const games: Game[] = [
    { id: 'G1', date: '2026-03-01', tournament: 'A', opponent: '台大', homeAway: '主' },
    { id: 'G2', date: '2026-04-01', tournament: 'A', opponent: ' 台大 ', homeAway: '客' },
    { id: 'G3', date: '2026-05-01', tournament: 'A', opponent: '政大', homeAway: '主' },
    { id: 'G4', date: '2026-06-01', tournament: 'A', opponent: '台大', homeAway: '主', status: 'scheduled' },
  ]
  const ds: Dataset = {
    ...EMPTY_DATASET, games,
    pitching: [
      prow({ gameId: 'G1', oppBatter: '王', result: '一安', loc: 7, code: 'ER' }), prow({ gameId: 'G1', oppOrder: 2, result: '三振' }),
      prow({ gameId: 'G2', oppOrder: 4, oppBatter: '王', result: '外飛', loc: 9 }), prow({ gameId: 'G2', oppOrder: 2, result: '內滾', loc: 6 }),
      prow({ gameId: 'G3', oppBatter: '王', result: '全壘打', loc: 8 }),
    ],
    batting: [{ gameId: 'G1', inning: 1, batter: '我', pitches: [], result: '一安', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 2, rbi: 0 }],
  }
  it('merges a name across games, counts games and the last date, ignores other opponents', () => {
    const lines = scoutLines(ds, '台大')
    const wang = lines.find((l) => l.label === '王')!
    expect(wang).toMatchObject({ g: 2, pa: 2, h: 1, hr: 0, lastDate: '2026-04-01', field: { left: 1, center: 0, right: 1 } })
    expect(lines.find((l) => l.label === '第 2 棒')).toMatchObject({ g: 2, pa: 2, so: 1, field: { left: 1, center: 0, right: 0 } })
    expect(lines).toHaveLength(2)
    const sum = scoutSummary(ds, '台大')
    expect(sum).toMatchObject({ games: 2, w: 1, l: 0, t: 1 })
    expect(sum.team.pa).toBe(4)
    expect(scoutLines(ds, '清大')).toEqual([])
  })
})
