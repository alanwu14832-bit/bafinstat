import { describe, expect, it } from 'vitest'
import {
  addPitch, appeared, changePitcher, commitPA, count, defaultPlan, endHalf, impliedResult, leftGame, newGame, nextGameId, offense, onField, runnerEvent, score, setReentry, startersOf, startingPitcherOf, subCandidates,
  substitute, toGameEdit, unusedBench, withInPlay, type RecordState,
} from './model'
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

describe('foul flies, pickoff throws and the in-play pitch', () => {
  it('a ball in play always ends with IP; a caught foul recorded as F becomes IP', () => {
    expect(withInPlay(['B', 'F'], '界外飛')).toEqual(['B', 'IP'])
    expect(withInPlay(['B', 'CS'], '一安')).toEqual(['B', 'IP'])
    expect(withInPlay(['B', 'IP'], '一安')).toEqual(['B', 'IP'])
    expect(withInPlay(['B'], '內滾')).toEqual(['B', 'IP'])
    expect(withInPlay(['B', 'B', 'B', 'B'], '保送')).toEqual(['B', 'B', 'B', 'B'])
  })

  it('界外飛 is an out that credits the fielder at the location', () => {
    let s = newGame(game, lineup, '壬')
    s = commitPA(addPitch(s, 'F'), { ...defaultPlan(s, '界外飛'), loc: 2, traj: 'F' })
    expect(s.outs).toBe(1)
    expect(s.pitching[0].code).toBe('I')
    expect(s.pitching[0].pitches).toEqual(['IP'])
    expect(s.pitching[0].result).toBe('界外飛')
  })

  it('a pickoff throw that misses is noted on the plate appearance, the runner stays', () => {
    let s = newGame(game, lineup, '壬')
    s = commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '一安'), loc: 56, traj: 'G' })
    expect(s.pitching[0].loc).toBe(56)
    s = runnerEvent(s, 0, 'opp', 'pkSafe')
    s = runnerEvent(s, 0, 'opp', 'pkSafe')
    expect(s.runners).toHaveLength(1)
    expect(s.extras.pka).toBe(2)
    s = commitPA(addPitch(addPitch(addPitch(s, 'CS'), 'SS'), 'SS'), defaultPlan(s, '三振'))
    expect(s.pitching[1].note).toBe('牽制 2 次')
    expect((s.pitching[1] as unknown as Record<string, unknown>).pka).toBeUndefined()
    expect(s.extras.pka).toBe(0)
  })
})

describe('game-day roster: bench, substitutions, re-entry', () => {
  const pool = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '子', '丑']

  it('someone new in the current pitcher\'s slot at P is a pitching change, so later pitches are his', () => {
    const s = substitute(newGame(game, lineup, '壬', { bench: ['癸'] }), 8, '癸', 'P')
    expect(s.pitcher).toBe('癸')
    expect(s.lineup[8]).toEqual({ name: '癸', pos: 'P' })
    expect(s.subs?.map((x) => x.kind)).toEqual(['P'])
    expect(leftGame(s)).toContain('壬')
    // a pinch hitter for the pitcher is still just a PH (the pitcher changes later, through 換投)
    expect(substitute(newGame(game, lineup, '壬'), 8, '癸', 'PH').pitcher).toBe('壬')
  })

  it('newGame keeps the starters and a bench that never repeats a starter; the 3-argument call still works', () => {
    const plain = newGame(game, lineup, '壬')
    expect(plain.starters).toEqual(lineup); expect(plain.starters).not.toBe(lineup)
    expect(plain.startingPitcher).toBe('壬'); expect(plain.bench).toEqual([]); expect(plain.subs).toEqual([]); expect(plain.reentry).toBe(false)
    const s = newGame(game, lineup, '壬', { bench: ['癸', '甲', '壬', '子', '癸', ''], reentry: true })
    expect(s.bench).toEqual(['癸', '子']); expect(s.reentry).toBe(true)
  })

  it('substitute logs who came in for whom; a position-only change logs nothing', () => {
    let s = newGame({ ...game, homeAway: '客' }, lineup, '壬', { bench: ['癸', '子'] })
    s = substitute(s, 2, '癸', 'PH')
    expect(s.lineup[2]).toEqual({ name: '癸', pos: 'PH' })
    expect(s.subs).toEqual([{ kind: 'PH', in: '癸', out: '丙', pos: 'PH', inning: 1, half: 'top', slot: 2 }])
    expect(leftGame(s)).toEqual(['丙']); expect(unusedBench(s)).toEqual(['子'])
    s = substitute(s, 2, '', '2B') // the pinch hitter stays in the game at 2B
    expect(s.lineup[2]).toEqual({ name: '癸', pos: '2B' }); expect(s.subs).toHaveLength(1)
    s = substitute(endHalf(s), 0, '子', 'C')
    expect(s.subs![1]).toMatchObject({ kind: 'DEF', in: '子', out: '甲', inning: 1, half: 'bottom', slot: 0 })
    expect(startersOf(s)).toEqual(lineup)
  })

  it('subCandidates: unused bench first, then who has not played, substituted-out players last and greyed out unless re-entry is on', () => {
    let s = newGame(game, lineup, '壬', { bench: ['子'] })
    s = substitute(s, 2, '癸', 'PH')
    const c = subCandidates(s, pool, 'batter')
    expect(c.names).toEqual(['子', '丑', '丙'])
    expect(c.tag('子')).toBe('（板凳）'); expect(c.tag('丙')).toBe('（已下場）'); expect(c.tag('丑')).toBeUndefined()
    expect([...c.disabled]).toEqual(['丙'])
    s = setReentry(s, true)
    expect(subCandidates(s, pool, 'batter').disabled.size).toBe(0)
    expect(setReentry(s, false).reentry).toBe(false)
    // a pitching change may also bring a fielder to the mound
    expect(subCandidates(s, pool, 'pitcher').names).toEqual(['子', '丑', '甲', '乙', '癸', '丁', '戊', '己', '庚', '辛', '丙'])
  })

  it('changePitcher without a DH: a reliever takes the pitcher\'s batting slot, a fielder moving to the mound keeps his own', () => {
    let s = newGame(game, lineup, '壬', { bench: ['子'] })
    s = changePitcher(s, '子')
    expect(s.pitcher).toBe('子'); expect(s.lineup[8]).toEqual({ name: '子', pos: 'P' })
    expect(s.subs).toEqual([{ kind: 'P', in: '子', out: '壬', pos: 'P', inning: 1, half: 'top', slot: 8 }])
    expect(leftGame(s)).toEqual(['壬']); expect(unusedBench(s)).toEqual([])
    s = changePitcher(s, '庚') // the CF comes in to pitch; 子's slot is left for the recorder
    expect(s.lineup[6]).toEqual({ name: '庚', pos: 'P' }); expect(s.lineup[8]).toEqual({ name: '子', pos: 'P' })
    expect(s.subs![1]).toMatchObject({ kind: 'P', in: '庚', out: '子', slot: 8 })
    expect(onField(s).has('子')).toBe(true)
  })

  it('changePitcher with a DH only changes the pitcher; his replacement can still be put into a batting slot', () => {
    const dhLineup = lineup.map((l, i) => (i === 8 ? { name: '癸', pos: 'DH' } : l))
    let s = newGame(game, dhLineup, '壬')
    s = changePitcher(s, '子')
    expect(s.lineup).toEqual(dhLineup)
    expect(s.subs).toEqual([{ kind: 'P', in: '子', out: '壬', pos: 'P', inning: 1, half: 'top' }])
    expect(leftGame(s)).toEqual(['壬'])
    const c = subCandidates(s, pool, 'batter')
    expect(c.names).toContain('子'); expect(c.tag('子')).toBe('（投手）')
    expect(toGameEdit(s).game.dayRoster!.starters.at(-1)).toEqual({ name: '壬', pos: 'P' })
  })

  it('old drafts without the roster fields still work: starters and who left come from the rows, the saved game keeps its roster', () => {
    const legacy = { ...newGame({ ...game, homeAway: '客' }, lineup, '壬') } as Partial<RecordState>
    for (const k of ['starters', 'startingPitcher', 'bench', 'reentry', 'subs'] as const) delete legacy[k]
    let s = legacy as RecordState
    expect(leftGame(s)).toEqual([]); expect(unusedBench(s)).toEqual([]); expect(startingPitcherOf(s)).toBe('壬'); expect([...appeared(s)]).toHaveLength(9)
    s = commitPA(s, defaultPlan(s, '一安'))
    s = substitute(s, 1, '癸', 'PH') // continued on the new version: substitutions are logged from here on
    s = commitPA(s, defaultPlan(s, '三振'))
    // 乙 never batted, so the row fallback sees 癸 as the slot's starter (the documented gap for old drafts) …
    expect(startersOf(s).slice(0, 2)).toEqual([{ name: '甲', pos: 'C' }, { name: '癸', pos: 'PH' }])
    // … but the log still knows 乙 left
    expect(leftGame(s)).toEqual(['乙'])
    expect(subCandidates(s, pool, 'batter')).toMatchObject({ names: ['子', '丑', '乙'] })
    expect(subCandidates(s, pool, 'batter').disabled.has('乙')).toBe(true)
    expect(toGameEdit(s).game.dayRoster).toBeUndefined()
    const kept = { starters: [{ name: '甲', pos: 'C', order: 1 }], bench: ['丑'], reentry: false }
    expect(toGameEdit({ ...s, game: { ...s.game, dayRoster: kept } }).game.dayRoster).toBe(kept)
    // a draft that never logged anything: who left is read off the batting rows
    const rowsOnly = { ...s, subs: undefined, lineup: s.lineup.map((l, i) => (i === 0 ? { name: '子', pos: 'C' } : l)) }
    expect(leftGame(rowsOnly)).toEqual(['甲'])
  })

  it('toGameEdit attaches the day roster and it survives normalizeGameEdit', () => {
    const dhLineup = lineup.map((l, i) => (i === 8 ? { name: '癸', pos: 'DH' } : l))
    let s = newGame(game, dhLineup, '壬', { bench: ['子', '丑'], reentry: true })
    s = changePitcher(s, '子')
    s = commitPA(s, defaultPlan(s, '三振'))
    const { fragment } = normalizeGameEdit(SEED_DATASET.roster, toGameEdit(s))
    const r = fragment.games[0].dayRoster!
    expect(r.starters).toHaveLength(10)
    expect(r.starters[0]).toEqual({ name: '甲', pos: 'C', order: 1 })
    expect(r.starters[9]).toEqual({ name: '壬', pos: 'P' })
    expect(r.bench).toEqual(['子', '丑'])
    expect(r.subs).toEqual([{ kind: 'P', in: '子', out: '壬', pos: 'P', inning: 1, half: 'top' }])
    expect(r.reentry).toBe(true)
  })
})
