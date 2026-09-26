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
export async function saveCloudRegistration(r: Registration, email?: string | null): Promise<Registration> {
  return fromRow(await upsertRegistration({ season: r.season, tournament: r.tournament.trim(), players: r.players, updated_by: email ?? null }))
}
export const deleteCloudRegistration = (season: number, tournament: string) => deleteRegistrationRow(season, tournament)
