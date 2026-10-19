/** 三振雙殺: a runner set to 出局 on strike three is a 盜壘失敗 (or 牽制出局／跑壘出局), not an out without a cause. */
import { describe, expect, it } from 'vitest'
import { addPitch, baseOutsFirst, commitPA, defaultPlan, newGame, type PAPlan, type RecordState } from './model'

const game = (homeAway: '主' | '客') => ({ id: 'G20261019-01', date: '2026-10-19', tournament: '友誼賽', opponent: '測試隊', homeAway, innings: 7 })
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const walk = (s: RecordState) => { for (let i = 0; i < 4; i++) s = addPitch(s, 'B'); return commitPA(s, defaultPlan(s, '保送')) }
const strikeThree = (s: RecordState) => addPitch(addPitch(addPitch(s, 'SS'), 'SS'), 'SS')
const send = (s: RecordState, plan: PAPlan) => { const x = baseOutsFirst(s, plan); return commitPA(x.s, x.plan) }

describe('三振雙殺', () => {
  it('we bat: the runner is caught stealing by default (盜壘失敗 on his row), two outs', () => {
    const s = strikeThree(walk(newGame(game('客'), lineup, '壬')))
    const r = s.runners[0].row
    const after = send(s, { ...defaultPlan(s, '三振'), runners: { [r]: 'out' } })
    expect(after.outs).toBe(2)
    expect(after.runners).toHaveLength(0)
    expect(after.batting[0].cs).toBe(1)
    expect(after.batting[1].result).toBe('三振')
  })
  it('they bat: the 阻殺 is ours, picked 牽制出局 it is a pickoff', () => {
    const s = strikeThree(walk(newGame(game('主'), lineup, '壬')))
    const r = s.runners[0].row
    const cs = send(s, { ...defaultPlan(s, '三振'), runners: { [r]: 'out' } })
    expect(cs.outs).toBe(2)
    expect(cs.pitching.reduce((a, p) => a + p.cs, 0)).toBe(1)
    const pk = send(s, { ...defaultPlan(s, '三振'), runners: { [r]: 'out' }, outHow: { [r]: 'pk' } })
    expect(pk.outs).toBe(2)
    expect(pk.pitching.reduce((a, p) => a + p.cs, 0)).toBe(0)
    expect(pk.pitching.reduce((a, p) => a + p.pk, 0)).toBeGreaterThan(0)
  })
  it('a ball in play goes through unchanged', () => {
    const s = addPitch(walk(newGame(game('客'), lineup, '壬')), 'IP')
    const plan = defaultPlan(s, '內滾')
    expect(baseOutsFirst(s, plan).plan).toBe(plan)
  })
})

describe('the game ends in the middle of a half-inning', () => {
  it('the runners still on are left on base (殘壘)', async () => {
    const { toGameEdit } = await import('./model')
    const s = walk(newGame(game('客'), lineup, '壬'))
    expect(toGameEdit({ ...s, finished: true }).batting[0].code).toBe('L')
    expect(toGameEdit(s).batting[0].code).toBeUndefined()
  })
})
