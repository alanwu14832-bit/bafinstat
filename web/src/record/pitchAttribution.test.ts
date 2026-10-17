/**
 * 漏算的球: the pitches of a count that never ended (the half ended on a 盜壘失敗 or 牽制), the pitches a pitcher threw before
 * he was changed in the middle of a count, and plate appearances without their pitches in P/PA and F-Strike%.
 */
import { describe, expect, it } from 'vitest'
import { pitchTotals, battingLines, pitchingLines, teamPitching } from '../data/stats'
import { isPA, isUnfinished, UNFINISHED, type BattingPA, type PitchingPA } from '../data/types'
import { pitcherToday } from '../data/broadcast'
import { addPitch, changePitcher, commitPA, defaultPlan, liveSplit, newGame, runnerEvent, toGameEdit, undoPitch } from './model'
import { inningsOf } from './timeline'

const game = { id: 'G20261014-01', date: '2026-10-14', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 7 }
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const out = (s: ReturnType<typeof newGame>) => commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '內滾'), loc: 6, traj: 'G' })
const single = (s: ReturnType<typeof newGame>) => commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '一安'), loc: 8, traj: 'L' })

describe('a count that never ended', () => {
  const half = () => {
    let s = newGame(game, lineup, '壬', { bench: ['林軒亦'] })
    s = out(out(s))
    s = single(s)                                                                  // 2 out, a runner on 1st
    s = addPitch(addPitch(addPitch(s, 'B'), 'CS'), 'B')                              // 3 pitches to the next batter …
    return runnerEvent(s, s.runners[0].row, 'opp', 'cs')                            // … then he is caught stealing: the third out
  }
  it('the pitches are the pitcher\'s: a 未完成打席 row holds them, no batter faced', () => {
    const s = half()
    expect(s.half).toBe('bottom')
    expect(s.pitching.at(-1)).toMatchObject({ pitcher: '壬', result: UNFINISHED, pitches: ['B', 'CS', 'B'] })
    expect(isPA(s.pitching.at(-1)!)).toBe(false)
    const l = pitchingLines(toGameEdit(s).pitching, [])[0]
    expect(l).toMatchObject({ bf: 3, pc: 6, balls: 2, outs: 3 })                   // 3 balls in play + the 3 above
    expect(l.fStrikePct).toBe(1)                                                     // the 3 batters faced all put the first pitch in play; the unfinished count (a ball first) is no batter faced
    // (it follows no half-inning: the runner timeline of the inning is as before)
    expect(inningsOf(s.pitching).get(1)).toEqual([0, 1, 2])
  })
  it('an ordinary 3rd out (no count in progress) adds no row', () => {
    let s = newGame(game, lineup, '壬')
    s = out(out(out(s)))
    expect(s.pitching.some(isUnfinished)).toBe(false)
  })
})

describe('a pitching change in the middle of a count', () => {
  const change = () => {
    let s = newGame(game, lineup, '壬', { bench: ['林軒亦'] })
    s = addPitch(addPitch(s, 'B'), 'CS')                                             // 壬 throws two
    s = changePitcher(s, '林軒亦')
    s = addPitch(addPitch(s, 'SS'), 'IP')                                            // 林軒亦 throws two, the ball is put in play
    return s
  }
  it('before the row is sent: the count so far is split between them', () => {
    const s = change()
    expect(s.priorPitchers).toEqual([{ name: '壬', pitches: 2 }])
    expect(liveSplit(s)).toEqual({ current: 2, prior: [{ name: '壬', pitches: 2 }] })
    expect(pitcherToday(s.pitching, '壬', 0, liveSplit(s).prior).pc).toBe(2)
    expect(pitcherToday(s.pitching, '林軒亦', liveSplit(s).current, liveSplit(s).prior).pc).toBe(2)
  })
  it('the row remembers it: each pitcher has his own pitches, the result and the batter faced are the new pitcher\'s, the team has all four', () => {
    const s0 = change()
    const s = commitPA(s0, { ...defaultPlan(s0, '內滾'), loc: 6, traj: 'G' })
    expect(s.pitching[0]).toMatchObject({ pitcher: '林軒亦', priorPitchers: [{ name: '壬', pitches: 2 }], pitches: ['B', 'CS', 'SS', 'IP'] })
    expect(s.priorPitchers).toBeUndefined()
    const lines = pitchingLines(s.pitching, [])
    expect(lines.find((l) => l.name === '壬')).toMatchObject({ pc: 2, bf: 0, strikes: 1, balls: 1, g: 1 })
    expect(lines.find((l) => l.name === '林軒亦')).toMatchObject({ pc: 2, bf: 1, outs: 1, whiffs: 1 })
    expect(teamPitching(s.pitching)).toMatchObject({ pc: 4, bf: 1 })
    // (the first pitch of that count was 壬's: the new pitcher's F-Strike% has no batter whose first pitch he threw)
    expect(lines.find((l) => l.name === '林軒亦')!.fStrikePct).toBeNull()
  })
  it('the half ending in that count: the unfinished row keeps the split', () => {
    let s = newGame(game, lineup, '壬', { bench: ['林軒亦'] })
    s = out(out(s)); s = single(s)
    s = addPitch(s, 'B')
    s = changePitcher(s, '林軒亦')
    s = addPitch(s, 'CS')
    s = runnerEvent(s, s.runners[0].row, 'opp', 'pk')
    const row = s.pitching.find(isUnfinished)!
    expect(row).toMatchObject({ pitcher: '林軒亦', pitches: ['B', 'CS'], priorPitchers: [{ name: '壬', pitches: 1 }] })
    const lines = pitchingLines(s.pitching, [])
    expect(lines.find((l) => l.name === '壬')!.pc).toBe(3 + 1)                      // three balls in play and the first pitch of the unfinished count
    expect(lines.find((l) => l.name === '林軒亦')).toMatchObject({ pc: 1, pk: 1 })
  })
  it('taking a pitch back that the first pitcher threw comes off his count', () => {
    let s = change()
    s = undoPitch(undoPitch(s))                     // 林軒亦's two
    expect(s.priorPitchers).toEqual([{ name: '壬', pitches: 2 }])
    s = undoPitch(s)
    expect(s.priorPitchers).toEqual([{ name: '壬', pitches: 1 }])
    s = undoPitch(s)
    expect(s.priorPitchers).toBeUndefined()
  })
})

describe('plate appearances without their pitches', () => {
  const bat = (o: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, batter: '甲', pitches: ['B', 'SS', 'IP'], result: '內滾', loc: 6, traj: 'G', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...o })
  it('P/PA and 首球揮棒% are over the plate appearances that have pitches', () => {
    const [l] = battingLines({ roster: [], games: [], batting: [], pitching: [], fielding: [] }, [bat({}), bat({ pitches: [] }), bat({ pitches: ['SS', 'SS', 'SS'], result: '三振', loc: undefined, traj: undefined })])
    expect(l.pa).toBe(3)
    expect(l.paPitched).toBe(2)
    expect(l.pPerPA).toBeCloseTo(6 / 2, 12)
    expect(l.fpsPct).toBeCloseTo(1 / 2, 12)       // only the third swung at the first pitch
  })
  it('P/BF and F-Strike% are over the batters faced with pitches', () => {
    const p = (o: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G', inning: 1, pitcher: 'A', pitches: ['S', 'IP'], result: '內滾', loc: 6, traj: 'G', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...o })
    const [l] = pitchingLines([p({}), p({ pitches: [] }), p({ pitches: ['B', 'B', 'B', 'B'], result: '保送' })], [])
    expect(l.bf).toBe(3)
    expect(l.bfPitched).toBe(2)
    expect(l.pPerBF).toBeCloseTo(6 / 2, 12)
    expect(l.fStrikePct).toBeCloseTo(1 / 2, 12)
    expect(pitchTotals(['S', 'IP']).pitches).toBe(2)
  })
})
