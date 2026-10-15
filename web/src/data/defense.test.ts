/**
 * Batch 17 bug 1 (from the maintainer's real games): after a 代打 the recorder sets the positions for the next half
 * with 換人 (只改守位), but the game did not know, so an error at SS went to the starting shortstop who had left.
 * Now every position change is logged (record/model substitute) and errors / putouts / 守備局數 go to whoever stood at
 * that position in that half-inning (data/gameRoster defenseTimeline, data/normalize deriveFielding / creditPlays).
 */
import { describe, expect, it } from 'vitest'
import { addError, addPitch, changePitcher, commitPA, defaultPlan, fieldersNow, newGame, runnerEvent, substitute, toGameEdit, type PAPlan, type RecordState } from '../record/model'
import { applyErrorFixes, fieldingErrorFixes, normalizeGameEdit, reconcileFielding } from './edit'
import { gameBoxScore } from './boxScore'
import { subText } from './broadcast'
import { defenseTimeline, gameAppearances, parseDayRoster } from './gameRoster'
import { dayRosterCells, dayRosterFromCells } from './xlsx'
import { creditPlays, deriveFielding } from './normalize'
import { SEED_DATASET } from './seed'
import { summarizeGame } from './stats'
import type { DayRosterSub, FieldingLine, Game, GameDayRoster, PitchingPA } from './types'

const POS = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P']
const NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬']
const lineup = NAMES.map((name, i) => ({ name, pos: POS[i] }))
// 主: we field the top halves, bat the bottom ones
const home: Game = { id: 'G20261015-01', date: '2026-10-15', tournament: '友誼賽', opponent: '測試隊', homeAway: '主', innings: 4 }
const ip = (s: RecordState) => addPitch(s, 'IP')
const play = (s: RecordState, result: string, patch: Partial<PAPlan> = {}) => commitPA(ip(s), { ...defaultPlan(s, result), ...patch })
const k3 = (s: RecordState) => play(play(play(s, '三振'), '三振'), '三振')
const fielding = (s: RecordState) => normalizeGameEdit(SEED_DATASET.roster, toGameEdit(s)).fragment.fielding
const errorsBy = (lines: FieldingLine[]) => Object.fromEntries(lines.filter((l) => l.e).map((l) => [`${l.player} ${l.pos}`, l.e]))
const roster = (subs: DayRosterSub[] = []): GameDayRoster => ({ starters: lineup.map((l, i) => ({ ...l, order: i + 1 })), bench: [], subs, reentry: false })
const sub = (kind: DayRosterSub['kind'], inn: string, out: string, pos: string, inning: number, half: 'top' | 'bottom' = 'bottom', slot?: number): DayRosterSub => ({ kind, in: inn, out, pos, inning, half, ...(slot === undefined ? {} : { slot }) })
const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: home.id, inning: 1, pitcher: '壬', pitches: ['IP'], result: '一安', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })

describe('defenseTimeline: who stood where in each half-inning', () => {
  it('starters, a 代打 who stays in (with or without his position set), a 守備調動 swap and a double switch', () => {
    const t = defenseTimeline(roster([
      sub('PH', '子', '丁', 'PH', 1, 'bottom', 3),          // 子 bats for the shortstop in the bottom of the 1st
      sub('PH', '丑', '戊', 'PH', 2, 'bottom', 4),          // 丑 bats for the third baseman in the 2nd
      sub('DEF', '丑', '丑', '2B', 3, 'top', 4),            // … stays in at 2B,
      sub('DEF', '丙', '丙', '3B', 3, 'top', 2),            // and 丙 moves 2B → 3B
      sub('DEF', '寅', '己', 'LF', 4, 'top', 5),             // a defensive replacement in left in the 4th
    ]))!
    expect(t(1, 'top').byPos.get('SS')).toBe('丁')
    // 子 was never given a position: he takes the one the man he replaced left open
    expect(t(2, 'top').byPos.get('SS')).toBe('子')
    expect(t(2, 'top').byPos.get('3B')).toBe('戊')
    expect(t(3, 'top').byPos.get('2B')).toBe('丑')
    expect(t(3, 'top').byPos.get('3B')).toBe('丙')
    expect(t(3, 'top').byName.get('丙')).toBe('3B')
    expect(t(3, 'top').byPos.get('LF')).toBe('己')
    expect(t(4, 'top').byPos.get('LF')).toBe('寅')
    expect(t(4, 'top').byName.has('己')).toBe(false)
  })
  it('a game without starters’ positions has none (the older rules apply)', () => {
    expect(defenseTimeline(undefined)).toBeUndefined()
    expect(defenseTimeline({ starters: [{ name: '甲', pos: 'DH', order: 1 }], subs: [] })).toBeUndefined()
  })
})

describe('the error goes to the player at that position in that half-inning (紀錄比賽 → saved game)', () => {
  // top 1: they bat; bottom 1: 子 pinch-hits for the shortstop 丁; top 2 on: the recorder sets the positions
  const start = () => {
    let s = newGame(home, lineup, '壬', { bench: ['子', '丑'] })
    s = k3(s)                                     // top 1
    s = substitute(s, 0, '', 'C')                 // (no change: nothing logged)
    s = play(s, '三振'); s = play(s, '三振'); s = play(s, '三振') // bottom 1: 甲 乙 丙
    expect(s.inning).toBe(2); expect(s.half).toBe('top')
    return s
  }
  const pinch = () => {
    let s = newGame(home, lineup, '壬', { bench: ['子', '丑'] })
    s = k3(s)
    s = play(s, '三振'); s = play(s, '三振')
    s = substitute(s, 3, '子', 'PH')              // 子 bats for 丁
    s = play(s, '三振')
    return s                                      // top 2
  }
  it('the 代打 stays in at SS (position set with 換人): his error is his', () => {
    let s = pinch()
    s = substitute(s, 3, '', 'SS')
    expect(s.subs!.at(-1)).toMatchObject({ kind: 'DEF', in: '子', out: '子', pos: 'SS', inning: 2, half: 'top' })
    s = play(addError(s, 'SS'), '一安', { loc: 6 })
    s = k3(s)
    const lines = fielding(s)
    expect(errorsBy(lines)).toEqual({ '子 SS': 1 })
    expect(lines.find((l) => l.player === '丁')?.e ?? 0).toBe(0)
    // 守備局數 (the innings they fielded so far: the 1st and the 2nd): 丁 played SS in the 1st, 子 in the 2nd; whoever
    // never moved keeps the game's 局數, as before
    expect(lines.find((l) => l.player === '丁' && l.pos === 'SS')!.innings).toBe(1)
    expect(lines.find((l) => l.player === '子' && l.pos === 'SS')!.innings).toBe(1)
    expect(lines.find((l) => l.player === '甲' && l.pos === 'C')!.innings).toBe(4)
  })
  it('the 代打 is replaced by a defender: the error is the defender’s', () => {
    let s = pinch()
    s = substitute(s, 3, '丑', 'SS')
    s = play(s, '失誤', { loc: 6 })
    s = k3(s)
    expect(errorsBy(fielding(s))).toEqual({ '丑 SS': 1 })
  })
  it('a position swap mid-game (SS ↔ 2B): each error to the right player by half-inning', () => {
    let s = start()
    s = play(addError(s, 'SS'), '一安', { loc: 6 }) // top 2: 丁 is still at SS
    s = k3(s)
    s = play(play(play(s, '三振'), '三振'), '三振')   // bottom 2
    s = substitute(s, 3, '', '2B')                // top 3: 丁 SS → 2B
    s = substitute(s, 2, '', 'SS')                //        丙 2B → SS
    s = play(addError(addError(s, 'SS'), '2B'), '一安', { loc: 6 })
    s = k3(s)
    const lines = fielding(s)
    expect(errorsBy(lines)).toEqual({ '丁 SS': 1, '丙 SS': 1, '丁 2B': 1 })
    expect(summarizeGame(normalizeGameEdit(SEED_DATASET.roster, toGameEdit(s)).fragment, home).errorsUs).toBe(3)
  })
  it('a fielder pulled right after his error keeps it: a change in the middle of the half counts from that row on', () => {
    let s = pinch()
    s = substitute(s, 3, '', 'SS')                // top 2: 子 stays in at SS
    s = play(addError(s, 'SS'), '一安', { loc: 6 }) // 子 errs
    s = substitute(s, 3, '丑', 'SS')              // … and is pulled at once
    expect(s.subs!.at(-1)).toMatchObject({ kind: 'DEF', in: '丑', out: '子', row: 1 })
    s = play(addError(s, 'SS'), '一安', { loc: 6 }) // 丑's own error, the next batter
    s = k3(s)
    const lines = fielding(s)
    expect(errorsBy(lines)).toEqual({ '子 SS': 1, '丑 SS': 1 })
    // the same in the first half a starter fields: 丁 errs, then 丑 replaces him
    let t = newGame(home, lineup, '壬', { bench: ['丑'] })
    t = play(addError(t, 'SS'), '一安', { loc: 6 })
    t = substitute(t, 3, '丑', 'SS')
    t = play(t, '內滾', { loc: 6 })               // 6-3 by 丑
    t = play(t, '三振'); t = play(t, '三振')
    const l2 = fielding(t)
    expect(errorsBy(l2)).toEqual({ '丁 SS': 1 })
    expect(l2.find((l) => l.player === '丑' && l.pos === 'SS')!.a).toBe(1)
    // the 誰失誤 chips show the same player the saved game charges
    expect(fieldersNow(t).get('SS')).toBe('丑')
  })
  it('a 換投 after the old pitcher moved to the field leaves him there', () => {
    // no DH: the pitcher 壬 bats 9th; 己 plays LF and bats 6th
    let s = newGame(home, lineup, '壬', { bench: [] })
    s = k3(s); s = play(play(play(s, '三振'), '三振'), '三振')   // top 1, bottom 1
    s = substitute(s, 8, '', 'LF')                // top 2: 壬 改守 LF
    s = changePitcher(s, '己')                    // 己 to the mound
    s = substitute(s, 5, '', 'P')
    expect(fieldersNow(s).get('LF')).toBe('壬')
    expect(fieldersNow(s).get('P')).toBe('己')
    s = play(addError(s, 'LF'), '一安', { loc: 7 })
    s = k3(s)
    expect(errorsBy(fielding(s))).toEqual({ '壬 LF': 1 })
  })
  it('a 代打 not yet given a position: the 誰失誤 chip names him at the position he left open', () => {
    const s = pinch()
    expect(s.lineup[3]).toMatchObject({ name: '子', pos: 'PH' })
    expect(fieldersNow(s).get('SS')).toBe('子')
  })
  it('putouts and assists follow the alignment too', () => {
    let s = pinch()
    s = substitute(s, 3, '', 'SS')
    s = play(s, '內滾', { loc: 6 })               // 6-3: 子 A, 乙 PO
    s = play(s, '內飛', { loc: 6 })               // 子 PO
    s = play(s, '三振')                           // 甲 PO
    const lines = fielding(s)
    const of = (p: string, pos: string) => lines.find((l) => l.player === p && l.pos === pos)!
    expect([of('子', 'SS').po, of('子', 'SS').a]).toEqual([1, 1])
    expect([of('丁', 'SS').po, of('丁', 'SS').a]).toEqual([0, 0])
    expect(of('乙', '1B').po).toBe(1)
  })
})

describe('older games and 修改資料', () => {
  it('a game without a roster keeps today’s rule', () => {
    const g: Game = { ...home }
    const d = deriveFielding(g, [{ gameId: g.id, inning: 1, batter: '丁', pos: 'SS', pitches: [], result: '三振', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 }], [pit({ inning: 3, errors: ['SS'] })])
    expect(errorsBy(d.lines)).toEqual({ '丁 SS': 1 })
  })
  it('a 守備調動 added in 修改資料 moves the error onto the player who stood there', () => {
    // saved before the fix: 子 pinch-hit for 丁 and stayed in at SS, but the change was never logged; the line says 丁
    const before = { ...home, dayRoster: roster([sub('PH', '子', '丁', 'PH', 1, 'bottom', 3), sub('PH', '丑', '子', 'PH', 2, 'bottom', 3)]) }
    const pitching = [pit({ inning: 2, errors: ['SS'] })]
    const lines: FieldingLine[] = [{ gameId: home.id, player: '丁', pos: 'SS', innings: 4, po: 0, a: 0, e: 1, dp: 0, pb: 0, sb: 0, cs: 0 }]
    // the recorder adds 「第 2 局上 子 改守 SS」 in the 登錄名單 (here: 子 took over at SS; the error was his)
    const after = { ...before, dayRoster: { ...before.dayRoster, subs: [...before.dayRoster.subs!, sub('DEF', '子', '子', 'SS', 2, 'top', 3)] } }
    const t = defenseTimeline(after.dayRoster)!
    expect(t(2, 'top').byPos.get('SS')).toBe('子')
    // (the roster says so either way: 子 inherited SS, so nothing moves on the plays; the 守備 table is fixed by 重算失誤)
    const out = reconcileFielding(lines, before, { batting: [], pitching }, { batting: [], pitching }, after)
    expect(out).toEqual(lines)
    const derived = deriveFielding(after, [], pitching).lines
    expect(errorsBy(derived)).toEqual({ '子 SS': 1 })
    creditPlays(derived, pitching, after)
  })
  it('a 守備調動 that changes who stood there moves the error, even off a line saved the old way', () => {
    const before = { ...home, dayRoster: roster([sub('PH', '子', '丁', 'PH', 1, 'bottom', 3)]) }
    const pitching = [pit({ inning: 2, errors: ['SS'] })]
    // saved before the fix: the starting shortstop 丁 was charged
    const lines: FieldingLine[] = [{ gameId: home.id, player: '丁', pos: 'SS', innings: 4, po: 0, a: 0, e: 1, dp: 0, pb: 0, sb: 0, cs: 0 }, { gameId: home.id, player: '丙', pos: '2B', innings: 4, po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0 }]
    // really 子 went to 2B and 丙 moved to SS in the 2nd: the recorder logs both in 修改資料
    const after = { ...before, dayRoster: { ...before.dayRoster, subs: [...before.dayRoster.subs!, sub('DEF', '子', '子', '2B', 2, 'top', 3), sub('DEF', '丙', '丙', 'SS', 2, 'top', 2)] } }
    const out = reconcileFielding(lines, before, { batting: [], pitching }, { batting: [], pitching }, after)
    expect(errorsBy(out)).toEqual({ '丙 SS': 1 })
  })
})

describe('修改資料: 守位變動 + 依登錄名單重算失誤 + 儲存 never counts an error twice', () => {
  it('the fix is computed on what the save writes, and the save then moves nothing again', () => {
    // 子 pinch-hit for 己 (LF) in the bottom of the 1st; the 2nd-inning SS error was saved on 丁 (old rule)
    const before = { ...home, dayRoster: roster([sub('PH', '子', '己', 'PH', 1, 'bottom', 5)]) }
    const pitching = [pit({ inning: 1, result: '三振' }), pit({ inning: 2, errors: ['SS'] }), pit({ inning: 3, result: '三振' }), pit({ inning: 4, result: '三振' })]
    const L = (player: string, pos: string, e = 0): FieldingLine => ({ gameId: home.id, player, pos, innings: 4, po: 0, a: 0, e, dp: 0, pb: 0, sb: 0, cs: 0 })
    const lines = [L('丁', 'SS', 1), L('己', 'LF')]
    // really 子 went to SS and 丁 to LF from the 2nd
    const after = { ...before, dayRoster: { ...before.dayRoster, subs: [...before.dayRoster.subs!, sub('DEF', '子', '子', 'SS', 2, 'top', 5), sub('DEF', '丁', '丁', 'LF', 2, 'top', 3)] } }
    const plays = { batting: [], pitching }
    // what the editor shows (GameEditor linesNow): the save's lines, then the fix against those
    const now = reconcileFielding(lines, before, plays, plays, after)
    const fixes = fieldingErrorFixes(now, after, [], pitching)
    const applied = applyErrorFixes(now, after, fixes)
    // pressing 重算 makes the game as it is now the basis: the save reconciles from there
    const saved = reconcileFielding(applied, after, plays, plays, after)
    expect(errorsBy(saved)).toEqual({ '子 SS': 1 })
    // 局數 follow the alignment: 丁 at SS one inning, 子 at SS from the 2nd (three of them)
    expect(saved.find((l) => l.player === '丁' && l.pos === 'SS')!.innings).toBe(1)
    expect(saved.find((l) => l.player === '子' && l.pos === 'SS')!.innings).toBe(3)
  })
})

describe('a 守備調動 shows everywhere the substitutions do', () => {
  it('box score 代打-SS, 文字轉播, 當日登錄名單 and the Excel 替補紀錄 round trip', () => {
    let s = newGame(home, lineup, '壬', { bench: ['子'] })
    s = k3(s)
    s = play(s, '三振'); s = play(s, '三振')
    s = substitute(s, 3, '子', 'PH')
    s = play(s, '三振')
    s = substitute(s, 3, '', 'SS')
    const { fragment } = normalizeGameEdit(SEED_DATASET.roster, toGameEdit(s))
    const g = fragment.games[0]
    expect(gameBoxScore(fragment, g).us.rows.find((r) => r.name === '子')!.pos).toBe('代打-SS')
    const move = g.dayRoster!.subs!.at(-1)!
    expect(subText(move)).toBe('守備異動：子 改守游擊手')
    expect(gameAppearances(fragment, g).subs.find((r) => r.move)).toMatchObject({ name: '子', pos: 'SS', move: true })
    const back = dayRosterFromCells({ ...dayRosterCells(g.dayRoster) })
    expect(back!.subs).toEqual(g.dayRoster!.subs)
  })
})

describe('a change in the middle of a plate appearance: what our fielders did before it stays with the old alignment, after it with the new', () => {
  // home, top 1: 三振, 三振, 一安 (runner on 1st, row 2), then the change; the next batter's plate appearance is never sent
  const third = () => {
    let s = newGame(home, lineup, '壬', { bench: ['丑', '寅'] })
    s = play(play(play(s, '三振'), '三振'), '一安', { loc: 8 })
    return s
  }
  const runner = (s: RecordState) => s.runners.find((r) => r.side === 'opp')!.row
  it('the half ends on the bases after the change: the error between pitches is the new fielder’s (as the 誰失誤 chip said)', () => {
    let s = third()
    s = substitute(s, 3, '丑', 'SS')               // 丑 replaces 丁 (logged after the half's 3 rows)
    expect(fieldersNow(s).get('SS')).toBe('丑')
    s = runnerEvent(addPitch(s, 'B'), runner(s), 'opp', 'err', undefined, 'SS')
    s = runnerEvent(s, runner(s), 'opp', 'out')     // 3rd out on the bases: the batter's plate appearance is never sent
    expect(s.half).toBe('bottom')
    const edit = toGameEdit(s)
    // the team's error count is unchanged (the error is on the half's last row)…
    expect(edit.pitching.flatMap((p) => p.errors ?? [])).toEqual(['SS'])
    // … and it is charged to 丑
    expect(errorsBy(fielding(s))).toEqual({ '丑 SS': 1 })
    // the saved game keeps that through the Excel 替補紀錄 round trip
    const g = normalizeGameEdit(SEED_DATASET.roster, edit).fragment.games[0]
    expect(dayRosterFromCells({ ...dayRosterCells(g.dayRoster) })!.subs).toEqual(g.dayRoster!.subs)
  })
  it('an error, then the change, in the same plate appearance: the error stays the old fielder’s', () => {
    let s = third()
    s = runnerEvent(addPitch(s, 'B'), runner(s), 'opp', 'err', undefined, 'SS')   // 丁 errs (runner to 2nd)…
    s = substitute(s, 3, '丑', 'SS')                                              // … and is pulled
    s = play(addError(s, 'SS'), '一安', { loc: 6 })                                // 丑's own error on the hit
    s = play(s, '三振')
    expect(s.subs!.at(-1)).toMatchObject({ in: '丑', row: 3, before: { errors: ['SS'] } })
    expect(errorsBy(fielding(s))).toEqual({ '丁 SS': 1, '丑 SS': 1 })
    const g = normalizeGameEdit(SEED_DATASET.roster, toGameEdit(s)).fragment.games[0]
    expect(dayRosterCells(g.dayRoster).替補紀錄).toContain('第3打席後 〔換人前 失誤SS〕')
    expect(dayRosterFromCells({ ...dayRosterCells(g.dayRoster) })!.subs).toEqual(g.dayRoster!.subs)
    // the same when the half then ends before that plate appearance is sent: one error each
    let t = third()
    t = runnerEvent(addPitch(t, 'B'), runner(t), 'opp', 'err', undefined, 'SS')
    t = substitute(t, 3, '丑', 'SS')
    t = runnerEvent(t, runner(t), 'opp', 'err', undefined, 'SS')
    t = runnerEvent(t, runner(t), 'opp', 'out')
    expect(errorsBy(fielding(t))).toEqual({ '丁 SS': 1, '丑 SS': 1 })
    // two changes in that plate appearance, an error after each
    let u = third()
    u = substitute(u, 3, '丑', 'SS')
    u = runnerEvent(addPitch(u, 'B'), runner(u), 'opp', 'err', undefined, 'SS')
    u = substitute(u, 3, '寅', 'SS')
    u = runnerEvent(u, runner(u), 'opp', 'err', undefined, 'SS')
    u = runnerEvent(u, runner(u), 'opp', 'out')
    // (the plate appearance never came: each change says what came after it, nothing points at a row that does not exist)
    expect(u.subs!.slice(-2).map((x) => [x.before, x.after])).toEqual([[undefined, { errors: ['SS'] }], [undefined, { errors: ['SS'] }]])
    expect(errorsBy(fielding(u))).toEqual({ '丑 SS': 1, '寅 SS': 1 })
    // a stored marker that is garbage is dropped; one the row no longer has (edited since) charges nothing extra
    const r = normalizeGameEdit(SEED_DATASET.roster, toGameEdit(u)).fragment.games[0].dayRoster!
    expect(parseDayRoster({ ...r, subs: r.subs!.map((x) => ({ ...x, after: { errors: [3, ''], cs: -1 } })) })!.subs!.every((x) => !x.after)).toBe(true)
    const edited = { ...toGameEdit(u), pitching: toGameEdit(u).pitching.map((p) => ({ ...p, errors: [] })) }
    expect(errorsBy(normalizeGameEdit(SEED_DATASET.roster, edited).fragment.fielding)).toEqual({})
  })
  it('a catcher replaced in the middle of the half: a 盜壘阻殺 for the third out is the new catcher’s', () => {
    let s = third()
    s = substitute(s, 0, '丑', 'C')
    s = runnerEvent(addPitch(s, 'B'), runner(s), 'opp', 'cs')
    expect(s.half).toBe('bottom')
    const lines = fielding(s)
    const c = (p: string) => lines.find((l) => l.player === p && l.pos === 'C')
    expect(c('丑')).toMatchObject({ cs: 1, a: 1 })
    expect(c('甲')?.cs ?? 0).toBe(0)
  })
})
