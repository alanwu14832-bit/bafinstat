/**
 * Roster edits: add / update / rename / remove players. Pure helpers; the store persists the result.
 * Renaming a player also renames every record that carries the old name, so stats stay attached.
 */
import { oppBatterName, type Dataset, type Player } from './types'
import { isIntra } from './intrasquad'
import { dayRosterNames, renameInDayRoster } from './gameRoster'

export interface RosterChange {
  /** original name → new player (name may differ = rename); '' original = new player */
  players: Array<{ original: string; player: Player }>
  /** original names to remove (only allowed when the player has no records) */
  removed: string[]
}

export function playersWithRecords(ds: Dataset): Set<string> {
  const s = new Set<string>()
  for (const p of ds.batting) { s.add(p.batter); if (p.runner) s.add(p.runner) }
  for (const p of ds.pitching) s.add(p.pitcher)
  for (const f of ds.fielding) s.add(f.player)
  for (const g of ds.games) for (const n of [g.winningPitcher, g.losingPitcher, g.savePitcher, ...(g.holds ?? [])]) if (n) s.add(n)
  // a bench-only player is on a game's 當日登錄名單: deleting him would leave a dangling name there
  for (const g of ds.games) for (const n of dayRosterNames(g.dayRoster)) s.add(n)
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
  const pairs = Object.entries(renames)
  const rn = (n?: string) => (n && renames[n]) || n
  const removed = new Set(change.removed)
  const edited = new Map(change.players.filter((c) => c.original).map((c) => [c.original, c.player]))
  const roster: Player[] = base.roster.filter((p) => !removed.has(p.name)).map((p) => edited.get(p.name) ?? p)
  const intra = new Set(base.games.filter(isIntra).map((g) => g.id))
  for (const c of change.players) if (!c.original && c.player.name.trim() && !roster.some((p) => p.name === c.player.name)) roster.push(c.player)
  return {
    roster,
    games: base.games.map((g) => ({ ...g, winningPitcher: rn(g.winningPitcher), losingPitcher: rn(g.losingPitcher), savePitcher: rn(g.savePitcher), holds: g.holds?.map((h) => rn(h)!), ...(g.dayRoster ? { dayRoster: renameInDayRoster(g.dayRoster, pairs) } : {}) })),
    batting: base.batting.map((p) => {
      const opp = intra.has(p.gameId) && p.oppPitcher && renames[p.oppPitcher]
      return renames[p.batter] || (p.runner && renames[p.runner]) || opp ? { ...p, batter: renames[p.batter] ?? p.batter, ...(p.runner ? { runner: renames[p.runner] ?? p.runner } : {}), ...(opp ? { oppPitcher: opp } : {}) } : p
    }),
    pitching: base.pitching.map((p) => {
      // (隊內賽: the other side's batters and 代跑 are our players too — 「代打 X」 keeps its mark)
      if (!intra.has(p.gameId)) return renames[p.pitcher] ? { ...p, pitcher: renames[p.pitcher] } : p
      const name = oppBatterName(p.oppBatter)
      const batter = name && renames[name] ? p.oppBatter!.replace(name, renames[name]) : p.oppBatter
      const runner = p.runner && renames[p.runner] ? renames[p.runner] : p.runner
      return renames[p.pitcher] || batter !== p.oppBatter || runner !== p.runner ? { ...p, pitcher: renames[p.pitcher] ?? p.pitcher, ...(batter ? { oppBatter: batter } : {}), ...(runner ? { runner } : {}) } : p
    }),
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
