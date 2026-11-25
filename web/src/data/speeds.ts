/**
 * 球速 (km/h), one per pitch: `speeds[k]` goes with `pitches[k]` (null = not measured). Stored only when at least one
 * pitch has a speed, and always as long as `pitches` (padded with null, cut to length).
 */
export const SPEED_MIN = 40
export const SPEED_MAX = 170
/** A typed speed as stored: a whole number in range, else null. */
export const speedOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= SPEED_MIN && v <= SPEED_MAX ? Math.round(v) : null)
/** The speeds lined up with `count` pitches, or undefined when none is known (so the row leaves them out). */
export function alignSpeeds(speeds: ReadonlyArray<number | null | undefined> | undefined, count: number): Array<number | null> | undefined {
  if (!speeds?.length) return undefined
  const out = Array.from({ length: count }, (_, k) => speedOf(speeds[k] ?? null))
  return out.some((v) => v !== null) ? out : undefined
}
/** 「132,,128」 (修改資料): the speeds of a plate appearance as text, in pitch order, blanks for the ones not measured. */
export const speedsText = (speeds: ReadonlyArray<number | null> | undefined) => (speeds?.some((v) => v !== null) ? speeds.map((v) => (v === null ? '' : String(v))).join(',') : '')
export const parseSpeedsText = (text: string, count: number) => alignSpeeds(text.split(/[,，、\s]/).map((t) => (t.trim() ? Number(t.trim()) : null)), count)

/** 「135 公里」 */
export const kmhText = (v: number) => `${v} 公里`

export interface SpeedLine { /** measured pitches */ n: number; max: number; avg: number }
export interface SpeedSummary extends SpeedLine {
  /** every pitch thrown in these rows, measured or not */
  pitches: number
  /** the game of the fastest pitch (its first time) */
  maxGameId: string
  /** in the order of the rows (the games' order), only games with a measured pitch */
  byGame: Array<SpeedLine & { gameId: string }>
  /** by the game's inning, low to high */
  byInning: Array<SpeedLine & { inning: number }>
}
type SpeedRow = { gameId: string; inning: number; pitches: string[]; speeds?: Array<number | null> }
const line = (vs: number[]): SpeedLine => ({ n: vs.length, max: Math.max(...vs), avg: Math.round((vs.reduce((a, v) => a + v, 0) / vs.length) * 10) / 10 })

/**
 * 球速 of a pitcher's plate appearances: the fastest, the average of every measured pitch (no pitch types are recorded,
 * so fastballs and breaking balls go in together), per game and per inning. Null when no pitch was measured.
 */
export function speedSummary(rows: ReadonlyArray<SpeedRow>): SpeedSummary | null {
  const all: number[] = [], games = new Map<string, number[]>(), innings = new Map<number, number[]>()
  let pitches = 0, maxGameId = '', max = -1
  for (const r of rows) {
    pitches += r.pitches.length
    for (const v of alignSpeeds(r.speeds, r.pitches.length) ?? []) {
      if (v === null) continue
      all.push(v)
      if (v > max) { max = v; maxGameId = r.gameId }
      if (!games.has(r.gameId)) games.set(r.gameId, [])
      games.get(r.gameId)!.push(v)
      if (!innings.has(r.inning)) innings.set(r.inning, [])
      innings.get(r.inning)!.push(v)
    }
  }
  if (!all.length) return null
  return {
    ...line(all), pitches, maxGameId,
    byGame: [...games].map(([gameId, vs]) => ({ gameId, ...line(vs) })),
    byInning: [...innings].sort((a, b) => a[0] - b[0]).map(([inning, vs]) => ({ inning, ...line(vs) })),
  }
}

/** How a speed stands out: 135 and up 'fast' (red), 125–134 'quick' (yellow), anything slower plain. */
export type SpeedTone = 'fast' | 'quick' | null
export const speedTone = (v: number | null | undefined): SpeedTone => (typeof v !== 'number' ? null : v >= 135 ? 'fast' : v >= 125 ? 'quick' : null)
/** Text classes for a speed on the page (theme colours: 黃 for 125–134, 紅 for 135+). */
export const SPEED_TEXT: Record<'fast' | 'quick', string> = { fast: 'text-critical font-semibold', quick: 'text-warning font-semibold' }
export const speedClass = (v: number | null | undefined): string => { const t = speedTone(v); return t ? SPEED_TEXT[t] : '' }
/** The fastest and the latest measured speed of some plate appearances (the last one's pitches last). */
export function speedFacts(rows: ReadonlyArray<{ pitches: string[]; speeds?: Array<number | null> }>): { max: number | null; last: number | null } {
  let max: number | null = null, last: number | null = null
  for (const r of rows) for (const v of alignSpeeds(r.speeds, r.pitches.length) ?? []) if (v !== null) { last = v; if (max === null || v > max) max = v }
  return { max, last }
}
