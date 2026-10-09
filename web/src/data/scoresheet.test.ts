import { describe, expect, it } from 'vitest'
import { buildScoresheet, scoreMark, type SheetCell } from './scoresheet'
import { addPitch, commitPA, dayRosterOf, defaultPlan, newGame, runnerEvent, substitute, type PAPlan, type RecordState } from '../record/model'
import { SEED_DATASET } from './seed'
import { summarizeGame } from './stats'
import { playGame } from '../test/simGame'
import type { BattingPA, PitchingPA } from './types'

// we are the visitors: every plate appearance of the 1st half is ours
const game = { id: 'G20260301-01', date: '2026-03-01', tournament: '友誼賽', opponent: '測試隊', homeAway: '客' as const, innings: 7 }
const lineup = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const pa = (s: RecordState, result: string, patch: Partial<PAPlan> = {}, pitches = ['IP']) => {
  for (const p of pitches) s = addPitch(s, p)
  const plan = defaultPlan(s, result)
  return commitPA(s, { ...plan, ...patch, runners: { ...plan.runners, ...patch.runners } })
}
const cellsOf = (sheet: ReturnType<typeof buildScoresheet>, name: string): SheetCell[] => sheet.lines.flatMap((l) => Object.values(l.cells).flat()).filter((c) => c.player === name)
const row = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G1', inning: 1, batter: '甲', order: 1, pitches: ['IP'], result: '內滾', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
const prow = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G1', inning: 1, pitcher: '甲', oppOrder: 1, pitches: ['IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })

describe('scoreMark', () => {
  it('writes the scorer\'s marks', () => {
    expect(scoreMark('一安', 7, 'L', ['B', 'IP']).mark).toBe('1B7')
    expect(scoreMark('三振', undefined, undefined, ['S', 'B', 'CS'])).toEqual({ mark: 'K', looking: true })
    expect(scoreMark('三振', undefined, undefined, ['SS', 'F', 'SS'])).toEqual({ mark: 'K', looking: false })
    expect(scoreMark('內滾', 6, 'G').mark).toBe('G6')
    expect(scoreMark('外飛', 8, 'L').mark).toBe('L8')
    expect(scoreMark('外飛', 8, 'F').mark).toBe('F8')
    expect(scoreMark('界外飛', 2).mark).toBe('FF2')
    expect(scoreMark('失誤', 6).mark).toBe('E6')
    expect(scoreMark('雙殺', 4).mark).toBe('DP4')
    expect(scoreMark('故四').mark).toBe('IBB')
    expect(scoreMark('全壘打', 89).mark).toBe('HR89')
    expect(scoreMark('犧飛', 9).mark).toBe('SF9')
    expect(scoreMark('突破僵局').mark).toBe('TB')
  })
})

describe('buildScoresheet: a followable inning', () => {
  let s = newGame(game, lineup, 'I')
  s = pa(s, '一安', { loc: 7 })                                      // A
  s = pa(s, '保送', {}, ['B', 'B', 'B', 'B'])                        // B
  s = pa(s, '二安', { loc: 78, rbi: 2, runners: { 0: 'home', 1: 'home' } })  // C: A and B score
  s = pa(s, '三振', {}, ['S', 'SS', 'SS'])                           // D
  s = pa(s, '內滾', { loc: 6, runners: { 2: 3 } })                   // E: C to third
  s = pa(s, '外飛', { loc: 8, traj: 'F', runners: { 2: 3 } })        // F: C left on
  const sheet = buildScoresheet(s.batting, 'bat', { innings: 7 })
  const one = (n: string) => cellsOf(sheet, n)[0]

  it('follows each runner round the bases', () => {
    expect(sheet.unfollowed).toEqual([])
    expect(one('A')).toMatchObject({ reached: 4, scored: true, mark: '1B7' })
    expect(one('B')).toMatchObject({ reached: 4, scored: true, mark: 'BB' })
    expect(one('C')).toMatchObject({ reached: 3, left: true, scored: false, rbi: 2, text: '左中二安②' })
    expect(one('D')).toMatchObject({ out: 1, mark: 'K', reached: 0 })
    expect(one('E')).toMatchObject({ out: 2, mark: 'G6' })
    expect(one('F')).toMatchObject({ out: 3, mark: 'F8' })
    expect(sheet.perInning[1]).toEqual({ r: 2, h: 2, e: 0, lob: 1 })
    expect(sheet.innings).toBe(7)
    expect(sheet.lines.map((l) => l.order)).toEqual([1, 2, 3, 4, 5, 6])
    expect(sheet.lines[0].players).toEqual([{ name: 'A', pos: 'C' }])
  })

  it('a steal is a note on the runner, and an out on the bases is drawn after his base', () => {
    let t = newGame(game, lineup, 'I')
    t = pa(t, '一安', { loc: 8 })
    t = runnerEvent(t, 0, 'us', 'sb')
    t = runnerEvent(t, 0, 'us', 'cs')
    t = pa(t, '三振', {}, ['S', 'S', 'S'])
    const sh = buildScoresheet(t.batting, 'bat', { innings: 7 })
    const a = cellsOf(sh, 'A')[0]
    expect(a.notes).toEqual(['SB', 'CS'])
    expect(a).toMatchObject({ reached: 2, outAt: 3 })
  })
})

describe('buildScoresheet: rows alone', () => {
  it('two plate appearances of one slot in one inning, and a pinch runner', () => {
    const rows = [row({ result: '一安', loc: 8, runner: '乙', run: 1 }), row({ order: 2, batter: '丙', result: '全壘打', rbi: 2, run: 1 }), row({ result: '內滾', code: 'I' })]
    const sh = buildScoresheet(rows, 'bat', { innings: 7 })
    expect(sh.unfollowed).toEqual([1])
    const slot1 = sh.lines[0]
    expect(slot1.players.map((p) => p.name)).toEqual(['甲', '乙'])
    expect(slot1.players[1].pos).toBe('代跑')
    expect(slot1.cells[1].map((c) => c.kind)).toEqual(['pa', 'pr', 'pa'])
    expect(slot1.cells[1][1]).toMatchObject({ player: '乙', text: '代跑' })
    expect(slot1.cells[1][0].notes).toContain('代跑 乙')
    expect(cellsOf(sh, '甲')).toHaveLength(2)
  })

  it('falls back to the row: scored, left, out after reaching', () => {
    const sh = buildScoresheet([row({ result: '二安', run: 1 }), row({ order: 2, batter: '乙', result: '一安', code: 'L' }), row({ order: 3, batter: '丙', result: '一安', code: 'II' }), row({ order: 4, batter: '丁', result: '保送', sb: 1 })], 'bat', { innings: 7 })
    expect(sh.unfollowed).toEqual([1])
    expect(cellsOf(sh, '甲')[0].reached).toBe(4)
    expect(cellsOf(sh, '乙')[0]).toMatchObject({ reached: 1, left: true })
    expect(cellsOf(sh, '丙')[0]).toMatchObject({ out: 2, reached: 1, outAt: 2 })
    expect(cellsOf(sh, '丁')[0].notes).toEqual(['SB'])
  })

  it('a tie-break runner is a placed cell, not a plate appearance', () => {
    const sh = buildScoresheet([row({ inning: 8, order: 9, batter: '壬', result: '突破僵局', pitches: [], run: 1 }), row({ inning: 8, batter: '甲', result: '一安', rbi: 1 })], 'bat', { innings: 7 })
    const c = cellsOf(sh, '壬')[0]
    expect(c).toMatchObject({ kind: 'placed', mark: 'TB', reached: 4, tone: 'other' })
    expect(sh.totals.pa).toBe(1)
    expect(sh.innings).toBe(8)
  })

  it('a defensive replacement gets his slot line (sub slots are lineup indexes: 0 = leadoff)', () => {
    const sh = buildScoresheet([row({})], 'bat', { innings: 7, subs: [{ kind: 'DEF', in: '癸', out: '甲', pos: 'LF', inning: 3, half: 'bottom', slot: 0 }] })
    expect(sh.lines[0].players).toEqual([{ name: '甲', pos: undefined }, { name: '癸', pos: 'LF', sub: true }])
  })

  it('defensive replacements made on 紀錄比賽 land under the right batters', () => {
    let s = newGame(game, lineup, 'I')
    s = pa(s, '內滾', {}, ['IP']); s = pa(s, '內滾', {}, ['IP']); s = pa(s, '內滾', {}, ['IP'])
    s = substitute(s, 0, '癸', 'C')
    s = substitute(s, 2, '子', '2B')
    const subs = dayRosterOf(s).subs
    expect(subs?.map((x) => x.slot)).toEqual([0, 2])
    const sh = buildScoresheet(s.batting, 'bat', { innings: 7, subs })
    expect(sh.lines.map((l) => [l.order, l.players.map((p) => p.name + (p.sub ? '(守備)' : ''))])).toEqual([[1, ['A', '癸(守備)']], [2, ['B']], [3, ['C', '子(守備)']]])
  })

  it('steals typed as counts (no runner events) are notes whether or not the inning can be followed', () => {
    const rows = [
      row({ batter: '甲', order: 1, result: '一安', basesBefore: '無', outsBefore: 0, sb: 1, code: 'L' }),
      row({ batter: '乙', order: 2, result: '三振', pitches: ['S', 'S', 'S'], basesBefore: '2', outsBefore: 0, code: 'I' }),
      row({ batter: '丙', order: 3, result: '三振', pitches: ['S', 'S', 'S'], basesBefore: '2', outsBefore: 1, code: 'II' }),
      row({ batter: '丁', order: 4, result: '三振', pitches: ['S', 'S', 'S'], basesBefore: '2', outsBefore: 2, code: 'III' }),
    ]
    const followed = buildScoresheet(rows, 'bat', { innings: 7 })
    expect(followed.unfollowed).toEqual([])
    expect(cellsOf(followed, '甲')[0]).toMatchObject({ reached: 2, notes: ['SB'] })
    const bare = buildScoresheet(rows.map(({ basesBefore: _b, ...r }) => r), 'bat', { innings: 7 })
    expect(bare.unfollowed).toEqual([1])
    expect(cellsOf(bare, '甲')[0].notes).toEqual(['SB'])
  })

  it('a dropped third strike is not shown as an out', () => {
    const sh = buildScoresheet([row({ result: '三振', pitches: ['S', 'S', 'SS'], code: 'L' })], 'bat', { innings: 7 })
    expect(cellsOf(sh, '甲')[0]).toMatchObject({ tone: 'on', reached: 1 })
  })
})

describe('buildScoresheet: the opponent', () => {
  it('names or slots, earned runs and pitching changes', () => {
    const rows = [prow({ oppBatter: '王', result: '一安', code: 'ER' }), prow({ oppOrder: 2, result: '失誤', code: 'R', errors: ['SS'] }), prow({ oppOrder: 3, pitcher: '乙', result: '三振', code: 'I', pitches: ['S', 'S', 'CS'] }), prow({ oppOrder: undefined, pitcher: '乙', result: '內滾', code: 'II' })]
    const sh = buildScoresheet(rows, 'pit', { innings: 7 })
    expect(sh.lines.map((l) => l.players[0].name)).toEqual(['王', '第 2 棒', '第 3 棒', '棒次未記'])
    expect(sh.lines[3].order).toBeNull()
    expect(cellsOf(sh, '王')[0]).toMatchObject({ earned: true, scored: true })
    expect(cellsOf(sh, '第 2 棒')[0]).toMatchObject({ earned: false, scored: true })
    expect(cellsOf(sh, '第 3 棒')[0]).toMatchObject({ pitcherChange: '乙', looking: true })
    expect(cellsOf(sh, '棒次未記')[0].pitcherChange).toBeUndefined()
    expect(sh.perInning[1]).toEqual({ r: 2, h: 1, e: 1, lob: 0 })
    expect(buildScoresheet([prow({})], 'pit', { innings: 7 }).perInning[1].e).toBeNull()
  })
})

describe('buildScoresheet agrees with the line score', () => {
  const check = (ds: { batting: BattingPA[]; pitching: PitchingPA[] }, sum: ReturnType<typeof summarizeGame>) => {
    const id = sum.game.id
    const bat = buildScoresheet(ds.batting.filter((p) => p.gameId === id), 'bat', { innings: sum.game.innings ?? 7 })
    const pit = buildScoresheet(ds.pitching.filter((p) => p.gameId === id), 'pit', { innings: sum.game.innings ?? 7 })
    sum.lineUs.forEach((r, i) => expect(bat.perInning[i + 1]?.r ?? 0).toBe(r))
    sum.lineOpp.forEach((r, i) => expect(pit.perInning[i + 1]?.r ?? 0).toBe(r))
    expect(Object.values(bat.perInning).reduce((a, x) => a + x.h, 0)).toBe(sum.hitsUs)
    expect(Object.values(pit.perInning).reduce((a, x) => a + x.h, 0)).toBe(sum.hitsOpp)
    expect(Object.values(bat.perInning).reduce((a, x) => a + x.lob, 0)).toBe(sum.lobUs)
    expect(bat.totals.e).toBe(sum.errorsOpp)
    // every scored cell is a run
    expect(bat.lines.flatMap((l) => Object.values(l.cells).flat()).filter((c) => c.kind !== 'pr' && c.reached === 4).length).toBe(sum.runsUs)
  }
  it('every seed game', () => {
    for (const g of SEED_DATASET.games.filter((x) => !x.status)) check(SEED_DATASET, summarizeGame(SEED_DATASET, g))
  })
  it('simulated games (followable innings)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = playGame(seed)
      const ds = { ...SEED_DATASET, games: [s.game], batting: s.batting, pitching: s.pitching, fielding: [] }
      check(ds, summarizeGame(ds, s.game))
      expect(buildScoresheet(s.batting, 'bat', { innings: 7 }).unfollowed).toEqual([])
      expect(buildScoresheet(s.pitching, 'pit', { innings: 7 }).unfollowed).toEqual([])
    }
  })
})
