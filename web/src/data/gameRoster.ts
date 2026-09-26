/**
 * 當日登錄名單: who started, who came off the bench and who sat, for one game. It is stored on the Game itself
 * (game.dayRoster, cloud column games.day_roster), so every save path carries it. Games without one (recorded
 * before this existed, imported, demo) fall back to what their plate-appearance rows imply.
 */
import type { Dataset, DayRosterSub, Game, GameDayRoster } from './types'

/** The migration a Supabase project needs for day rosters and registration lists. */
export const ROSTERS_MIGRATION = 'supabase/migrations/2026-09-26_rosters.sql'
/** Shown (as a save warning) when the cloud has no games.day_roster column yet. */
export const DAY_ROSTER_UNSUPPORTED = `當日登錄名單沒有存進雲端：請管理員在 Supabase 執行 ${ROSTERS_MIGRATION}`

/** Labels of the substitution kinds (Excel 替補紀錄 column, game detail badges). */
export const SUB_KIND_LABEL: Record<DayRosterSub['kind'], string> = { PH: '代打', PR: '代跑', DEF: '守備', P: '換投' }
const SUB_KINDS = new Set<string>(Object.keys(SUB_KIND_LABEL))

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const nameOf = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const posOf = (v: unknown): string => (typeof v === 'string' ? v.trim().toUpperCase() : '')
const intOf = (v: unknown, min: number): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) && n >= min ? Math.round(n) : undefined
}

/**
 * Defensive read of a stored day roster (cloud jsonb, localStorage, Excel import, hand-edited rows): trims names,
 * drops blanks and duplicates, removes bench names that are starters, coerces reentry to a boolean. Returns
 * undefined for null / garbage / an empty roster. Idempotent (normalize runs it on every load).
 */
export function parseDayRoster(v: unknown): GameDayRoster | undefined {
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return undefined } }
  if (!isObj(v)) return undefined
  const seen = new Set<string>()
  const starters: GameDayRoster['starters'] = []
  for (const s of Array.isArray(v.starters) ? v.starters : []) {
    if (!isObj(s)) continue
    const name = nameOf(s.name)
    if (!name || seen.has(name)) continue
    seen.add(name)
    const order = intOf(s.order, 1)
    starters.push(order === undefined ? { name, pos: posOf(s.pos) } : { name, pos: posOf(s.pos), order })
  }
  const bench: string[] = []
  for (const b of Array.isArray(v.bench) ? v.bench : []) { const name = nameOf(b); if (name && !seen.has(name)) { seen.add(name); bench.push(name) } }
  const subs: DayRosterSub[] = []
  for (const x of Array.isArray(v.subs) ? v.subs : []) {
    if (!isObj(x)) continue
    const name = nameOf(x.in)
    if (!name) continue
    const k = typeof x.kind === 'string' ? x.kind.trim().toUpperCase() : ''
    const slot = intOf(x.slot, 0)
    subs.push({ kind: (SUB_KINDS.has(k) ? k : 'DEF') as DayRosterSub['kind'], in: name, out: nameOf(x.out), pos: posOf(x.pos), inning: intOf(x.inning, 0) ?? 0, half: x.half === 'bottom' ? 'bottom' : 'top', ...(slot === undefined ? {} : { slot }) })
  }
  if (!starters.length && !bench.length && !subs.length) return undefined
  // subs is left out when empty so a roster without substitutions looks the same before and after a save
  return { starters, bench, ...(subs.length ? { subs } : {}), reentry: v.reentry === true || v.reentry === 1 || v.reentry === 'true' }
}

/** Every name a day roster mentions (starters, bench, substitutions in and out). */
export function dayRosterNames(r?: GameDayRoster): string[] {
  if (!r) return []
  const out = new Set<string>()
  for (const s of r.starters) out.add(s.name)
  for (const n of r.bench) out.add(n)
  for (const s of r.subs ?? []) { out.add(s.in); out.add(s.out) }
  out.delete('')
  return [...out]
}

/** Apply player renames ([from, to] pairs) inside a day roster. Returns the same object when nothing changed. */
export function renameInDayRoster<T extends GameDayRoster | undefined>(r: T, renames: Array<[string, string]>): T {
  if (!r || !renames.length) return r
  const map = new Map(renames)
  if (!dayRosterNames(r).some((n) => map.has(n))) return r
  const rn = (n: string) => map.get(n) ?? n
  const next: GameDayRoster = { ...r, starters: r.starters.map((s) => ({ ...s, name: rn(s.name) })), bench: r.bench.map(rn), ...(r.subs ? { subs: r.subs.map((s) => ({ ...s, in: rn(s.in), out: rn(s.out) })) } : {}) }
  // a rename onto a name already listed would duplicate it; parsing again dedupes
  return (parseDayRoster(next) ?? next) as T
}

/** One player line of the 當日登錄名單 view. `kind` / `replaced` only come from a recorded substitution log. */
export interface AppearanceRow { name: string; pos?: string; order?: number; kind?: DayRosterSub['kind']; inning?: number; half?: 'top' | 'bottom'; replaced?: string }
export interface GameAppearances {
  starters: AppearanceRow[]
  /** substitutions in the order they happened (one row per logged substitution, so a starter who moves to the mound
   *  or re-enters appears here too), plus everyone else who played but is neither a starter nor logged */
  subs: AppearanceRow[]
  /** 到場未上場: bench names that never entered (always empty without a day roster) */
  bench: string[]
  /** true when the starters were inferred from the rows (the game has no day roster starters) */
  inferred: boolean
}

/**
 * Who started, who came in and who sat, for one game. Pass the UNFILTERED dataset: the 守位 filter narrows
 * batting rows and would hide substitutes. Without a saved roster, starters are the first batter per batting
 * order plus the first pitcher (the same rule as GS), and the bench is unknown.
 */
export function gameAppearances(ds: Dataset, game: Game): GameAppearances {
  const bat = ds.batting.filter((p) => p.gameId === game.id)
  const pit = ds.pitching.filter((p) => p.gameId === game.id)
  const fld = ds.fielding.filter((f) => f.gameId === game.id)
  const r = game.dayRoster
  // we bat in the bottom half at home and the top half away
  const batHalf = game.homeAway === '客' ? 'top' : 'bottom'
  const pitHalf = batHalf === 'top' ? 'bottom' : 'top'
  const first = new Map<string, { inning: number; half: 'top' | 'bottom'; pos?: string }>()
  const seen = (name: string, inning: number, half: 'top' | 'bottom', pos?: string) => {
    if (!name) return
    const f = first.get(name)
    if (!f) { first.set(name, { inning, half, pos }); return }
    if (inning && (!f.inning || inning < f.inning || (inning === f.inning && half === 'top' && f.half === 'bottom'))) first.set(name, { inning, half, pos: f.pos ?? pos })
  }
  for (const p of bat) seen(p.batter, p.inning, batHalf, p.pos)
  for (const p of pit) seen(p.pitcher, p.inning, pitHalf, 'P')
  for (const f of fld) seen(f.player, 0, pitHalf, f.pos)

  const entered = new Set([...bat.map((p) => p.batter), ...pit.map((p) => p.pitcher), ...fld.map((f) => f.player), ...(r?.subs ?? []).map((s) => s.in)].filter(Boolean))
  let starters: AppearanceRow[]
  const inferred = !r?.starters.length
  if (!inferred) starters = r!.starters.map((s) => ({ name: s.name, pos: s.pos || undefined, order: s.order }))
  else {
    // a pinch hitter shares the starter's order, so the first batter per order is the starter
    const byOrder = new Map<number, AppearanceRow>()
    const names = new Set<string>()
    for (const p of bat) if (p.order && p.batter && !byOrder.has(p.order) && !names.has(p.batter)) { byOrder.set(p.order, { name: p.batter, pos: p.pos, order: p.order }); names.add(p.batter) }
    starters = [...byOrder.values()].sort((a, b) => a.order! - b.order!)
    const sp = pit.find((p) => p.pitcher)?.pitcher
    if (sp && !names.has(sp)) starters.push({ name: sp, pos: 'P' })
  }
  const starterNames = new Set(starters.map((s) => s.name))
  const subs: AppearanceRow[] = (r?.subs ?? []).map((s) => ({ name: s.in, pos: s.pos || undefined, kind: s.kind, inning: s.inning || undefined, half: s.half, replaced: s.out || undefined }))
  const logged = new Set(subs.map((s) => s.name))
  for (const name of entered) {
    if (starterNames.has(name) || logged.has(name)) continue
    const f = first.get(name)
    subs.push({ name, pos: f?.pos, inning: f?.inning || undefined, half: f?.inning ? f.half : undefined })
  }
  const at = (s: AppearanceRow) => (s.inning ? s.inning * 2 + (s.half === 'bottom' ? 1 : 0) : 1e9)
  subs.sort((a, b) => at(a) - at(b)) // stable: logged substitutions keep their order within a half
  const bench = (r?.bench ?? []).filter((n) => !entered.has(n) && !starterNames.has(n))
  return { starters, subs, bench, inferred }
}
