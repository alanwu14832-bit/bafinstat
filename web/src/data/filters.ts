import { summarizeGame, type GameSummary } from './stats'
import type { BattingPA, Dataset, Filters, Game } from './types'
import { isIntra } from './intrasquad'

export interface FilteredData {
  /** every game counted (a 隊內賽's two sides too, when the 隊內賽 filter counts them) */
  games: Game[]
  /** the team's games (勝敗, 得失分, 走勢): never a 隊內賽 */
  summaries: GameSummary[]
  /** every game counted, 隊內賽 sides included (a player's game log, the score by inning his pitching needs) */
  allSummaries: GameSummary[]
  batting: BattingPA[]
  pitching: Dataset['pitching']
  fielding: Dataset['fielding']
  /** ids of games passing the game-level filters */
  gameIds: Set<string>
}

/** Games that actually happened: not scheduled or cancelled, and with at least one plate appearance recorded. */
export function playedGames(ds: Dataset): Game[] {
  const withRows = new Set<string>()
  for (const p of ds.batting) withRows.add(p.gameId)
  for (const p of ds.pitching) withRows.add(p.gameId)
  return ds.games.filter((g) => !g.status && withRows.has(g.id)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

/** Game-level filters (tournament / date / opponent / home-away / result). */
export function filterGames(ds: Dataset, f: Filters): { games: Game[]; summaries: GameSummary[] } {
  const summaries: GameSummary[] = []
  const games: Game[] = []
  for (const g of playedGames(ds)) {
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
    games, summaries: summaries.filter((s) => !isIntra(s.game)), allSummaries: summaries, gameIds,
    batting: ds.batting.filter((p) => gameIds.has(p.gameId) && (pos === 'all' || (p.pos ?? '') === pos)),
    pitching: ds.pitching.filter((p) => gameIds.has(p.gameId)),
    fielding: ds.fielding.filter((p) => gameIds.has(p.gameId) && (pos === 'all' || p.pos === pos)),
  }
}

export const uniqueSorted = (values: Array<string | undefined>) => [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
