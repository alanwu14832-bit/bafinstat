import type { Player } from './types'

/** Position groups for the radar's 同守位 comparison; DH / UT / unknown have no group. */
export type PosGroup = '投手' | '捕手' | '內野' | '外野'
const GROUP: Record<string, PosGroup> = { P: '投手', C: '捕手', '1B': '內野', '2B': '內野', '3B': '內野', SS: '內野', IF: '內野', LF: '外野', CF: '外野', RF: '外野', OF: '外野' }
export const posGroup = (pos?: string): PosGroup | null => (pos ? GROUP[pos] ?? null : null)

/** Teammates sharing a player's position group (by roster 主守位), the player included. */
export function sameGroup(roster: Player[], name: string): { group: PosGroup; names: Set<string> } | null {
  const group = posGroup(roster.find((p) => p.name === name)?.primaryPos)
  if (!group) return null
  return { group, names: new Set(roster.filter((p) => posGroup(p.primaryPos) === group).map((p) => p.name)) }
}

export function median(values: Array<number | null | undefined>): number | null {
  const xs = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  if (!xs.length) return null
  const m = xs.length >> 1
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2
}

/**
 * The season before the one the filtered games end in. Seasons follow the calendar year, like the filter
 * bar's 「2026年」 preset, so a filter ending in 2026 compares with 2025.
 */
export function previousSeason(lastGameDate: string | undefined): { year: number; from: string; to: string } | null {
  const y = Number(lastGameDate?.slice(0, 4))
  if (!Number.isInteger(y) || y < 1900) return null
  return { year: y - 1, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
}
