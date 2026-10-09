import { describe, expect, it } from 'vitest'
import { addPitch, commitPA, defaultPlan, newGame, runnerEvent, toggleEarned, type PAPlan, type RecordState } from './model'
import { applyEarned, earnedAll, earnedRepairs, TIEBREAK_WHY } from './earned'
import { placeTiebreak } from './tiebreak'

// we are the home team, so the opponent bats first and every plate appearance here is theirs
const game = { id: 'G20260301-01', date: '2026-03-01', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 7 }
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const start = () => newGame(game, lineup, '壬')
const pa = (s: RecordState, result: string, patch: Partial<PAPlan> = {}) => {
  const plan = defaultPlan(s, result)
  return commitPA(addPitch(s, 'IP'), { ...plan, ...patch, runners: { ...plan.runners, ...patch.runners } })
}
const k = (s: RecordState) => pa(s, '三振')
const codes = (s: RecordState) => s.pitching.map((p) => p.code)

describe('自責分 by the rules (errorless inning)', () => {
  it('a batter who reached on an error never scores an earned run; the home run hitter does', () => {
    let s = pa(start(), '失誤')                         // 1 on an error (would have been the 1st out)
    s = pa(s, '全壘打')                                   // 2 homers: 2 runs, 0 outs
    expect(codes(s)).toEqual(['R', 'ER'])
    expect(earnedAll(s.pitching).get(0)?.why).toBe('上壘靠我隊失誤')
  })

  it('after a two-out error that should have ended the inning, nothing is earned', () => {
    let s = k(k(start()))
    s = pa(s, '一安')                                     // single, 2 outs
    s = pa(s, '失誤')                                     // should have been the 3rd out
    s = pa(s, '全壘打', { runners: { 2: 'home', 3: 'home' } })
    expect(codes(s).slice(2)).toEqual(['R', 'R', 'R'])
    expect(earnedAll(s.pitching).get(2)?.why).toBe('沒有失誤的話，這局在他回本壘前已經三出局')
  })

  it('an error with nobody out only adds an out: later runs before that third out are still earned', () => {
    let s = pa(start(), '失誤')                           // errorless: 1 out
    s = k(s)                                              // 2 outs (really 1)
    s = pa(s, '全壘打')                                   // the hitter is earned, the man who reached on the error is not
    expect(codes(s)).toEqual(['R', 'I', 'ER'])
    s = k(s)                                              // errorless 3rd out
    s = pa(s, '全壘打')                                   // after it: unearned
    expect(s.pitching[4].code).toBe('R')
  })

  it('a runner who took a base on a passed ball is earned only if he would have scored anyway', () => {
    let s = pa(start(), '一安')                           // runner on first
    s = runnerEvent(s, 0, 'opp', 'pb')                    // to second on a passed ball
    s = pa(s, '一安', { runners: { 0: 'home' } })         // scores from second on a single (from first: only to third)
    expect(s.pitching[0].code).toBe('R')
    s = k(k(k(s)))
    expect(s.pitching[0].code).toBe('R')
    expect(earnedAll(s.pitching).get(0)?.why).toBe('靠捕逸多跑的壘才回到本壘')
  })

  it('...but a home run after it would have brought him in anyway, so his run turns earned', () => {
    let s = pa(start(), '一安')
    s = runnerEvent(s, 0, 'opp', 'pb')
    s = pa(s, '一安', { runners: { 0: 'home' } })
    s = pa(s, '全壘打')                                   // the errorless runner on third scores on it
    expect(codes(s)).toEqual(['ER', 'ER', 'ER'])
  })

  it('a run that comes in on a passed ball is unearned; on a wild pitch it is earned', () => {
    let s = pa(pa(start(), '三安'), '三安', { runners: { 0: 'home' } })
    s = runnerEvent(s, 1, 'opp', 'pb')
    expect(s.pitching[1].code).toBe('R')                  // right away while the plate appearance goes on
    s = k(s)
    expect(s.pitching[1].code).toBe('R')
    let w = pa(start(), '三安')
    w = runnerEvent(w, 0, 'opp', 'wp')
    w = k(w)
    expect(w.pitching[0].code).toBe('ER')
  })

  it('a strikeout survived on a passed ball counts as an out', () => {
    let s = start()
    s = commitPA({ ...s, extras: { ...s.extras, pb: 1 } }, { ...defaultPlan(s, '三振'), batter: 1 })
    s = pa(s, '全壘打')
    expect(codes(s)).toEqual(['R', 'ER'])
    expect(earnedAll(s.pitching).get(0)?.why).toBe('不死三振是捕逸造成的')
  })

  it('a run scored on 失誤進壘 on the play is unearned, the batter-runner with it', () => {
    let s = pa(start(), '一安')
    s = pa(s, '一安', { runners: { 0: 'home' }, errAdv: [0], errBy: ['RF'] })   // single, our RF lets him score from first
    expect(s.pitching[0].code).toBe('R')
  })

  it('bases loaded walk in the errorless inning forces the run in: earned', () => {
    let s = pa(pa(pa(start(), '保送'), '保送'), '保送')
    s = pa(s, '保送')
    expect(s.pitching[0].code).toBe('ER')
  })

  it('a relief pitcher gets no benefit of the outs missed before he came in', () => {
    let s = k(k(start()))
    s = pa(s, '一安')                                     // 壬's runner
    s = pa(s, '失誤')                                     // should have been the third out
    s = { ...s, pitcher: '辛' }                           // reliever
    s = pa(s, '全壘打', { runners: { 2: 'home', 3: 'home' } })
    // 壬's runner: after the errorless third out → unearned; the reliever's batter: his inning had only 2 outs → earned
    expect(codes(s).slice(2)).toEqual(['R', 'R', 'ER'])
  })

  it('a call made by hand stays when the inning changes later', () => {
    let s = pa(start(), '一安')
    s = pa(s, '二安', { runners: { 0: 'home' } })
    expect(s.pitching[0].code).toBe('ER')
    s = toggleEarned(s, 0)                                // the recorder knows better (a muffed foul fly…)
    s = pa(s, '全壘打')
    expect(codes(s)).toEqual(['R', 'ER', 'ER'])
  })

  it('a call on the play itself (earnedBy) wins over the rules', () => {
    let s = pa(start(), '一安')
    s = pa(s, '二安', { runners: { 0: 'home' }, earnedBy: { 0: false } })
    expect(s.pitching[0].code).toBe('R')
  })

  it('applyEarned: an edit moves the calls that followed the rules and keeps the rest', () => {
    let s = pa(start(), '一安')
    s = pa(s, '二安', { runners: { 0: 'home' } })
    const rows = s.pitching
    const asError = rows.map((p, i) => (i === 0 ? { ...p, result: '失誤' } : p))
    expect(applyEarned(asError, earnedAll(rows), earnedAll(asError))[0].code).toBe('R')
    const byHand = asError.map((p, i) => (i === 0 ? { ...p, code: 'R' } : p))
    // was R by hand (rules said ER): stays R whatever the rules say now
    expect(applyEarned(byHand, earnedAll(rows), earnedAll(rows))[0].code).toBe('R')
  })

  it('earnedRepairs lists the runs whose code is not what the rules say (not those of a half that ended on the bases)', () => {
    let s = pa(start(), '失誤')
    s = k(k(k(pa(s, '全壘打'))))
    const old = s.pitching.map((p) => (p.code === 'R' ? { ...p, code: 'ER' } : p))   // recorded before the rules: every run earned
    expect(earnedRepairs(old)).toEqual([{ index: 0, inning: 1, name: '對方第 1 棒（投手 壬）', from: 'ER', to: 'R', why: '上壘靠我隊失誤' }])
    // the same inning not finished yet: the home run's plate appearance is the last one so far, its runs are left alone
    expect(earnedRepairs(old.slice(0, 2))).toEqual([])
  })
})

describe('突破僵局: a placed runner\'s run is never earned', () => {
  // the opponent bats the top of the 8th, two runners placed (rows 0 and 1)
  const placed = () => placeTiebreak({ ...start(), inning: 8, oppOrder: 3 })
  it('his run is unearned; the batters\' runs are judged as usual', () => {
    let s = pa(placed(), '二安')
    expect(codes(s)[0]).toBe('R')
    expect(earnedAll(s.pitching).get(0)?.why).toContain('突破僵局')
    expect(earnedAll(s.pitching).get(0)?.why).toBe(TIEBREAK_WHY)
    s = pa(s, '全壘打')
    expect(codes(s)).toEqual(['R', 'R', 'ER', 'ER'])
  })
  it('his real out counts in the errorless inning', () => {
    let s = runnerEvent(placed(), 0, 'opp', 'pk')         // out 1: the runner on second picked off
    s = k(s)                                              // out 2
    s = pa(s, '失誤')                                     // errorless out 3
    s = pa(s, '全壘打')
    expect(codes(s)[1]).toBe('R')                         // placed
    expect(codes(s)[3]).toBe('R')                         // reached on the error
    expect(codes(s)[4]).toBe('R')
    expect(earnedAll(s.pitching).get(4)?.why).toBe('沒有失誤的話，這局在他回本壘前已經三出局')
  })
  it('a finished tie-break inning needs no repairs, and a call by hand on a placed run stays', () => {
    let s = pa(placed(), '二安')
    s = k(k(k(s)))
    expect(earnedRepairs(s.pitching)).toEqual([])
    let t = pa(placed(), '二安')
    t = toggleEarned(t, 0)
    expect(t.pitching[0].code).toBe('ER')
    t = pa(t, '全壘打')
    expect(t.pitching[0].code).toBe('ER')
  })
})
