/**
 * Our games read as a sequence of events for the win-probability model (data/winModel.ts): every runner play
 * between pitches ('play'), every plate appearance's result ('pa'), and the corrections the model needs ('fix': a
 * score taken from the line score, a tie-break start the model did not expect; 'end': the game ended early or tied).
 *
 * Each half-inning is followed with record/timeline's inferHalf (rows with 壘上(前) / 出局(前)); one that cannot be
 * followed (older imports) is laid out from the results alone (rebuildHalf) and marked approx — those count for WPA
 * but never train the model. Demo games never train it either. 突破僵局 runners are no plate appearance: no event,
 * no training; the half's first batter starts from the bases they were put on.
 *
 * Values: WE (our side's win probability) before / after each event, WPA = after − before, RE24 (offense view) =
 * RE(to) − RE(from) + runs, LI = the plate appearance's leverage ÷ the mean over every real plate appearance.
 * Attribution: our result → the batter; our 盜壘 / 盜壘失敗 / 牽制出局 / 壘死 → the runner (代跑 included, as in
 * battingLines); other runner plays (暴投, 捕逸, 失誤, 進壘, 投手犯規…) → the team only; everything while the
 * opponent bats → our pitcher of that plate appearance (his RE24 = − the offense's).
 */
import { basesMask, buildRunModel, buildWinModel, END, resultClass, stateOf, type AdvKey, type HalfName, type PaSample, type WinModel, type WinRules } from './winModel'
import { batterEndFor, homesIn, inferHalf, inningsOf, midOf, OUT_PLAYS, rebuildHalf, stepAfter, type Base, type End, type Half, type Move, type Side, type Step } from '../record/timeline'
import { playText } from './plays'
import { countBeforeText } from './gameText'
import { summarizeGame, type BattingLine, type PitchingLine } from './stats'
import { isPA, isPlaced, type BattingPA, type Dataset, type Game, type PitchingPA } from './types'

type Row = BattingPA | PitchingPA

/** One half-inning's steps: followed (inferHalf) or, failing that, laid out from the results (approx). */
export function halfSteps(rows: Row[], idx: number[], side: Side): { half: Half; approx: boolean } {
  const h = inferHalf(rows, idx, side)
  return h ? { half: h, approx: false } : { half: rebuildHalf(rows, idx, side), approx: true }
}

/**
 * Runner plays the timeline folded into a half's last plate appearance. When the half (or the game) ends between the
 * next batter's pitches — a 盜壘失敗 / 牽制 for the third out, a walk-off 盜本壘 / 暴投 / 投手犯規 — that batter has no row
 * to keep the plays on, so inferHalf puts the out or the run in the step before, as if the result had made it. The
 * rows still say what happened: the runner's own 盜壘 / 盜壘失敗 / 壘上出局 counts (we bat), the last row's 盜壘 /
 * 阻殺 / 牽制 / 暴投 / 捕逸 counts (they bat), the balks settlePending put on the row, beyond the plays its steps
 * hold. Those plays are taken out of the step again: the returned step is what the result alone left (the batter
 * where his result put him, a runner where he stood), and `tail` the plays after it, last outs and trailing runs
 * only. Nothing without such a count is split (a runner thrown out on the hit stays the hit's; while we bat, a runner's
 * 牽制 / 壘上出局 is told apart from an out on the play only after a walk). null: nothing to split.
 *
 * A count says *that* a play happened, not *when*. Only the batter's own play after his result is sure to be the tail's
 * (we bat: his counts are his; they bat: an out after a walk). Anyone else's count is the tail's only when the game was
 * recorded with runner plays (紀錄比賽, or a filled 跑壘事件 column) and the rest of the half adds up: no other row has a
 * count beyond its plays, and the runner did not stand further on than his own result put him with no play to say why.
 * Rows from the Excel template (跑壘事件 left empty) or with counts typed in 修改資料 fail that: their steal or wild pitch
 * happened earlier, inferHalf already folded it into a step, and the run stays with the plate appearance that drove it
 * in. A run after the step's third out is never split off either.
 */
export function splitTail(rows: Row[], steps: Step[], side: Side): { step: Step; tail: Move[] } | null {
  const st = steps[steps.length - 1]
  const r = st && rows[st.index]
  if (!r || !isPA(r)) return null
  const k = st.index
  const all = steps.flatMap((s) => s.moves)
  // plays the rows count but no step holds
  let balks = (r.events ?? []).filter((e) => e.play && e.kind === 'bk').length
  const pool: Record<string, number> = {}
  if (side === 'pit') {
    const p = r as PitchingPA
    const n = (kind: string) => st.moves.filter((m) => m.kind === kind).length
    const at = (kind: string) => new Set(st.moves.filter((m) => m.kind === kind).map((m) => m.at)).size
    Object.assign(pool, { cs: p.cs - n('cs'), pk: p.pk - n('pk'), sb: p.sba - n('sb'), wp: p.wp - at('wp'), pb: p.pb - at('pb') })
  }
  const walk = resultClass(r.result) === 'BB'
  // where a step's batter stood after his result alone: his result, or a mark on the play (趁傳進壘)
  const resultEnd = (s: Step): End => {
    const x = rows[s.index]
    let e: End = batterEndFor(x.result)
    for (const p of x.events ?? []) if (p.play && p.batter && typeof e === 'number' && (p.to === 'home' || (typeof p.to === 'number' && p.to > e))) e = p.to
    return e
  }
  // the counts can be read as the tail's: runner plays were recorded in this game, and no other row of the half
  // counts a play its steps do not hold
  const people = new Set([...midOf(st).map((o) => o.row), k])
  const recorded = rows.some((x) => (x.events ?? []).some((e) => e && !e.play))
  const halfAddsUp = steps.every((s) => {
    const x = rows[s.index]
    if (side === 'pit') {
      if (s.index === k) return true
      const p = x as PitchingPA
      const n = (kind: string) => s.moves.filter((m) => m.kind === kind).length
      return p.cs <= n('cs') && p.pk <= n('pk') && p.sba <= n('sb')
    }
    if (people.has(s.index)) return true
    const b = x as BattingPA
    const n = (kind: string) => all.filter((m) => m.row === s.index && m.kind === kind).length
    return b.sb <= n('sb') && b.cs <= n('cs')
  })
  const trusted = recorded && halfAddsUp
  // someone who stood further on after his own result than it put him, with no play to say why: a steal, wild pitch…
  // the rows did not keep (it may be the very play his count is for)
  const unrecordedAdvance = (row: number) => steps.some((s) => {
    if (s.index !== row || s === st || isPlaced(rows[row])) return false
    const e = resultEnd(s)
    return typeof s.batter === 'number' && typeof e === 'number' && s.batter > e
  })
  const sure = (row: number, out: boolean) => row === k && (side === 'bat' || (out && walk))
  const may = (row: number, out: boolean) => sure(row, out) || (trusted && !unrecordedAdvance(row))
  const used = new Map<string, number>()
  const take = (row: number, kinds: string[]): string | null => {
    for (const kind of kinds) {
      if (side === 'pit') { if ((pool[kind] ?? 0) > 0) { pool[kind]--; return kind } continue }
      const b = rows[row] as BattingPA
      const moved = all.filter((m) => m.row === row && m.kind === kind).length + (used.get(`${row}${kind}`) ?? 0)
      // 壘上出局 / 牽制: the batter's own out on the result never counts there, a runner's out on the play does —
      // except after a walk, which puts nobody out
      const outs = row === k || walk
      const have = kind === 'cs' ? b.cs : kind === 'sb' ? b.sb : !outs ? 0 : kind === 'out' ? b.baserunningOuts ?? 0 : kind === 'pk' ? b.outOnBase - (b.baserunningOuts ?? 0) : 0
      if (have > moved) { used.set(`${row}${kind}`, (used.get(`${row}${kind}`) ?? 0) + 1); return kind }
    }
    return null
  }
  const rb = resultEnd(st)
  const end = (row: number): End => (row === k ? st.batter : st.dest[row])
  // lead runner first, the batter last
  const order = [...midOf(st).map((o) => ({ row: o.row, base: o.base as number })), { row: k, base: 0 }]
  const canBeTail = (row: number) => row !== k || (typeof rb === 'number' && (st.batter === 'out' || st.batter === 'home'))
  const tailOut: Array<{ row: number; kind: string }> = []
  // the last outs, as long as each has a count of its own
  for (const row of [...st.outs].reverse()) {
    const kind = canBeTail(row) && may(row, true) ? take(row, ['cs', 'pk', 'out']) : null
    if (!kind) break
    tailOut.unshift({ row, kind })
  }
  const tailRun: Array<{ row: number; kind: string }> = []
  // the trailing runs (the lead runner scored first), while the result left fewer than three out
  const outsLeft = (r.outsBefore ?? 0) + st.outs.length - tailOut.length
  for (const p of outsLeft >= 3 ? [] : [...order].reverse()) {
    if (end(p.row) !== 'home') continue
    const kind = !canBeTail(p.row) ? null : (may(p.row, false) ? take(p.row, ['sb', 'wp', 'pb']) : null) ?? (balks > 0 ? (balks--, 'bk') : null)
    if (!kind) break
    tailRun.unshift({ row: p.row, kind })
  }
  if (!tailOut.length && !tailRun.length) return null
  // where everyone stood after the result, trailing first: the batter where his result put him, a runner where he
  // was, each pushed on by whoever came up behind him (the half's last runners left on base were only placed by
  // leftEnds, which did not know the batter stood on base)
  const tail = new Set([...tailOut, ...tailRun].map((t) => t.row))
  const pos = new Map<number, number>()
  let behind = 0
  for (const p of [...order].reverse()) {
    const e = end(p.row)
    if (!tail.has(p.row) && typeof e !== 'number') { if (e === 'home') behind = 4; continue }
    const b = tail.has(p.row) ? (p.row === k ? (rb as number) : Math.max(p.base, behind + 1)) : Math.max(e as number, behind + 1)
    if (b <= behind || b >= 4) return null
    pos.set(p.row, b)
    behind = b
  }
  const dest = { ...st.dest }
  for (const [row, b] of pos) if (row !== k) dest[row] = b as Base
  const step: Step = { ...st, dest, batter: tail.has(k) ? (pos.get(k) as Base) : st.batter, outs: st.outs.filter((row) => !tail.has(row)) }
  const move = (t: { row: number; kind: string }, to: End): Move => ({ at: r.pitches.length, kind: t.kind, row: t.row, from: pos.get(t.row) as Base, to })
  return { step, tail: [...tailRun.map((t) => move(t, 'home')), ...tailOut.map((t) => move(t, 'out'))] }
}

/** Every chart and table of these numbers says so (the 勝率 of the site is 勝÷(勝+敗); this is not a forecast). */
export const WPA_DISCLAIMER = '描述這場發生了什麼，不代表預測能力'

export type EventKind = 'pa' | 'play' | 'fix' | 'end'
export type Credit =
  | { kind: 'batter' | 'runner' | 'pitcher'; name: string; row: number }
  | { kind: 'team' }
  | { kind: 'none' }

export interface GameEvent {
  kind: EventKind
  /** who was batting: 'bat' = us, 'pit' = the opponent (our pitching rows) */
  side: Side
  inning: number
  half: HalfName
  /** the plate appearance it happened in (index in this game's rows of `side`); −1 for 'fix' / 'end' */
  row: number
  /** 'play': the runner play (its row is the runner's) */
  move?: Move
  /** base-out states (END = 24 after the third out) */
  from: number
  to: number
  runs: number
  /** score before and after (us, them) */
  us: number
  opp: number
  usAfter: number
  oppAfter: number
  /** our win probability before / after, and the change */
  weBefore: number
  weAfter: number
  wpa: number
  /** run expectancy added, from the offense's side (0 for 'fix' / 'end') */
  re24: number
  /** leverage of the plate appearance it belongs to (1 = average); 0 for 'fix' / 'end' */
  li: number
  approx: boolean
  credit: Credit
  /** 'fix' / 'end': what it is */
  note?: string
  /** first event of its half-inning */
  halfStart?: boolean
}

/** What one plate appearance did to our win probability. */
export interface RowWin {
  /** the result (credited to the batter / our pitcher) */
  wpa: number
  re24: number
  li: number
  /** when the batter came up, right before his result (after the runner plays during his pitches), after his
   *  result, and after the plays that followed it when the half ended before the next batter finished (splitTail) */
  weBefore: number
  weResult: number
  weAfter: number
  weEnd: number
  /** runner plays during his pitches and after his result (any runner) */
  runWpa: number
  runRe24: number
  approx: boolean
}

export interface WinCoverage {
  /** games with events */
  games: number
  /** plate appearances with a value, and how many of them lie in a half laid out from the results */
  pas: number
  approxPas: number
  /** real (non-demo) games and plate appearances the model was built from */
  trainGames: number
  trainPas: number
}

export interface WinData {
  model: WinModel
  rules: WinRules
  /** mean raw leverage over every real plate appearance (LI = raw ÷ this) */
  liMean: number
  events: Map<string, GameEvent[]>
  /** half-innings of each game laid out from the results */
  approxHalves: Map<string, number>
  bat: Map<BattingPA, RowWin>
  pit: Map<PitchingPA, RowWin>
  /** our runners' own plays (盜壘, 盜壘失敗, 牽制出局, 壘死), by the row he reached on (credited to runner ?? batter) */
  runner: Map<BattingPA, { wpa: number; re24: number }>
  coverage: WinCoverage
}

const RUNNER_PLAYS = new Set(['sb', ...OUT_PLAYS])
const EPS = 1e-12

interface HalfInfo { inning: number; half: HalfName; side: Side; idx: number[]; steps: Step[]; approx: boolean; /** runner plays after the last result (splitTail) */ tail: Move[] }
interface GameInfo { game: Game; bat: BattingPA[]; pit: PitchingPA[]; halves: HalfInfo[]; lineUs: number[]; lineOpp: number[]; result: number }

/** Mask after a runner play from `s`. */
function applyMove(outs: number, bases: number, m: Move): { outs: number; bases: number; runs: number } {
  const without = bases & ~(1 << (m.from - 1))
  if (m.to === 'out') return { outs: outs + 1, bases: without, runs: 0 }
  if (m.to === 'home') return { outs, bases: without, runs: 1 }
  return { outs, bases: without | (1 << (m.to - 1)), runs: 0 }
}

/** The plate appearance's start: outs before his runner plays, the runners he came up with. */
function stepStart(st: Step, r: Row, approxOuts: number | null): number {
  const outs = approxOuts ?? Math.max(0, (r.outsBefore ?? 0) - st.moves.filter((m) => m.to === 'out').length)
  return stateOf(Math.min(2, outs), basesMask(st.before))
}

/** Advancement facts for the training data, read from where everyone ended. */
function advFacts(st: Step, r: Row): Partial<Record<AdvKey, boolean>> {
  const f: Partial<Record<AdvKey, boolean>> = {}
  if (st.before.length) {
    f.runnerPlay = st.moves.some((m) => m.to !== 'out')
    f.runnerOut = st.moves.some((m) => m.to === 'out')
  }
  const mid = midOf(st)
  const on = (b: number) => mid.find((o) => o.base === b)
  const cls = resultClass(r.result)
  const outsAt = r.outsBefore ?? 0
  if (cls === '1B') {
    const r2 = on(2), r1 = on(1)
    if (r2) f.single2H = st.dest[r2.row] === 'home'
    if (r1 && (!r2 || st.dest[r2.row] !== 3)) f.single13 = st.dest[r1.row] === 3 || st.dest[r1.row] === 'home'
  } else if (cls === '2B') {
    const r1 = on(1)
    if (r1) f.double1H = st.dest[r1.row] === 'home'
  } else if (cls === 'OUT' && outsAt < 2) {
    const dp = st.outs.length >= 2
    if (on(1)) f.dp = dp
    if (mid.length && !dp) f.outAdvance = mid.some((o) => { const d = st.dest[o.row]; return d === 'home' || (typeof d === 'number' && d > o.base) })
  }
  return f
}

/** Group a dataset's rows by game, in order. */
function byGame<T extends { gameId: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) (m.get(r.gameId) ?? m.set(r.gameId, []).get(r.gameId)!).push(r)
  return m
}

function readGame(game: Game, bat: BattingPA[], pit: PitchingPA[]): GameInfo {
  const sum = summarizeGame({ roster: [], games: [game], batting: bat, pitching: pit, fielding: [] }, game)
  const weBatTop = game.homeAway === '客'
  const sides = { bat: inningsOf(bat), pit: inningsOf(pit) }
  const last = Math.max(0, ...sides.bat.keys(), ...sides.pit.keys())
  const halves: HalfInfo[] = []
  for (let i = 1; i <= last; i++) {
    for (const half of ['top', 'bottom'] as const) {
      const side: Side = (half === 'top') === weBatTop ? 'bat' : 'pit'
      const idx = sides[side].get(i)
      if (!idx?.length) continue
      const rows: Row[] = side === 'bat' ? bat : pit
      const { half: h, approx } = halfSteps(rows, idx, side)
      const split = approx ? null : splitTail(rows, h.steps, side)
      halves.push({ inning: i, half, side, idx, steps: split ? [...h.steps.slice(0, -1), split.step] : h.steps, approx, tail: split?.tail ?? [] })
    }
  }
  return { game, bat, pit, halves, lineUs: sum.lineUs, lineOpp: sum.lineOpp, result: sum.result === 'W' ? 1 : sum.result === 'L' ? 0 : 0.5 }
}

/** Training plate appearances of one game: followed halves only, both offenses, real plate appearances. */
function gameSamples(g: GameInfo, nextHalf: () => number): PaSample[] {
  const out: PaSample[] = []
  for (const h of g.halves) {
    if (h.approx) continue
    const rows: Row[] = h.side === 'bat' ? g.bat : g.pit
    const id = nextHalf()
    for (const st of h.steps) {
      const r = rows[st.index]
      if (!isPA(r)) continue
      const from = stepStart(st, r, null)
      const moveRuns = st.moves.filter((m) => m.to === 'home').length
      const to = stateOf((r.outsBefore ?? 0) + st.outs.length, basesMask(stepAfter(st)))
      out.push({ from, to, runs: moveRuns + homesIn(st), cls: resultClass(r.result), adv: advFacts(st, r), half: id })
    }
  }
  return out
}

const OUR = (home: boolean, w: number) => (home ? w : 1 - w)

/** Events of one game (li still raw), plus the raw leverage at each real plate appearance's start. */
function gameEvents(g: GameInfo, model: WinModel): { events: GameEvent[]; liStarts: number[]; approxHalves: number } {
  const home = g.game.homeAway === '主'
  const events: GameEvent[] = []
  const liStarts: number[] = []
  const re = model.run.re
  let cur: number | null = null
  let us = 0, opp = 0
  const lineBefore = (inning: number, half: HalfName) => {
    let u = 0, o = 0
    for (let k = 0; k < inning - 1; k++) { u += g.lineUs[k] ?? 0; o += g.lineOpp[k] ?? 0 }
    if (half === 'bottom') { if (g.game.homeAway === '主') o += g.lineOpp[inning - 1] ?? 0; else u += g.lineUs[inning - 1] ?? 0 }
    return { u, o }
  }
  const homeDiff = () => (home ? us - opp : opp - us)
  /** a correction from where we are to `target` (no player's) */
  // the first event of each half carries halfStart (the chart's half-inning lines)
  let marked = false
  const fix = (h: HalfInfo, state: number, target: number, note: string, extra?: Partial<GameEvent>) => {
    const was = cur ?? target
    events.push({
      kind: 'fix', side: h.side, inning: h.inning, half: h.half, row: -1, from: state, to: state, runs: 0, us: extra?.us ?? us, opp: extra?.opp ?? opp, usAfter: us, oppAfter: opp,
      weBefore: was, weAfter: target, wpa: target - was, re24: 0, li: 0, approx: h.approx, credit: { kind: 'none' }, note, ...(marked ? {} : { halfStart: true }),
    })
    marked = true
    cur = target
  }
  let approxHalves = 0
  for (const h of g.halves) {
    if (h.approx) approxHalves++
    const rows: Row[] = h.side === 'bat' ? g.bat : g.pit
    const line = lineBefore(h.inning, h.half)
    us = line.u; opp = line.o
    let first = true
    marked = false
    let state = 0
    let outsCum = 0
    let halfRuns = 0
    const placed = h.idx.some((i) => isPlaced(rows[i]))
    for (const st of h.steps) {
      const r = rows[st.index]
      if (!isPA(r)) continue
      const from = stepStart(st, r, h.approx ? outsCum : null)
      const d0 = homeDiff()
      const natural = OUR(home, model.we(h.inning, h.half, from, d0))
      if (first) {
        if (cur !== null && Math.abs(natural - cur) > EPS) fix(h, from, natural, placed ? '突破僵局：壘上有人開始這個半局' : '依局分表與局面接續')
        else if (cur === null) cur = natural
        first = false
      } else if (cur !== null && Math.abs(natural - cur) > 1e-9) fix(h, from, natural, '依局分表與局面接續')
      const liRaw = model.liRaw(h.inning, h.half, from, d0)
      liStarts.push(liRaw)
      state = from
      const credit = (m?: Move): Credit => {
        if (h.side === 'pit') return { kind: 'pitcher', name: (r as PitchingPA).pitcher, row: st.index }
        if (!m) return { kind: 'batter', name: (r as BattingPA).batter, row: st.index }
        if (!RUNNER_PLAYS.has(m.kind)) return { kind: 'team' }
        const rr = rows[m.row] as BattingPA | undefined
        return rr ? { kind: 'runner', name: rr.runner || rr.batter, row: m.row } : { kind: 'team' }
      }
      const push = (kind: 'pa' | 'play', to: number, runs: number, m?: Move) => {
        const usB = us, oppB = opp
        if (h.side === 'bat') us += runs; else opp += runs
        halfRuns += runs
        const before = cur!
        const afterW = OUR(home, model.after(h.inning, h.half, to, homeDiff()))
        const e: GameEvent = {
          kind, side: h.side, inning: h.inning, half: h.half, row: st.index, from: state, to, runs, us: usB, opp: oppB, usAfter: us, oppAfter: opp,
          weBefore: before, weAfter: afterW, wpa: afterW - before, re24: (to >= END ? 0 : re[to]) - re[state] + runs, li: liRaw, approx: h.approx, credit: credit(m),
        }
        if (m) e.move = m
        if (!marked) e.halfStart = true
        events.push(e)
        marked = true
        cur = afterW
        state = to
      }
      let o = Math.floor(from / 8), b = from % 8
      if (!h.approx) {
        for (const m of st.moves) {
          const next = applyMove(o, b, m)
          o = next.outs; b = next.bases
          push('play', stateOf(o, b), next.runs, m)
          if (state >= END) break
        }
      }
      if (state >= END) continue
      const outs1 = (h.approx ? Math.min(2, outsCum) : (r.outsBefore ?? 0)) + st.outs.length
      outsCum = outs1
      push('pa', stateOf(outs1, basesMask(stepAfter(st))), homesIn(st))
      // plays after the half's last result (splitTail): the runner's, not the batter's
      if (st === h.steps[h.steps.length - 1]) {
        for (const m of h.tail) {
          if (state >= END) break
          const next = applyMove(Math.floor(state / 8), state % 8, m)
          push('play', stateOf(next.outs, next.bases), next.runs, m)
        }
      }
    }
    // the half's runs as the line score has them
    const want = h.side === 'bat' ? g.lineUs[h.inning - 1] ?? 0 : g.lineOpp[h.inning - 1] ?? 0
    if (want !== halfRuns && cur !== null) {
      const usB = us, oppB = opp
      if (h.side === 'bat') us += want - halfRuns; else opp += want - halfRuns
      fix(h, state, OUR(home, model.after(h.inning, h.half, state, homeDiff())), '依局分表校正比分', { us: usB, opp: oppB })
    }
  }
  // the last value is the result: a rounding hair is taken off the last event, anything more is an 'end' point
  const lastEv = events[events.length - 1]
  if (lastEv && cur !== null && cur !== g.result && Math.abs(cur - g.result) <= 1e-9) { lastEv.weAfter = g.result; lastEv.wpa = g.result - lastEv.weBefore; cur = g.result }
  if (cur !== null && Math.abs(cur - g.result) > 1e-9) {
    const last = events[events.length - 1]
    events.push({
      kind: 'end', side: last.side, inning: last.inning, half: last.half, row: -1, from: last.to, to: last.to, runs: 0, us: last.usAfter, opp: last.oppAfter, usAfter: last.usAfter, oppAfter: last.oppAfter,
      weBefore: cur, weAfter: g.result, wpa: g.result - cur, re24: 0, li: 0, approx: false, credit: { kind: 'none' }, note: '比賽結束（提前結束或時間到）',
    })
  }
  return { events, liStarts, approxHalves }
}

/** Every training plate appearance of a dataset (real games, followed halves, both offenses). */
export function paTransitions(ds: Dataset): PaSample[] {
  const bat = byGame(ds.batting), pit = byGame(ds.pitching)
  let id = 0
  const out: PaSample[] = []
  for (const g of ds.games) {
    if (g.isDemo || g.status) continue
    out.push(...gameSamples(readGame(g, bat.get(g.id) ?? [], pit.get(g.id) ?? []), () => id++))
  }
  return out
}

const cache = new WeakMap<Dataset, Map<string, WinData>>()
const rulesKey = (r: WinRules) => `${r.innings}|${r.tiebreakFrom ?? ''}|${r.tiebreakBases.join('')}`

/** The model and every game's events, cached per Dataset object (effectiveDataset keeps it stable until a save). */
export function buildWinData(ds: Dataset, rules: WinRules): WinData {
  const key = rulesKey(rules)
  const hit = cache.get(ds)?.get(key)
  if (hit) return hit
  const batBy = byGame(ds.batting), pitBy = byGame(ds.pitching)
  const games = ds.games.filter((g) => !g.status).map((g) => readGame(g, batBy.get(g.id) ?? [], pitBy.get(g.id) ?? []))
  let id = 0
  const samples: PaSample[] = []
  let trainGames = 0
  for (const g of games) {
    if (g.game.isDemo) continue
    const s = gameSamples(g, () => id++)
    if (s.length) trainGames++
    samples.push(...s)
  }
  const model = buildWinModel(buildRunModel(samples), rules)
  const perGame = games.map((g) => ({ g, ...gameEvents(g, model) }))
  const real = perGame.filter((x) => !x.g.game.isDemo).flatMap((x) => x.liStarts)
  const pool = real.length ? real : perGame.flatMap((x) => x.liStarts)
  const mean = pool.length ? pool.reduce((a, b) => a + b, 0) / pool.length : 0
  const liMean = mean > 0 ? mean : 1
  const events = new Map<string, GameEvent[]>()
  const approxHalves = new Map<string, number>()
  const bat = new Map<BattingPA, RowWin>(), pit = new Map<PitchingPA, RowWin>()
  const runner = new Map<BattingPA, { wpa: number; re24: number }>()
  let pas = 0, approxPas = 0
  for (const { g, events: evs, approxHalves: k } of perGame) {
    for (const e of evs) if (e.li) e.li /= liMean
    events.set(g.game.id, evs)
    approxHalves.set(g.game.id, k)
    const rowWin = (e: GameEvent): RowWin | undefined => {
      const rows: Row[] = e.side === 'bat' ? g.bat : g.pit
      const r = rows[e.row]
      if (!r) return undefined
      const m = (e.side === 'bat' ? bat : pit) as Map<Row, RowWin>
      let w = m.get(r)
      if (!w) { w = { wpa: 0, re24: 0, li: e.li, weBefore: e.weBefore, weResult: e.weBefore, weAfter: e.weAfter, weEnd: e.weAfter, runWpa: 0, runRe24: 0, approx: e.approx }; m.set(r, w) }
      return w
    }
    for (const e of evs) {
      if (e.kind !== 'pa' && e.kind !== 'play') continue
      const w = rowWin(e)
      if (!w) continue
      // our pitcher's runs saved are the offense's runs added, turned around
      const re = e.side === 'pit' ? -e.re24 : e.re24
      w.weEnd = e.weAfter
      if (e.kind === 'pa') { w.wpa = e.wpa; w.re24 = re; w.weResult = e.weBefore; w.weAfter = e.weAfter; pas++; if (e.approx) approxPas++ }
      else {
        w.runWpa += e.wpa; w.runRe24 += re
        if (e.credit.kind === 'runner') {
          const rr = g.bat[e.credit.row]
          if (rr) { const c = runner.get(rr) ?? { wpa: 0, re24: 0 }; c.wpa += e.wpa; c.re24 += e.re24; runner.set(rr, c) }
        }
      }
    }
  }
  const data: WinData = {
    model, rules, liMean, events, approxHalves, bat, pit, runner,
    coverage: { games: perGame.filter((x) => x.events.length).length, pas, approxPas, trainGames, trainPas: samples.length },
  }
  const m = cache.get(ds) ?? new Map<string, WinData>()
  m.set(key, data)
  cache.set(ds, m)
  return data
}

/** Batting lines with WPA / RE24 filled in from these plate appearances (result → batter, own runner plays → runner). */
export function withWinBatting(lines: BattingLine[], pas: BattingPA[], win: WinData): BattingLine[] {
  const acc = new Map<string, { wpa: number; re24: number }>()
  const add = (name: string, wpa: number, re24: number) => { if (!name) return; const a = acc.get(name) ?? { wpa: 0, re24: 0 }; a.wpa += wpa; a.re24 += re24; acc.set(name, a) }
  for (const pa of pas) {
    const w = win.bat.get(pa)
    if (w) add(pa.batter, w.wpa, w.re24)
    const r = win.runner.get(pa)
    if (r) add(pa.runner && pa.runner !== pa.batter ? pa.runner : pa.batter, r.wpa, r.re24)
  }
  return lines.map((l) => { const a = acc.get(l.name); return a ? { ...l, wpa: a.wpa, re24: a.re24 } : l })
}

/** Pitching lines with WPA / RE24: everything that happened while each pitcher was on the mound (positive = good). */
export function withWinPitching(lines: PitchingLine[], pas: PitchingPA[], win: WinData): PitchingLine[] {
  const acc = new Map<string, { wpa: number; re24: number }>()
  for (const pa of pas) {
    const w = win.pit.get(pa)
    if (!w || !pa.pitcher) continue
    const a = acc.get(pa.pitcher) ?? { wpa: 0, re24: 0 }
    a.wpa += w.wpa + w.runWpa; a.re24 += w.re24 + w.runRe24
    acc.set(pa.pitcher, a)
  }
  return lines.map((l) => { const a = acc.get(l.name); return a ? { ...l, wpa: a.wpa, re24: a.re24 } : l })
}

export interface TeamWin { wpa: number | null; re24: number | null; pas: number; approxPas: number }
/** The 球隊合計 of withWinBatting: every player's share added up (team-only runner plays are nobody's). */
export function teamWinBatting(pas: BattingPA[], win: WinData): TeamWin {
  let wpa = 0, re24 = 0, n = 0, approx = 0
  for (const pa of pas) {
    const w = win.bat.get(pa)
    if (w) { wpa += w.wpa; re24 += w.re24; n++; if (w.approx) approx++ }
    const r = win.runner.get(pa)
    if (r) { wpa += r.wpa; re24 += r.re24 }
  }
  return n ? { wpa, re24, pas: n, approxPas: approx } : { wpa: null, re24: null, pas: 0, approxPas: 0 }
}
export function teamWinPitching(pas: PitchingPA[], win: WinData): TeamWin {
  let wpa = 0, re24 = 0, n = 0, approx = 0
  for (const pa of pas) {
    const w = win.pit.get(pa)
    if (!w) continue
    wpa += w.wpa + w.runWpa; re24 += w.re24 + w.runRe24; n++
    if (w.approx) approx++
  }
  return n ? { wpa, re24, pas: n, approxPas: approx } : { wpa: null, re24: null, pas: 0, approxPas: 0 }
}

/** This game's rows → their RowWin, by row index (for the 逐球 tables). */
export function rowWins<T extends Row>(rows: T[], map: Map<T, RowWin>): Map<number, RowWin> {
  const out = new Map<number, RowWin>()
  rows.forEach((r, i) => { const w = map.get(r); if (w) out.set(i, w) })
  return out
}

/** The n plate appearances that moved our win probability most (ties: the earlier first). */
export function keyPlays(events: GameEvent[], n = 5): GameEvent[] {
  return events.map((e, i) => ({ e, i })).filter(({ e }) => e.kind === 'pa').sort((a, z) => Math.abs(z.e.wpa) - Math.abs(a.e.wpa) || a.i - z.i).slice(0, n).map(({ e }) => e)
}
/** Row indexes of the key plays, per side (for the 逐球 filter's 關鍵打席 chip). */
export function keyRowSets(plays: GameEvent[]): { bat: Set<number>; pit: Set<number> } {
  return { bat: new Set(plays.filter((e) => e.side === 'bat').map((e) => e.row)), pit: new Set(plays.filter((e) => e.side === 'pit').map((e) => e.row)) }
}

/** 「第 5 局下・1 出局・一、三壘・3:4 落後」 (our score first). */
export function situationText(e: Pick<GameEvent, 'inning' | 'half' | 'from' | 'us' | 'opp'>, _weAreHome?: boolean): string {
  const outs = e.from >= END ? 3 : Math.floor(e.from / 8)
  const bases = e.from >= END ? 0 : e.from % 8
  const B = ['壘上無人', '一壘', '二壘', '一、二壘', '三壘', '一、三壘', '二、三壘', '滿壘']
  const lead = e.us > e.opp ? '領先' : e.us < e.opp ? '落後' : '平手'
  return `第 ${e.inning} 局${e.half === 'top' ? '上' : '下'}・${outs} 出局・${B[bases]}・${e.us}:${e.opp} ${lead}`
}

/**
 * What happened, in words: 「陳大文 二安（1 分打點）」「對方第 4 棒 王 全壘打（投手 林小華）」「李大同 盜壘 2B→3B」.
 * `count` puts the count before the result's pitch in front of it: 「陳大文 1-1 後 二安（1 分打點）」.
 */
export function eventText(e: GameEvent, rows: { bat: BattingPA[]; pit: PitchingPA[] }, opts: { count?: boolean } = {}): string {
  const res = (r: Row) => [opts.count ? countBeforeText(r) : '', r.result].filter(Boolean).join(' ')
  if (e.kind === 'fix' || e.kind === 'end') return e.note ?? ''
  if (e.side === 'bat') {
    if (e.kind === 'play' && e.move) {
      const rr = rows.bat[e.move.row]
      return `${rr ? rr.runner || rr.batter : '跑者'} ${playText(e.move)}`.trim()
    }
    const r = rows.bat[e.row]
    return r ? `${r.batter} ${res(r)}${r.rbi ? `（${r.rbi} 分打點）` : ''}` : ''
  }
  const r = rows.pit[e.row]
  if (!r) return ''
  const who = (p?: PitchingPA) => (p ? `對方${p.oppOrder ? `第 ${p.oppOrder} 棒` : '打者'}${p.oppBatter ? ` ${p.oppBatter}` : ''}` : '對方跑者')
  if (e.kind === 'play' && e.move) return `${who(rows.pit[e.move.row])} ${playText(e.move)}（投手 ${r.pitcher}）`
  return `${who(r)} ${res(r)}（投手 ${r.pitcher}）`
}
