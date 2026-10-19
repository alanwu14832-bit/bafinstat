/** 觸身／妨礙: the pitch that ended it is counted (HP / CI): one more pitch, with the balls in 好壞球 totals, not in the count. */
import { describe, expect, it } from 'vitest'
import { countTrail } from '../data/counts'
import { pitchTotals, pitchingLines } from '../data/stats'
import { addPitch, commitPA, count, defaultPlan, impliedResult, newGame, toGameEdit, type RecordState } from './model'

const game = { id: 'G20261019-03', date: '2026-10-19', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 7 }
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))

describe('the pitch of a 觸身 / 妨礙', () => {
  const after = (result: '觸身' | '妨礙', first: string[]) => {
    let s: RecordState = newGame(game, lineup, '壬')
    for (const c of first) s = addPitch(s, c)
    return commitPA(s, defaultPlan(s, result))
  }
  it('觸身 on 3-1: HP is added, 6 pitches, 4 of them with the balls; the count stays 3-1', () => {
    const s = after('觸身', ['B', 'B', 'CS', 'B'])
    expect(s.pitching[0].pitches).toEqual(['B', 'B', 'CS', 'B', 'HP'])
    expect(pitchTotals(s.pitching[0].pitches)).toMatchObject({ pitches: 5, strikes: 1, balls: 4 })
    expect(count(s.pitching[0].pitches)).toEqual({ balls: 3, strikes: 1 })
    expect(impliedResult(s.pitching[0].pitches)).toBeNull()
    expect(countTrail(s.pitching[0].pitches)).toMatchObject({ n: 5, final: '3-1' })
    expect(pitchingLines(toGameEdit(s).pitching, [])[0]).toMatchObject({ pc: 5, hbp: 1 })
  })
  it('妨礙 on the first pitch: CI, one pitch', () => {
    const s = after('妨礙', [])
    expect(s.pitching[0].pitches).toEqual(['CI'])
    expect(pitchTotals(['CI'])).toMatchObject({ pitches: 1, balls: 1 })
  })
})

describe('修改資料: the HP / CI pitch follows the result', () => {
  it('觸身 → 一安 drops HP and ends on IP; 一安 → 觸身 swaps IP for HP; 觸身 → 妨礙 swaps HP for CI', async () => {
    const { lastPitchFor } = await import('./paEdit')
    expect(lastPitchFor(['B', 'HP'], '一安')).toEqual(['B', 'IP'])
    expect(lastPitchFor(['B', 'IP'], '觸身')).toEqual(['B', 'HP'])
    expect(lastPitchFor(['B', 'HP'], '妨礙')).toEqual(['B', 'CI'])
    expect(lastPitchFor(['B', 'HP'], '觸身')).toEqual(['B', 'HP'])
    expect(lastPitchFor(['B', 'B', 'B', 'HP'], '保送')).toEqual(['B', 'B', 'B'])
  })
})
