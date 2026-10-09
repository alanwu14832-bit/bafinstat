/**
 * 球員排序: every player list on the site follows one choice, by jersey number (背號) or by surname (姓氏, in stroke
 * order — 筆畫, the usual order for Chinese names in Taiwan; the zh-Hant collation sorts by the first character's
 * strokes, then the rest of the name). Players who left (畢業／離隊) stay after the current ones either way.
 */
import type { Player } from './types'

export type RosterSort = 'number' | 'surname'

export const ROSTER_SORT_LABEL: Record<RosterSort, string> = { number: '背號', surname: '姓氏' }

const collator = new Intl.Collator('zh-Hant')
export const compareNames = (a: string, b: string) => collator.compare(a, b)

const jersey = (n?: string) => { const v = Number(n); return n !== undefined && n !== '' && Number.isFinite(v) ? v : Infinity }
/** A current player: blank status or 現役 (畢業／離隊 are not). */
export const isActivePlayer = (p?: Pick<Player, 'status'>) => !p?.status || p.status === '現役'
const isActive = isActivePlayer

/** Compare two players: by number (no number last, ties by name) or by name (stroke order). */
export function comparePlayers(mode: RosterSort, a: { name: string; number?: string }, b: { name: string; number?: string }): number {
  if (mode === 'number') { const d = jersey(a.number) - jersey(b.number); if (d) return d }
  return compareNames(a.name, b.name)
}

/** The roster in list order: current players first, then the chosen order. */
export function sortRoster<T extends Pick<Player, 'name' | 'number' | 'status'>>(roster: T[], mode: RosterSort, activeFirst = true): T[] {
  return [...roster].sort((a, b) => (activeFirst ? Number(isActive(b)) - Number(isActive(a)) : 0) || comparePlayers(mode, a, b))
}

/** Plain names (from a game, a box score, a pitcher list) in the chosen order, looking numbers up in the roster. */
export function sortNames(names: string[], roster: Pick<Player, 'name' | 'number' | 'status'>[], mode: RosterSort): string[] {
  const by = new Map(roster.map((p) => [p.name, p]))
  return [...names].sort((a, b) => comparePlayers(mode, by.get(a) ?? { name: a }, by.get(b) ?? { name: b }))
}

/** A stats row with the player's jersey number (a number, so the 背號 column sorts 2 before 10; null without one). */
export type WithNumber<T> = T & { number: number | null }
export function withNumbers<T extends { name: string }>(rows: T[], roster: Pick<Player, 'name' | 'number'>[]): WithNumber<T>[] {
  const by = new Map(roster.map((p) => [p.name, jersey(p.number)]))
  return rows.map((r) => { const n = by.get(r.name); return { ...r, number: n === undefined || n === Infinity ? null : n } })
}
