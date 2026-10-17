/** XBT% and outs on the bases on a ball that put the batter on, from the live-recorded rows. */
import { describe, expect, it } from 'vitest'
import { runnerPlays } from './baserunning'
import { battingLines, teamBatting } from './stats'
import { EMPTY_DATASET } from './types'
import { addPitch, commitPA, defaultPlan, newGame } from '../record/model'

const game = { id: 'G20261014-01', date: '2026-10-14', tournament: '友誼賽', opponent: '測試隊', homeAway: '客' as const, innings: 7 }
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const hit = (s: ReturnType<typeof newGame>, result: string, over: Record<string, unknown> = {}) => commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, result), loc: 8, traj: 'L', ...over } as never)

describe('XBT and 被刺殺', () => {
  it('counts the chances, the extra bases taken and the outs trying, per runner', () => {
    let s = newGame(game, lineup, '壬')
    s = hit(s, '一安')                                              // 甲 on 1B (no runners: no chance)
    s = hit(s, '一安', { runners: { 0: 3 } })                       // 乙 singles; 甲 1B→3B: an extra base taken
    s = hit(s, '二安', { runners: { 0: 'home', 1: 'home' } })       // 丙 doubles; 甲 scores from 3B (not a chance), 乙 1B→home on a double: taken
    s = hit(s, '一安')                                              // 丁 on 1B... 丙 (2B) holds: his chance for 2B→home on a single, not taken
    const r = runnerPlays(s.batting)
    expect(r.get('甲')).toMatchObject({ xbtOpp: 1, xbt: 1, xbtOut: 0, thrownOut: 0 })
    expect(r.get('乙')).toMatchObject({ xbtOpp: 1, xbt: 1 })
    expect(r.get('丙')).toMatchObject({ xbtOpp: 1, xbt: 0 })
    const l = battingLines({ ...EMPTY_DATASET }, s.batting).find((x) => x.name === '甲')!
    expect([l.xbtOpp, l.xbt, l.xbtPct]).toEqual([1, 1, 1])
    expect(teamBatting({ ...EMPTY_DATASET }, s.batting)).toMatchObject({ xbtOpp: 3, xbt: 2 })
  })
  it('thrown out trying for the base, and the batter put out after reaching, are 被刺殺 (and the attempt out)', () => {
    let s = newGame(game, lineup, '壬')
    s = hit(s, '一安')                                              // 甲 on 1B
    s = hit(s, '一安', { runners: { 0: 'out' } })                   // 乙 singles; 甲 thrown out trying for 3B
    s = hit(s, '一安', { batter: 'out' })                           // 丙 singles and is out stretching it
    const r = runnerPlays(s.batting)
    expect(r.get('甲')).toMatchObject({ xbtOpp: 1, xbt: 0, xbtOut: 1, thrownOut: 1 })
    expect(r.get('丙')).toMatchObject({ thrownOut: 1 })
  })
  it('a half that cannot be followed is left out; a 盜壘失敗 is not a 被刺殺', () => {
    let s = newGame(game, lineup, '壬')
    s = hit(s, '一安')
    const broken = s.batting.map((b) => ({ ...b, basesBefore: undefined }))
    expect(runnerPlays(broken).size).toBe(0)
  })
})
