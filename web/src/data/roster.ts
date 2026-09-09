/**
 * Roster edits: add / update / rename / remove players. Pure helpers; the store persists the result.
 * Renaming a player also renames every record that carries the old name, so stats stay attached.
 */
import type { Dataset, Player } from './types'

export interface RosterChange {
  /** original name → new player (name may differ = rename); '' original = new player */
  players: Array<{ original: string; player: Player }>
  /** original names to remove (only allowed when the player has no records) */
  removed: string[]
}

export function playersWithRecords(ds: Dataset): Set<string> {
  const s = new Set<string>()
  for (const p of ds.batting) s.add(p.batter)
  for (const p of ds.pitching) s.add(p.pitcher)
  for (const f of ds.fielding) s.add(f.player)
  for (const g of ds.games) for (const n of [g.winningPitcher, g.losingPitcher, g.savePitcher, ...(g.holds ?? [])]) if (n) s.add(n)
  return s
}

/** Renames as { old: new } for every change whose name differs. */
export function renamesOf(change: RosterChange): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of change.players) if (c.original && c.original !== c.player.name) out[c.original] = c.player.name
  return out
}

export function applyRosterChange(base: Dataset, change: RosterChange): Dataset {
  const renames = renamesOf(change)
  const rn = (n?: string) => (n && renames[n]) || n
  const removed = new Set(change.removed)
  const edited = new Map(change.players.filter((c) => c.original).map((c) => [c.original, c.player]))
  const roster: Player[] = base.roster.filter((p) => !removed.has(p.name)).map((p) => edited.get(p.name) ?? p)
  for (const c of change.players) if (!c.original && c.player.name.trim() && !roster.some((p) => p.name === c.player.name)) roster.push(c.player)
  return {
    roster,
    games: base.games.map((g) => ({ ...g, winningPitcher: rn(g.winningPitcher), losingPitcher: rn(g.losingPitcher), savePitcher: rn(g.savePitcher), holds: g.holds?.map((h) => rn(h)!) })),
    batting: base.batting.map((p) => (renames[p.batter] ? { ...p, batter: renames[p.batter] } : p)),
    pitching: base.pitching.map((p) => (renames[p.pitcher] ? { ...p, pitcher: renames[p.pitcher] } : p)),
    fielding: base.fielding.map((f) => (renames[f.player] ? { ...f, player: renames[f.player] } : f)),
  }
}

/** Validation: names required, unique, no removing players that still have records. */
export function validateRosterChange(base: Dataset, change: RosterChange): string | null {
  const names = change.players.map((c) => c.player.name.trim())
  if (names.some((n) => !n)) return '有球員沒填姓名'
  const dup = names.find((n, i) => names.indexOf(n) !== i)
  if (dup) return `姓名重複：${dup}`
  const withRecords = playersWithRecords(base)
  const bad = change.removed.find((n) => withRecords.has(n))
  if (bad) return `${bad} 已有比賽紀錄，不能刪除；請把狀態改成「離隊」`
  return null
}
