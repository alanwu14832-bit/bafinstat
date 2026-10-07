/**
 * In-app corrections of one game. Pure functions: the store decides where the result is persisted.
 * The edited fragment goes through normalizeDataset so the same rules as an import apply
 * (innings from out codes, vocabulary aliases, fielding derived when none is given, warnings).
 */
import { catcherLine, catchingByPlayer, creditPlays, deriveFielding, normalizeDataset, type GameWarning } from './normalize'
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

type Tally = { e: number; po: number; a: number; dp: number }
/** What the plate appearances alone say each fielder did (errors, and putouts / assists / double plays), keyed by
 *  position — or by pitcher's name for P, since several pitchers share it. */
function tallyFromPlays(game: Game, batting: BattingPA[], pitching: PitchingPA[]): Map<string, Tally & { line: FieldingLine }> {
  const { lines } = deriveFielding(game, batting, pitching)
  creditPlays(lines, pitching)
  const out = new Map<string, Tally & { line: FieldingLine }>()
  for (const l of lines) {
    const key = l.pos === 'P' ? `P|${l.player}` : l.pos
    if (!out.has(key)) out.set(key, { e: l.e, po: l.po, a: l.a, dp: l.dp, line: l })
  }
  return out
}

/**
 * Keep the fielding lines in step with edited plate appearances: whatever the plays implied before the edit and
 * imply now is added as a difference, so an error or a putout changed in a plate appearance moves E / PO / A on the
 * right fielder (被盜壘 / 阻殺 / 捕逸 move on the catcher), and numbers typed into the 守備 table stay. PO / A / DP are left alone when the lines never had any
 * (the save then credits them from scratch).
 */
export function reconcileFielding(lines: FieldingLine[], game: Game, before: { batting: BattingPA[]; pitching: PitchingPA[] }, after: { batting: BattingPA[]; pitching: PitchingPA[] }): FieldingLine[] {
  if (!lines.length) return lines
  const was = tallyFromPlays(game, before.batting, before.pitching)
  const now = tallyFromPlays(game, after.batting, after.pitching)
  const plays = lines.some((l) => l.po || l.a)
  const out = lines.map((l) => ({ ...l }))
  const find = (key: string) => (key.startsWith('P|') ? out.find((l) => l.pos === 'P' && l.player === key.slice(2)) : out.find((l) => l.pos === key))
  for (const key of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(key), b = now.get(key)
    const d = (k: keyof Tally) => (b?.[k] ?? 0) - (a?.[k] ?? 0)
    const de = d('e'), dpo = plays ? d('po') : 0, da = plays ? d('a') : 0, ddp = plays ? d('dp') : 0
    if (!de && !dpo && !da && !ddp) continue
    const line = find(key)
    if (line) {
      line.e = Math.max(0, line.e + de); line.po = Math.max(0, line.po + dpo); line.a = Math.max(0, line.a + da); line.dp = Math.max(0, line.dp + ddp)
    } else if (b) {
      // a fielder (or pitcher) the lines did not have yet
      out.push({ ...b.line, e: Math.max(0, de), po: Math.max(0, dpo), a: Math.max(0, da), dp: Math.max(0, ddp) })
    }
  }
  // 被盜壘 / 阻殺 / 捕逸 move with the plate appearances too, on whoever was catching
  const cWas = catchingByPlayer(game, before.pitching, lines), cNow = catchingByPlayer(game, after.pitching, lines)
  for (const name of new Set([...cWas.keys(), ...cNow.keys()])) {
    const a = cWas.get(name), b = cNow.get(name)
    const dsb = (b?.sb ?? 0) - (a?.sb ?? 0), dcs = (b?.cs ?? 0) - (a?.cs ?? 0), dpb = (b?.pb ?? 0) - (a?.pb ?? 0)
    if (!dsb && !dcs && !dpb) continue
    const line = catcherLine(out, game, name)
    line.sb = Math.max(0, line.sb + dsb); line.cs = Math.max(0, line.cs + dcs); line.pb = Math.max(0, line.pb + dpb)
  }
  return out
}
