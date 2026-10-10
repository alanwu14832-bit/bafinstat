import type { Player } from './types'
import { SEASON_START, seasonLabel, seasonOfDate, seasonRange } from './seasons'

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
 * The season before the one the filtered games end in (data/seasons.ts: the calendar year by default, so a filter
 * ending in 2026 compares with 2025; with 學年 a filter ending in 2026-02 compares with 113 學年).
 */
export function previousSeason(lastGameDate: string | undefined, start = SEASON_START): { season: number; label: string; from: string; to: string } | null {
  const cur = seasonOfDate(lastGameDate, start)
  if (cur < 1900) return null
  const season = cur - 1
  return { season, label: seasonLabel(season, start), ...seasonRange(season, start) }
}
