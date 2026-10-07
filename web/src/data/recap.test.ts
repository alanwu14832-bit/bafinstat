import { describe, expect, it } from 'vitest'
import { gameRecap } from './recap'
import { summarizeGame } from './stats'
import type { BattingPA, Dataset, Game, PitchingPA } from './types'

const game: Game = { id: 'G1', date: '2026-09-28', tournament: '新生盃', opponent: '經濟', homeAway: '主', winningPitcher: '王' }
const bat = (inning: number, batter: string, x: Partial<BattingPA> = {}): BattingPA => ({ gameId: 'G1', inning, batter, pitches: ['X'], result: '一安', loc: 7, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...x })
const pit = (inning: number, x: Partial<PitchingPA> = {}): PitchingPA => ({ gameId: 'G1', inning, pitcher: '王', pitches: ['X'], result: '外飛', loc: 8, code: 'I', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...x })
// opponent scores 1 in the top of the 1st, we score 3 in the bottom of the 1st and 1 in the 2nd: 4–1
const ds: Dataset = {
  roster: [], games: [game],
  pitching: [pit(1, { result: '全壘打', code: 'ER', loc: 7 }), pit(1), pit(1, { code: 'II' }), pit(1, { code: 'III' }), pit(2), pit(2, { code: 'II' }), pit(2, { code: 'III' })],
  batting: [bat(1, '甲', { run: 1, code: 'R' }), bat(1, '乙', { run: 1, code: 'R' }), bat(1, '丙', { result: '全壘打', run: 1, rbi: 3, code: 'R' }), bat(2, '丁', { run: 1, rbi: 1, result: '全壘打', code: 'R' })],
  fielding: [],
}

describe('戰報摘要', () => {
  it('finds where it turned, the biggest half-inning and who stood out, each pointing back to its source', () => {
    const r = gameRecap(summarizeGame(ds, game), ds, '喝FIN')
    const turn = r.find((l) => l.kind === 'turn')!
    expect(turn.text).toContain('第 1 局下')
    expect(turn.text).toContain('3:1')
    expect([turn.inning, turn.half, turn.side]).toEqual([1, 'bottom', 'bat'])
    const big = r.find((l) => l.kind === 'big')!
    expect(big.text).toContain('單局攻下 3 分')
    expect(big.text).toContain('丙 3')
    expect(r.find((l) => l.kind === 'star')?.player).toBe('丙')
    expect(r.find((l) => l.kind === 'pitch')?.label).toBe('勝投')
  })
})
