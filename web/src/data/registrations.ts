/**
 * 報名名單: the players registered for one tournament in one year (e.g. 2026 大專盃). A game finds its list by
 * year (game.date) + tournament; with no list (or an empty one) every roster player is eligible, so friendly games
 * and teams that never enter lists work as before. Cloud mode stores lists in the `registrations` table
 * (supabase/migrations/2026-09-26_rosters.sql); local mode keeps them in this browser.
 */
import { deleteRegistrationRow, fetchRegistrations, upsertRegistration, type RegistrationRow } from './supabase'
import type { Game, Registration } from './types'

export const REGISTRATIONS_KEY = 'bafin.registrations.v1'
/** Shown instead of the editor when the cloud has no registrations table yet. */
export const REGISTRATIONS_UNSUPPORTED = '報名名單需要管理員先在 Supabase 執行 supabase/migrations/2026-09-26_rosters.sql'

/** Year of an ISO date (2026-09-26 → 2026); 0 when there is none. */
export function seasonOf(date: string): number {
  const m = /^\s*(\d{4})/.exec(date ?? '')
  return m ? Number(m[1]) : 0
}
/** Identity of a list: season + trimmed tournament. */
export const registrationKey = (season: number, tournament: string) => `${season}|${(tournament ?? '').trim()}`

/** The list for a game's year + tournament (exact match), or undefined (no game, or no list for it). */
export function registrationFor(regs: Registration[], game: Pick<Game, 'date' | 'tournament'> | null | undefined): Registration | undefined {
  if (!game) return undefined
  const key = registrationKey(seasonOf(game.date), game.tournament ?? '')
  return regs.find((r) => registrationKey(r.season, r.tournament) === key)
}

/** The list with this registrationKey, or undefined. */
export function registrationByKey(regs: Registration[], key: string | null | undefined): Registration | undefined {
  return key ? regs.find((r) => registrationKey(r.season, r.tournament) === key) : undefined
}

/** Lists no scheduled game points at (e.g. 新生盃 entered before its games are on the schedule), so they can still be picked. */
export function unscheduledRegistrations(regs: Registration[], scheduled: Pick<Game, 'date' | 'tournament'>[]): Registration[] {
  const taken = new Set(scheduled.map((g) => registrationKey(seasonOf(g.date), g.tournament ?? '')))
  return regs.filter((r) => !taken.has(registrationKey(r.season, r.tournament)))
}

/** allNames narrowed to the list when it has at least one player; otherwise (no list, empty list) unchanged. */
export function eligibleNames(allNames: string[], reg?: Registration): string[] {
  if (!reg?.players.length) return allNames
  const ok = new Set(reg.players)
  return allNames.filter((n) => ok.has(n))
}

/** Clean one list read from storage, the cloud or the editor: trimmed tournament, trimmed unique players. null when unusable. */
export function parseRegistration(v: unknown): Registration | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const season = typeof o.season === 'number' ? o.season : typeof o.season === 'string' ? Number(o.season) : NaN
  const tournament = typeof o.tournament === 'string' ? o.tournament.trim() : ''
  if (!Number.isInteger(season) || season <= 0 || !tournament) return null
  const players = [...new Set((Array.isArray(o.players) ? o.players : []).filter((n): n is string => typeof n === 'string').map((n) => n.trim()).filter(Boolean))]
  return { season, tournament, players, ...(typeof o.updatedAt === 'string' ? { updatedAt: o.updatedAt } : {}) }
}

/** Newest season first, then tournament (zh-Hant collation). Returns a new array. */
export function sortRegistrations(regs: Registration[]): Registration[] {
  return [...regs].sort((a, b) => b.season - a.season || a.tournament.localeCompare(b.tournament, 'zh-Hant'))
}
/** Insert or replace (same season + tournament) one list; sorted. */
export function withRegistration(regs: Registration[], r: Registration): Registration[] {
  const key = registrationKey(r.season, r.tournament)
  return sortRegistrations([...regs.filter((x) => registrationKey(x.season, x.tournament) !== key), r])
}
export function withoutRegistration(regs: Registration[], season: number, tournament: string): Registration[] {
  const key = registrationKey(season, tournament)
  return regs.filter((x) => registrationKey(x.season, x.tournament) !== key)
}

/** Apply player renames ([from, to] pairs). Lists that did not change keep their identity, so callers can tell which to save. */
export function renameInRegistrations(regs: Registration[], renames: Array<[string, string]>): Registration[] {
  if (!renames.length) return regs
  const map = new Map(renames)
  return regs.map((r) => (r.players.some((n) => map.has(n)) ? { ...r, players: [...new Set(r.players.map((n) => map.get(n) ?? n))] } : r))
}
/** Drop removed players from every list. Unchanged lists keep their identity. */
export function removeFromRegistrations(regs: Registration[], names: string[]): Registration[] {
  if (!names.length) return regs
  const gone = new Set(names)
  return regs.map((r) => (r.players.some((n) => gone.has(n)) ? { ...r, players: r.players.filter((n) => !gone.has(n)) } : r))
}

/** A 報名名單 that follows its tournament's new name: `from` is removed, `to` written (players merged into a list the
 *  new name already had). */
export interface RegistrationMove { from: Registration; to: Registration }

/** Tournaments that never take a 報名名單 (the default names for friendlies and games without a 杯賽): a list never
 *  moves to one of them (a tournament's last game changed to 友誼賽 / its 杯賽 cleared keeps its list where it was, and
 *  the editor flags it) and they are never offered as the new name of a list. */
export const NO_LIST = new Set(['友誼賽', '未分類', '練習'])

type GameKey = Pick<Game, 'id' | 'date' | 'tournament'>
/**
 * Renaming a tournament renames its 報名名單 (batch 17: the 杯賽 filter kept showing 秋季聯賽 after the games became
 * 2026秋季聯賽). For each game whose (year, 杯賽) changed between `before` and `after`: when no game is left under the old
 * name that year and a list has it, the list moves to the new name (merged with the new name's list when there is one).
 * A rename that leaves other games under the old name moves nothing, and nothing moves to 友誼賽 / 未分類 / 練習 (NO_LIST).
 */
export function registrationMoves(regs: Registration[], before: GameKey[], after: GameKey[]): RegistrationMove[] {
  const keyOf = (g: GameKey) => registrationKey(seasonOf(g.date), g.tournament ?? '')
  const was = new Map(before.map((g) => [g.id, g]))
  const stillUsed = new Set(after.map(keyOf))
  const moves = new Map<string, RegistrationMove>()
  // the lists as the moves so far leave them: two old names renamed into one new name both end up in it
  let cur = regs
  for (const g of after) {
    const old = was.get(g.id)
    if (!old) continue
    const from = keyOf(old), to = keyOf(g)
    if (from === to || stillUsed.has(from) || moves.has(from) || !(g.tournament ?? '').trim() || NO_LIST.has(g.tournament.trim())) continue
    const list = registrationByKey(regs, from)
    if (!list) continue
    const target = registrationByKey(cur, to)
    const move = { from: list, to: { season: seasonOf(g.date), tournament: g.tournament.trim(), players: [...new Set([...(target?.players ?? []), ...list.players])] } }
    moves.set(from, move)
    cur = applyRegistrationMoves(cur, [move])
  }
  return [...moves.values()]
}
/** The lists after the moves (sorted). */
export function applyRegistrationMoves(regs: Registration[], moves: RegistrationMove[]): Registration[] {
  let out = regs
  for (const m of moves) out = withRegistration(withoutRegistration(out, m.from.season, m.from.tournament), m.to)
  return out
}
/** `regs` (e.g. the 報名名單 sheet of a file imported with 取代) moved along with the games renamed from `before` to `after`. */
export const followRenames = (regs: Registration[], before: GameKey[], after: GameKey[]): Registration[] => applyRegistrationMoves(regs, registrationMoves(regs, before, after))
/** 「報名名單也一起改名：2026 年「秋季聯賽」→「2026秋季聯賽」」 (the year apart from the names, so 秋季聯賽 → 2026秋季聯賽 does
 *  not read as the same name) */
export const registrationMoveText = (moves: RegistrationMove[]) => moves.length ? `報名名單也一起改名：${moves.map((m) => `${m.from.season} 年「${m.from.tournament}」→「${m.to.tournament}」`).join('、')}` : ''

/** 秋季聯賽 ~ 2026秋季聯賽 ~ 2026 秋季聯賽: one name inside the other once the digits and spaces are left out */
const looksRenamed = (a: string, b: string) => {
  const x = a.replace(/[\d\s年度第屆届]/g, ''), y = b.replace(/[\d\s年度第屆届]/g, '')
  return !!x && !!y && (x.includes(y) || y.includes(x))
}

/**
 * 報名名單 editor: a list whose 杯賽 has no game that year (renamed since, typed differently, or registered before its
 * first game is on the schedule) is flagged; a likely new name is offered as the fix (「改成 2026秋季聯賽」): a
 * tournament of that year with games and no list whose name contains this one (or the other way round), else the only
 * such tournament. 友誼賽 / 未分類 / 練習 are never offered.
 */
export function orphanRegistration(r: Registration, regs: Registration[], games: Pick<Game, 'date' | 'tournament'>[]): { orphan: boolean; suggestion?: string } {
  const year = games.filter((g) => seasonOf(g.date) === r.season)
  if (year.some((g) => (g.tournament ?? '').trim() === r.tournament)) return { orphan: false }
  const listed = new Set(regs.filter((x) => x.season === r.season).map((x) => x.tournament))
  const free = [...new Set(year.map((g) => (g.tournament ?? '').trim()).filter((t) => t && !listed.has(t) && !NO_LIST.has(t)))]
  const alike = free.filter((t) => looksRenamed(t, r.tournament))
  const pick = alike.length === 1 ? alike[0] : !alike.length && free.length === 1 ? free[0] : undefined
  return { orphan: true, ...(pick ? { suggestion: pick } : {}) }
}

// ---------------------------------------------------------------- local mode (this browser)
export function readLocalRegistrations(): Registration[] {
  try {
    const v = localStorage.getItem(REGISTRATIONS_KEY)
    const raw: unknown = v ? JSON.parse(v) : []
    return sortRegistrations((Array.isArray(raw) ? raw : []).map(parseRegistration).filter((r): r is Registration => !!r))
  } catch { return [] }
}
export function writeLocalRegistrations(list: Registration[]) {
  try { localStorage.setItem(REGISTRATIONS_KEY, JSON.stringify(list)) } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------- cloud mode
const fromRow = (r: RegistrationRow): Registration => parseRegistration({ season: Number(r.season), tournament: r.tournament, players: r.players ?? [], updatedAt: r.updated_at }) ?? { season: Number(r.season), tournament: r.tournament, players: [] }

/** null when the table is missing (migration not run yet). */
export async function loadCloudRegistrations(): Promise<Registration[] | null> {
  const rows = await fetchRegistrations()
  return rows === null ? null : sortRegistrations(rows.map(fromRow))
}
export async function saveCloudRegistration(r: Registration, _email?: string | null): Promise<Registration> {
  // updated_by is stamped by the database with the recorder's name (this table is public)
  return fromRow(await upsertRegistration({ season: r.season, tournament: r.tournament.trim(), players: r.players, updated_by: null }))
}
export const deleteCloudRegistration = (season: number, tournament: string) => deleteRegistrationRow(season, tournament)
