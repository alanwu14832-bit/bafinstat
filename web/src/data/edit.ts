/**
 * In-app corrections of one game. Pure functions: the store decides where the result is persisted.
 * The edited fragment goes through normalizeDataset so the same rules as an import apply
 * (innings from out codes, vocabulary aliases, fielding derived when none is given, warnings).
 */
import { normalizeDataset, type GameWarning } from './normalize'
import type { BattingPA, Dataset, FieldingLine, Game, PitchingPA } from './types'

export interface GameEdit {
  game: Game
  batting: BattingPA[]
  pitching: PitchingPA[]
  fielding: FieldingLine[]
}

/** One game's rows, as a standalone dataset fragment (roster included so normalize can check names). */
export function extractGame(ds: Dataset, id: string): GameEdit | null {
  const game = ds.games.find((g) => g.id === id)
  if (!game) return null
  return {
    game,
    batting: ds.batting.filter((p) => p.gameId === id),
    pitching: ds.pitching.filter((p) => p.gameId === id),
    fielding: ds.fielding.filter((f) => f.gameId === id),
  }
}

/** Normalize the edited game on its own; returns the fragment to persist plus review warnings. */
export function normalizeGameEdit(roster: Dataset['roster'], edit: GameEdit): { fragment: Dataset; warnings: GameWarning[] } {
  const id = edit.game.id
  const stamp = <T extends { gameId: string }>(rows: T[]) => rows.map((r) => ({ ...r, gameId: id }))
  const { dataset, warnings } = normalizeDataset({ roster, games: [edit.game], batting: stamp(edit.batting), pitching: stamp(edit.pitching), fielding: stamp(edit.fielding) })
  return { fragment: dataset, warnings }
}

/** Replace one game (and all its rows) inside a dataset with the normalized fragment. New players are added to the roster. */
export function applyGameEdit(base: Dataset, fragment: Dataset): Dataset {
  const game = fragment.games[0]
  const id = game.id
  const names = new Set(base.roster.map((p) => p.name))
  const exists = base.games.some((g) => g.id === id)
  return {
    roster: [...base.roster, ...fragment.roster.filter((p) => !names.has(p.name))],
    games: exists ? base.games.map((g) => (g.id === id ? game : g)) : [...base.games, game],
    batting: [...base.batting.filter((p) => p.gameId !== id), ...fragment.batting],
    pitching: [...base.pitching.filter((p) => p.gameId !== id), ...fragment.pitching],
    fielding: [...base.fielding.filter((f) => f.gameId !== id), ...fragment.fielding],
  }
}

export function removeGame(base: Dataset, id: string): Dataset {
  return {
    roster: base.roster,
    games: base.games.filter((g) => g.id !== id),
    batting: base.batting.filter((p) => p.gameId !== id),
    pitching: base.pitching.filter((p) => p.gameId !== id),
    fielding: base.fielding.filter((f) => f.gameId !== id),
  }
}
