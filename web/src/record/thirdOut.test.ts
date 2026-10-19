/** Rule 5.08(a): no run on a play whose third out is the batter or a force out; a tag out is a reminder only. */
import { describe, expect, it } from 'vitest'
import { addPitch, commitPA, defaultPlan, newGame, planProblems, thirdOutRule, type RecordState } from './model'

const game = { id: 'G20261019-01', date: '2026-10-19', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 7 }
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const out = (s: RecordState) => commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '內滾'), loc: 6, traj: 'G' })
const walk = (s: RecordState) => { for (let i = 0; i < 4; i++) s = addPitch(s, 'B'); return commitPA(s, defaultPlan(s, '保送')) }
const single = (s: RecordState) => commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '一安'), loc: 8, traj: 'L' })
const row = (s: RecordState, base: number) => s.runners.find((r) => r.base === base)!.row

describe('the third out on the play', () => {
  const loaded2 = () => walk(walk(walk(out(out(newGame(game, lineup, '壬'))))))
  it('野選 with two out: the forced runner is the third out, nobody scores by default, no RBI', () => {
    const s = addPitch(loaded2(), 'IP')
    expect(s.outs).toBe(2)
    const plan = defaultPlan(s, '野選')
    expect(Object.values(plan.runners).filter((d) => d === 'home')).toHaveLength(0)
    expect(plan.rbi).toBe(0)
    expect(planProblems(s, plan)).toEqual([])
    // the recorder sends the runner from third home anyway: blocked, it is a force out
    const forced = { ...plan, runners: { ...plan.runners, [row(s, 3)]: 'home' as const } }
    expect(planProblems(s, forced).some((m) => m.includes('封殺') && m.includes('5.08'))).toBe(true)
  })
  it('a ground out for the third out: a run is blocked (the batter never reached first)', () => {
    const s = addPitch(loaded2(), 'IP')
    const plan = defaultPlan(s, '內滾')
    expect(planProblems(s, plan)).toEqual([])
    const bad = { ...plan, runners: { ...plan.runners, [row(s, 3)]: 'home' as const } }
    expect(planProblems(s, bad).some((m) => m.includes('打者出局'))).toBe(true)
  })
  it('a runner tagged out at the plate for the third out while another scores: a reminder, not a block', () => {
    // two out, runners on 2nd and 3rd (no force), single: the runner from 3rd scores, the one from 2nd is thrown out at home
    let s = out(out(newGame(game, lineup, '壬')))
    s = single(s)
    s = commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '二安'), loc: 9, traj: 'L', runners: { [s.runners[0].row]: 3 }, batter: 2, rbi: 0 })
    expect(s.runners.map((r) => r.base).sort()).toEqual([2, 3])
    s = addPitch(s, 'IP')
    const plan = { ...defaultPlan(s, '一安'), loc: 8, traj: 'L', runners: { [row(s, 3)]: 'home' as const, [row(s, 2)]: 'out' as const } }
    expect(planProblems(s, plan)).toEqual([])
    expect(thirdOutRule(s, plan).warn).toMatch(/踩到本壘/)
  })
  it('with one out a double play still ends it: a run on a 雙殺 is blocked, and none scores by default', () => {
    let s = walk(walk(walk(out(newGame(game, lineup, '壬')))))
    s = addPitch(s, 'IP')
    expect(s.outs).toBe(1)
    const plan = defaultPlan(s, '雙殺')
    expect(Object.values(plan.runners).includes('home')).toBe(false)
    expect(planProblems(s, { ...plan, runners: { ...plan.runners, [row(s, 3)]: 'home' } }).some((m) => m.includes('5.08'))).toBe(true)
  })
})
