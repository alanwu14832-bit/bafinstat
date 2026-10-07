import { describe, expect, it } from 'vitest'
import { pitchingLines, resolveParams, teamPitching } from './stats'
import { DEFAULT_PARAMS, type Game, type PitchingPA } from './types'

const pa = (gameId: string, pitcher: string, result: string, code?: string): PitchingPA => ({ gameId, inning: 1, pitcher, pitches: ['X'], result, code, sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 })
const games: Game[] = [
  { id: 'A', date: '2026-09-27', tournament: 't', opponent: 'x', homeAway: '主', winningPitcher: '甲', savePitcher: '乙' },
  { id: 'B', date: '2026-09-28', tournament: 't', opponent: 'y', homeAway: '主', winningPitcher: '丙' },
]
const pas = [
  pa('A', '甲', '三振', 'I'), pa('A', '甲', '保送'), pa('A', '甲', '全壘打', 'ER'), pa('A', '乙', '三振', 'II'), pa('A', '乙', '內滾', 'III'),
  pa('B', '丙', '三振', 'I'), pa('B', '丙', '一安', 'ER'), pa('B', '丙', '外飛', 'II'), pa('B', '甲', '三振', 'III'),
]

describe('投球合計 (D02)', () => {
  it('GS = games, W / SV summed from the games, G = games not pitcher appearances', () => {
    const t = teamPitching(pas, DEFAULT_PARAMS, games)
    expect([t.g, t.gs, t.w, t.l, t.sv]).toEqual([2, 2, 2, 0, 1])
    const lines = pitchingLines(pas, games)
    expect(lines.reduce((a, l) => a + l.gs, 0)).toBe(t.gs)
    expect(lines.reduce((a, l) => a + l.w, 0)).toBe(t.w)
  })
  it('one game alone matches that game', () => {
    const t = teamPitching(pas.filter((p) => p.gameId === 'B'), DEFAULT_PARAMS, games.filter((g) => g.id === 'B'))
    expect([t.g, t.gs, t.w, t.sv]).toEqual([1, 1, 1, 0])
  })
})

describe('FIP (D04)', () => {
  it('is on the ERA scale (per innings per game) and the automatic constant makes team FIP = team ERA', () => {
    const params = resolveParams({ ...DEFAULT_PARAMS, inningsPerGame: 7 }, pas)
    const t = teamPitching(pas, params, games)
    expect(t.fip).toBeCloseTo(t.era!, 10)
    // the constant is on the 7-inning scale: ERA 7 × 2 ER / 2 IP = 7; core = (13 + 3 − 8) / 2 × 7/9
    expect(params.fipConstant).toBeCloseTo(7 - (8 / 2) * (7 / 9), 10)
  })
  it('a fixed constant is used as is when automatic is off', () => {
    const params = resolveParams({ ...DEFAULT_PARAMS, fipAuto: false, fipConstant: 3 }, pas)
    expect(params.fipConstant).toBe(3)
  })
})
