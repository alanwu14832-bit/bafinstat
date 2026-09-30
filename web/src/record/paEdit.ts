/**
 * Editing one plate appearance of a finished game with the recording buttons. Each change keeps the row
 * consistent the way live recording would have written it (IP pitch for a ball in play, out code, R code),
 * but never overwrites what the recorder set by hand on purpose (L, R, ER stay).
 */
import type { BattingPA, PitchingPA } from '../data/types'
import { BIP_RESULTS, OUT_RESULTS, withInPlay } from './model'
import { NO_BATTED_BALL } from './widgets'

type PA = BattingPA | PitchingPA
const OUT_CODES = new Set(['I', 'II', 'III'])
const ROMAN = ['I', 'II', 'III'] as const

/** Code for a new result: an out gets I／II／III from 出局(前) (雙殺 counts two), a non-out drops a stale out code. */
export function codeFor(result: string, outsBefore: number | undefined, code: string | undefined): string | undefined {
  const current = code || undefined
  if (OUT_RESULTS.has(result)) {
    if (current && !OUT_CODES.has(current)) return current
    if (outsBefore === undefined) return current
    return ROMAN[Math.min(2, outsBefore + (result === '雙殺' ? 1 : 0))]
  }
  return current && OUT_CODES.has(current) ? undefined : current
}

/** The last pitch follows a changed result: a ball in play ends on IP (a swinging strike becomes contact), a
 *  strikeout on a swinging strike, a walk on a ball; an HBP / interference has no IP. */
export function lastPitchFor(pitches: string[], result: string): string[] {
  const last = pitches[pitches.length - 1]
  if (BIP_RESULTS.has(result)) return last === 'SS' ? [...pitches.slice(0, -1), 'IP'] : withInPlay(pitches, result)
  if (last !== 'IP') return pitches
  const head = pitches.slice(0, -1)
  return result === '三振' ? [...head, 'SS'] : result === '保送' || result === '故四' ? [...head, 'B'] : head
}

/** New result: ball-in-play pitch added, batted-ball fields cleared when there is no batted ball, code updated. */
export function withResult<T extends PA>(pa: T, result: string): T {
  const next = { ...pa, result, pitches: lastPitchFor(pa.pitches, result), code: codeFor(result, pa.outsBefore, pa.code) }
  if (NO_BATTED_BALL.has(result)) { delete next.loc; delete next.traj; delete next.quality }
  if (!next.code) delete next.code
  return next
}

/** 得分 for our batter, with the R code following it (a run is R; taking it away clears R). */
export function withRun(pa: BattingPA, run: number): BattingPA {
  const next: BattingPA = { ...pa, run: Math.max(0, Math.min(1, run)) }
  if (next.run && (!next.code || next.code === 'L')) next.code = 'R'
  if (!next.run && next.code === 'R') delete next.code
  return next
}

/** 壘上(前) as three toggles: '12' ⇄ {1, 2}; no runner is 無. */
export function toggleBase(bases: string | undefined, base: 1 | 2 | 3): string {
  const set = new Set<string>((bases ?? '').replace('無', '').split('').filter((c) => c === '1' || c === '2' || c === '3'))
  const k = String(base)
  if (set.has(k)) set.delete(k); else set.add(k)
  return [...set].sort().join('') || '無'
}

/** A blank batting row to insert at index `at`: the inning of the row before it, the next slot, and whoever holds that
 *  slot by then (the last batter there, or his 代跑, who took the slot over). */
export function blankBattingAt(rows: BattingPA[], at: number, gameId: string): BattingPA {
  const prev = rows[at - 1]
  const order = prev?.order ? (prev.order % 9) + 1 : prev ? undefined : 1
  // earlier in the game: that slot's last batter, or his 代跑 who took the slot over; otherwise its next batter
  const before = order ? [...rows.slice(0, at)].reverse().find((p) => p.order === order) : undefined
  const after = order && !before ? rows.slice(at).find((p) => p.order === order) : undefined
  const batter = before ? before.runner || before.batter : after?.batter ?? ''
  const pos = before ? (before.runner ? undefined : before.pos) : after?.pos
  return { gameId, inning: prev?.inning ?? rows[at]?.inning ?? 1, order, batter, ...(pos ? { pos } : {}), pitches: [], result: '', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 }
}
/** A blank opponent row to insert at index `at`: inning and pitcher of the row before it, next batter in their order. */
export function blankPitchingAt(rows: PitchingPA[], at: number, gameId: string): PitchingPA {
  const prev = rows[at - 1]
  const near = prev ?? rows[at]
  return { gameId, inning: near?.inning ?? 1, oppOrder: prev?.oppOrder ? (prev.oppOrder % 9) + 1 : prev ? undefined : 1, pitcher: near?.pitcher ?? '', pitches: [], result: '', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 }
}

/* ------------------------------------------------ base running of our batter after he reached */
const ON_FIRST = new Set(['一安', '保送', '故四', '觸身', '失誤', '野選', '妨礙'])
/** Base the batter reached on his result: 1–3, 4 for a home run, null when he was out at the plate. */
export function startBase(pa: Pick<BattingPA, 'result' | 'code'>): number | null {
  if (pa.result === '二安') return 2
  if (pa.result === '三安') return 3
  if (pa.result === '全壘打') return 4
  if (ON_FIRST.has(pa.result)) return 1
  // 不死三振: struck out but reached (no out code)
  if (pa.result === '三振' && pa.code && !OUT_CODES.has(pa.code)) return 1
  return null
}

export type RunEvent = 'sb' | 'err' | 'cs' | 'pk' | 'out' | 'score' | 'stranded'
export const RUN_EVENTS: Array<{ ev: RunEvent; label: string; out?: boolean }> = [
  { ev: 'sb', label: '盜壘' }, { ev: 'err', label: '失誤進壘' }, { ev: 'score', label: '得分' }, { ev: 'stranded', label: '殘壘' },
  { ev: 'cs', label: '盜壘失敗', out: true }, { ev: 'pk', label: '牽制出局', out: true }, { ev: 'out', label: '壘死', out: true },
]
export interface PathStep { label: string; base?: number; end?: 'run' | 'out' | 'stranded' }

/** How the runner got around, rebuilt from the row's counts: errors and steals in order, then how it ended. */
export function basePath(pa: BattingPA): PathStep[] {
  const start = startBase(pa)
  if (start === null) return []
  const steps: PathStep[] = [{ label: pa.result, base: Math.min(start, 4) }]
  if (start === 4) return [{ label: pa.result, end: 'run' }]
  let base = start
  // from third the next base is home (盜本壘 / 失誤回本壘): shown without a base, the run itself is the ending
  const move = (label: string, n: number) => { for (let i = 0; i < n; i++) { if (base >= 3) { steps.push({ label: `${label}（本壘）` }); continue } base += 1; steps.push({ label, base }) } }
  move('失誤進壘', pa.advOnError)
  move('盜壘', pa.sb)
  if (pa.run) steps.push({ label: '得分', end: 'run' })
  else if (pa.cs) steps.push({ label: '盜壘失敗', end: 'out' })
  else if (pa.outOnBase) steps.push({ label: '出局', end: 'out' })
  else if (pa.code === 'L') steps.push({ label: '殘壘', end: 'stranded' })
  return steps
}
/** Still on base as far as the row says (reached, and neither scored, was put out nor left on base). */
export const stillOn = (pa: BattingPA) => { const p = basePath(pa); return p.length > 0 && !p[p.length - 1].end }

/** One base-running event on this row, the way 紀錄比賽 records it. Steals and error advances add up; an ending
 *  (得分, 殘壘, or an out on the bases) replaces whatever ending the row had. An out needs its out code picked by hand
 *  (which out of the inning it was is not known here); a run is R, left on base is L. */
export function applyRunEvent(pa: BattingPA, ev: RunEvent): BattingPA {
  const next = { ...pa }
  if (ev === 'sb') { next.sb += 1; return next }
  if (ev === 'err') { next.advOnError += 1; return next }
  // a new ending: clear the old one first
  next.run = 0; next.cs = 0; next.outOnBase = 0
  if (next.code === 'R' || next.code === 'L') delete next.code
  switch (ev) {
    case 'cs': next.cs = 1; break
    case 'pk': case 'out': next.outOnBase = 1; break
    case 'score': return withRun(next, 1)
    case 'stranded': next.code = 'L'; break
  }
  return next
}
/** Which ending the row has now (for showing that button as selected). */
export function runEnding(pa: BattingPA): RunEvent | null {
  if (pa.run) return 'score'
  if (pa.cs) return 'cs'
  if (pa.outOnBase) return 'out'
  if (pa.code === 'L') return 'stranded'
  return null
}
/** Take back the last step of basePath (the ending first, then the latest steal, then the latest error advance). */
export function undoRunStep(pa: BattingPA): BattingPA {
  const next = { ...pa }
  if (next.run) return withRun(next, 0)
  if (next.cs) { next.cs -= 1; return next }
  if (next.outOnBase) { next.outOnBase -= 1; return next }
  if (next.code === 'L') { delete next.code; return next }
  if (next.sb) { next.sb -= 1; return next }
  if (next.advOnError) next.advOnError -= 1
  return next
}
