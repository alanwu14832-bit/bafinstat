/** Null-safe baseball formatting for table cells and tiles. */
export const DASH = '—'

export const f3 = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? DASH : (v < 1 && v >= 0 ? v.toFixed(3).replace(/^0/, '') : v.toFixed(3)))
export const f2 = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? DASH : v.toFixed(2))
export const f1 = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? DASH : v.toFixed(1))
export const pct = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? DASH : `${(v * 100).toFixed(1)}%`)
export const int = (v: number | null | undefined): string => (v === null || v === undefined ? DASH : String(Math.round(v)))
export const signedInt = (v: number): string => (v > 0 ? `+${v}` : String(v))

/** yyyy-mm-dd → mm/dd */
export const shortDate = (iso: string): string => (iso.length >= 10 ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : iso)
export const yearOf = (iso: string): string => iso.slice(0, 4)

export const POSITION_LABEL: Record<string, string> = {
  P: '投手', C: '捕手', '1B': '一壘', '2B': '二壘', '3B': '三壘', SS: '游擊', LF: '左外野', CF: '中外野', RF: '右外野', DH: '指定打擊', PH: '代打', PR: '代跑',
}
export const posLabel = (pos?: string) => (pos ? `${pos} ${POSITION_LABEL[pos] ?? ''}`.trim() : DASH)

/** Percentile rank (0–100) of v within values; higher is better unless invert. */
export function percentile(v: number | null, values: Array<number | null>, invert = false): number {
  if (v === null) return 0
  const xs = values.filter((x): x is number => x !== null)
  if (xs.length <= 1) return 50
  const below = xs.filter((x) => (invert ? x > v : x < v)).length
  return Math.round((below / (xs.length - 1)) * 100)
}
