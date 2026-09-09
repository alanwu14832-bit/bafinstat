import { describe, expect, it } from 'vitest'
import { addPitch, commitPA, count, defaultPlan, endHalf, impliedResult, newGame, nextGameId, offense, runnerEvent, score, toGameEdit } from './model'
import { normalizeGameEdit } from '../data/edit'
import { SEED_DATASET } from '../data/seed'
import { summarizeGame, battingLines, pitchingLines } from '../data/stats'

const game = { id: 'G20260301-01', date: '2026-03-01', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 7 }
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))

describe('live scorekeeping model', () => {
  it('counts pitches and implies walks / strikeouts', () => {
    expect(count(['B', 'CS', 'F', 'F', 'F'])).toEqual({ balls: 1, strikes: 2 })
    expect(impliedResult(['B', 'B', 'B', 'B'])).toBe('保送')
    expect(impliedResult(['SS', 'CS', 'F', 'SS'])).toBe('三振')
    expect(nextGameId('2026-03-01', ['G20260301-01'])).toBe('G20260301-02')
  })

  it('home team: opponent bats first; a full half-inning switches sides and codes runners', () => {
    let s = newGame(game, lineup, '壬')
    expect(offense(s)).toBe('opp')
    // leadoff single, then strikeout, then a double scoring the runner (earned), then two outs
    s = commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '一安'), loc: 6, traj: 'G' })
    expect(s.runners).toHaveLength(1)
    s = commitPA(addPitch(addPitch(addPitch(s, 'CS'), 'SS'), 'SS'), defaultPlan(s, '三振'))
    expect(s.outs).toBe(1)
    const plan = defaultPlan(s, '二安'); expect(plan.runners[0]).toBe(3) // default: first-to-third on a double
    s = commitPA(addPitch(s, 'IP'), { ...plan, loc: 8, traj: 'F', runners: { 0: 'home' } })
    expect(s.pitching[0].code).toBe('ER'); expect(score(s).opp).toBe(1)
    s = commitPA(s, { ...defaultPlan(s, '內飛'), loc: 7, traj: 'F' })
    s = commitPA(s, { ...defaultPlan(s, '內滾'), loc: 4, traj: 'G' })
    // half over: runner on 2B left (L), we are now batting the bottom of the 1st
    expect(s.half).toBe('bottom'); expect(s.inning).toBe(1); expect(s.outs).toBe(0); expect(s.runners).toHaveLength(0)
    expect(s.pitching[2].code).toBe('L'); expect(s.pitching[3].code).toBe('II'); expect(s.pitching[4].code).toBe('III')
    expect(offense(s)).toBe('us')
    expect(s.pitching.map((p) => p.outsBefore)).toEqual([0, 0, 1, 1, 2])
  })

  it('our offense: runs, RBI, steals and LOB land on the right rows and reproduce the line score', () => {
    let s = { ...newGame({ ...game, homeAway: '客' }, lineup, '壬') } // away: we bat top
    expect(offense(s)).toBe('us')
    s = commitPA(s, defaultPlan(s, '保送'))               // 甲 to 1B
    s = runnerEvent(s, 0, 'us', 'sb')                      // 甲 steals 2B
    expect(s.batting[0].sb).toBe(1); expect(s.runners[0].base).toBe(2)
    s = commitPA(s, { ...defaultPlan(s, '一安'), loc: 9, traj: 'L', quality: '強', runners: { 0: 'home' }, rbi: 1 }) // 乙 single, 甲 scores
    expect(s.batting[0].run).toBe(1); expect(s.batting[0].code).toBe('R'); expect(s.batting[1].rbi).toBe(1)
    s = commitPA(s, { ...defaultPlan(s, '雙殺'), loc: 6, traj: 'G' })  // 丙 GIDP: 乙 out at 2B, 丙 out at 1B
    expect(s.outs).toBe(2); expect(s.batting[1].outOnBase).toBe(1); expect(s.batting[1].code).toBe('I'); expect(s.batting[2].code).toBe('II')
    s = commitPA(s, defaultPlan(s, '觸身'))
    s = commitPA(s, defaultPlan(s, '三振'))
    expect(s.half).toBe('bottom'); expect(s.batting[3].code).toBe('L')
    const sc = score(s); expect(sc.us).toBe(1); expect(sc.lineUs[0]).toBe(1)
    expect(s.slot).toBe(5) // 己 leads off next inning
    // through the normal pipeline the numbers agree
    const { fragment } = normalizeGameEdit(SEED_DATASET.roster, toGameEdit(s))
    const sum = summarizeGame(fragment, fragment.games[0])
    expect(sum.runsUs).toBe(1); expect(sum.hitsUs).toBe(1); expect(sum.lobUs).toBe(1)
    const b = battingLines(fragment, fragment.batting)
    expect(b.find((l) => l.name === '甲')!.sb).toBe(1); expect(b.find((l) => l.name === '乙')!.rbi).toBe(1)
    expect(b.find((l) => l.name === '丙')!.gidp).toBe(1)
  })

  it('pitching rows credit outs and earned runs to the pitcher on the mound', () => {
    let s = newGame(game, lineup, '壬')
    s = commitPA(s, defaultPlan(s, '全壘打'))
    s = commitPA(s, defaultPlan(s, '內滾'))
    s = { ...s, pitcher: '辛' }
    s = commitPA(s, defaultPlan(s, '三振'))
    s = commitPA(s, defaultPlan(s, '外飛'))
    s = endHalf(s)
    const { fragment } = normalizeGameEdit(SEED_DATASET.roster, toGameEdit(s))
    const lines = pitchingLines(fragment.pitching, fragment.games)
    expect(lines.find((l) => l.name === '壬')!.er).toBe(1); expect(lines.find((l) => l.name === '壬')!.outs).toBe(1)
    expect(lines.find((l) => l.name === '辛')!.outs).toBe(2); expect(lines.find((l) => l.name === '辛')!.k).toBe(1)
  })
})
