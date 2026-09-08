import { summarizeGame, type GameSummary } from './stats'
import type { BattingPA, Dataset, Filters, Game } from './types'

export interface FilteredData {
  games: Game[]
  summaries: GameSummary[]
  batting: BattingPA[]
  pitching: Dataset['pitching']
  fielding: Dataset['fielding']
  /** ids of games passing the game-level filters */
  gameIds: Set<string>
}

/** Game-level filters (tournament / date / opponent / home-away / result). */
export function filterGames(ds: Dataset, f: Filters): { games: Game[]; summaries: GameSummary[] } {
  const summaries: GameSummary[] = []
  const games: Game[] = []
  for (const g of [...ds.games].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    if (f.tournament !== 'all' && g.tournament !== f.tournament) continue
    if (f.from && g.date < f.from) continue
    if (f.to && g.date > f.to) continue
    if (f.opponent !== 'all' && g.opponent !== f.opponent) continue
    if (f.homeAway !== 'all' && g.homeAway !== f.homeAway) continue
    const s = summarizeGame(ds, g)
    if (f.result !== 'all' && s.result !== f.result) continue
    games.push(g); summaries.push(s)
  }
  return { games, summaries }
}

/** Apply all filters. The position filter only narrows batting PAs and fielding lines. */
export function applyFilters(ds: Dataset, f: Filters): FilteredData {
  const { games, summaries } = filterGames(ds, f)
  const gameIds = new Set(games.map((g) => g.id))
  const pos = f.position
  return {
    games, summaries, gameIds,
    batting: ds.batting.filter((p) => gameIds.has(p.gameId) && (pos === 'all' || (p.pos ?? '') === pos)),
    pitching: ds.pitching.filter((p) => gameIds.has(p.gameId)),
    fielding: ds.fielding.filter((p) => gameIds.has(p.gameId) && (pos === 'all' || p.pos === pos)),
  }
}

export const uniqueSorted = (values: Array<string | undefined>) => [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
