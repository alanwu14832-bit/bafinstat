/**
 * 換投後牽制: an out on the bases belongs to the pitcher on the mound when it was made — the reliever who picks off the
 * runner he inherited, not the one he replaced (秋聯對文化 第 6 局, 林昱丞 → 林軒亦) — and 壘死／壘上出局 say which base it was at.
 */
import { describe, expect, it } from 'vitest'
import { auditGame } from '../data/audit'
import { normalizeGameEdit } from '../data/edit'
import { normalizeDataset } from '../data/normalize'
import { ourPitchingBox } from '../data/boxScore'
import { parsePlays, playsText, playText } from '../data/plays'
import { SEED_DATASET } from '../data/seed'
import { outsCredited, pitchingLines } from '../data/stats'
import { RELIEF, isPA, isRelief, type PitchingPA, type PlayEvent } from '../data/types'
import { addPitch, changePitcher, commitPA, defaultOutAt, defaultPlan, newGame, runnerEvent, toGameEdit } from './model'
import { inferHalf, inningsOf } from './timeline'

const game = { id: 'G20261014-01', date: '2026-10-14', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 7 }
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const grounder = (s: ReturnType<typeof newGame>) => commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '內滾'), loc: 6, traj: 'G' })
const single = (s: ReturnType<typeof newGame>) => commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '一安'), loc: 8, traj: 'L' })
const row = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G', inning: 1, pitcher: 'A', pitches: ['IP'], result: '內滾', loc: 6, traj: 'G', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })

describe('a reliever picks off the runner he inherited before facing a batter', () => {
  const build = () => {
    let s = newGame(game, lineup, '壬', { bench: ['林軒亦'] })
    s = grounder(grounder(s))
    s = single(s)
    s = changePitcher(s, '林軒亦')
    return runnerEvent(s, s.runners[0].row, 'opp', 'pk')
  }
  it('he gets a 未面對打者 row: 0.1 IP, a pickoff, a game — and the pitcher he replaced keeps 0.2', () => {
    const s = build()
    expect(s.half).toBe('bottom')
    expect(s.pitching.map((p) => [p.pitcher, p.result])).toEqual([['壬', '內滾'], ['壬', '內滾'], ['壬', '一安'], ['林軒亦', RELIEF]])
    expect(s.pitching[3]).toMatchObject({ outsBefore: 2, pitches: [], pk: 1 })
    const lines = pitchingLines(toGameEdit(s).pitching, [])
    expect(lines.find((l) => l.name === '壬')).toMatchObject({ ipDisplay: '0.2', outs: 2, bf: 3, g: 1 })
    expect(lines.find((l) => l.name === '林軒亦')).toMatchObject({ ipDisplay: '0.1', outs: 1, bf: 0, pk: 1, g: 1, gs: 0, pc: 0 })
  })
  it('it is no plate appearance: not in the timeline, not a batter faced, in the box score', () => {
    const rows = build().pitching
    expect(isRelief(rows[3])).toBe(true)
    expect(isPA(rows[3])).toBe(false)
    expect([...inningsOf(rows).get(1)!]).toEqual([0, 1, 2])
    expect(inferHalf(rows, inningsOf(rows).get(1)!, 'pit')).not.toBeNull()
    expect(ourPitchingBox(rows, []).map((l) => l.name)).toEqual(['壬', '林軒亦'])
    expect(auditGame([], rows).filter((i) => i.index === 3)).toEqual([])
  })
  it('the game saves and loads back the same (normalize keeps the row)', () => {
    const edit = toGameEdit(build())
    const { dataset } = normalizeDataset({ ...SEED_DATASET, games: [edit.game], batting: [], pitching: edit.pitching, fielding: [] })
    expect(dataset.pitching.filter(isRelief)).toHaveLength(1)
    expect(pitchingLines(dataset.pitching, []).find((l) => l.name === '林軒亦')).toMatchObject({ outs: 1, pk: 1 })
  })
  it('mid-inning: the pickoff comes first, then he faces batters — all three outs are his, the pitcher before him has none', () => {
    let s = newGame(game, lineup, '壬', { bench: ['林軒亦'] })
    s = single(s)
    s = changePitcher(s, '林軒亦')
    s = runnerEvent(s, s.runners[0].row, 'opp', 'pk')
    s = grounder(grounder(s))
    const lines = pitchingLines(toGameEdit(s).pitching, [])
    expect(lines.find((l) => l.name === '林軒亦')).toMatchObject({ outs: 3, bf: 2, pk: 1 })
    expect(lines.find((l) => l.name === '壬')).toMatchObject({ outs: 0, bf: 1 })
  })
  it('the same reliever picking off while he already has a row of his own adds no extra row', () => {
    let s = newGame(game, lineup, '壬', { bench: ['林軒亦'] })
    s = changePitcher(s, '林軒亦')
    s = single(s)
    s = runnerEvent(s, s.runners[0].row, 'opp', 'pk')
    expect(s.pitching.filter(isRelief)).toHaveLength(0)
  })
})

describe('an out on the bases during a plate appearance is that plate appearance\'s pitcher\'s (rows from before the change)', () => {
  it('a pickoff between the first reliever pitches: his, though outsBefore already counts it', () => {
    const pk: PlayEvent = { at: 0, kind: 'pk', from: 1, to: 'out' }
    const rows = [
      row({ pitcher: 'A', result: '一安', outsBefore: 0, code: 'I', loc: 8 }),            // his runner is the 1st out (picked off by B)
      row({ pitcher: 'B', result: '內滾', outsBefore: 1, code: 'II', events: [pk] }),
      row({ pitcher: 'B', result: '內滾', outsBefore: 2, code: 'III' }),
    ]
    const credit = outsCredited(rows)
    expect(credit.get(rows[0])).toBeUndefined()
    expect(credit.get(rows[1])).toBe(2)       // the pickoff and his own ground out
    expect(credit.get(rows[2])).toBe(1)
    const lines = pitchingLines(rows, [])
    expect(lines.find((l) => l.name === 'A')!.outs).toBe(0)
    expect(lines.find((l) => l.name === 'B')!.outs).toBe(3)
  })
  it('rows without runner plays read as before', () => {
    const rows = [row({ result: '內滾', outsBefore: 0, code: 'I' }), row({ pitcher: 'B', result: '內滾', outsBefore: 1, code: 'II' }), row({ pitcher: 'B', result: '三振', outsBefore: 2, code: 'III', pitches: ['SS', 'SS', 'SS'], loc: undefined, traj: undefined })]
    expect(pitchingLines(rows, []).map((l) => [l.name, l.outs])).toEqual([['B', 2], ['A', 1]])
  })
})

describe('壘死 at which base', () => {
  it('the text and the spreadsheet column say it, and read back', () => {
    const events: PlayEvent[] = [
      { at: 1, kind: 'out', from: 3, to: 'out', outAt: 'home' },
      { at: 2, kind: 'out', from: 2, to: 'out', play: true, outAt: 3 },
      { at: 1, kind: 'outPlay', from: 1, to: 'out', play: true, batter: true, outAt: 2 },
      { at: 1, kind: 'out', from: 2, to: 'out', play: true },
    ]
    expect(events.map(playText)).toEqual(['壘死（本壘）', '壘死（3B）', '打者出局（2B）', '壘死（2B）'])
    expect(playsText(events)).toBe('1 壘死 3-X 於H；2 壘死 2-X 於3 跑者；1 出局 1-X 於2 打者；1 壘死 2-X 跑者')
    expect(parsePlays(playsText(events))).toEqual(events)
  })
  it('the runner panel records where he died; without it the play reads as before (his own base)', () => {
    let s = newGame({ ...game, homeAway: '客' as const }, lineup, '壬')
    s = single(s)                                           // 甲 on 1B
    const withBase = runnerEvent(s, 0, 'us', 'out', undefined, undefined, 2)
    expect(withBase.plays).toEqual([{ at: 0, kind: 'out', from: 1, to: 'out', outAt: 2 }])
    expect(runnerEvent(s, 0, 'us', 'out').plays).toEqual([{ at: 0, kind: 'out', from: 1, to: 'out' }])
  })
  it('the default: the base after the one the result leaves him on; doubled off after a fly ball, where he stands', () => {
    let s = newGame({ ...game, homeAway: '客' as const }, lineup, '壬')
    s = single(s)
    expect(defaultOutAt(s, { result: '一安' }, 'batter')).toBe(2)
    expect(defaultOutAt(s, { result: '三安' }, 'batter')).toBe('home')
    expect(defaultOutAt(s, { result: '一安' }, 0)).toBe(3)        // 甲 (1B) goes to 2B on a single, then is out at 3B
    expect(defaultOutAt(s, { result: '外飛' }, 0)).toBe(1)
    expect(defaultOutAt(s, { result: '內滾' }, 0)).toBe(3)        // the ground out moves the forced runner to 2B by default: out going on to 3B
  })
  it('a single, the batter thrown out at 2B: the mark says 2B (and a pick of 本壘 is kept)', () => {
    let s = newGame({ ...game, homeAway: '客' as const }, lineup, '壬')
    const plan = { ...defaultPlan(s, '一安'), loc: 8, traj: 'L', batter: 'out' as const }
    const a = commitPA(addPitch(s, 'IP'), plan)
    expect(a.batting[0].events).toEqual([expect.objectContaining({ kind: 'outPlay', outAt: 2 })])
    const b = commitPA(addPitch(s, 'IP'), { ...plan, outAt: { batter: 'home' } })
    expect(b.batting[0].events).toEqual([expect.objectContaining({ kind: 'outPlay', outAt: 'home' })])
    expect(b.batting[0]).toMatchObject({ result: '一安', outOnBase: 1, code: 'I' })
  })
})

describe('安打後被刺殺: their runner and batter, the base and the fielders', () => {
  const rosterOf = lineup.map((l) => ({ name: l.name, primaryPos: l.pos }))
  // we field (主): 壬 pitches; their batter singles to CF and is thrown out at 2B (CF assist, SS putout), their runner on 1st is thrown out at 3B
  const play = (outAt?: Record<string, import('../data/types').OutAt>) => {
    let s = newGame(game, lineup, '壬')
    s = single(s)                                                      // runner on 1B
    const plan = { ...defaultPlan(s, '一安'), loc: 8, traj: 'L', runners: { 0: 'out' as const }, batter: 'out' as const, ...(outAt ? { outAt } : {}) }
    return commitPA(addPitch(s, 'IP'), plan)
  }
  it('both outs carry a mark that says where (the batter 2B, the runner 3B), as a plain 被刺殺 for the runner', () => {
    const s = play()
    expect(s.pitching[1].events).toEqual([
      expect.objectContaining({ kind: 'tag', from: 1, to: 'out', play: true, outAt: 3 }),
      expect.objectContaining({ kind: 'outPlay', batter: true, outAt: 2 }),
    ])
    expect(s.outs).toBe(2)
  })
  it('the recorder\'s pick wins; a 壘死 stays kind out', () => {
    const s = play({ batter: 'home', 0: 2 })
    expect(s.pitching[1].events).toEqual([expect.objectContaining({ kind: 'tag', outAt: 2 }), expect.objectContaining({ kind: 'outPlay', outAt: 'home' })])
    let t = newGame({ ...game, homeAway: '客' as const }, lineup, '壬')
    t = single(t)
    const mistake = commitPA(addPitch(t, 'IP'), { ...defaultPlan(t, '一安'), loc: 8, traj: 'L', runners: { 0: 'out' as const }, runningOuts: [0] })
    expect(mistake.batting[1].events).toEqual([expect.objectContaining({ kind: 'out', from: 1, outAt: 3 })])
  })
  it('stats: the hits count, both outs are our pitcher\'s; the fielding credits the CF an assist per throw and the covering men a putout', () => {
    const s = play()
    const edit = toGameEdit(s)
    const { fragment } = normalizeGameEdit(rosterOf as never, { ...edit, game: { ...edit.game, id: 'G1' } } as never)
    const l = pitchingLines(fragment.pitching, [])[0]
    expect(l).toMatchObject({ h: 2, outs: 2 })
    const fld = (pos: string) => fragment.fielding.find((f) => f.pos === pos)
    expect([fld('CF')?.a, fld('3B')?.po, fld('SS')?.po]).toEqual([2, 1, 1])   // 2B-cover for a ball to CF is the SS
  })
})
