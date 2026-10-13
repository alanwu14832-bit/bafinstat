/**
 * What earlier games against an opponent tell the recorder: the names of their batters (記對方打者姓名), their last
 * batting order, and the pitchers we faced (對方投手 with the hand). For datalists and one-tap chips on 紀錄比賽.
 */
import { OPP_PR_UNNAMED, oppBatterName, type BattingPA, type Dataset, type Game, type OppHand } from './types'

const same = (a: string, b: string) => a.trim() === b.trim()
/** Played games (no status) against this opponent, newest first (by date, then id). */
function gamesVs(ds: Dataset, opponent: string): Game[] {
  if (!opponent.trim()) return []
  return ds.games.filter((g) => !g.status && same(g.opponent, opponent)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
}

/** Every opponent batter (and named pinch runner) seen against this opponent, newest game first, each once. */
export function oppBatterNames(ds: Dataset, opponent: string): string[] {
  const out = new Set<string>()
  for (const g of gamesVs(ds, opponent)) for (const p of ds.pitching) {
    if (p.gameId !== g.id) continue
    if (oppBatterName(p.oppBatter)) out.add(oppBatterName(p.oppBatter))
    // (their pinch runners too, by name)
    if (p.runner?.trim() && p.runner.trim() !== OPP_PR_UNNAMED) out.add(p.runner.trim())
  }
  return [...out]
}

/** Their batting order in the last game against them that has names: the first batter of each slot (the starter). */
export function lastOppLineup(ds: Dataset, opponent: string): { gameId: string; date: string; names: string[] } | null {
  for (const g of gamesVs(ds, opponent)) {
    const rows = ds.pitching.filter((p) => p.gameId === g.id)
    if (!rows.some((p) => oppBatterName(p.oppBatter))) continue
    const names = Array.from({ length: 9 }, (_, k) => oppBatterName(rows.find((p) => p.oppOrder === k + 1)?.oppBatter))
    return { gameId: g.id, date: g.date, names }
  }
  return null
}

/** Opponent pitchers to offer as one-tap chips: this game's first, then earlier games against them; each name once, with its latest hand. */
export function oppPitcherOptions(ds: Dataset, opponent: string, currentRows: BattingPA[] = []): Array<{ name: string; hand?: OppHand }> {
  const out = new Map<string, OppHand | undefined>()
  const add = (rows: BattingPA[]) => {
    // latest first within a game: the last row with that name has its latest hand
    for (const p of [...rows].reverse()) {
      const name = p.oppPitcher?.trim()
      if (!name) continue
      if (!out.has(name)) out.set(name, p.oppHand)
      else if (!out.get(name) && p.oppHand) out.set(name, p.oppHand)
    }
  }
  add(currentRows)
  const current = new Set(currentRows.map((p) => p.gameId))
  for (const g of gamesVs(ds, opponent)) if (!current.has(g.id)) add(ds.batting.filter((p) => p.gameId === g.id))
  return [...out].map(([name, hand]) => ({ name, ...(hand ? { hand } : {}) }))
}
