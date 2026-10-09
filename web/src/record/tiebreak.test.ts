import { describe, expect, it } from 'vitest'
import { addPitch, newGame, type RecordState } from './model'
import { addPlacedRows, defaultTiebreak, extraInnings, parseTiebreakBases, placeTiebreak, removePlacedRows, skipTiebreak, tiebreakDue, tiebreakLabel, tiebreakPreview } from './tiebreak'
import { deriveHalf } from './timeline'
import type { BattingPA, Game, PitchingPA } from '../data/types'

const game = (homeAway: '主' | '客'): Game => ({ id: 'G20260301-01', date: '2026-03-01', tournament: '友誼賽', opponent: '測試隊', homeAway, innings: 7 })
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
// we are 客: we bat the top of each inning
const ours = (patch: Partial<RecordState> = {}): RecordState => ({ ...newGame(game('客'), lineup, '壬'), inning: 8, ...patch })
// we are 主: they bat the top
const theirs = (patch: Partial<RecordState> = {}): RecordState => ({ ...newGame(game('主'), lineup, '壬'), inning: 8, ...patch })

describe('the rule', () => {
  it('reads bases and labels', () => {
    expect(parseTiebreakBases('12')).toEqual([1, 2])
    expect(parseTiebreakBases('x3')).toEqual([3])
    expect(tiebreakLabel({ from: 8, bases: [1, 2] })).toBe('第 8 局起・一、二壘')
    expect(tiebreakLabel({ from: 10, bases: [2] })).toBe('第 10 局起・二壘')
    expect(tiebreakLabel({ from: 8, bases: [1, 2, 3] })).toBe('第 8 局起・滿壘')
    expect(tiebreakLabel(null)).toBe('不採用')
    expect(defaultTiebreak(7)).toEqual({ from: 8, bases: [1, 2] })
    expect(defaultTiebreak(9)).toEqual({ from: 10, bases: [1, 2] })
    expect(defaultTiebreak(7, '')).toBeNull()
  })
})

describe('placing the runners (we bat)', () => {
  it('puts the two batters before the one up on second and first, one row each', () => {
    const s = placeTiebreak(ours({ slot: 6 }))
    expect(s.batting).toHaveLength(2)
    expect(s.batting[0]).toMatchObject({ order: 5, batter: '戊', pos: '3B', basesBefore: '無', outsBefore: 0, result: '突破僵局', pitches: [], inning: 8 })
    expect(s.batting[1]).toMatchObject({ order: 6, batter: '己', basesBefore: '2', outsBefore: 0, result: '突破僵局' })
    expect(s.runners).toEqual([{ base: 2, side: 'us', row: 0, name: '戊' }, { base: 1, side: 'us', row: 1, name: '己' }])
    expect(s.slot).toBe(6)
    expect(tiebreakPreview(ours({ slot: 6 })).map((p) => `${p.base}${p.order}${p.name}`)).toEqual(['25戊', '16己', '07庚'])
  })
  it('wraps the batting order', () => {
    const s = placeTiebreak(ours({ slot: 0 }))
    expect(s.batting.map((b) => [b.order, b.batter])).toEqual([[8, '辛'], [9, '壬']])
    expect(s.runners.map((r) => r.base)).toEqual([2, 1])
  })
  it('only second base: the batter just before', () => {
    const s = placeTiebreak(ours({ slot: 3, tiebreak: { from: 8, bases: [2] } }))
    expect(s.batting.map((b) => [b.order, b.batter, b.basesBefore])).toEqual([[3, '丙', '無']])
    expect(s.runners).toEqual([{ base: 2, side: 'us', row: 0, name: '丙' }])
  })
  it('bases loaded: three runners, lead runner first', () => {
    const s = placeTiebreak(ours({ slot: 4, tiebreak: { from: 8, bases: [1, 2, 3] } }))
    expect(s.batting.map((b) => [b.batter, b.basesBefore])).toEqual([['乙', '無'], ['丙', '3'], ['丁', '23']])
    expect(s.runners.map((r) => [r.base, r.name])).toEqual([[3, '乙'], [2, '丙'], [1, '丁']])
  })
  it('stamps the opponent pitcher when one is set', () => {
    const s = placeTiebreak(ours({ slot: 6, oppPitcher: { name: '王', hand: 'L' } }))
    expect(s.batting[0]).toMatchObject({ oppPitcher: '王', oppHand: 'L' })
  })
})

describe('placing the runners (they bat)', () => {
  it('the opponent batters before the one up, with our pitcher on the mound', () => {
    const s = placeTiebreak(theirs({ oppOrder: 3 }))
    expect(s.pitching.map((p) => [p.oppOrder, p.pitcher, p.basesBefore, p.result])).toEqual([[1, '壬', '無', '突破僵局'], [2, '壬', '2', '突破僵局']])
    expect(s.runners.map((r) => [r.base, r.side, r.row])).toEqual([[2, 'opp', 0], [1, 'opp', 1]])
    expect(s.oppOrder).toBe(3)
    expect(s.pitching[0].oppBatter).toBeUndefined()
  })
  it('copies the name last typed for that slot, or (記對方打者姓名) their lineup', () => {
    const earlier: PitchingPA = { gameId: 'G20260301-01', inning: 7, oppOrder: 1, pitcher: '壬', oppBatter: '王', pitches: ['IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, code: 'I', basesBefore: '無', outsBefore: 0 }
    const s = placeTiebreak(theirs({ oppOrder: 3, pitching: [earlier] }))
    expect(s.pitching[1].oppBatter).toBe('王')
    expect(s.runners[0].name).toBe('王')
    const t = placeTiebreak(theirs({ oppOrder: 3, pitching: [earlier], oppNames: true, oppLineup: ['林', '陳', '', '', '', '', '', '', ''] }))
    expect(t.pitching.slice(1).map((p) => p.oppBatter)).toEqual(['林', '陳'])
  })
})

describe('when the card shows', () => {
  it('from the first extra inning, before anything happens in the half', () => {
    expect(tiebreakDue(ours({ inning: 7 }))).toBe(false)
    expect(tiebreakDue(ours())).toBe(true)
    expect(tiebreakDue(theirs())).toBe(true)
    expect(tiebreakDue(placeTiebreak(ours()))).toBe(false)
    expect(tiebreakDue(addPitch(ours(), 'B'))).toBe(false)
    expect(tiebreakDue(ours({ tiebreak: null }))).toBe(false)
    expect(tiebreakDue(ours({ tiebreakSkip: ['8top'] }))).toBe(false)
    expect(tiebreakDue(skipTiebreak(ours()))).toBe(false)
    expect(tiebreakDue(ours({ finished: true }))).toBe(false)
  })
  it('a draft from before the setting uses the inning after regulation', () => {
    const s = ours()
    delete s.tiebreak
    expect(tiebreakDue({ ...s, game: { ...s.game, innings: 9 } })).toBe(false)
    expect(tiebreakDue({ ...s, inning: 10, game: { ...s.game, innings: 9 } })).toBe(true)
  })
  it('a rule from a later inning', () => {
    expect(tiebreakDue(ours({ tiebreak: { from: 9, bases: [1, 2] } }))).toBe(false)
    expect(tiebreakDue(ours({ inning: 9, tiebreak: { from: 9, bases: [1, 2] } }))).toBe(true)
  })
})

describe('修改資料: adding and removing placed runners', () => {
  const pa = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 8, batter: '甲', pitches: [], result: '', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
  const earlier = [pa({ inning: 7, order: 5, batter: '戊', pos: '3B', result: '三振', basesBefore: '無', outsBefore: 0, code: 'I' }), pa({ inning: 7, order: 6, batter: '己', runner: '寅', result: '一安', basesBefore: '無', outsBefore: 1, code: 'L' })]
  const inning8 = [
    pa({ order: 7, batter: '庚', result: '一安', basesBefore: '無', outsBefore: 0, code: 'L' }),
    pa({ order: 8, batter: '辛', result: '三振', basesBefore: '1', outsBefore: 0, code: 'I' }),
    pa({ order: 9, batter: '壬', result: '外飛', basesBefore: '1', outsBefore: 1, code: 'II' }),
    pa({ order: 1, batter: '甲', result: '內滾', basesBefore: '1', outsBefore: 2, code: 'III' }),
  ]
  it('puts the slot holders before the leadoff in front and carries the inning', () => {
    const rows = [...earlier, ...inning8]
    const r = addPlacedRows(rows, 8, 'bat', [1, 2], 'G')
    if ('reason' in r) throw new Error(r.reason)
    expect(r.text).toBe('二壘 戊、一壘 寅')
    const out = deriveHalf(r.rows, r.half, 'bat')
    expect(out.slice(2, 4).map((b) => [b.batter, b.order, b.result, b.basesBefore])).toEqual([['戊', 5, '突破僵局', '無'], ['寅', 6, '突破僵局', '2']])
    expect(out.slice(4).map((b) => b.basesBefore)).toEqual(['12', '123', '123', '123'])
    expect(out.slice(2).map((b) => b.code)).toEqual(['L', 'L', 'L', 'I', 'II', 'III'])
    const back = removePlacedRows(out, 8, 'bat')
    if ('reason' in back) throw new Error(back.reason)
    const again = deriveHalf(back.rows, back.half, 'bat')
    const pick = (b: BattingPA) => [b.basesBefore, b.outsBefore, b.code, b.run]
    expect(again.map(pick)).toEqual(rows.map(pick))
  })
  it('says why when it cannot', () => {
    expect(addPlacedRows([...earlier, pa({ result: '一安' })], 8, 'bat', [1, 2], 'G')).toHaveProperty('reason')
    expect(removePlacedRows([...earlier, ...inning8], 8, 'bat')).toHaveProperty('reason')
  })
})

describe('which innings of a saved game can be extra innings (修改資料)', () => {
  // runs by inning: ours on batting rows, theirs as R / ER codes on pitching rows
  const line = (us: number[], them: number[]) => ({
    bat: us.map((run, i) => ({ inning: i + 1, result: '一安', run })),
    pit: them.flatMap((n, i) => [{ inning: i + 1, result: '一安', code: n ? 'R' : 'L' }, ...Array.from({ length: Math.max(0, n - 1) }, () => ({ inning: i + 1, result: '一安', code: 'ER' }))]),
  })
  const of = (l: ReturnType<typeof line>) => [...extraInnings(l.bat, l.pit)].sort((a, z) => a - z)
  it('a 5-inning game that went to a 6th: the 6th (the saved 局數 is 6)', () => {
    expect(of(line([1, 0, 0, 1, 0, 1], [0, 2, 0, 0, 0, 0]))).toEqual([6])
  })
  it('a 9-inning game not tied late: none (the 8th and 9th are regulation innings)', () => {
    expect(of(line([1, 0, 0, 0, 0, 0, 0, 2, 0], [0, 0, 1, 0, 0, 0, 0, 0, 0]))).toEqual([])
  })
  it('a 7-inning game tied after 7 and won in the 9th: the 8th and the 9th', () => {
    expect(of(line([1, 0, 0, 0, 0, 0, 0, 1, 1], [0, 0, 0, 0, 0, 0, 1, 1, 0]))).toEqual([8, 9])
  })
  it('a game that already has 突破僵局 runners: from that inning on, on both sides', () => {
    const l = line([0, 0, 0, 0, 0, 0, 0, 1, 1], [0, 0, 0, 0, 0, 0, 0, 1, 0])
    l.bat.push({ inning: 8, result: '突破僵局', run: 0 })
    expect(of(l)).toEqual([8, 9])
  })
})
