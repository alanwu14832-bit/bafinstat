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
 */
import type { BattingPA, PitchingPA, PlayEvent } from '../data/types'

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
  if (result === '二安') return 2
  if (result === '三安') return 3
  if (result === '全壘打') return 'home'
  return 1
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
      // the inning's last plate appearance: whoever scored did, the rest were left on base where they stood
      const after: OnBase[] = []
      for (const g of going) {
        if (scored(rows[g.row], side)) { if (g.row === k) batter = 'home'; else dest[g.row] = 'home'; continue }
        const b = (g.row === k ? (typeof batter === 'number' ? batter : 1) : g.base) as Base
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
    // a change to an earlier plate appearance never blocks itself on a later one: when standing still would put two
    // runners on a base there (moved back to first, and the next batter reaches first), he keeps the base he ended on
    // (forced along), and anyone still in the way is pushed ahead the way a force play would
    const nobody = () => ''
    let next = build(true)
    if (j > i && stepProblems(next, nobody).length) {
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
    if (typeof to === 'number') { const ahead = on.find((o) => o.base === to); if (ahead) move(ahead.row, k === 'sb' || k === 'wp' || k === 'pb' ? k : 'advance') }
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
  const end = (i: number, how: 'out' | 'home' | 'left', isBatter: boolean) => {
    const r = touch(i) as Row
    const wasRun = r.code === 'R' ? 'R' : 'ER'
    if (side === 'bat') (r as BattingPA).run = how === 'home' ? 1 : 0
    if (how === 'out') {
      outs += 1
      r.code = ROMAN[Math.min(2, outs - 1)]
      if (side === 'bat' && !isBatter) { const b = r as BattingPA; if (!b.outOnBase && !b.cs) b.outOnBase = 1 }
    } else {
      r.code = how === 'home' ? (side === 'bat' ? 'R' : wasRun) : 'L'
      if (side === 'bat') { const b = r as BattingPA; b.outOnBase = 0; b.cs = 0 }
    }
  }
  for (const s of half.steps) {
    // the runner plays during his pitches come first; 壘上(前) / 出局(前) are what was left for his result
    for (const m of s.moves) if (m.to === 'out' || m.to === 'home') end(m.row, m.to, false)
    const r = touch(s.index) as Row
    const mid = midOf(s)
    r.basesBefore = basesText(mid)
    r.outsBefore = outs
    // 趁傳進壘 on the play stays while that person still ends where it says
    const onPlay = (r.events ?? []).filter((e) => e.play && (e.batter ? s.batter === e.to : mid.some((o) => s.dest[o.row] === e.to)))
    const events = [...s.moves.map(({ at, kind, from, to }) => ({ at, kind, from, to })), ...onPlay]
    if (events.length) r.events = events
    else delete r.events
    // outs in the order they happened, then the runs
    for (const row of s.outs) end(row, 'out', row === s.index)
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
  for (const k of idx) {
    const r = rows[k]
    const before = on.slice().sort((a, z) => z.base - a.base)
    const dest: Record<number, End> = {}
    const has = (b: number) => before.some((o) => o.base === b)
    const up = (o: OnBase, n: number): End => (o.base + n >= 4 ? 'home' : ((o.base + n) as Base))
    const reachedOnK = r.result === '三振' && (r.code === 'R' || r.code === 'ER' || r.code === 'L')
    let batter: End = reachedOnK ? 1 : batterEndFor(r.result)
    const n = r.result === '一安' ? 1 : r.result === '二安' ? 2 : r.result === '三安' ? 3 : r.result === '全壘打' ? 4 : 0
    const forcedWalk = ['保送', '故四', '觸身', '妨礙'].includes(r.result) || reachedOnK
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
