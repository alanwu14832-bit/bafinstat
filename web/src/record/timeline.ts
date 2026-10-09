/**
 * Who was on base during each plate appearance, rebuilt from the saved rows, and the way back.
 *
 * A row keeps totals for the runner who reached on it (盜壘 1, 得分 1, code R / L / out) but not *when* he moved, so
 * the editor could only list everyone who had reached earlier in the inning. Rows recorded with 壘上(前) and
 * 出局(前) on every plate appearance (everything 紀錄比賽 writes) pin it down: runners never pass each other, the
 * bases before the next batter say how many are still on, an out code says in which plate appearance that runner
 * was put out, and the lead runners are the ones who scored. `inferHalf` turns an inning into steps — the runners
 * on base when each batter came up and where each of them (and the batter) was when the plate appearance ended —
 * and `deriveHalf` writes edited steps back: 壘上(前), 出局(前), runs, and the R / L / out codes, recomputed.
 * An inning that cannot be followed (older imports without 壘上(前), inconsistent rows) gives null, and the
 * editor falls back to the per-row totals.
 *
 * 逐球跑壘: a row may also carry `events`, the runner plays during its own pitches (第 2 球暴投 1B→2B, 第 3 球盜壘
 * 2B→3B), in order. Its 壘上(前) / 出局(前) are taken when the ball was put in play, i.e. after those plays, so the
 * step keeps them as `moves` between the runners the batter came up with (`before`) and the ones still there for
 * his result (`midOf`). Rows without events fold any such play into the plate appearance before, as before.
 *
 * 突破僵局: a runner the tie-break rule put on base is a row (result 突破僵局) before the inning's first plate
 * appearance, lead runner first; his step puts him on his base (`placedBases`) and moves nobody.
 */
import { HIT_BASE_COUNT, isDouble, isPlaced, type BattingPA, type PitchingPA, type PlayEvent } from '../data/types'

export type Side = 'bat' | 'pit'
export type Base = 1 | 2 | 3
/** Where someone was when the plate appearance ended. */
export type End = Base | 'home' | 'out'
export interface OnBase { row: number; base: Base }
/** A runner play between pitches: after `at` pitches of this plate appearance (0 = before the first one). */
export interface Move { at: number; kind: string; row: number; from: Base; to: End }
export interface Step {
  /** index of the plate appearance in the side's rows */
  index: number
  /** runners on base when this batter came up, lead runner first */
  before: OnBase[]
  /** runner plays during his pitches, in order (steals, wild pitches, pickoffs…) */
  moves: Move[]
  /** where each runner still on base for the result (midOf) was at the end of this plate appearance (by row) */
  dest: Record<number, End>
  /** the batter at the end of his plate appearance */
  batter: End
  /** rows put out in this step, in the order the outs happened (a runner caught stealing during the next batter's
   *  pitches is saved in this step, after the batter's own out) */
  outs: number[]
}
export interface Half { inning: number; steps: Step[] }

type Row = BattingPA | PitchingPA
const OUT_CODES: Record<string, number> = { I: 1, II: 2, III: 3 }
const ROMAN = ['I', 'II', 'III'] as const
const outNo = (r: Row) => OUT_CODES[r.code ?? ''] ?? 0
export const scored = (r: Row, side: Side) => (side === 'bat' ? (r as BattingPA).run > 0 : r.code === 'R' || r.code === 'ER')
const parseBases = (b?: string): Base[] => [...new Set((b ?? '').split('').filter((c) => c === '1' || c === '2' || c === '3').map(Number) as Base[])].sort((a, z) => z - a)
const basesText = (on: OnBase[]) => on.map((o) => o.base).sort((a, z) => a - z).join('') || '無'
/** Base a batter who was not out stands on after his result, before anyone else moves (a home run is home). */
function hitBase(result: string): End {
  if (isDouble(result)) return 2
  if (result === '三安') return 3
  if (result === '全壘打') return 'home'
  return 1
}

/**
 * The inning's last plate appearance has no next one to tell where the runners left on base ended. They end where
 * the marks on the batted ball say (進壘, or 趁傳／失誤進壘), else where they stood — pushed on only by the person
 * behind them (the batter reaching first moves the man on first to second). `left` is lead runner first.
 */
export function leftEnds(left: Array<{ row: number; base: number }>, batter: { row: number; base: number } | null, plays: PlayEvent[]): Map<number, number> {
  const end = new Map<number, number>()
  const marks = plays.filter((e) => e.play && typeof e.to === 'number')
  if (batter) {
    const m = marks.find((e) => e.batter)
    end.set(batter.row, m && (m.to as number) > batter.base ? (m.to as number) : batter.base)
  }
  const pool = marks.filter((e) => !e.batter)
  let ahead = 4
  for (const g of left) {
    // 進壘 marks start where he stood; 趁傳／失誤進壘 marks where the hit alone put him
    const fits = (e: PlayEvent) => (e.to as number) > g.base && (e.to as number) < ahead
    const m = pool.find((e) => e.kind === 'advance' && e.from === g.base && fits(e)) ?? pool.filter((e) => e.kind !== 'advance' && e.from >= g.base && fits(e)).sort((a, z) => (z.to as number) - (a.to as number))[0]
    if (m) pool.splice(pool.indexOf(m), 1)
    const b = m ? (m.to as number) : g.base
    end.set(g.row, b)
    ahead = b
  }
  // nobody shares a base with the person behind him
  let behind = batter ? end.get(batter.row)! : 0
  for (const g of [...left].reverse()) {
    const b = end.get(g.row)!
    if (b <= behind) end.set(g.row, Math.min(3, behind + 1))
    behind = end.get(g.row)!
  }
  return end
}

/**
 * 進壘 marks for the inning's last plate appearance: whoever was left on base somewhere `leftEnds` would not work out
 * by itself gets one (from where he stood, or for the batter from where his hit put him), so the next look at the
 * game finds him there again.
 */
export function leftMarks(mid: Array<{ row: number; base: number }>, dest: Record<number, End>, batter: { row: number; result: string; end: End; start?: number }, plays: PlayEvent[], at: number): PlayEvent[] {
  const left = mid.filter((o) => typeof dest[o.row] === 'number').sort((a, z) => z.base - a.base)
  // (a tie-break runner starts on the base he was put on)
  const start = batter.start ?? hitBase(batter.result)
  const bat = typeof batter.end === 'number' ? { row: batter.row, base: typeof start === 'number' ? start : 1 } : null
  const kept = plays.slice()
  const out: PlayEvent[] = []
  if (bat && batter.end !== leftEnds([], bat, kept).get(bat.row) && (batter.end as number) > bat.base) {
    const m: PlayEvent = { at, kind: 'advance', from: bat.base as Base, to: batter.end as Base, play: true, batter: true }
    out.push(m); kept.push(m)
  }
  for (const o of left) {
    const ends = leftEnds(left, bat, kept)
    const want = dest[o.row] as number
    if (ends.get(o.row) !== want && want > o.base) { const m: PlayEvent = { at, kind: 'advance', from: o.base as Base, to: want as Base, play: true }; out.push(m); kept.push(m) }
  }
  return out
}

/** Rows of each inning, in order (indexes into `rows`). */
export function inningsOf(rows: Row[]): Map<number, number[]> {
  const m = new Map<number, number[]>()
  rows.forEach((r, i) => m.set(r.inning, [...(m.get(r.inning) ?? []), i]))
  return m
}

// plays between pitches only: 趁傳進壘 on the batted ball (`play`) is part of where people ended, not a move before it
const eventsOf = (r: Row): PlayEvent[] => (r.events ?? []).filter((e) => e && !e.play && [1, 2, 3].includes(e.from))
const moveOuts = (r: Row) => eventsOf(r).filter((e) => e.to === 'out').length
/** Bases when the batter came up: his 壘上(前) (taken at the result) with his own runner plays undone; null if they do not fit. */
function startBases(r: Row): Base[] | null {
  const set = new Set<number>(parseBases(r.basesBefore))
  for (const e of [...eventsOf(r)].reverse()) {
    if (typeof e.to === 'number') { if (!set.has(e.to)) return null; set.delete(e.to) }
    if (set.has(e.from)) return null
    set.add(e.from)
  }
  return ([...set] as Base[]).sort((a, z) => z - a)
}
const startOuts = (r: Row) => r.outsBefore! - moveOuts(r)

/** Where the tie-break rule puts 1, 2 or 3 runners when nothing else tells: 2B; 2B and 1B; 3B, 2B and 1B. */
const PLACED_LAYOUT: Record<number, Base[]> = { 1: [2], 2: [2, 1], 3: [3, 2, 1] }
/**
 * The base each tie-break runner of an inning was put on (by row), lead runner first. It is not stored: it is the
 * next real batter's 壘上(前) with his own runner plays undone, when that has as many runners as were placed; else
 * (nobody batted, or the bases do not fit) the usual layout.
 */
export function placedBases(rows: Row[], idx: number[]): Record<number, Base> {
  const placed = idx.filter((i) => rows[i] && isPlaced(rows[i]))
  if (!placed.length) return {}
  const next = idx.find((i) => rows[i] && !isPlaced(rows[i]))
  const fromNext = next === undefined || !rows[next].basesBefore ? null : startBases(rows[next])
  const bases = fromNext && fromNext.length === placed.length ? fromNext : PLACED_LAYOUT[placed.length] ?? PLACED_LAYOUT[3]
  const out: Record<number, Base> = {}
  placed.forEach((row, i) => { out[row] = bases[Math.min(i, bases.length - 1)] })
  return out
}

/** Rebuild one inning; null when its rows do not say enough (or do not add up). */
export function inferHalf(rows: Row[], idx: number[], side: Side): Half | null {
  if (!idx.length || idx.some((i) => !rows[i].basesBefore || rows[i].outsBefore === undefined)) return null
  const steps: Step[] = []
  let on: OnBase[] = []
  for (let n = 0; n < idx.length; n++) {
    const k = idx[n], r = rows[k]
    const start = startBases(r)
    if (!start || start.join() !== on.map((o) => o.base).join()) return null
    // this batter's runner plays, one by one; an out on one is the next out of the inning
    let o = startOuts(r)
    if (o < 0) return null
    const moves: Move[] = []
    let mid = on.slice()
    for (const e of eventsOf(r)) {
      const who = mid.find((x) => x.base === e.from)
      if (!who) return null
      mid = mid.filter((x) => x !== who)
      if (e.to === 'out') { o++; if (outNo(rows[who.row]) !== o) return null }
      else if (e.to === 'home') { if (!scored(rows[who.row], side)) return null }
      else { if (e.to <= e.from || mid.some((x) => x.base === e.to)) return null; mid.push({ row: who.row, base: e.to }) }
      moves.push({ at: e.at, kind: e.kind, row: who.row, from: e.from, to: e.to })
    }
    mid.sort((a, z) => z.base - a.base)
    const lo = r.outsBefore!
    if (o !== lo) return null
    const last = n === idx.length - 1
    const hi = last ? Math.max(lo, ...idx.map((i) => outNo(rows[i]))) : startOuts(rows[idx[n + 1]])
    if (hi < lo) return null
    const outHere = (x: Row) => { const v = outNo(x); return v > lo && v <= hi }
    const dest: Record<number, End> = {}
    let batter: End
    // who is still running after this plate appearance: runners lead first, then the batter
    const going: Array<{ row: number; base: number }> = []
    for (const m of mid) { if (outHere(rows[m.row])) dest[m.row] = 'out'; else going.push({ row: m.row, base: m.base }) }
    if (outHere(r)) batter = 'out'
    else {
      batter = hitBase(r.result)
      if (batter !== 'home') going.push({ row: k, base: 0 })
    }
    // outs in this window must be exactly the people marked out here
    const outCount = Object.values(dest).filter((d) => d === 'out').length + (batter === 'out' ? 1 : 0)
    if (outCount !== hi - lo) return null
    const next = last ? null : startBases(rows[idx[n + 1]])
    if (!last && !next) return null
    let stay: Array<{ row: number; base: number }>
    if (next) {
      const nScore = going.length - next.length
      if (nScore < 0) return null
      const scorers = going.slice(0, nScore)
      if (scorers.some((g) => !scored(rows[g.row], side))) return null
      for (const g of scorers) if (g.row === k) batter = 'home'; else dest[g.row] = 'home'
      stay = going.slice(nScore)
      const after: OnBase[] = []
      for (let i = 0; i < stay.length; i++) {
        const b = next[i]
        if (b < stay[i].base) return null
        if (stay[i].row === k) batter = b; else dest[stay[i].row] = b
        after.push({ row: stay[i].row, base: b })
      }
      steps.push({ index: k, before: on, moves, dest, batter, outs: [] })
      on = after
    } else {
      // the inning's last plate appearance: whoever scored did, the rest were left on base (see leftEnds)
      const left: Array<{ row: number; base: number }> = []
      let bat: { row: number; base: number } | null = null
      // (a tie-break runner with no batter after him: the base he was put on)
      if (isPlaced(r) && typeof batter === 'number') batter = placedBases(rows, idx)[k] ?? batter
      for (const g of going) {
        if (scored(rows[g.row], side)) { if (g.row === k) batter = 'home'; else dest[g.row] = 'home'; continue }
        if (g.row === k) bat = { row: k, base: typeof batter === 'number' ? batter : 1 }
        else left.push(g)
      }
      const ends = leftEnds(left, bat, r.events ?? [])
      const after: OnBase[] = []
      for (const g of [...left, ...(bat ? [bat] : [])]) {
        const b = ends.get(g.row)! as Base
        if (g.row === k) batter = b; else dest[g.row] = b
        after.push({ row: g.row, base: b })
      }
      steps.push({ index: k, before: on, moves, dest, batter, outs: [] })
      on = after
    }
    const st = steps[steps.length - 1]
    st.outs = [...Object.entries(dest).filter(([, d]) => d === 'out').map(([row]) => Number(row)), ...(batter === 'out' ? [k] : [])].sort((a, z) => outNo(rows[a]) - outNo(rows[z]))
    st.dest = dest
    st.batter = batter
  }
  return { inning: rows[idx[0]].inning, steps }
}

/** Runners on base for the result: the ones the batter came up with, after this plate appearance's runner plays. */
export function midOf(s: Pick<Step, 'before' | 'moves'>): OnBase[] {
  let on = s.before.slice()
  for (const m of s.moves ?? []) {
    if (!on.some((o) => o.row === m.row)) continue
    on = on.filter((o) => o.row !== m.row)
    if (typeof m.to === 'number') on.push({ row: m.row, base: m.to })
  }
  return on.sort((a, z) => z.base - a.base)
}
/** Outs in a step: the ones on runner plays during the plate appearance and the ones on its result. */
export const outsIn = (s: Step) => s.moves.filter((m) => m.to === 'out').length + s.outs.length

/** Runners on base when the plate appearance ended (lead first). */
export function stepAfter(s: Step): OnBase[] {
  const out: OnBase[] = []
  for (const o of midOf(s)) { const d = s.dest[o.row]; if (typeof d === 'number') out.push({ row: o.row, base: d }) }
  if (typeof s.batter === 'number') out.push({ row: s.index, base: s.batter })
  return out.sort((a, z) => z.base - a.base)
}

/** Runner plays replayed over the runners actually on base: `from` follows earlier edits, plays of a runner who is
 *  no longer there (or would not move forward any more) are dropped. */
function replay(before: OnBase[], moves: Move[]): Move[] {
  let on = before.slice()
  const out: Move[] = []
  for (const m of moves) {
    const r = on.find((o) => o.row === m.row)
    if (!r || (typeof m.to === 'number' && m.to <= r.base)) continue
    on = on.filter((o) => o !== r)
    if (typeof m.to === 'number') on.push({ row: m.row, base: m.to })
    out.push({ ...m, from: r.base })
  }
  return out
}

/** Make steps i… agree again after a change in step i: its plays and destinations follow the runners it has, and
 *  every later step gets the runners the one before it left (someone who now scores is gone; someone who now stays
 *  is kept where he stood until the recorder moves him). */
function carry(steps: Step[], i: number, was0?: OnBase[]) {
  for (let j = i; j < steps.length; j++) {
    const before = j === i ? steps[j].before : stepAfter(steps[j - 1])
    const moves = replay(before, steps[j].moves)
    const mid = midOf({ before, moves })
    const was = new Map((j === i && was0 ? was0 : midOf(steps[j])).map((o) => [o.row, o.base]))
    const build = (follow: boolean) => {
      const dest: Record<number, End> = {}
      // follow: someone who stood still on the result keeps standing still from wherever he now is;
      // otherwise he still ends where he ended
      for (const o of mid) { const d = steps[j].dest[o.row]; dest[o.row] = d === undefined || (follow && d === was.get(o.row)) ? o.base : d }
      // a destination behind where he now stands is moved up to where he is
      for (const o of mid) { const d = dest[o.row]; if (typeof d === 'number' && d < o.base) dest[o.row] = o.base }
      const outsJ = steps[j].outs.filter((r) => r === steps[j].index ? steps[j].batter === 'out' : dest[r] === 'out')
      for (const o of mid) if (dest[o.row] === 'out' && !outsJ.includes(o.row)) outsJ.unshift(o.row)
      return { ...steps[j], before, moves, dest, outs: outsJ }
    }
    // a change never blocks itself on what the result already says: when standing still would put two runners on a
    // base (moved back to first, or a steal taken back, and the batter reaches first), he keeps the base he ended on
    // (forced along), and anyone still in the way is pushed ahead the way a force play would
    const nobody = () => ''
    let next = build(true)
    if ((j > i || was0) && stepProblems(next, nobody).length) {
      next = build(false)
      if (stepProblems(next, nobody).length) next = forceAhead(next)
    }
    steps[j] = next
  }
}

/** Each runner still on base ends at least one base ahead of the person behind him (trailing first; past third he scores). */
function forceAhead(s: Step): Step {
  const dest = { ...s.dest }
  let behind = typeof s.batter === 'number' ? s.batter : s.batter === 'home' ? 4 : 0
  for (const o of [...midOf(s)].sort((a, z) => a.base - z.base)) {
    const d = dest[o.row]
    if (d === 'out') continue
    if (d === 'home') { behind = 4; continue }
    if (behind && d <= behind) { const to = behind + 1; dest[o.row] = to >= 4 ? 'home' : (to as Base); behind = Math.min(4, to) } else behind = d
  }
  return { ...s, dest }
}

/**
 * Change where one person was at the end of one plate appearance and carry it through the rest of the inning:
 * later plate appearances get the new set of runners (someone who now scores disappears from them; someone who now
 * stays is kept where he stood until the recorder moves him).
 */
export function setEnd(half: Half, at: number, who: number | 'batter', end: End): Half {
  const steps = half.steps.map((s) => ({ ...s, dest: { ...s.dest } }))
  const i = steps.findIndex((s) => s.index === at)
  if (i < 0) return half
  const row = who === 'batter' ? at : who
  if (who === 'batter') steps[i].batter = end; else steps[i].dest[who] = end
  // keep the out order: a new runner out goes before the batter's (it happened on the play), a new batter out last
  let outs = steps[i].outs.filter((r) => r !== row)
  if (end === 'out') { const b = outs.indexOf(at); outs = who !== 'batter' && b >= 0 ? [...outs.slice(0, b), row, ...outs.slice(b)] : [...outs, row] }
  steps[i].outs = outs
  carry(steps, i)
  return { ...half, steps }
}

/** Plays that put the runner out, and the ones that send him home from wherever he is. */
export const OUT_PLAYS = new Set(['cs', 'pk', 'out'])
/**
 * Runner play(s) during plate appearance `at`, after `pitch` of its pitches: each runner in `rows` (lead runner first)
 * moves up one base (from third: scores) or is put out. Moving into a base someone still holds pushes him on first —
 * a double steal is two steals, a wild pitch moves him on the same wild pitch, anything else just advances him.
 * Returns the plays added, so the caller can count them (盜壘, 暴投…).
 */
export function addPlay(half: Half, at: number, pitch: number, kind: string, rows: number[]): { half: Half; added: Move[] } {
  const steps = half.steps.map((s) => ({ ...s, moves: s.moves.slice(), dest: { ...s.dest } }))
  const i = steps.findIndex((s) => s.index === at)
  if (i < 0) return { half, added: [] }
  const st = steps[i]
  const pos = st.moves.filter((m) => m.at <= pitch).length
  let on = midOf({ before: st.before, moves: st.moves.slice(0, pos) })
  const added: Move[] = []
  const move = (row: number, k: string) => {
    const r = on.find((o) => o.row === row)
    if (!r) return
    const to: End = OUT_PLAYS.has(k) ? 'out' : k === 'score' || r.base >= 3 ? 'home' : ((r.base + 1) as Base)
    if (typeof to === 'number') { const ahead = on.find((o) => o.base === to); if (ahead) move(ahead.row, k === 'sb' || k === 'wp' || k === 'pb' || k === 'bk' ? k : 'advance') }
    on = on.filter((o) => o.row !== row)
    if (typeof to === 'number') on.push({ row, base: to })
    added.push({ at: pitch, kind: k, row, from: r.base, to })
  }
  for (const row of [...rows].sort((a, z) => (on.find((o) => o.row === z)?.base ?? 0) - (on.find((o) => o.row === a)?.base ?? 0))) move(row, kind)
  const was = midOf(st)
  st.moves = [...st.moves.slice(0, pos), ...added, ...st.moves.slice(pos)]
  carry(steps, i, was)
  return { half: { ...half, steps }, added }
}

/** Take back one runner play of plate appearance `at` (by its place in that step's moves). */
export function removePlay(half: Half, at: number, n: number): { half: Half; removed?: Move } {
  const steps = half.steps.map((s) => ({ ...s, moves: s.moves.slice(), dest: { ...s.dest } }))
  const i = steps.findIndex((s) => s.index === at)
  if (i < 0 || !steps[i].moves[n]) return { half }
  const was = midOf(steps[i])
  const [removed] = steps[i].moves.splice(n, 1)
  carry(steps, i, was)
  return { half: { ...half, steps }, removed }
}

/**
 * Row indexes moved for rows inserted (k > 0) or removed (k < 0) at `at`: indexes ≥ at move by k, and the rows that
 * were removed (at … at − k − 1) become −1, so counts kept on them are dropped.
 */
export function shiftHalf(half: Half, at: number, k: number): Half {
  const f = (row: number) => (row < at ? row : k < 0 && row < at - k ? -1 : row + k)
  return {
    ...half,
    steps: half.steps.map((st) => ({
      index: f(st.index),
      before: st.before.map((o) => ({ ...o, row: f(o.row) })),
      moves: st.moves.map((m) => ({ ...m, row: f(m.row) })),
      dest: Object.fromEntries(Object.entries(st.dest).map(([row, d]) => [f(Number(row)), d])),
      batter: st.batter,
      outs: st.outs.map(f),
    })),
  }
}

/**
 * Tie-break runners put in front of an inning whose rows start at `at` (already shifted for the inserted rows):
 * `placed` lead runner first, with their rows and bases. They stand still unless a batter forces them along.
 */
export function withPlaced(half: Half, at: number, placed: OnBase[]): Half {
  const first = half.steps.findIndex((st) => st.index >= at)
  const i = first < 0 ? half.steps.length : first
  const added: Step[] = placed.map((p, n) => ({ index: p.row, before: placed.slice(0, n).map((o) => ({ ...o })), moves: [], dest: Object.fromEntries(placed.slice(0, n).map((o) => [o.row, o.base])), batter: p.base, outs: [] }))
  const steps = [...half.steps.slice(0, i).map((s) => ({ ...s })), ...added, ...half.steps.slice(i).map((s) => ({ ...s, moves: s.moves.slice(), dest: { ...s.dest } }))]
  const j = i + added.length
  if (j < steps.length) {
    const was = midOf(steps[j])
    steps[j] = { ...steps[j], before: [...placed.map((o) => ({ ...o })), ...steps[j].before].sort((a, z) => z.base - a.base) }
    carry(steps, j, was)
  }
  return { ...half, steps }
}

/** The inning without these runners (tie-break runners taken off): their steps, and them in every other step, are gone. */
export function withoutRunners(half: Half, rows: number[]): Half {
  const gone = new Set(rows)
  const steps = half.steps.filter((st) => !gone.has(st.index)).map((st) => ({
    ...st,
    before: st.before.filter((o) => !gone.has(o.row)),
    moves: st.moves.filter((m) => !gone.has(m.row)),
    dest: Object.fromEntries(Object.entries(st.dest).filter(([row]) => !gone.has(Number(row)))),
    outs: st.outs.filter((r) => !gone.has(r)),
  }))
  if (steps.length) carry(steps, 0)
  return { ...half, steps }
}

/** Impossible positions in one step: two people on one base, or a runner passing the one ahead. */
export function stepProblems(s: Step, name: (row: number) => string): string[] {
  const out: string[] = []
  // a runner play into a base someone still holds
  let on = s.before.slice()
  for (const m of s.moves ?? []) {
    on = on.filter((o) => o.row !== m.row)
    if (typeof m.to === 'number') {
      const there = on.find((o) => o.base === m.to)
      if (there) out.push(`${name(m.row)} 到 ${m.to}B 時 ${name(there.row)} 還在那裡`)
      on.push({ row: m.row, base: m.to })
    }
  }
  const people = [...midOf(s).map((o) => ({ row: o.row, from: o.base as number, to: s.dest[o.row] })), { row: s.index, from: 0, to: s.batter }]
  let ahead: { row: number; to: number } | null = null
  const label = (b: number) => (b === 4 ? '本壘' : `${b}B`)
  for (const p of people) {
    if (p.to === 'out' || p.to === undefined) continue
    const to = p.to === 'home' ? 4 : p.to
    if (ahead && to === ahead.to && to < 4) out.push(`${name(ahead.row)} 和 ${name(p.row)} 都在 ${label(to)}`)
    else if (ahead && to > ahead.to) out.push(`${name(p.row)} 到了${label(to)}，超過前面的 ${name(ahead.row)}（${label(ahead.to)}）`)
    ahead = { row: p.row, to }
  }
  return out
}

/**
 * Write an inning's steps back onto its rows: 壘上(前) and 出局(前) of every plate appearance, and how each row's
 * person ended (out code in the order the outs happened, a run with R — ER for an opponent run unless it was
 * marked R — or L when left on base). Totals that say *how* (steals, 盜壘失敗, 壘死) are kept, except that a
 * runner who is no longer out loses his 壘死／盜壘失敗 and one who now is gets a 壘死.
 */
export function deriveHalf<T extends Row>(rows: T[], half: Half, side: Side): T[] {
  const out = rows.slice()
  const touch = (i: number) => (out[i] = { ...out[i] })
  let outs = 0
  // mistake: 壘死 (true), plainly put out (false), or not known here — keep what the row says (undefined)
  const end = (i: number, how: 'out' | 'home' | 'left', isBatter: boolean, mistake?: boolean) => {
    const r = touch(i) as Row
    const wasRun = r.code === 'R' ? 'R' : 'ER'
    if (side === 'bat') (r as BattingPA).run = how === 'home' ? 1 : 0
    if (how === 'out') {
      outs += 1
      r.code = ROMAN[Math.min(2, outs - 1)]
      if (side === 'bat' && !isBatter) {
        const b = r as BattingPA
        if (!b.outOnBase && !b.cs) b.outOnBase = 1
        if (mistake) b.baserunningOuts = 1
        else if (mistake === false) delete b.baserunningOuts
      }
    } else {
      r.code = how === 'home' ? (side === 'bat' ? 'R' : wasRun) : 'L'
      if (side === 'bat') { const b = r as BattingPA; b.outOnBase = 0; b.cs = 0; delete b.baserunningOuts }
    }
  }
  for (const s of half.steps) {
    // the runner plays during his pitches come first; 壘上(前) / 出局(前) are what was left for his result
    for (const m of s.moves) if (m.to === 'out' || m.to === 'home') end(m.row, m.to, false, m.to === 'out' ? m.kind === 'out' : undefined)
    const r = touch(s.index) as Row
    const mid = midOf(s)
    r.basesBefore = basesText(mid)
    r.outsBefore = outs
    // 趁傳進壘 on the play stays while that person still ends where it says
    // (a 壘死 mark is his while the runner who stood on its base is still out)
    // (a 投手犯規 after the last plate appearance stays: it happened, and BK is counted from it)
    const onPlay = (r.events ?? []).filter((e) => e.play && (e.kind === 'bk' || (e.batter ? s.batter === e.to : e.to === 'out' ? mid.some((o) => o.base === e.from && s.dest[o.row] === 'out') : mid.some((o) => s.dest[o.row] === e.to))))
    // the inning's last one: where the runners left on base ended has to be written down (no next 壘上(前) says it)
    if (s === half.steps[half.steps.length - 1]) onPlay.push(...leftMarks(mid, s.dest, { row: s.index, result: r.result, end: s.batter, ...(isPlaced(r) && typeof s.batter === 'number' ? { start: s.batter } : {}) }, onPlay, r.pitches.length))
    const events = [...s.moves.map(({ at, kind, from, to }) => ({ at, kind, from, to })), ...onPlay]
    if (events.length) r.events = events
    else delete r.events
    // outs in the order they happened, then the runs
    // a runner out on the play: 壘死 when the play says so (a mark from his base), else the row's own count stands
    const runningOut = new Set(onPlay.filter((e) => e.to === 'out' && !e.batter).flatMap((e) => mid.filter((o) => o.base === e.from).map((o) => o.row)))
    for (const row of s.outs) end(row, 'out', row === s.index, runningOut.has(row) ? true : undefined)
    for (const o of mid) if (s.dest[o.row] === 'home') end(o.row, 'home', false)
    if (s.batter === 'home') end(s.index, 'home', true)
  }
  // left on base when the inning ended
  const lastStep = half.steps[half.steps.length - 1]
  if (lastStep) for (const o of stepAfter(lastStep)) end(o.row, 'left', o.row === lastStep.index)
  return out
}

/** All innings of one side that can be followed, by inning. */
export function inferAll(rows: Row[], side: Side): Map<number, Half | null> {
  const m = new Map<number, Half | null>()
  for (const [inning, idx] of inningsOf(rows)) m.set(inning, inferHalf(rows, idx, side))
  return m
}

const OUT_AT_PLATE = new Set(['三振', '內滾', '內飛', '外飛', '界外飛', '犧觸', '犧飛', '雙殺'])
/** Where a batter stands right after his result (nobody records where he goes later on his own row). */
export function batterEndFor(result: string): End {
  if (OUT_AT_PLATE.has(result)) return 'out'
  return hitBase(result)
}

/**
 * A new result for the batter of `at`: he goes where the result puts him, and runners he would run into are pushed
 * ahead (a bases-loaded walk forces the run in; on a home run everyone scores).
 */
export function setBatterResult(half: Half, at: number, result: string): Half {
  let h = setEnd(half, at, 'batter', batterEndFor(result))
  const s = h.steps.find((x) => x.index === at)
  if (!s) return h
  // trailing person first: each runner must end at least one base ahead of the person behind him
  let behind = typeof s.batter === 'number' ? s.batter : s.batter === 'home' ? 4 : 0
  for (const o of [...midOf(s)].sort((a, z) => a.base - z.base)) {
    const d = s.dest[o.row]
    if (d === 'out') continue
    if (d === 'home') { behind = 4; continue }
    if (behind && d <= behind) {
      const to = behind + 1
      h = setEnd(h, at, o.row, to >= 4 ? 'home' : (to as Base))
      behind = Math.min(4, to)
    } else behind = d
  }
  return h
}

/** Runs that came home in one step (runners and the batter). */
export const homesIn = (s: Step) => Object.values(s.dest).filter((d) => d === 'home').length + (s.batter === 'home' ? 1 : 0)

/**
 * An inning whose saved bases do not add up (older imports, or rows written before a bug was fixed): lay the
 * runners out again from the results alone, the way 紀錄比賽 suggests them — hits move everyone up as many bases,
 * walks force, a sacrifice fly scores the man on third, a double play gets the forced runner — so the recorder can
 * correct it from there on the diamond. A runner the rows say scored comes home once he reaches third, so the
 * inning's runs mostly stay what they were; runs and out codes then follow these steps.
 */
export function rebuildHalf(rows: Row[], idx: number[], side: Side): Half {
  const steps: Step[] = []
  let on: OnBase[] = []
  let outs = 0
  const placedAt = placedBases(rows, idx)
  for (const k of idx) {
    const r = rows[k]
    const before = on.slice().sort((a, z) => z.base - a.base)
    // a tie-break runner: put on his base, nobody else moves
    if (isPlaced(r)) {
      const dest: Record<number, End> = {}
      for (const o of before) dest[o.row] = o.base
      const step: Step = { index: k, before, moves: [], dest, batter: placedAt[k] ?? 2, outs: [] }
      steps.push(step)
      on = stepAfter(step)
      continue
    }
    const dest: Record<number, End> = {}
    const has = (b: number) => before.some((o) => o.base === b)
    const up = (o: OnBase, n: number): End => (o.base + n >= 4 ? 'home' : ((o.base + n) as Base))
    const reachedOnK = r.result === '三振' && (r.code === 'R' || r.code === 'ER' || r.code === 'L')
    let batter: End = reachedOnK ? 1 : batterEndFor(r.result)
    // an infield single (內安) moves only the runners it forces, like a walk
    const n = r.result === '內安' ? 0 : HIT_BASE_COUNT[r.result] ?? 0
    const forcedWalk = ['內安', '保送', '故四', '觸身', '妨礙'].includes(r.result) || reachedOnK
    const outsHere: number[] = []
    for (const o of before) {
      if (n) dest[o.row] = up(o, n)
      else if (forcedWalk) dest[o.row] = o.base === 1 || (o.base === 2 && has(1)) || (o.base === 3 && has(1) && has(2)) ? up(o, 1) : o.base
      else if (r.result === '失誤' || r.result === '犧觸') dest[o.row] = up(o, 1)
      else if (r.result === '犧飛') dest[o.row] = o.base === 3 ? 'home' : o.base
      else dest[o.row] = o.base
    }
    // the forced runner is the other out of a double play / the one thrown out on a fielder's choice
    if ((r.result === '雙殺' || r.result === '野選') && before.length && outs < 2) {
      const lead = before.find((o) => o.base === 1) ?? before[before.length - 1]
      dest[lead.row] = 'out'
      outsHere.push(lead.row)
      outs++
      if (r.result === '野選') for (const o of before) if (o !== lead && typeof dest[o.row] === 'number') dest[o.row] = up(o, 1)
    }
    for (const o of before) if (dest[o.row] === 3 && scored(rows[o.row], side)) dest[o.row] = 'home'
    if (batter === 'out') { outsHere.push(k); outs++ }
    if (r.result === '全壘打') batter = 'home'
    const step: Step = { index: k, before, moves: [], dest, batter, outs: outsHere }
    steps.push(step)
    on = stepAfter(step)
    if (outs >= 3) { outs = 0; on = [] }
  }
  return { inning: rows[idx[0]].inning, steps }
}

type Counts = Record<string, number>
/**
 * What a half-inning's runner plays (between pitches) count: on the runner's own row for our side (盜壘 sb,
 * 盜壘失敗 cs, 失誤進壘 advOnError, 壘上出局 outOnBase from 牽制／壘死, 壘死 baserunningOuts), on the plate appearance
 * for the opponent (被盜壘 sba, 阻殺 cs, 牽制出局 pk; a wild pitch / passed ball once per pitch however many moved).
 */
export function playCounts(half: Half | null | undefined, side: Side): Map<number, Counts> {
  const out = new Map<number, Counts>()
  if (!half) return out
  const add = (row: number, key: string, n = 1) => { const c = out.get(row) ?? {}; c[key] = (c[key] ?? 0) + n; out.set(row, c) }
  for (const st of half.steps) {
    if (side === 'bat') {
      for (const m of st.moves) {
        if (m.kind === 'sb') add(m.row, 'sb'); if (m.kind === 'cs') add(m.row, 'cs'); if (m.kind === 'err') add(m.row, 'advOnError')
        if (m.kind === 'pk' || m.kind === 'out') add(m.row, 'outOnBase'); if (m.kind === 'out') add(m.row, 'baserunningOuts')
      }
    } else {
      for (const m of st.moves) { if (m.kind === 'sb') add(st.index, 'sba'); if (m.kind === 'cs') add(st.index, 'cs'); if (m.kind === 'pk') add(st.index, 'pk') }
      for (const k of ['wp', 'pb']) add(st.index, k, new Set(st.moves.filter((m) => m.kind === k).map((m) => m.at)).size)
    }
  }
  return out
}

/**
 * Keep the rows' baserunning counts in step with an edit of the runner plays: whatever the plays counted before and
 * count now is added as a difference. A play the timeline drops on its own (a runner who is no longer on that base
 * after an earlier change) is taken off its count too, so adding it back never counts it twice; numbers typed by
 * hand for plays that are not in the timeline stay.
 */
export function applyPlayCounts<T extends Row>(rows: T[], before: Half | null | undefined, after: Half, side: Side): T[] {
  const was = playCounts(before, side), now = playCounts(after, side)
  const out = rows.slice()
  for (const row of new Set([...was.keys(), ...now.keys()])) {
    if (!out[row]) continue
    const a = was.get(row) ?? {}, b = now.get(row) ?? {}
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    let r: Record<string, unknown> | null = null
    for (const k of keys) {
      const d = (b[k] ?? 0) - (a[k] ?? 0)
      if (!d) continue
      r ??= { ...(out[row] as unknown as Record<string, unknown>) }
      const v = Math.max(0, (Number(r[k]) || 0) + d)
      if (k === 'baserunningOuts' && !v) delete r[k]; else r[k] = v
    }
    if (r) out[row] = r as unknown as T
  }
  return out
}
