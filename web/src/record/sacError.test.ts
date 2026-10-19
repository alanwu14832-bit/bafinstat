/** 犧觸／犧飛, the batter safe on an error: the sacrifice and the error are recorded, no putout, nothing left 待核對. */
import { describe, expect, it } from 'vitest'
import { addPitch, commitPA, defaultPlan, newGame, type PAPlan, type RecordState } from './model'
import { auditGame } from '../data/audit'
import { creditPlays } from '../data/normalize'
import { battingLines } from '../data/stats'
import type { FieldingLine } from '../data/types'

const game = (homeAway: '主' | '客') => ({ id: 'G20261019-01', date: '2026-10-19', tournament: '友誼賽', opponent: '測試隊', homeAway, innings: 7 })
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const walk = (s: RecordState) => { for (let i = 0; i < 4; i++) s = addPitch(s, 'B'); return commitPA(s, defaultPlan(s, '保送')) }
const sacSafe = (s: RecordState, errBy?: string[]): RecordState => {
  s = addPitch(s, 'IP')
  const plan: PAPlan = { ...defaultPlan(s, '犧觸'), loc: 5, traj: 'G', batter: 1, errAdv: ['batter'], ...(errBy ? { errBy } : {}) }
  return commitPA(s, plan)
}

describe('犧觸, batter safe on an error', () => {
  it('we field: our error, he is on first, no putout, no 待核對', () => {
    const s = sacSafe(walk(newGame(game('主'), lineup, '壬')), ['3B'])
    const row = s.pitching[1]
    expect(row.result).toBe('犧觸')
    expect(row.errors).toEqual(['3B'])
    expect(s.runners.map((r) => r.base).sort()).toEqual([1, 2])
    expect(s.outs).toBe(0)
    expect(auditGame([], s.pitching)).toEqual([])
    const lines: FieldingLine[] = ['1B', '3B'].map((pos) => ({ gameId: 'G', player: pos, pos, po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0 }))
    creditPlays(lines, s.pitching)
    expect(lines.map((l) => [l.po, l.a])).toEqual([[0, 0], [0, 0]])
  })
  it('we bat: a sacrifice (no at-bat), their error, no 待核對', () => {
    const s = sacSafe(walk(newGame(game('客'), lineup, '壬')))
    expect(s.batting[1].errors?.length).toBe(1)
    expect(auditGame(s.batting, []).filter((i) => i.index === 1)).toEqual([])
    const ds = { roster: [], games: [{ ...game('客') }], batting: s.batting, pitching: [], fielding: [] }
    expect(battingLines(ds, s.batting).find((l) => l.name === '乙')).toMatchObject({ pa: 1, ab: 0, sh: 1 })
  })
})
