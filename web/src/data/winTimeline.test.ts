import { describe, expect, it } from 'vitest'
import { battingLines, pitchingLines, summarizeGame } from './stats'
import { isPA, isPlaced, type BattingPA, type Dataset, type Game, type PitchingPA } from './types'
import { buildRunModel, END, stateOf, type WinRules } from './winModel'
import { buildWinData, eventText, keyPlays, paTransitions, situationText, teamWinBatting, withWinBatting, withWinPitching, type GameEvent } from './winTimeline'
import { normalizeGameEdit } from './edit'
import { toGameEdit } from '../record/model'
import { playGame, roster } from '../test/simGame'
import { SEED_DATASET } from './seed'

const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'H1', inning: 1, outsBefore: 0, basesBefore: '無', order: 1, batter: '甲', pitches: ['IP'], result: '內滾', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'H1', inning: 1, outsBefore: 0, basesBefore: '無', oppOrder: 1, pitcher: '投', pitches: ['SS', 'SS', 'SS'], result: '三振', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })
const ds = (games: Game[], batting: BattingPA[], pitching: PitchingPA[]): Dataset => ({ roster: [], games, batting, pitching, fielding: [] })

/** Sim games 1…n (test/simGame.ts) as saved, each with its own id; `demo` marks them demo games. */
function simGames(from: number, to: number, demo = false): Dataset {
  const out = ds([], [], [])
  for (let seed = from; seed <= to; seed++) {
    const s = playGame(seed)
    const edit = toGameEdit(s)
    const { fragment } = normalizeGameEdit(roster, { ...edit, game: { ...edit.game, id: `S${seed}`, ...(demo ? { isDemo: true } : {}) } })
    out.games.push(...fragment.games); out.batting.push(...fragment.batting); out.pitching.push(...fragment.pitching)
  }
  return out
}

const SIM_RULES: WinRules = { innings: 7, tiebreakFrom: 8, tiebreakBases: [1, 2] }
const halves = (evs: GameEvent[]) => {
  const m = new Map<string, GameEvent[]>()
  for (const e of evs) { const k = `${e.inning}${e.half}`; (m.get(k) ?? m.set(k, []).get(k)!).push(e) }
  return m
}

describe('a hand-made game (1 inning, we are home)', () => {
  const game: Game = { id: 'H1', date: '2026-01-01', tournament: 'T', opponent: '對手', homeAway: '主', innings: 1 }
  const pitching = [pit({ code: 'I' }), pit({ outsBefore: 1, oppOrder: 2, code: 'II' }), pit({ outsBefore: 2, oppOrder: 3, code: 'III' })]
  const batting = [bat({ result: '全壘打', run: 1, rbi: 1, code: 'R', batter: '陳大文' })]
  const data = ds([game], batting, pitching)
  const rules: WinRules = { innings: 1, tiebreakFrom: null, tiebreakBases: [] }
  const win = buildWinData(data, rules)
  const evs = win.events.get('H1')!
  it('three strikeouts, then a walk-off home run', () => {
    const pas = evs.filter((e) => e.kind === 'pa')
    expect(pas).toHaveLength(4)
    const hr = pas[3]
    expect(hr.weAfter).toBe(1)
    expect(hr.wpa).toBeCloseTo(1 - win.model.we(1, 'bottom', stateOf(0, 0), 0), 12)
    expect(hr.credit).toEqual({ kind: 'batter', name: '陳大文', row: 0 })
    expect(evs.reduce((a, e) => a + e.wpa, 0)).toBeCloseTo(1 - evs[0].weBefore, 12)
    for (const k of pas.slice(0, 3)) { expect(k.credit.kind).toBe('pitcher'); expect(k.wpa).toBeGreaterThan(0) }
    expect(evs.every((e) => e.kind === 'pa')).toBe(true)
  })
  it('words: the situation and what happened', () => {
    const hr = evs[3]
    expect(situationText(hr, true)).toBe('第 1 局下・0 出局・壘上無人・0:0 平手')
    expect(eventText(hr, { bat: batting, pit: pitching })).toBe('陳大文 全壘打（1 分打點）')
    expect(eventText(evs[0], { bat: batting, pit: pitching })).toBe('對方第 1 棒 三振（投手 投）')
    expect(keyPlays(evs, 5)[0]).toBe(hr)
  })
  it('credits the pitcher for his rows and leaves a player without events at null', () => {
    const lines = withWinPitching(pitchingLines(pitching, [game]), pitching, win)
    expect(lines[0].wpa).toBeCloseTo(evs.slice(0, 3).reduce((a, e) => a + e.wpa, 0), 12)
    expect(lines[0].re24).toBeCloseTo(-evs.slice(0, 3).reduce((a, e) => a + e.re24, 0), 12)
    expect(withWinPitching(pitchingLines(pitching, [game]), [], win)[0].wpa).toBeNull()
    expect(pitchingLines(pitching, [game])[0].wpa).toBeNull()
  })
})

describe('代跑: the runner gets his own steal', () => {
  // we bat first: 甲 singles, 乙 runs for him and steals second during 丙's plate appearance; three strikeouts
  const game: Game = { id: 'H2', date: '2026-01-01', tournament: 'T', opponent: '對手', homeAway: '客', innings: 1 }
  const batting = [
    bat({ gameId: 'H2', batter: '甲', runner: '乙', result: '一安', sb: 1, code: 'L' }),
    bat({ gameId: 'H2', order: 2, batter: '丙', result: '三振', basesBefore: '2', events: [{ at: 1, kind: 'sb', from: 1, to: 2 }], pitches: ['B', 'SS', 'SS', 'SS'], code: 'I' }),
    bat({ gameId: 'H2', order: 3, batter: '丁', result: '三振', outsBefore: 1, basesBefore: '2', code: 'II' }),
    bat({ gameId: 'H2', order: 4, batter: '戊', result: '三振', outsBefore: 2, basesBefore: '2', code: 'III' }),
  ]
  const pitching = [pit({ gameId: 'H2', code: 'I' }), pit({ gameId: 'H2', outsBefore: 1, code: 'II' }), pit({ gameId: 'H2', outsBefore: 2, code: 'III' })]
  const data = ds([game], batting, pitching)
  const win = buildWinData(data, { innings: 1, tiebreakFrom: null, tiebreakBases: [] })
  const evs = win.events.get('H2')!
  it('splits the credit', () => {
    const steal = evs.find((e) => e.kind === 'play')!
    expect(steal.credit).toEqual({ kind: 'runner', name: '乙', row: 0 })
    expect(steal.row).toBe(1)
    expect(eventText(steal, { bat: batting, pit: pitching })).toBe('乙 盜壘 1B→2B')
    const single = evs.find((e) => e.kind === 'pa' && e.row === 0)!
    const lines = withWinBatting(battingLines(data, batting), batting, win)
    const by = (n: string) => lines.find((l) => l.name === n)!
    expect(by('乙').wpa).toBeCloseTo(steal.wpa, 12)
    expect(by('乙').re24).toBeCloseTo(steal.re24, 12)
    expect(by('甲').wpa).toBeCloseTo(single.wpa, 12)
    expect(steal.wpa).toBeGreaterThan(0)
    const team = teamWinBatting(batting, win)
    expect(team.wpa).toBeCloseTo(lines.reduce((a, l) => a + (l.wpa ?? 0), 0), 12)
    // a 0:0 game over after its one inning: a tie
    expect(evs[evs.length - 1].weAfter).toBe(0.5)
  })
})

describe('a runner play after the half\'s last result (the next batter never finished)', () => {
  const rules: WinRules = { innings: 1, tiebreakFrom: null, tiebreakBases: [] }
  const threeK = (gameId: string) => [pit({ gameId, code: 'I' }), pit({ gameId, outsBefore: 1, code: 'II' }), pit({ gameId, outsBefore: 2, code: 'III' })]
  it('盜壘失敗 for the third out: the single is a single, the out is the runner\'s (代跑 included)', () => {
    for (const runner of [undefined, '庚']) {
      // we bat first: 甲, 乙 strike out, 丙 singles and is caught stealing on 丁's first pitch
      const game: Game = { id: 'T1', date: '2026-01-01', tournament: 'T', opponent: '對手', homeAway: '客', innings: 1 }
      const batting = [
        bat({ gameId: 'T1', batter: '甲', result: '三振', code: 'I' }),
        bat({ gameId: 'T1', order: 2, batter: '乙', result: '三振', outsBefore: 1, code: 'II' }),
        bat({ gameId: 'T1', order: 3, batter: '丙', result: '一安', outsBefore: 2, code: 'III', cs: 1, ...(runner ? { runner } : {}) }),
      ]
      const data = ds([game], batting, threeK('T1'))
      const win = buildWinData(data, rules)
      const evs = win.events.get('T1')!.filter((e) => e.side === 'bat')
      const single = evs.find((e) => e.kind === 'pa' && e.row === 2)!
      expect([single.from, single.to, single.runs]).toEqual([stateOf(2, 0), stateOf(2, 1), 0])
      expect(single.wpa).toBeGreaterThan(0)
      expect(single.credit).toEqual({ kind: 'batter', name: '丙', row: 2 })
      const cs = evs[evs.length - 1]
      expect(cs.kind).toBe('play')
      expect(cs.move).toMatchObject({ kind: 'cs', row: 2, from: 1, to: 'out' })
      expect([cs.from, cs.to]).toEqual([stateOf(2, 1), END])
      expect(cs.credit).toEqual({ kind: 'runner', name: runner ?? '丙', row: 2 })
      expect(eventText(cs, { bat: batting, pit: data.pitching })).toBe(`${runner ?? '丙'} 盜壘失敗（1B）`)
      expect(paTransitions(data).filter((t) => t.cls === '1B')).toEqual([expect.objectContaining({ from: stateOf(2, 0), to: stateOf(2, 1), runs: 0 })])
      const lines = withWinBatting(battingLines(data, batting), batting, win)
      const by = (n: string) => lines.find((l) => l.name === n)
      if (runner) { expect(by('庚')!.wpa).toBeCloseTo(cs.wpa, 12); expect(by('丙')!.wpa).toBeCloseTo(single.wpa, 12) }
      else expect(by('丙')!.wpa).toBeCloseTo(single.wpa + cs.wpa, 12)
    }
  })
  it('a walk-off steal of home: the triple scores nobody, the steal wins it', () => {
    const game: Game = { id: 'T2', date: '2026-01-01', tournament: 'T', opponent: '對手', homeAway: '主', innings: 1 }
    const batting = [
      bat({ gameId: 'T2', batter: '甲', result: '三振', code: 'I' }),
      bat({ gameId: 'T2', order: 2, batter: '乙', result: '三振', outsBefore: 1, code: 'II' }),
      bat({ gameId: 'T2', order: 3, batter: '丙', result: '三安', outsBefore: 2, code: 'R', run: 1, sb: 1 }),
    ]
    const data = ds([game], batting, threeK('T2'))
    const win = buildWinData(data, rules)
    const evs = win.events.get('T2')!
    const triple = evs.find((e) => e.kind === 'pa' && e.side === 'bat' && e.row === 2)!
    expect([triple.from, triple.to, triple.runs]).toEqual([stateOf(2, 0), stateOf(2, 4), 0])
    expect(triple.weAfter).toBeLessThan(1)
    const steal = evs[evs.length - 1]
    expect(steal).toMatchObject({ kind: 'play', runs: 1, weAfter: 1, credit: { kind: 'runner', name: '丙', row: 2 } })
    expect(steal.move).toMatchObject({ kind: 'sb', from: 3, to: 'home' })
    expect([steal.usAfter, steal.oppAfter]).toEqual([1, 0])
    expect(paTransitions(data).filter((t) => t.cls === '3B')).toEqual([expect.objectContaining({ to: stateOf(2, 4), runs: 0 })])
  })
  it('they bat: a pickoff for the third out after a walk is our pitcher\'s play, not the walk', () => {
    const game: Game = { id: 'T3', date: '2026-01-01', tournament: 'T', opponent: '對手', homeAway: '主', innings: 1 }
    const pitching = [pit({ gameId: 'T3', code: 'I' }), pit({ gameId: 'T3', outsBefore: 1, code: 'II' }), pit({ gameId: 'T3', outsBefore: 2, result: '保送', pitches: ['B', 'B', 'B', 'B'], code: 'III', pk: 1 })]
    const batting = [bat({ gameId: 'T3', result: '全壘打', run: 1, rbi: 1, code: 'R' })]
    const data = ds([game], batting, pitching)
    const evs = buildWinData(data, rules).events.get('T3')!.filter((e) => e.side === 'pit')
    const walk = evs.find((e) => e.kind === 'pa' && e.row === 2)!
    expect([walk.from, walk.to]).toEqual([stateOf(2, 0), stateOf(2, 1)])
    expect(evs[evs.length - 1]).toMatchObject({ kind: 'play', to: END, credit: { kind: 'pitcher', name: '投', row: 2 }, move: { kind: 'pk' } })
  })
  it('a runner thrown out on the hit (no count of his own) stays part of the hit', () => {
    // 丙 doubles with two out; 丁 singles and 丙 is thrown out at the plate for the third out
    const game: Game = { id: 'T4', date: '2026-01-01', tournament: 'T', opponent: '對手', homeAway: '客', innings: 1 }
    const batting = [
      bat({ gameId: 'T4', batter: '甲', result: '三振', code: 'I' }),
      bat({ gameId: 'T4', order: 2, batter: '乙', result: '三振', outsBefore: 1, code: 'II' }),
      bat({ gameId: 'T4', order: 3, batter: '丙', result: '二安', outsBefore: 2, code: 'III', outOnBase: 1 }),
      bat({ gameId: 'T4', order: 4, batter: '丁', result: '一安', outsBefore: 2, basesBefore: '2', code: 'L' }),
    ]
    const data = ds([game], batting, threeK('T4'))
    const evs = buildWinData(data, rules).events.get('T4')!
    expect(evs.filter((e) => e.kind === 'play')).toEqual([])
    expect(evs.find((e) => e.kind === 'pa' && e.side === 'bat' && e.row === 3)!.to).toBe(END)
  })
})

describe('Excel-style halves: counts without 跑壘事件 (the play happened earlier, not after the last result)', () => {
  const rules: WinRules = { innings: 1, tiebreakFrom: null, tiebreakBases: [] }
  const threeK = (gameId: string) => [pit({ gameId, code: 'I' }), pit({ gameId, outsBefore: 1, code: 'II' }), pit({ gameId, outsBefore: 2, code: 'III' })]
  const threeKBat = (gameId: string) => [bat({ gameId, code: 'I' }), bat({ gameId, order: 2, outsBefore: 1, code: 'II' }), bat({ gameId, order: 3, outsBefore: 2, code: 'III' })]
  const noFix = (evs: GameEvent[]) => expect(evs.filter((e) => e.kind === 'fix' || e.kind === 'play')).toEqual([])
  it('we bat: 甲 steals second during 乙\'s plate appearance, 乙\'s single walks it off', () => {
    const game: Game = { id: 'X1', date: '2026-01-01', tournament: 'T', opponent: '對手', homeAway: '主', innings: 1 }
    const batting = [
      bat({ gameId: 'X1', batter: '甲', result: '一安', sb: 1, run: 1, code: 'R' }),
      bat({ gameId: 'X1', order: 2, batter: '乙', result: '一安', basesBefore: '2', rbi: 1, code: 'L' }),
    ]
    const data = ds([game], batting, threeK('X1'))
    const win = buildWinData(data, rules)
    const evs = win.events.get('X1')!
    noFix(evs)
    const single = evs.find((e) => e.kind === 'pa' && e.side === 'bat' && e.row === 1)!
    expect([single.from, single.runs, single.weAfter]).toEqual([stateOf(0, 2), 1, 1])
    const lines = withWinBatting(battingLines(data, batting), batting, win)
    expect(lines.find((l) => l.name === '乙')!.wpa).toBeCloseTo(single.wpa, 12)
    expect(paTransitions(data).filter((t) => t.cls === '1B').map((t) => t.runs)).toEqual([0, 1])
  })
  it('we bat: 丁\'s RBI single keeps its run when he is thrown out stretching for the third out', () => {
    const game: Game = { id: 'X2', date: '2026-01-01', tournament: 'T', opponent: '對手', homeAway: '客', innings: 1 }
    const batting = [
      bat({ gameId: 'X2', batter: '甲', result: '三振', code: 'I' }),
      bat({ gameId: 'X2', order: 2, batter: '乙', result: '三振', outsBefore: 1, code: 'II' }),
      bat({ gameId: 'X2', order: 3, batter: '丙', result: '一安', outsBefore: 2, sb: 1, run: 1, code: 'R' }),
      bat({ gameId: 'X2', order: 4, batter: '丁', result: '一安', outsBefore: 2, basesBefore: '2', rbi: 1, code: 'III' }),
    ]
    const data = ds([game], batting, threeK('X2'))
    const win = buildWinData(data, rules)
    const evs = win.events.get('X2')!
    noFix(evs.filter((e) => e.side === 'bat'))
    const single = evs.find((e) => e.kind === 'pa' && e.side === 'bat' && e.row === 3)!
    expect([single.from, single.to, single.runs, single.usAfter]).toEqual([stateOf(2, 2), END, 1, 1])
    expect(single.wpa).toBeGreaterThan(0)
    const lines = withWinBatting(battingLines(data, batting), batting, win)
    expect(lines.find((l) => l.name === '丁')!.wpa).toBeCloseTo(single.wpa, 12)
    expect(lines.find((l) => l.name === '丁')!.re24).toBeCloseTo(single.re24, 12)
  })
  it('they bat: a wild pitch during #2\'s plate appearance is not a walk-off wild pitch', () => {
    const game: Game = { id: 'X3', date: '2026-01-01', tournament: 'T', opponent: '對手', homeAway: '客', innings: 1 }
    const pitching = [
      pit({ gameId: 'X3', result: '二安', pitches: ['IP'], code: 'ER' }),
      pit({ gameId: 'X3', oppOrder: 2, result: '一安', pitches: ['B', 'IP'], basesBefore: '3', wp: 1, code: 'L' }),
    ]
    const data = ds([game], threeKBat('X3'), pitching)
    const win = buildWinData(data, rules)
    const evs = win.events.get('X3')!
    noFix(evs)
    const single = evs.find((e) => e.kind === 'pa' && e.side === 'pit' && e.row === 1)!
    expect([single.from, single.runs, single.weAfter]).toEqual([stateOf(0, 4), 1, 0])
    expect(single.wpa).toBeCloseTo(-single.weBefore, 12)
    expect(eventText(single, { bat: data.batting, pit: pitching })).toBe('對方第 2 棒 一安（投手 投）')
  })
  it('a hand-entered steal in a game recorded with runner plays still stays out of the walk-off', () => {
    // 2 innings, we are home. 1st: 丙's steal is recorded (an event on 丁's row). 2nd: 甲's 盜壘 was typed in 修改資料
    // without one (he stole during 乙's plate appearance), and 乙's single walks it off
    const game: Game = { id: 'X4', date: '2026-01-01', tournament: 'T', opponent: '對手', homeAway: '主', innings: 2 }
    const batting = [
      bat({ gameId: 'X4', batter: '丙', result: '一安', sb: 1, code: 'L' }),
      bat({ gameId: 'X4', order: 2, batter: '丁', result: '三振', basesBefore: '2', pitches: ['B', 'SS', 'SS', 'SS'], events: [{ at: 1, kind: 'sb', from: 1, to: 2 }], code: 'I' }),
      bat({ gameId: 'X4', order: 3, batter: '戊', result: '三振', outsBefore: 1, basesBefore: '2', code: 'II' }),
      bat({ gameId: 'X4', order: 4, batter: '己', result: '三振', outsBefore: 2, basesBefore: '2', code: 'III' }),
      bat({ gameId: 'X4', inning: 2, order: 5, batter: '甲', result: '一安', sb: 1, run: 1, code: 'R' }),
      bat({ gameId: 'X4', inning: 2, order: 6, batter: '乙', result: '一安', basesBefore: '2', rbi: 1, code: 'L' }),
    ]
    const pitching = [...threeK('X4'), ...threeK('X4').map((p) => ({ ...p, inning: 2 }))]
    const data = ds([game], batting, pitching)
    const evs = buildWinData(data, { innings: 2, tiebreakFrom: null, tiebreakBases: [] }).events.get('X4')!.filter((e) => e.side === 'bat')
    expect(evs.filter((e) => e.kind === 'fix')).toEqual([])
    expect(evs.filter((e) => e.kind === 'play').map((e) => e.move?.kind)).toEqual(['sb'])
    const single = evs.find((e) => e.kind === 'pa' && e.row === 5)!
    expect([single.runs, single.weAfter]).toEqual([1, 1])
  })
})

describe('150 simulated games (test/simGame.ts)', () => {
  const data = simGames(1, 150)
  const win = buildWinData(data, SIM_RULES)
  it('is cached per dataset object', () => {
    expect(buildWinData(data, SIM_RULES)).toBe(win)
  })
  it('stays a probability, adds up, and ends at the result', () => {
    for (const g of data.games) {
      const evs = win.events.get(g.id)!
      expect(evs.length).toBeGreaterThan(0)
      const sum = summarizeGame(data, g)
      const result = sum.result === 'W' ? 1 : sum.result === 'L' ? 0 : 0.5
      for (const e of evs) {
        expect(e.weBefore).toBeGreaterThanOrEqual(0); expect(e.weBefore).toBeLessThanOrEqual(1 + 1e-12)
        expect(e.weAfter).toBeGreaterThanOrEqual(0); expect(e.weAfter).toBeLessThanOrEqual(1 + 1e-12)
        expect(e.approx).toBe(false)
      }
      for (let i = 1; i < evs.length; i++) expect(evs[i].weBefore).toBeCloseTo(evs[i - 1].weAfter, 12)
      expect(evs[evs.length - 1].weAfter).toBe(result)
      expect(evs.reduce((a, e) => a + e.wpa, 0)).toBeCloseTo(result - evs[0].weBefore, 9)
    }
  })
  it('a complete half: Σ RE24 = its runs − RE(start); the line score holds at every half end', () => {
    for (const g of data.games) {
      const sum = summarizeGame(data, g)
      const weTop = g.homeAway === '客'
      for (const [k, list] of halves(win.events.get(g.id)!.filter((e) => e.kind !== 'end'))) {
        const last = list[list.length - 1]
        const inning = Number(k.replace(/\D+$/, ''))
        const half = k.endsWith('top') ? 'top' : 'bottom'
        const before = (line: number[]) => line.slice(0, inning - 1).reduce((a, b) => a + b, 0)
        // after a top half only the visitors' inning is in
        const usEnd = before(sum.lineUs) + (half === 'bottom' || weTop ? sum.lineUs[inning - 1] : 0)
        const oppEnd = before(sum.lineOpp) + (half === 'bottom' || !weTop ? sum.lineOpp[inning - 1] : 0)
        expect([last.usAfter, last.oppAfter], `${g.id} ${k}`).toEqual([usEnd, oppEnd])
        if (last.to === END) {
          const runs = list.reduce((a, e) => a + e.runs, 0)
          expect(list.reduce((a, e) => a + e.re24, 0)).toBeCloseTo(runs - win.model.run.re[list[0].from], 9)
        }
      }
    }
  })
  it('every plate appearance has exactly one result event; tie-break runners none', () => {
    let placed = 0
    for (const g of data.games) {
      const evs = win.events.get(g.id)!
      for (const side of ['bat', 'pit'] as const) {
        const rows: Array<BattingPA | PitchingPA> = (side === 'bat' ? data.batting : data.pitching).filter((r) => r.gameId === g.id)
        const count = new Map<number, number>()
        for (const e of evs) if (e.kind === 'pa' && e.side === side) count.set(e.row, (count.get(e.row) ?? 0) + 1)
        rows.forEach((r, i) => {
          if (isPlaced(r)) placed++
          expect(count.get(i) ?? 0, `${g.id} ${side} row ${i}`).toBe(isPA(r) ? 1 : 0)
        })
      }
    }
    expect(placed).toBeGreaterThan(0)
  })
  it('credit adds up: batters + runners + team-only plays = our offense', () => {
    for (const g of data.games) {
      const evs = win.events.get(g.id)!.filter((e) => e.side === 'bat' && (e.kind === 'pa' || e.kind === 'play'))
      const rows = data.batting.filter((r) => r.gameId === g.id)
      const lines = withWinBatting(battingLines(data, rows), rows, win)
      const players = lines.reduce((a, l) => a + (l.wpa ?? 0), 0)
      const team = evs.filter((e) => e.credit.kind === 'team').reduce((a, e) => a + e.wpa, 0)
      expect(players + team).toBeCloseTo(evs.reduce((a, e) => a + e.wpa, 0), 9)
      expect(evs.filter((e) => e.kind === 'pa').every((e) => e.credit.kind === 'batter')).toBe(true)
      // our pitchers: everything while the opponent batted
      const prow = data.pitching.filter((r) => r.gameId === g.id)
      const plines = withWinPitching(pitchingLines(prow, [g]), prow, win)
      for (const l of plines) {
        const own = win.events.get(g.id)!.filter((e) => e.credit.kind === 'pitcher' && e.credit.name === l.name)
        expect(l.wpa ?? 0).toBeCloseTo(own.reduce((a, e) => a + e.wpa, 0), 9)
      }
    }
  })
  it('a walk never ends the half in the training data (plays after the last result are split off)', () => {
    const t = paTransitions(data)
    expect(t.filter((x) => x.cls === 'BB' && x.to === END)).toEqual([])
    // before the split: 86 hits, walks and errors "ended" a half; what is left are runners out on the play itself
    expect(t.filter((x) => x.to === END && ['1B', '2B', '3B', 'BB', 'E'].includes(x.cls)).length).toBeLessThan(10)
    expect([...win.events.values()].flat().some((e) => e.kind === 'play' && e.to === END && e.move?.kind === 'cs')).toBe(true)
  })
  it('LI averages 1 over every plate appearance', () => {
    const lis = [...win.events.values()].flat().filter((e) => e.kind === 'pa').map((e) => e.li)
    expect(lis.reduce((a, b) => a + b, 0) / lis.length).toBeCloseTo(1, 9)
    expect(win.coverage.trainGames).toBe(150)
    expect(win.coverage.approxPas).toBe(0)
  })
  it('calibration: built on games 1–150, checked on 151–300', () => {
    const test = simGames(151, 300, true)
    const both: Dataset = { ...data, games: [...data.games, ...test.games], batting: [...data.batting, ...test.batting], pitching: [...data.pitching, ...test.pitching] }
    const w2 = buildWinData(both, SIM_RULES)
    // the demo games do not change the model
    expect(w2.model.run.sample.pas).toBe(win.model.run.sample.pas)
    let n = 0, brier = 0
    for (const g of test.games) {
      const r = summarizeGame(both, g).result
      if (r === 'T') continue
      const y = r === 'W' ? 1 : 0
      for (const e of w2.events.get(g.id)!) if (e.halfStart) { brier += (e.weBefore - y) ** 2; n++ }
    }
    expect(n).toBeGreaterThan(500)
    expect(brier / n).toBeLessThan(0.22)
    const actual = buildRunModel(paTransitions({ ...test, games: test.games.map((g) => ({ ...g, isDemo: false })) })).sample.runsPerHalfActual!
    expect(Math.abs(w2.model.run.sample.runsPerHalfModel - actual)).toBeLessThan(0.15)
  }, 60_000)
})

describe('older games and demo games', () => {
  it('a seed game without 壘上(前): laid out from the results, scores from the line score, ends at the result', () => {
    const win = buildWinData(SEED_DATASET, SIM_RULES)
    const g = SEED_DATASET.games.find((x) => x.id === 'G20251010-01')!
    const evs = win.events.get(g.id)!
    expect(evs.length).toBeGreaterThan(0)
    expect(evs.filter((e) => e.kind === 'pa' || e.kind === 'play' || e.kind === 'fix').every((e) => e.approx)).toBe(true)
    expect(win.approxHalves.get(g.id)).toBeGreaterThan(0)
    const sum = summarizeGame(SEED_DATASET, g)
    const result = sum.result === 'W' ? 1 : sum.result === 'L' ? 0 : 0.5
    expect(evs[evs.length - 1].weAfter).toBe(result)
    const last = evs[evs.length - 1]
    expect([last.usAfter, last.oppAfter]).toEqual([sum.runsUs, sum.runsOpp])
    // approx halves never train the model
    expect(win.model.run.sample.pas).toBe(paTransitions(SEED_DATASET).length)
  })
  it('demo games never train the model', () => {
    const real = simGames(1, 6), demo = simGames(7, 12, true)
    const mixed: Dataset = { ...real, games: [...real.games, ...demo.games], batting: [...real.batting, ...demo.batting], pitching: [...real.pitching, ...demo.pitching] }
    const onlyReal = buildWinData(real, SIM_RULES).model.run.sample.pas
    expect(onlyReal).toBeGreaterThan(0)
    expect(buildWinData(demo, SIM_RULES).model.run.sample.pas).toBe(0)
    expect(buildWinData(mixed, SIM_RULES).model.run.sample.pas).toBe(onlyReal)
    expect(buildWinData(mixed, SIM_RULES).events.get('S7')!.length).toBeGreaterThan(0)
  })
})

describe('the count before the result (KeyPlays wording)', () => {
  it('reads 「1-1 後」 in front of the result', () => {
    const game: Game = { id: 'H3', date: '2026-01-01', tournament: 'T', opponent: '對手', homeAway: '主', innings: 1 }
    const pitching = [pit({ gameId: 'H3', code: 'I', oppBatter: '王', oppOrder: 4 }), pit({ gameId: 'H3', outsBefore: 1, code: 'II' }), pit({ gameId: 'H3', outsBefore: 2, code: 'III' })]
    const batting = [bat({ gameId: 'H3', result: '二安', pitches: ['B', 'CS', 'IP'], rbi: 0, batter: '陳大文' })]
    const win = buildWinData(ds([game], batting, pitching), { innings: 1, tiebreakFrom: null, tiebreakBases: [] })
    const evs = win.events.get('H3')!
    const rows = { bat: batting, pit: pitching }
    expect(eventText(evs[0], rows, { count: true })).toBe('對方第 4 棒 王 0-2 後 三振（投手 投）')
    const dbl = evs.find((e) => e.side === 'bat' && e.kind === 'pa')!
    expect(eventText(dbl, rows, { count: true })).toBe('陳大文 1-1 後 二安')
    expect(eventText(dbl, rows)).toBe('陳大文 二安')
  })
})
