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
