/**
 * In-app corrections of one game. Pure functions: the store decides where the result is persisted.
 * The edited fragment goes through normalizeDataset so the same rules as an import apply
 * (innings from out codes, vocabulary aliases, fielding derived when none is given, warnings).
 */
import { catcherLine, catchingByPlayer, creditPlays, deriveFielding, fieldersOf, normalizeDataset, type GameWarning } from './normalize'
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
  creditPlays(lines, pitching, game)
  const out = new Map<string, Tally & { line: FieldingLine }>()
  for (const l of lines) {
    const key = `${l.pos}|${l.player}`
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
export function reconcileFielding(lines: FieldingLine[], game: Game, before: { batting: BattingPA[]; pitching: PitchingPA[] }, after: { batting: BattingPA[]; pitching: PitchingPA[] }, gameAfter: Game = game): FieldingLine[] {
  if (!lines.length) return lines
  // (`gameAfter`: the game with its edited 當日登錄名單 — a 守備調動 added in 修改資料 moves the errors with it)
  const was = tallyFromPlays(game, before.batting, before.pitching)
  const now = tallyFromPlays(gameAfter, after.batting, after.pitching)
  const plays = lines.some((l) => l.po || l.a)
  const out = lines.map((l) => ({ ...l }))
  // the line of that player at that position; a pitcher only by name. Older lines (one player per position, from
  // before the 當日登錄名單 knew every change) are found by position when the plays only ever had one player there.
  const players = new Map<string, Set<string>>()
  for (const k of [...was.keys(), ...now.keys()]) { const [pos, name] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)]; players.set(pos, (players.get(pos) ?? new Set()).add(name)) }
  const find = (key: string) => {
    const pos = key.slice(0, key.indexOf('|')), name = key.slice(key.indexOf('|') + 1)
    return out.find((l) => l.pos === pos && l.player === name) ?? (pos !== 'P' && players.get(pos)?.size === 1 ? out.find((l) => l.pos === pos) : undefined)
  }
  const diffs = [...new Set([...was.keys(), ...now.keys()])].map((key) => {
    const a = was.get(key), b = now.get(key)
    const d = (k: keyof Tally) => (b?.[k] ?? 0) - (a?.[k] ?? 0)
    return { key, b, de: d('e'), dpo: plays ? d('po') : 0, da: plays ? d('a') : 0, ddp: plays ? d('dp') : 0 }
  })
  // what comes off goes first: with lines that disagree with the plays (saved before every change was logged), a
  // number taken away from someone who has no line comes off whoever at that position has it
  diffs.sort((x, y) => (x.de + x.dpo + x.da + x.ddp) - (y.de + y.dpo + y.da + y.ddp))
  const pushed = new Set<FieldingLine>()
  for (const { key, b, de, dpo, da, ddp } of diffs) {
    if (!de && !dpo && !da && !ddp) continue
    const pos = key.slice(0, key.indexOf('|'))
    const line = find(key) ?? (pos !== 'P' && (de < 0 || dpo < 0 || da < 0 || ddp < 0)
      ? out.find((l) => l.pos === pos && !pushed.has(l) && ((de < 0 && l.e > 0) || (dpo < 0 && l.po > 0) || (da < 0 && l.a > 0) || (ddp < 0 && l.dp > 0))) : undefined)
    if (line) {
      line.e = Math.max(0, line.e + de); line.po = Math.max(0, line.po + dpo); line.a = Math.max(0, line.a + da); line.dp = Math.max(0, line.dp + ddp)
    } else if (b) {
      // a fielder (or pitcher) the lines did not have yet
      const l = { ...b.line, e: Math.max(0, de), po: Math.max(0, dpo), a: Math.max(0, da), dp: Math.max(0, ddp) }
      out.push(l); pushed.add(l)
    }
  }
  // a change in the 登錄名單 moves the 守備局數 too: each line the alignment covers takes its innings from it (a line it
  // does not cover keeps what it had)
  if (fieldersOf(gameAfter) && alignmentKey(game) !== alignmentKey(gameAfter)) {
    for (const l of out) { const n = l.pos === 'P' ? undefined : now.get(`${l.pos}|${l.player}`)?.line.innings; if (n) l.innings = n }
  }
  // 被盜壘 / 阻殺 / 捕逸 move with the plate appearances too, on whoever was catching
  const cWas = catchingByPlayer(game, before.pitching, lines), cNow = catchingByPlayer(gameAfter, after.pitching, lines)
  for (const name of new Set([...cWas.keys(), ...cNow.keys()])) {
    const a = cWas.get(name), b = cNow.get(name)
    const dsb = (b?.sb ?? 0) - (a?.sb ?? 0), dcs = (b?.cs ?? 0) - (a?.cs ?? 0), dpb = (b?.pb ?? 0) - (a?.pb ?? 0)
    if (!dsb && !dcs && !dpb) continue
    const line = catcherLine(out, game, name)
    line.sb = Math.max(0, line.sb + dsb); line.cs = Math.max(0, line.cs + dcs); line.pb = Math.max(0, line.pb + dpb)
  }
  return out
}

/** What decides who stood where: the half we field, the starters and every substitution. */
const alignmentKey = (g: Pick<Game, 'homeAway' | 'dayRoster'>) => JSON.stringify([g.homeAway, g.dayRoster?.starters ?? [], g.dayRoster?.subs ?? []])

/** One fielding line whose E differs from what the plays and the 當日登錄名單 say (fieldingErrorFixes); `innings` = how
 *  long he stood there by the 登錄名單. */
export interface ErrorFix { player: string; pos: string; from: number; to: number; innings?: number }

/**
 * 修改資料 → 守備: the lines whose 失誤 differ from what the plate appearances say, each error charged to whoever stood
 * at that position in that half-inning (the 當日登錄名單 with every change). Games saved before every change was logged
 * (a 代打 who stayed in at SS, a 守備調動) have the error on the wrong player; one tap (applyErrorFixes) puts it right.
 * Only for a game with a roster that has the starters' positions (older games keep their typed numbers, no suggestion).
 */
export function fieldingErrorFixes(lines: FieldingLine[], game: Game, batting: BattingPA[], pitching: PitchingPA[]): ErrorFix[] {
  if (!fieldersOf(game) || !lines.length) return []
  const key = (l: Pick<FieldingLine, 'player' | 'pos'>) => `${l.player}\u0000${l.pos}`
  const want = new Map<string, ErrorFix>()
  for (const l of deriveFielding(game, batting, pitching).lines) {
    const w = want.get(key(l)) ?? { player: l.player, pos: l.pos, from: 0, to: 0, ...(l.innings ? { innings: l.innings } : {}) }
    w.to += l.e
    want.set(key(l), w)
  }
  for (const l of lines) {
    if (!l.player.trim()) continue
    const w = want.get(key(l)) ?? { player: l.player, pos: l.pos, from: 0, to: 0 }
    w.from += l.e
    want.set(key(l), w)
  }
  // the team total must agree before anything is moved: an error typed by hand with no plate appearance stays
  const fixes = [...want.values()].filter((f) => f.from !== f.to)
  const total = (k: 'from' | 'to') => fixes.reduce((a, f) => a + f[k], 0)
  return fixes.length && total('from') === total('to') ? fixes : []
}

/** The lines with the E of fieldingErrorFixes (a line a player did not have yet is added with the innings he stood
 *  there, else that game's 局數). */
export function applyErrorFixes(lines: FieldingLine[], game: Game, fixes: ErrorFix[]): FieldingLine[] {
  const out = lines.map((l) => ({ ...l }))
  for (const f of fixes) {
    const own = out.filter((l) => l.player === f.player && l.pos === f.pos)
    if (own.length) { own.forEach((l, i) => { l.e = i === 0 ? f.to : 0 }) }
    else if (f.to) out.push({ gameId: game.id, player: f.player, pos: f.pos, innings: f.innings ?? game.innings, po: 0, a: 0, e: f.to, dp: 0, pb: 0, sb: 0, cs: 0, note: '失誤依守位推定' })
  }
  return out
}
