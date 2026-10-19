/** 再見 (rule 9.06(f)): only the winning run counts, and the hit is credited with the bases the winning runner advanced. */
import { describe, expect, it } from 'vitest'
import { addPitch, commitPA, defaultPlan, newGame, planProblems, score, type RecordState } from './model'

const game = { id: 'G20261019-01', date: '2026-10-19', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 2 }
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const walk = (s: RecordState) => { for (let i = 0; i < 4; i++) s = addPitch(s, 'B'); return commitPA(s, defaultPlan(s, '保送')) }
// we are the home team, tied 0:0 in the bottom of the last (2nd) inning
const bottom = (inning = 2): RecordState => ({ ...newGame(game, lineup, '壬'), inning, half: 'bottom' })
const row = (s: RecordState, base: number) => s.runners.find((r) => r.base === base)!.row

describe('再見', () => {
  it('bases loaded, a double: one run, the batter credited with a single, everyone one base', () => {
    const s = addPitch(walk(walk(walk(bottom()))), 'IP')
    const plan = defaultPlan(s, '二安')
    expect(plan.result).toBe('一安')
    expect(plan.batter).toBe(1)
    expect(plan.runners).toEqual({ [row(s, 3)]: 'home', [row(s, 2)]: 3, [row(s, 1)]: 2 })
    expect(plan.rbi).toBe(1)
    expect(planProblems(s, plan)).toEqual([])
    // sending another runner home is not allowed: the game was over
    const more = { ...plan, runners: { ...plan.runners, [row(s, 2)]: 'home' as const } }
    expect(planProblems(s, more).some((m) => m.includes('再見'))).toBe(true)
    const after = commitPA(s, { ...plan, loc: 8, traj: 'L' })
    expect(score(after)).toMatchObject({ us: 1, opp: 0 })
  })
  it('a home run counts every run; a runner from first scoring on a triple keeps the triple', () => {
    const loaded = addPitch(walk(walk(walk(bottom()))), 'IP')
    expect(defaultPlan(loaded, '全壘打')).toMatchObject({ result: '全壘打', batter: 'home', rbi: 4 })
    const one = addPitch(walk(bottom()), 'IP')
    expect(defaultPlan(one, '三安')).toMatchObject({ result: '三安', batter: 3, rbi: 1 })
  })
  it('not the last inning (or the visitors batting): nothing changes', () => {
    const s = addPitch(walk(walk(walk(bottom(1)))), 'IP')
    expect(defaultPlan(s, '二安')).toMatchObject({ result: '二安', batter: 2, rbi: 2 })
  })
})
