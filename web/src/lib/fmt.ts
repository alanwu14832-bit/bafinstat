/** Null-safe baseball formatting for table cells and tiles. */
export const DASH = '—'

export const f3 = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? DASH : (v < 1 && v >= 0 ? v.toFixed(3).replace(/^0/, '') : v.toFixed(3)))
export const f2 = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? DASH : v.toFixed(2))
export const f1 = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? DASH : v.toFixed(1))
export const pct = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? DASH : `${(v * 100).toFixed(1)}%`)
/** A difference of two rates, in percentage points with its sign: +12.3% / −4.0% (sSeager). */
export const signedPct = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? DASH : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1)}%`)
/** A signed value with a real minus sign: signed(1.25, 2) → '+1.25', signed(-0.4, 2) → '−0.40' (WPA, RE24). */
export const signed = (v: number | null | undefined, digits = 2): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH
  const t = Math.abs(v).toFixed(digits)
  return Number(t) === 0 ? t : `${v > 0 ? '+' : '−'}${t}`
}
export const signed2 = (v: unknown): string => signed(v as number | null, 2)
export const signed1 = (v: unknown): string => signed(v as number | null, 1)
/** A change of a probability in whole percentage points: +23% / −8% (one game's WPA). */
export const signedPts = (v: number | null | undefined): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH
  const n = Math.round(v * 100)
  return n === 0 ? '0%' : `${n > 0 ? '+' : '−'}${Math.abs(n)}%`
}
/**
 * The change between two probabilities shown next to them as whole percents: the difference of the two rounded
 * numbers, so 「90% → 83%（−7%）」 always adds up (signedPts of the exact change could read −8%).
 */
export const signedPtsBetween = (before: number, after: number): string => {
  const n = Math.round(after * 100) - Math.round(before * 100)
  return n === 0 ? '0%' : `${n > 0 ? '+' : '−'}${Math.abs(n)}%`
}
/** Whole-percent form for composite tiles where a decimal would not fit. */
export const pct0 = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? DASH : `${Math.round(v * 100)}%`)
export const int = (v: number | null | undefined): string => (v === null || v === undefined ? DASH : String(Math.round(v)))
export const signedInt = (v: number): string => (v > 0 ? `+${v}` : String(v))

/** yyyy-mm-dd → mm/dd */
export const shortDate = (iso: string): string => (iso.length >= 10 ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : iso)
export const yearOf = (iso: string): string => iso.slice(0, 4)

export const POSITION_LABEL: Record<string, string> = {
  P: '投手', C: '捕手', '1B': '一壘', '2B': '二壘', '3B': '三壘', SS: '游擊', LF: '左外野', CF: '中外野', RF: '右外野', DH: '指定打擊', PH: '代打', PR: '代跑', IF: '內野手', OF: '外野手', UT: '工具人',
}
export const posLabel = (pos?: string) => (pos ? `${pos} ${POSITION_LABEL[pos] ?? ''}`.trim() : DASH)

/**
 * Percentile rank (0–100) of v within values; higher is better unless invert. Midrank: ties share the middle of their
 * places (so a team where most have 0 HR does not put them all at PR 0), and a v that is not among the values (a player
 * below the sample minimum) is placed among them as one more. Always 0..100; one value or none → 50.
 */
export function percentile(v: number | null, values: Array<number | null>, invert = false): number {
  if (v === null) return 0
  const xs = values.filter((x): x is number => x !== null)
  let n = xs.length
  if (n <= 1) return 50
  const worse = xs.filter((x) => (invert ? x > v : x < v)).length
  let ties = xs.filter((x) => x === v).length
  if (ties === 0) { n += 1; ties = 1 }
  return Math.round((100 * (worse + (ties - 1) / 2)) / (n - 1))
}

/** How far a PR is from the middle, 0 (PR 50) … 1 (PR 0 or 100). */
const prDistance = (pr: number) => Math.min(1, Math.abs(pr - 50) / 50)
/** The colour of a PR: red (--pr-hot) for better than the team's middle, blue (--pr-cold) for worse, grey at PR 50. */
export function prMix(pr: number): string {
  return `color-mix(in oklab, var(${pr >= 50 ? '--pr-hot' : '--pr-cold'}) ${Math.round(prDistance(pr) * 100)}%, var(--pr-mid))`
}
/** Text on a prMix fill: white once the colour is strong enough, else the normal ink. */
export const prInk = (pr: number): string => (prDistance(pr) >= 0.4 ? '#fff' : 'var(--ink)')
