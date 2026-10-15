/**
 * Box Score (batch 16): /live's box from the recording state equals the site's own lines of the same rows
 * (summarizeGame / battingLines / pitchingLines / oppBattingLines), mid-game and after 結束比賽 (then it is the game
 * page's box of the saved game), and the newspaper details: substitutes under their slot, the notes line, the batter
 * at the plate, 投球中, the pitches of the plate appearance in progress, 突破僵局 runners, 對方代打／代跑, 對方投手.
 */
import { describe, expect, it } from 'vitest'
import { boxScore, gameBoxScore, liveBoxScore, ourBattingBox, ourPitchingBox, type BoxScore } from './boxScore'
import { battingLines, pitchingLines, summarizeGame } from './stats'
import { oppBattingLines, oppTotals } from './opponent'
import { normalizeGameEdit } from './edit'
import { EMPTY_DATASET, OPP_PH_UNNAMED, OPP_PR_UNNAMED, type BattingPA, type Dataset, type Game, type PitchingPA } from './types'
import { offense, score, setOppPitcher, toGameEdit, type RecordState } from '../record/model'
import { halfPlayed } from '../record/upNext'
import { playGame, playGameWith, roster } from '../test/simGame'

const ds = (s: RecordState): Dataset => ({ ...EMPTY_DATASET, roster, games: [s.game], batting: s.batting, pitching: s.pitching })

/** Every line the site computes from these rows is in the box with the same numbers. */
function expectSameAsLines(box: BoxScore, s: RecordState) {
  const d = ds(s)
  const sum = summarizeGame(d, s.game, new Set())
  expect(box.us.total.r).toBe(sum.runsUs)
  expect(box.us.total.h).toBe(sum.hitsUs)
  expect(box.opp.total.r).toBe(sum.runsOpp)
  expect(box.opp.total.h).toBe(sum.hitsOpp)
  const sc = score(s)
  expect([box.us.total.r, box.opp.total.r]).toEqual([sc.us, sc.opp])
  for (const l of battingLines(d, s.batting)) {
    const rows = box.us.rows.filter((r) => r.name === l.name)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ ab: l.ab, r: l.r, h: l.h, rbi: l.rbi, bb: l.bb + l.hbp, so: l.so })
  }
  for (const l of oppBattingLines(s.pitching)) {
    const rows = box.opp.rows.filter((r) => r.name === l.label)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ ab: l.ab, r: l.r, h: l.h, rbi: l.rbi, bb: l.bb + l.hbp, so: l.so })
  }
  const t = oppTotals(s.pitching)
  expect(box.opp.total).toEqual({ ab: t.ab, r: t.r, h: t.h, rbi: t.rbi, bb: t.bb + t.hbp, so: t.so })
  // the batting totals add up over the rows
  for (const side of [box.us, box.opp]) for (const k of ['ab', 'r', 'h', 'rbi', 'bb', 'so'] as const) expect(side.rows.reduce((a, r) => a + r[k], 0)).toBe(side.total[k])
  const live = offense(s) === 'opp' ? s.pitches.length : 0
  for (const l of pitchingLines(s.pitching, [s.game])) {
    const p = box.pitching.find((x) => x.name === l.name)!
    expect(p).toMatchObject({ ip: l.ipDisplay, h: l.h, r: l.r, er: l.er, bb: l.bb + l.hbp, k: l.k })
    expect(p.pc).toBe(l.pc + (l.name === s.pitcher ? live : 0))
  }
  // 對方投手: every one of our pitches is someone's
  expect(box.oppPitchers.reduce((a, p) => a + p.pc, 0)).toBe(s.batting.reduce((a, p) => a + p.pitches.length, 0) + (offense(s) === 'us' ? s.pitches.length : 0))
}

describe('Box Score: /live from the recording state', () => {
  it.each([1, 2, 3, 6, 9, 12, 17, 24])('game %i: before every plate appearance the box equals the lines of the same rows', (seed) => {
    let n = 0
    playGameWith(seed, (s) => {
      if (n++ % 3) return
      const sc = score(s)
      const inPlay = halfPlayed(s, sc, s.game.innings ?? 7)
      const box = liveBoxScore(s, { inPlay, roster })
      expectSameAsLines(box, s)
      // the batter at the plate is marked, once; the pitcher on the mound says 投球中 only while the other side bats
      const at = box[offense(s) === 'us' ? 'us' : 'opp'].rows.filter((r) => r.atBat)
      expect(at).toHaveLength(inPlay ? 1 : 0)
      if (inPlay && offense(s) === 'us') expect(at[0].name).toBe(s.lineup[s.slot].name)
      expect(box[offense(s) === 'us' ? 'opp' : 'us'].rows.some((r) => r.atBat)).toBe(false)
      expect(box.pitching.filter((p) => p.now).map((p) => p.name)).toEqual(inPlay && offense(s) === 'opp' ? [s.pitcher] : [])
      expect(box.oppPitchers.filter((p) => p.now).length).toBe(inPlay && offense(s) === 'us' && box.oppPitchers.length ? 1 : 0)
      // every starter has his slot from the first pitch on
      expect(box.us.rows.filter((r) => r.first).length).toBeGreaterThanOrEqual(s.lineup.length)
    })
  })

  it.each(Array.from({ length: 30 }, (_, i) => i + 1))('game %i: after 結束比賽 the /live box is the game page box of the saved game', (seed) => {
    const s = playGame(seed)
    const { fragment } = normalizeGameEdit(roster, toGameEdit(s))
    const game = fragment.games[0]
    const saved = gameBoxScore(fragment, game)
    const live = liveBoxScore(s, { inPlay: false, roster })
    expect(live.us).toEqual(saved.us)
    expect(live.opp).toEqual(saved.opp)
    expect(live.pitching).toEqual(saved.pitching)
    // 對方投手: the saved game splits stints by name and hand only (where a 換投 came in mid plate appearance is not
    // saved), so the stints may be cut differently; every pitch and plate appearance is still someone's
    const sumOf = (b: BoxScore, k: 'pc' | 'pa' | 'h' | 'k') => b.oppPitchers.reduce((a, x) => a + x[k], 0)
    for (const k of ['pc', 'pa', 'h', 'k'] as const) expect(sumOf(live, k)).toBe(sumOf(saved, k))
    // the game page's own tables (攻守成績) of the saved game: the same numbers
    const bat = fragment.batting.filter((p) => p.gameId === game.id), pit = fragment.pitching.filter((p) => p.gameId === game.id)
    for (const l of ourBattingBox(fragment, bat)) expect(live.us.rows.find((r) => r.name === l.name)).toMatchObject({ ab: l.ab, r: l.r, h: l.h, rbi: l.rbi, bb: l.bb + l.hbp, so: l.so })
    expect(ourPitchingBox(pit, [game]).map((l) => [l.name, l.ipDisplay, l.h, l.r, l.er, l.bb + l.hbp, l.k, l.pc])).toEqual(live.pitching.map((p) => [p.name, p.ip, p.h, p.r, p.er, p.bb, p.k, p.pc]))
    for (const l of oppBattingLines(pit)) expect(live.opp.rows.find((r) => r.name === l.label)).toMatchObject({ ab: l.ab, h: l.h, rbi: l.rbi })
  })
})

// ------------------------------------------------------------------ hand-made cases
const GAME: Game = { id: 'G1', date: '2026-10-20', tournament: '系際盃', opponent: '對手', homeAway: '客', innings: 7 }
const b = (inning: number, order: number, batter: string, result: string, x: Partial<BattingPA> = {}): BattingPA => ({ gameId: 'G1', inning, order, batter, pitches: ['IP'], result, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...x })
const p = (inning: number, oppOrder: number, result: string, x: Partial<PitchingPA> = {}): PitchingPA => ({ gameId: 'G1', inning, pitcher: '壬', oppOrder, pitches: ['IP'], result, sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...x })

describe('Box Score: the newspaper details', () => {
  const batting: BattingPA[] = [
    b(1, 1, '甲', '二安', { run: 1, sb: 1 }), b(1, 2, '乙', '全壘打', { run: 1, rbi: 2, pitches: ['B', 'S', 'IP'], oppPitcher: '王', oppHand: 'R' }), b(1, 3, '丙', '三振', { pitches: ['S', 'S', 'SS'], code: 'I', oppPitcher: '王', oppHand: 'R' }),
    // 代打 癸 in slot 3, 代跑 子 for him; 甲 doubles again
    b(3, 3, '癸', '一安', { pos: 'PH', runner: '子', run: 1, sb: 2, oppPitcher: '林', oppHand: 'L', pitches: ['B', 'IP'] }), b(3, 1, '甲', '二安', { rbi: 1, oppPitcher: '林', oppHand: 'L' }),
    // 8th: a 突破僵局 runner (no plate appearance) who scores
    b(8, 2, '乙', '突破僵局', { pitches: [], run: 1 }),
  ]
  const pitching: PitchingPA[] = [
    p(1, 1, '一安', { code: 'R' }), p(1, 2, '三振', { pitches: ['S', 'S', 'S'], code: 'I' }),
    // their 代打 named 陳 in slot 3, run for by an unnamed 對方代跑
    p(1, 3, '保送', { oppBatter: '代打 陳', runner: '對方代跑', pitches: ['B', 'B', 'B', 'B'] }),
    p(2, 4, '全壘打', { code: 'ER', rbi: 1, pitcher: '癸' }),
  ]
  const dayRoster = { starters: ['甲', '乙', '丙'].map((name, i) => ({ name, pos: ['SS', 'CF', '1B'][i], order: i + 1 })), subs: [] }
  const box = boxScore({ game: GAME, batting, pitching, dayRoster })

  it('slots in order with the substitutes under the player they came in for, a totals row and the notes', () => {
    expect(box.us.rows.map((r) => [r.slot, r.first, r.name, r.pos])).toEqual([[1, true, '甲', 'SS'], [2, true, '乙', 'CF'], [3, true, '丙', '1B'], [3, false, '癸', '代打'], [3, false, '子', '代跑']])
    expect(box.us.rows.find((r) => r.name === '甲')).toMatchObject({ ab: 2, r: 1, h: 2, rbi: 1 })
    // the 突破僵局 runner's run is his, but no at bat
    expect(box.us.rows.find((r) => r.name === '乙')).toMatchObject({ ab: 1, r: 2, h: 1, rbi: 2 })
    // the 代跑 has the run and the steals after 癸 reached
    expect(box.us.rows.find((r) => r.name === '癸')).toMatchObject({ ab: 1, r: 0, h: 1 })
    expect(box.us.rows.find((r) => r.name === '子')).toMatchObject({ ab: 0, r: 1, h: 0 })
    expect(box.us.total).toEqual({ ab: 5, r: 4, h: 4, rbi: 3, bb: 0, so: 1 })
    expect(box.us.notes).toEqual([{ label: '二安', text: '甲 2' }, { label: '全壘打', text: '乙' }, { label: '盜壘', text: '甲、子 2' }])
  })

  it('their batters by slot (names when recorded), 對方代打／代跑 as subs, their pitchers from our plate appearances', () => {
    expect(box.opp.rows.map((r) => [r.slot, r.first, r.name, r.pos])).toEqual([[1, true, '第 1 棒', ''], [2, true, '第 2 棒', ''], [3, true, '陳', '代打'], [3, false, '對方代跑', '代跑'], [4, true, '第 4 棒', '']])
    expect(box.opp.rows.find((r) => r.name === '陳')).toMatchObject({ ab: 0, bb: 1 })
    expect(box.opp.notes).toEqual([{ label: '全壘打', text: '第 4 棒' }])
    expect(box.pitching.map((x) => [x.name, x.ip, x.h, x.r, x.er, x.bb, x.k, x.pc])).toEqual([['壬', '0.1', 1, 1, 0, 1, 1, 8], ['癸', '0.0', 1, 1, 1, 0, 0, 1]])
    // the first row has no pitcher recorded: 對方投手; then 右投 王 (2 PA), 左投 林 (2 PA, and the tie-break runner faced nobody)
    expect(box.oppPitchers.map((x) => [x.label, x.pa, x.h, x.bb, x.k, x.pc])).toEqual([['對方投手', 1, 1, 0, 0, 1], ['右投 王', 2, 1, 0, 1, 6], ['左投 林', 2, 2, 0, 0, 3]])
  })
})

describe('Box Score: substitutes in the order they came in', () => {
  // we bat in the top half: 丙 replaces 乙 in center field in 3下 (never bats), 丁 pinch-hits for 丙 in 5上, 戊 runs for 丁
  const starters = [{ name: '甲', pos: 'SS', order: 1 }, { name: '乙', pos: 'CF', order: 2 }]
  const subs = [
    { kind: 'DEF' as const, in: '丙', out: '乙', pos: 'CF', inning: 3, half: 'bottom' as const, slot: 1 },
    { kind: 'PH' as const, in: '丁', out: '丙', pos: 'PH', inning: 5, half: 'top' as const, slot: 1 },
    { kind: 'PR' as const, in: '戊', out: '丁', pos: 'PR', inning: 5, half: 'top' as const, slot: 1 },
  ]
  const rows = [b(1, 1, '甲', '外飛'), b(1, 2, '乙', '內滾'), b(3, 1, '甲', '三振'), b(5, 2, '丁', '一安', { pos: 'PH' })]
  const order = (box: BoxScore) => box.us.rows.map((r) => [r.slot, r.first, r.name, r.pos])
  const want = [[1, true, '甲', 'SS'], [2, true, '乙', 'CF'], [2, false, '丙', 'CF'], [2, false, '丁', '代打'], [2, false, '戊', '代跑']]

  it('a 守備 substitute who never batted stays above the pinch hitter who came in after him', () => {
    expect(order(boxScore({ game: GAME, batting: rows, pitching: [], dayRoster: { starters, subs } }))).toEqual(want)
  })
  it('the same with the 代跑 stamped on the row he ran for, and in the home half', () => {
    const stamped = rows.map((r) => (r.batter === '丁' ? { ...r, runner: '戊' } : r))
    expect(order(boxScore({ game: GAME, batting: stamped, pitching: [], dayRoster: { starters, subs } }))).toEqual(want)
    // home team (we bat in the bottom half): 丙 comes in while we field in 3上, 丁 bats in 5下
    const home = boxScore({ game: { ...GAME, homeAway: '主' }, batting: stamped, pitching: [], dayRoster: { starters, subs: subs.map((x) => ({ ...x, half: x.half === 'top' ? 'bottom' as const : 'top' as const })) } })
    expect(order(home)).toEqual(want)
  })
})

describe('Box Score: the plate appearance in progress', () => {
  const NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬']
  const base = (x: Partial<RecordState>): RecordState => ({
    game: { ...GAME, homeAway: '主' }, lineup: NAMES.map((name) => ({ name, pos: 'DH' })), slot: 0, pitcher: '壬', oppOrder: 3, oppBatter: '', inning: 1, half: 'top', outs: 1, runners: [],
    batting: [], pitching: [p(1, 1, '一安'), p(1, 2, '外飛', { code: 'I' })], pitches: ['B', 'S', 'F'], extras: { sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, pka: 0 }, finished: false, startedAt: '2026-10-20T03:00:00Z',
    starters: NAMES.map((name) => ({ name, pos: 'DH' })), ...x,
  })

  it('its pitches are in our pitcher\'s 用球數, its batter is marked and has no plate appearance yet', () => {
    const box = liveBoxScore(base({}), { inPlay: true })
    expect(box.pitching).toEqual([{ name: '壬', ip: '0.1', outs: 1, h: 1, r: 0, er: 0, bb: 0, k: 0, pc: 5, now: true }])
    expect(box.opp.rows.map((r) => [r.name, r.atBat, r.ab])).toEqual([['第 1 棒', false, 1], ['第 2 棒', false, 1], ['第 3 棒', true, 0]])
    expect(box.opp.total.ab).toBe(2)
    // all nine of ours are listed from the first pitch, nobody at bat
    expect(box.us.rows.map((r) => r.name)).toEqual(NAMES)
    expect(box.us.rows.some((r) => r.atBat)).toBe(false)
    // once the game is over (waiting for 結束比賽) nobody is marked at bat or 投球中 (pitches typed anyway still count)
    const over = liveBoxScore(base({}), { inPlay: false })
    expect(over.pitching[0]).toMatchObject({ pc: 5, now: false })
    expect(over.opp.rows.some((r) => r.atBat)).toBe(false)
  })

  it('a reliever who has faced nobody yet, and their named pinch hitter at the plate', () => {
    const box = liveBoxScore(base({ pitcher: '癸', oppBatter: '代打 99號', oppNames: true }), { inPlay: true })
    expect(box.pitching.map((x) => [x.name, x.pc, x.now])).toEqual([['壬', 2, false], ['癸', 3, true]])
    expect(box.opp.rows.at(-1)).toMatchObject({ slot: 3, first: true, name: '99號', pos: '代打', atBat: true })
  })

  it('our half: the opponent pitcher on the mound has the pitches so far, a pitcher who came in mid plate appearance takes over the count', () => {
    const rows = [b(1, 1, '甲', '一安', { pitches: ['B', 'IP'], oppPitcher: '王' }), b(1, 2, '乙', '外飛', { pitches: ['S', 'B', 'IP'], code: 'I', oppPitcher: '王' })]
    const s = base({ half: 'bottom', slot: 2, batting: rows, pitches: ['B', 'B'], oppPitcher: { name: '王' } })
    const box = liveBoxScore(s, { inPlay: true })
    expect(box.oppPitchers.map((x) => [x.label, x.pa, x.pc, x.now])).toEqual([['王', 2, 7, true]])
    expect(box.us.rows.find((r) => r.atBat)?.name).toBe('丙')
    expect(box.pitching[0]).toMatchObject({ pc: 2, now: false })
    // 林 came in after the first ball of 丙's plate appearance
    const relief = liveBoxScore({ ...s, oppPitcher: { name: '林', hand: 'L' }, oppPitcherFrom: { row: 2, pitches: 1 } }, { inPlay: true })
    expect(relief.oppPitchers.map((x) => [x.label, x.pc, x.now])).toEqual([['王', 6, false], ['左投 林', 1, true]])
  })

  it('every 換投 keeps its pitcher: two right-handers in a row stay two rows when a third pitcher comes in', () => {
    const ours = (s: RecordState, n: number) => {
      const add = Array.from({ length: n }, (_, i) => b(1, s.batting.length + i + 1, NAMES[(s.batting.length + i) % 9], '外飛', { pitches: ['B', 'IP'], code: 'I', ...(s.oppPitcher?.hand ? { oppHand: s.oppPitcher.hand } : {}) }))
      return { ...s, batting: [...s.batting, ...add] }
    }
    let s = base({ half: 'bottom', pitches: [] })
    s = ours(setOppPitcher(s, { hand: 'R' }), 3)
    s = ours(setOppPitcher(s, { hand: 'R' }), 3)
    const rows = (x: RecordState) => liveBoxScore(x, { inPlay: true }).oppPitchers.map((p) => [p.label, p.pa, p.pc, p.now])
    expect(rows(s)).toEqual([['右投', 3, 6, false], ['右投', 3, 6, true]])
    s = setOppPitcher(s, { hand: 'L' })
    expect(rows(s)).toEqual([['右投', 3, 6, false], ['右投', 3, 6, false], ['左投', 0, 0, true]])
    s = ours(setOppPitcher(s, { hand: 'R' }), 1)
    expect(rows(s)).toEqual([['右投', 3, 6, false], ['右投', 3, 6, false], ['右投', 1, 2, true]])
  })

  it('the pitches thrown before a 換投 in the middle of a plate appearance stay with the pitcher who threw them', () => {
    let s = base({ half: 'bottom', pitches: [] })
    s = setOppPitcher(s, { name: 'A' })
    s = { ...s, batting: [b(1, 1, '甲', '外飛', { pitches: ['B', 'IP'], code: 'I', oppPitcher: 'A' }), b(1, 2, '乙', '外飛', { pitches: ['S', 'IP'], code: 'I', oppPitcher: 'A' })], pitches: ['B', 'B', 'B'] }
    s = setOppPitcher(s, { name: 'B' })
    expect(s.oppPitcherFrom).toEqual({ row: 2, pitches: 3 })
    s = { ...s, batting: [...s.batting, b(1, 3, '丙', '保送', { pitches: ['B', 'B', 'B', 'B'], oppPitcher: 'B' })], pitches: [] }
    const rows = (x: RecordState) => liveBoxScore(x, { inPlay: true }).oppPitchers.map((p) => [p.label, p.pa, p.pc])
    expect(rows(s)).toEqual([['A', 2, 7], ['B', 1, 1]])
    s = setOppPitcher(s, { name: 'C' })
    expect(rows(s)).toEqual([['A', 2, 7], ['B', 1, 1], ['C', 0, 0]])
    // C in, and out again after two pitches of the next plate appearance, without any row of his own
    s = { ...s, pitches: ['S', 'S'] }
    s = setOppPitcher(s, { name: 'D' })
    s = { ...s, batting: [...s.batting, b(1, 4, '丁', '三振', { pitches: ['S', 'S', 'S'], code: 'I', oppPitcher: 'D' })], pitches: [] }
    expect(rows(s)).toEqual([['A', 2, 7], ['B', 1, 1], ['C', 0, 2], ['D', 1, 1]])
  })
})

describe('對方打者左打／右打 in the box (batch 18)', () => {
  const game: Game = { id: 'G1', date: '2026-10-16', tournament: '聯賽', opponent: '政大', homeAway: '主' }
  const pit = (oppOrder: number, extra: Partial<PitchingPA> = {}): PitchingPA => ({ gameId: 'G1', inning: 1, outsBefore: 0, oppOrder, pitcher: '甲', pitches: ['S'], result: '三振', code: 'I', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...extra })
  it('tags each of their batters with the side recorded (both sides: 左右打), nothing when unknown', () => {
    const box = boxScore({ game, batting: [], pitching: [pit(1, { oppBats: 'L' }), pit(2), pit(3, { oppBats: 'R' }), pit(1, { oppBats: 'R', inning: 2 })] })
    expect(box.opp.rows.map((r) => [r.slot, r.bats])).toEqual([[1, '左右打'], [2, undefined], [3, '右打']])
    expect('bats' in box.opp.rows[1]).toBe(false)
  })
  it('an unnamed 對方代打 merged into his slot: sides that disagree are left out, not shown as 左右打', () => {
    const box = boxScore({ game, batting: [], pitching: [pit(3, { oppBats: 'R' }), pit(3, { oppBatter: OPP_PH_UNNAMED, oppBats: 'L', inning: 4 }), pit(4, { oppBats: 'L' }), pit(4, { oppBatter: OPP_PH_UNNAMED, oppBats: 'L', inning: 4 })] })
    expect(box.opp.rows.map((r) => [r.slot, r.bats])).toEqual([[3, undefined], [4, '左打']])
    // a named batter who stood on both sides is a switch hitter
    const named = boxScore({ game, batting: [], pitching: [pit(3, { oppBatter: '王', oppBats: 'R' }), pit(3, { oppBatter: '王', oppBats: 'L', inning: 4 })] })
    expect(named.opp.rows.map((r) => r.bats)).toEqual(['左右打'])
  })
  it('a named 對方代打 whose later plate appearance is keyed by the slot again (記對方打者姓名 off): no side on the slot row', () => {
    const box = boxScore({ game, batting: [], pitching: [pit(3, { oppBats: 'R' }), pit(3, { oppBatter: '代打 王', oppBats: 'L', inning: 4 }), pit(3, { oppBats: 'L', inning: 6 })] })
    expect(box.opp.rows.map((r) => [r.name, r.slot, r.bats])).toEqual([['第 3 棒', 3, undefined], ['王', 3, '左打']])
    // a named 代打 who stood on both sides under his own name is still a switch hitter
    const both = boxScore({ game, batting: [], pitching: [pit(3, { oppBats: 'R' }), pit(3, { oppBatter: '代打 王', oppBats: 'L', inning: 4 }), pit(3, { oppBatter: '王', oppBats: 'R', inning: 6 })] })
    expect(both.opp.rows.map((r) => [r.name, r.bats])).toEqual([['第 3 棒', '右打'], ['王', '左右打']])
  })
  it('a 對方代跑 who bats later in the slot from the other side: no side on the slot row (named or not)', () => {
    for (const runner of [OPP_PR_UNNAMED, '李']) {
      const box = boxScore({ game, batting: [], pitching: [pit(3, { oppBats: 'R', result: '一安', code: 'H', runner }), pit(3, { oppBats: 'L', inning: 4 })] })
      expect(box.opp.rows.find((r) => r.name === '第 3 棒')?.bats).toBeUndefined()
    }
    // without anyone coming in, the same slot recorded both ways is one switch hitter
    const one = boxScore({ game, batting: [], pitching: [pit(3, { oppBats: 'R', result: '一安', code: 'H' }), pit(3, { oppBats: 'L', inning: 4 })] })
    expect(one.opp.rows.map((r) => r.bats)).toEqual(['左右打'])
  })
  it('on /live a named 對方代打 at the plate already marks his slot row as two people (as his row will once written)', () => {
    const box = boxScore({ game, batting: [], pitching: [pit(3, { oppBats: 'R' }), pit(3, { oppBats: 'L', inning: 3 })], live: { lineup: [], atBat: { side: 'opp', key: '王', slot: 3, pinchHit: true, bats: 'L' }, pitcher: '甲', pitcherNow: true, livePitches: 0, opp: { start: 0, pc: 0, carried: 0, now: false, show: false } } })
    expect(box.opp.rows.map((r) => [r.name, r.bats])).toEqual([['第 3 棒', undefined], ['王', '左打']])
  })
  it('on /live the unnamed 對方代打 at the plate shows the side picked for him, even when his slot had the other side', () => {
    const box = boxScore({ game, batting: [], pitching: [pit(3, { oppBats: 'R' })], live: { lineup: [], atBat: { side: 'opp', key: '第 3 棒', slot: 3, pinchHit: true, bats: 'L' }, pitcher: '甲', pitcherNow: true, livePitches: 0, opp: { start: 0, pc: 0, carried: 0, now: false, show: false } } })
    expect(box.opp.rows.find((r) => r.atBat)?.bats).toBe('左打')
  })
  it('on /live the batter at the plate shows the side picked for him', () => {
    const box = boxScore({ game, batting: [], pitching: [pit(1)], live: { lineup: [], atBat: { side: 'opp', key: '第 2 棒', slot: 2, pinchHit: false, bats: 'L' }, pitcher: '甲', pitcherNow: true, livePitches: 0, opp: { start: 0, pc: 0, carried: 0, now: false, show: false } } })
    expect(box.opp.rows.find((r) => r.atBat)?.bats).toBe('左打')
  })
})
