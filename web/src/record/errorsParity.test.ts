/**
 * Batch 11: the E column counts every error (趁傳進壘 is no error, 失誤進壘 is), and recording our batting and theirs is
 * equally complete (對方失誤, 失誤進壘 for their runners, their RBI, 備註, 對方代打).
 */
import { describe, expect, it } from 'vitest'
import {
  addOppError, addPitch, commitPA, defaultPlan, endHalf, newGame, oppPitchCount, pinchHitOpp, setOppPitcher, removeOppError, runnerEvent, setOppRbi, settlePending, toGameEdit, type PAPlan, type RecordState,
} from './model'
import { describeChange } from './summary'
import { normalizeGameEdit } from '../data/edit'
import { SEED_DATASET } from '../data/seed'
import { summarizeGame } from '../data/stats'
import { cleanOppErrors, errorsOf, errorsText, oppErrorsOf, UNKNOWN_FIELDER } from '../data/errors'
import { deriveFielding } from '../data/normalize'
import { asOppBatting, oppBattingLines, oppRunning, oppTotals } from '../data/opponent'
import { buildScoresheet } from '../data/scoresheet'
import { OPP_PH_UNNAMED, type BattingPA, type Game, type PitchingPA } from '../data/types'

const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
// 客: we bat the top halves
const away = { id: 'G20261013-01', date: '2026-10-13', tournament: '友誼賽', opponent: '測試隊', homeAway: '客' as const, innings: 7 }
const home = { ...away, homeAway: '主' as const }
const ip = (s: RecordState) => addPitch(s, 'IP')
const play = (s: RecordState, result: string, patch: Partial<PAPlan> = {}) => commitPA(ip(s), { ...defaultPlan(s, result), loc: 6, ...patch })
const summary = (s: RecordState) => { const { fragment } = normalizeGameEdit(SEED_DATASET.roster, toGameEdit(s)); return summarizeGame(fragment, fragment.games[0]) }

describe('E counts every error of theirs (audit A3)', () => {
  it('1) a single, the batter takes 2B on the shortstop’s wild throw marked 失誤進壘', () => {
    let s = newGame(away, lineup, '壬')
    s = play(s, '一安', { batter: 2, errAdv: ['batter'] })
    expect(s.batting[0].errors).toEqual([UNKNOWN_FIELDER])
    expect(summary(s).errorsOpp).toBe(1)
    // naming their fielder keeps him
    let t = newGame(away, lineup, '壬')
    t = play(t, '一安', { batter: 2, errAdv: ['batter'], errBy: ['SS'] })
    expect(t.batting[0].errors).toEqual(['SS'])
  })
  it('2) runner on 1B, single, the runner reaches 3B on the right fielder’s bad throw', () => {
    let s = newGame(away, lineup, '壬')
    s = play(s, '一安')
    s = play(s, '一安', { runners: { 0: 3 }, errAdv: [0] })
    expect(summary(s).errorsOpp).toBe(1)
  })
  it('3) and 4) a pickoff throw into center field between pitches (then caught stealing for the third out)', () => {
    let s = newGame(away, lineup, '壬')
    s = play(s, '內滾'); s = play(s, '內滾')
    s = play(s, '一安')
    s = addPitch(s, 'B')
    s = runnerEvent(s, 2, 'us', 'err')
    expect(s.extras.oppErrors).toEqual([UNKNOWN_FIELDER])
    expect(s.batting[2].advOnError).toBe(1)
    // 4) the half ends on the bases: the error is not lost
    const ended = runnerEvent(s, 2, 'us', 'cs')
    expect(ended.half).toBe('bottom')
    expect(ended.batting[2].errors).toEqual([UNKNOWN_FIELDER])
    expect(summary(ended).errorsOpp).toBe(1)
    // 3) the plate appearance goes on and is sent
    s = play(s, '內飛')
    expect(s.batting[3].errors).toEqual([UNKNOWN_FIELDER])
    expect(summary(s).errorsOpp).toBe(1)
  })
  it('5) a grounder, the first baseman drops the throw: batter on via 失誤進壘 instead of the result 失誤', () => {
    let s = newGame(away, lineup, '壬')
    s = play(s, '內滾', { batter: 1, errAdv: ['batter'], errBy: ['1B'] })
    expect(summary(s).errorsOpp).toBe(1)
  })
  it('6) two outs, their catcher drops a foul pop: 對方失誤 C with nobody moving', () => {
    let s = newGame(away, lineup, '壬')
    s = play(s, '內滾'); s = play(s, '內滾')
    s = addPitch(s, 'F')
    s = addOppError(s, 'C')
    expect(describeChange(newGame(away, lineup, '壬'), addOppError(newGame(away, lineup, '壬'), 'C'))).toContain('對方失誤 C')
    s = addOppError(s, 'SS'); s = removeOppError(s, 'SS')
    s = addPitch(s, 'SS'); s = addPitch(s, 'SS')
    s = commitPA(s, defaultPlan(s, '三振'))
    expect(s.batting[2].errors).toEqual(['C'])
    expect(summary(s).errorsOpp).toBe(1)
  })
  it('7) catcher’s interference is their error on every board', () => {
    let s = newGame(away, lineup, '壬')
    s = commitPA(s, defaultPlan(s, '妨礙'))
    expect(summary(s).errorsOpp).toBe(1)
    expect(oppErrorsOf(s.batting[0]).count).toBe(1)
  })
  it('趁傳進壘 is no error; a 失誤 result is one, plus another fielder named on the play', () => {
    let s = newGame(away, lineup, '壬')
    s = play(s, '一安', { batter: 2, throws: ['batter'] })
    expect(summary(s).errorsOpp).toBe(0)
    s = play(s, '失誤', { loc: 6, runners: { 0: 'home' }, errAdv: [0] })
    expect(s.batting[1].errors).toBeUndefined()
    expect(summary(s).errorsOpp).toBe(1)
    s = play(s, '失誤', { loc: 6, batter: 2, errAdv: ['batter'], errBy: ['RF'] })
    expect(summary(s).errorsOpp).toBe(3)
  })
})

describe('the same fielder twice in one plate appearance is two errors (review)', () => {
  it('we bat: 失誤進壘 on their 2B between pitches, then the batter reaches on E4', () => {
    let s = newGame(away, lineup, '壬')
    s = play(s, '一安')
    s = runnerEvent(s, 0, 'us', 'err', undefined, '2B')
    s = play(s, '失誤', { loc: 4 })
    expect(s.batting[1].errors).toEqual(['2B'])
    expect(summary(s).errorsOpp).toBe(2)
  })
  it('we bat: 對方失誤 SS (a dropped foul pop), then the batter reaches on E6; 對方失誤 C then 妨礙', () => {
    let s = newGame(away, lineup, '壬')
    s = addOppError(s, 'SS')
    s = play(s, '失誤', { loc: 6 })
    expect(summary(s).errorsOpp).toBe(2)
    s = addOppError(s, 'C')
    s = play(s, '妨礙', { loc: undefined })
    expect(summary(s).errorsOpp).toBe(4)
  })
  it('we field: their runner takes a base on our 2B’s error, then the batter reaches on E4', () => {
    let s = newGame(home, lineup, '壬')
    s = play(s, '一安')
    s = runnerEvent(s, 0, 'opp', 'err', undefined, '2B')
    s = play(s, '失誤', { loc: 4 })
    expect(s.pitching[1].errors).toEqual(['2B', '2B'])
    expect(summary(s).errorsUs).toBe(2)
  })
  it('we field: the fielder picked for the 失誤進壘 on a 失誤 result at his 落點 is that same error', () => {
    let s = newGame(home, lineup, '壬')
    s = play(s, '失誤', { loc: 6, batter: 2, errAdv: ['batter'], errBy: ['SS'] })
    expect(summary(s).errorsUs).toBe(1)
    s = play(s, '失誤', { loc: 6, batter: 2, errAdv: ['batter'], errBy: ['SS', 'RF'] })
    expect(summary(s).errorsUs).toBe(3)
  })
  it('we field: an error pressed after a 失誤 at the same position, kept when the half is ended by hand', () => {
    let s = newGame(home, lineup, '壬')
    s = play(s, '失誤', { loc: 6 })
    s = runnerEvent(s, 0, 'opp', 'err', undefined, 'SS')
    s = settlePending(s)
    expect(s.pitching[0].errors).toEqual(['SS', 'SS'])
    expect(summary(s).errorsUs).toBe(2)
  })
})

describe('the shared rule (data/errors.ts)', () => {
  const b = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, batter: '甲', pitches: [], result: '', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
  const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G', inning: 1, pitcher: '壬', pitches: [], result: '', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })
  it('their errors: the list, the result, and older rows’ 失誤進壘 plays', () => {
    expect(oppErrorsOf(b({ result: '失誤', loc: 6 })).count).toBe(1)
    // the list never holds the result's own error: the same fielder listed is another error of his
    expect(oppErrorsOf(b({ result: '失誤', loc: 6, errors: ['SS'] })).count).toBe(2)
    expect(oppErrorsOf(b({ result: '失誤', loc: 6, errors: ['C'] })).count).toBe(2)
    expect(oppErrorsOf(b({ result: '失誤', errors: ['C'] })).count).toBe(2)
    expect(oppErrorsOf(b({ result: '失誤', errors: ['?'] })).count).toBe(2)
    expect(oppErrorsOf(b({ result: '失誤' })).count).toBe(1)
    expect(oppErrorsOf(b({ result: '妨礙', errors: ['C'] })).count).toBe(2)
    expect(oppErrorsOf(b({ result: '一安', errors: ['?', 'LF'] }))).toEqual({ positions: ['LF'], unknown: 1, count: 2 })
    // before the list: one per play between pitches, one for the batted ball (not on a 失誤 result)
    expect(oppErrorsOf(b({ result: '一安', events: [{ at: 1, kind: 'err', from: 1, to: 2 }, { at: 2, kind: 'throw', from: 2, to: 3 }] })).count).toBe(1)
    expect(oppErrorsOf(b({ result: '一安', events: [{ at: 1, kind: 'err', from: 1, to: 2, play: true }, { at: 1, kind: 'err', from: 2, to: 3, play: true }] })).count).toBe(1)
    expect(oppErrorsOf(b({ result: '失誤', loc: 6, events: [{ at: 1, kind: 'err', from: 1, to: 2, play: true }] })).count).toBe(1)
  })
  it('ours: the list no longer hides the 失誤 result, and 妨礙 adds the catcher', () => {
    // a list naming the result's position holds its own error (older rows, the Excel help)
    expect(errorsOf(pit({ result: '失誤', loc: 6, errors: ['SS'] }))).toEqual({ positions: ['SS'], unknown: 0 })
    expect(errorsOf(pit({ result: '失誤', loc: 6, errors: ['SS', 'SS'] }))).toEqual({ positions: ['SS', 'SS'], unknown: 0 })
    expect(errorsOf(pit({ result: '失誤', loc: 6, errors: ['RF'] }))).toEqual({ positions: ['RF', 'SS'], unknown: 0 })
    expect(errorsOf(pit({ result: '妨礙', errors: ['SS'] }))).toEqual({ positions: ['SS', 'C'], unknown: 0 })
  })
  it('typed 對方失誤 keeps 不知道', () => {
    expect(cleanOppErrors('SS、不知道、?、6')).toEqual(['SS', '?', '?', 'SS'])
    expect(errorsText(['SS', '?'])).toBe('SS、不明')
    expect(cleanOppErrors(errorsText(['SS', '?']))).toEqual(['SS', '?'])
  })
  it('an error at a position nobody batted at goes to the 當日登錄名單’s man there, else it is reported, never dropped', () => {
    const g: Game = { id: 'G', date: '2026-10-13', tournament: 't', opponent: 'o', homeAway: '主', innings: 3 }
    const bat = [b({ batter: '甲', pos: 'C' })]
    const withRoster = { ...g, dayRoster: { starters: [{ name: '甲', pos: 'C', order: 1 }, { name: '乙', pos: 'RF' }], bench: [], reentry: false } }
    const d1 = deriveFielding(withRoster, bat, [pit({ result: '一安', errors: ['RF'] })])
    expect(d1.lines.find((l) => l.player === '乙')?.e).toBe(1)
    const d2 = deriveFielding(g, bat, [pit({ result: '一安', errors: ['RF'] })])
    expect(d2.unknownErrors).toBe(1)
  })
  it('the game’s E for us counts an error no line has (no 落點)', () => {
    let s = newGame(home, lineup, '壬')
    s = commitPA(ip(s), { ...defaultPlan(s, '失誤') })
    expect(summary(s).errorsUs).toBe(1)
  })
})

describe('their batting recorded like ours', () => {
  it('失誤進壘 for their runner asks whose error: ours, and the run is unearned', () => {
    let s = newGame(home, lineup, '壬')
    s = play(s, '三安')
    s = runnerEvent(s, 0, 'opp', 'err', undefined, 'C')
    expect(s.extras.errors).toEqual(['C'])
    expect(s.pitching[0].code).toBe('R')
    s = play(s, '內滾')
    expect(s.pitching[1].errors).toEqual(['C'])
    expect(summary(s).errorsUs).toBe(1)
  })
  it('their RBI is kept, corrected afterwards, and in their box', () => {
    let s = newGame(home, lineup, '壬')
    s = play(s, '一安')
    s = play(s, '二安', { runners: { 0: 'home' }, rbi: 1 })
    expect(s.pitching[1].rbi).toBe(1)
    s = setOppRbi(s, 1, 2)
    expect(s.pitching[1].rbi).toBe(2)
    s = setOppRbi(s, 1, 0)
    expect('rbi' in s.pitching[1]).toBe(false)
    s = setOppRbi(s, 1, 1)
    expect(oppTotals(s.pitching).rbi).toBe(1)
    expect(asOppBatting(s.pitching[1]).rbi).toBe(1)
    const sheet = buildScoresheet(s.pitching, 'pit', { innings: 7 })
    expect(sheet.totals.rbi).toBe(1)
  })
  it('their runners’ steals, caught stealing and outs on the bases are on the runner’s own line', () => {
    let s = newGame(home, lineup, '壬')
    s = { ...play(s, '一安'), oppBatter: '王' }
    s = { ...s, pitching: s.pitching.map((p) => ({ ...p, oppBatter: '王' })) }
    s = runnerEvent(s, 0, 'opp', 'sb')
    s = play(s, '一安')
    s = runnerEvent(s, 1, 'opp', 'cs')
    s = play(s, '內飛')
    const run = oppRunning(s.pitching)
    expect(run.get(s.pitching[0])).toMatchObject({ sb: 1, cs: 0 })
    expect(run.get(s.pitching[1])).toMatchObject({ cs: 1 })
    const wang = oppBattingLines(s.pitching).find((l) => l.name === '王')!
    expect(wang.sb).toBe(1)
  })
  it('備註 typed in the confirm panel goes on the row, after the pickoff note', () => {
    let s = newGame(home, lineup, '壬')
    s = play(s, '一安', { note: '強襲投手' })
    expect(s.pitching[0].note).toBe('強襲投手')
    let t = newGame(away, lineup, '壬')
    t = play(t, '一安')
    t = runnerEvent(t, 0, 'us', 'pkSafe')
    t = play(t, '內滾', { note: '觸擊' })
    expect(t.batting[1].note).toBe('牽制 1 次；觸擊')
  })
  it('對方代打 marks this plate appearance only (and his slot when names are kept)', () => {
    let s = newGame(home, lineup, '壬')
    s = pinchHitOpp(s, '')
    s = play(s, '一安')
    expect(s.pitching[0].oppBatter).toBe(OPP_PH_UNNAMED)
    expect(s.oppBatter).toBe('')
    let t: RecordState = { ...newGame(home, lineup, '壬'), oppNames: true, oppLineup: Array(9).fill('') }
    t = pinchHitOpp(t, '12號')
    expect(t.oppLineup![0]).toBe('12號')
    // a typed name keeps the 代打 mark on the row (review): 「代打 12號」, read as 12號 everywhere else
    expect(t.oppBatter).toBe('代打 12號')
    expect(describeChange(newGame(home, lineup, '壬'), pinchHitOpp(newGame(home, lineup, '壬'), '12號'))).toContain('對方代打 12號')
    t = play(t, '一安')
    expect(t.pitching[0].oppBatter).toBe('代打 12號')
    expect(oppBattingLines(t.pitching)[0].label).toBe('12號')
  })
  it('對方投手 用球 starts again at a 換投 to another right-hander (review)', () => {
    let s = setOppPitcher(newGame(away, lineup, '壬'), { hand: 'R' })
    s = play(addPitch(addPitch(s, 'B'), 'S'), '一安')
    s = play(addPitch(s, 'B'), '內滾')
    expect(oppPitchCount(s)).toBe(5)
    s = addPitch(s, 'B')
    s = setOppPitcher(s, { hand: 'R' })
    expect(oppPitchCount(s)).toBe(0)
    s = addPitch(addPitch(s, 'S'), 'S')
    expect(oppPitchCount(s)).toBe(2)
    s = play(s, '飛球')
    expect(oppPitchCount(s)).toBe(3)
    // the first entry (no pitcher yet) is no change
    let t = play(newGame(away, lineup, '壬'), '一安')
    t = setOppPitcher(t, { hand: 'L' })
    expect(t.oppPitcherFrom).toBeUndefined()
  })
  it('a half ended by hand keeps 對方失誤 pressed during the plate appearance', () => {
    let s = newGame(away, lineup, '壬')
    s = play(s, '一安')
    s = addOppError(s, 'LF')
    s = endHalf(s)
    expect(s.batting[0].errors).toEqual(['LF'])
    expect(settlePending(newGame(away, lineup, '壬')).batting).toEqual([])
  })
})
