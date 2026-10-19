/** A runner doubled off after a catch, or thrown out on a 犧飛: the outfielder's assist, the cover's putout, a double play. */
import { describe, expect, it } from 'vitest'
import { addPitch, commitPA, defaultPlan, newGame, outAtAsked, type RecordState } from '../record/model'
import { creditPlays, doublePlayOn } from './normalize'
import type { FieldingLine } from './types'

const game = { id: 'G20261019-01', date: '2026-10-19', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 7 }
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const walk = (s: RecordState) => { for (let i = 0; i < 4; i++) s = addPitch(s, 'B'); return commitPA(s, defaultPlan(s, '保送')) }
const lines = (): FieldingLine[] => ['1B', '2B', 'SS', 'LF', 'C'].map((pos) => ({ gameId: 'G', player: pos, pos, po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0 }))

describe('the runner put out after a catch', () => {
  it('is asked where; LF caught and threw to first: LF PO + A, 1B PO, a double play for both', () => {
    expect(outAtAsked('外飛')).toBe(true)
    let s = addPitch(walk(newGame(game, lineup, '壬')), 'IP')
    const r = s.runners[0].row
    s = commitPA(s, { ...defaultPlan(s, '外飛'), loc: 7, traj: 'F', runners: { [r]: 'out' }, outAt: { [r]: 1 } })
    expect(s.outs).toBe(2)
    const row = s.pitching[1]
    expect(doublePlayOn(row)).toBe(true)
    const l = lines()
    creditPlays(l, s.pitching)
    const by = (pos: string) => l.find((x) => x.pos === pos)!
    expect([by('LF').po, by('LF').a, by('LF').dp]).toEqual([1, 1, 1])
    expect([by('1B').po, by('1B').dp]).toEqual([1, 1])
  })
})
