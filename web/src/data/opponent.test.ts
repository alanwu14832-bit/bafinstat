import { describe, expect, it } from 'vitest'
import { hasOppName, oppBatsLabel, oppBattingLines, oppKey, oppTotals, scoutLines, scoutSummary } from './opponent'
import { SEED_DATASET } from './seed'
import { summarizeGame } from './stats'
import { EMPTY_DATASET, OPP_PH_UNNAMED, oppPinchHitter, type Dataset, type Game, type PitchingPA } from './types'

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
  it('對方代打: unnamed is merged into his slot, a named one is the name after the mark (review)', () => {
    expect(oppKey({ oppBatter: OPP_PH_UNNAMED, oppOrder: 7 })).toBe('第 7 棒')
    expect(hasOppName({ oppBatter: OPP_PH_UNNAMED, oppOrder: 7 })).toBe(false)
    expect(oppPinchHitter(' 99號 ')).toBe('代打 99號')
    expect(oppKey({ oppBatter: oppPinchHitter('99號'), oppOrder: 7 })).toBe('99號')
    const lines = oppBattingLines([prow({ oppOrder: 7 }), prow({ oppOrder: 7, oppBatter: OPP_PH_UNNAMED, result: '一安' }), prow({ oppOrder: 9, oppBatter: OPP_PH_UNNAMED }), prow({ oppOrder: 4, oppBatter: '代打 99號' }), prow({ oppOrder: 4, oppBatter: '99號' })])
    expect(lines.map((l) => [l.label, l.pa])).toEqual([['99號', 2], ['第 7 棒', 2], ['第 9 棒', 1]])
  })
  it('a tie-break runner counts only his run', () => {
    const [l] = oppBattingLines([prow({ result: '突破僵局', pitches: [], code: 'R' })])
    expect(l).toMatchObject({ pa: 0, r: 1 })
  })
  it('a 對方代跑 gets the run (like our 代跑), listed in the slot he ran for; the team line is unchanged', () => {
    const rows = [prow({ oppBatter: '王', result: '一安', code: 'ER', runner: '12號' }), prow({ oppOrder: 2, result: '保送', code: 'R', runner: '對方代跑' }), prow({ oppOrder: 3, result: '三振', pitches: ['S', 'S', 'S'] })]
    const lines = oppBattingLines(rows)
    expect(lines.map((l) => [l.label, l.slot, l.pa, l.h, l.r])).toEqual([['王', 1, 1, 1, 0], ['12號', 1, 0, 0, 1], ['第 2 棒', 2, 1, 0, 0], ['對方代跑', 2, 0, 0, 1], ['第 3 棒', 3, 1, 0, 0]])
    expect(oppTotals(rows)).toEqual(oppTotals(rows.map(({ runner: _r, ...p }) => p)))
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
  it('lists a 對方代跑 with the day he ran', () => {
    const withPr = { ...ds, pitching: ds.pitching.map((p, i) => (i === 0 ? { ...p, runner: '8號' } : p)) }
    expect(scoutLines(withPr, '台大').find((l) => l.label === '8號')).toMatchObject({ pa: 0, r: 1, lastDate: '2026-03-01', field: { left: 0, center: 0, right: 0 } })
  })
})

describe('對手情蒐: each batter\'s side (batch 18)', () => {
  it('shows 左打 / 右打 as recorded against us, 左右打 when both, nothing when never recorded', () => {
    const games: Game[] = ['G1', 'G2'].map((id, i) => ({ id, date: `2026-10-0${i + 1}`, tournament: '聯賽', opponent: '政大', homeAway: '主' }))
    const ds: Dataset = { ...EMPTY_DATASET, games, pitching: [
      prow({ oppBatter: '王', oppBats: 'L' }), prow({ oppOrder: 2, oppBatter: '李', oppBats: 'R' }), prow({ oppOrder: 3, oppBatter: '陳' }),
      prow({ gameId: 'G2', oppBatter: '王', oppBats: 'L' }), prow({ gameId: 'G2', oppOrder: 2, oppBatter: '李', oppBats: 'L' }),
    ] }
    const by = Object.fromEntries(scoutLines(ds, '政大').map((l) => [l.label, l.bats]))
    expect(by).toEqual({ 王: '左打', 李: '左右打', 陳: undefined })
  })
  it('an unnamed slot (「第 N 棒」) can be different people: one side when they all agree, nothing (not 左右打) when not', () => {
    const games: Game[] = ['G1', 'G2'].map((id, i) => ({ id, date: `2026-10-0${i + 1}`, tournament: '聯賽', opponent: '甲隊', homeAway: '主' }))
    const ds: Dataset = { ...EMPTY_DATASET, games, pitching: [
      prow({ oppOrder: 3, oppBatter: undefined, oppBats: 'R' }), prow({ gameId: 'G2', oppOrder: 3, oppBatter: undefined, oppBats: 'L' }),
      prow({ oppOrder: 4, oppBatter: undefined, oppBats: 'R' }), prow({ gameId: 'G2', oppOrder: 4, oppBatter: undefined, oppBats: 'R' }),
    ] }
    const by = Object.fromEntries(scoutLines(ds, '甲隊').map((l) => [l.label, l.bats]))
    expect(by).toEqual({ '第 3 棒': undefined, '第 4 棒': '右打' })
    expect(scoutLines(ds, '甲隊').find((l) => l.label === '第 3 棒')).not.toHaveProperty('bats')
  })
})

describe('oppBatsLabel', () => {
  it('one side, both sides for one man, nothing for a slot that merged people', () => {
    expect(oppBatsLabel('王', new Set(['L']))).toBe('左打')
    expect(oppBatsLabel('王', new Set(['L', 'R']))).toBe('左右打')
    expect(oppBatsLabel('第 3 棒', new Set(['L', 'R']))).toBeUndefined()
    expect(oppBatsLabel('第 3 棒', new Set(['L', 'R']), true)).toBe('左右打')
    expect(oppBatsLabel('第 3 棒', new Set(['R']))).toBe('右打')
    expect(oppBatsLabel('棒次未記', new Set(['L', 'R']))).toBeUndefined()
    expect(oppBatsLabel('王', new Set())).toBeUndefined()
    expect(oppBatsLabel('王', undefined)).toBeUndefined()
  })
})
