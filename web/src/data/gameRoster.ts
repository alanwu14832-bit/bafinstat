/**
 * 當日登錄名單: who started, who came off the bench and who sat, for one game. It is stored on the Game itself
 * (game.dayRoster, cloud column games.day_roster), so every save path carries it. Games without one (recorded
 * before this existed, imported, demo) fall back to what their plate-appearance rows imply.
 */
import type { Dataset, DayRosterSub, Game, GameDayRoster, SubCharges } from './types'

/** The migration a Supabase project needs for day rosters and registration lists. */
export const ROSTERS_MIGRATION = 'supabase/migrations/2026-09-26_rosters.sql'
/** Shown (as a save warning) when the cloud has no games.day_roster column yet. */
export const DAY_ROSTER_UNSUPPORTED = `當日登錄名單沒有存進雲端：請管理員在 Supabase 執行 ${ROSTERS_MIGRATION}`
/** Shown when the cloud has no batting_pa.runner column: the 代跑's run / SB was saved on the batter. */
/** Shown when the cloud has no pitching_pa.errors column: 守備失誤 marked on opponent plate appearances was not saved. */
export const ERRORS_UNSUPPORTED = `打席上的守備失誤沒有存進雲端：請管理員在 Supabase 執行 ${ROSTERS_MIGRATION}`
/** Shown when the cloud has no events columns: the order of steals / wild pitches between pitches was not saved (the totals were). */
export const EVENTS_UNSUPPORTED = `每一球之間的跑壘順序沒有存進雲端（盜壘、暴投的次數照常儲存）：請管理員在 Supabase 執行 supabase/migrations/2026-10-07_play_events.sql`
export const RUNNER_UNSUPPORTED = `代跑沒有存進雲端（得分、盜壘暫時算在原打者）：請管理員在 Supabase 執行 ${ROSTERS_MIGRATION}`

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

/** The counts of SubCharges (besides its errors). */
export const CHARGE_COUNTS = ['sba', 'cs', 'pb', 'pk'] as const
/** A SubCharges with only what it has (undefined when it has nothing). */
export function chargesOrNone(c: SubCharges): SubCharges | undefined {
  const out: SubCharges = {}
  if (c.errors?.length) out.errors = [...c.errors]
  for (const k of CHARGE_COUNTS) if (c[k] && c[k]! > 0) out[k] = c[k]
  return Object.keys(out).length ? out : undefined
}
/** `a` without `b` (the errors one position at a time). */
export function chargesMinus(a: SubCharges, b?: SubCharges): SubCharges {
  const errors = [...(a.errors ?? [])]
  for (const e of b?.errors ?? []) { const k = errors.indexOf(e); if (k >= 0) errors.splice(k, 1) }
  const out: SubCharges = { errors }
  for (const k of CHARGE_COUNTS) out[k] = Math.max(0, (a[k] ?? 0) - (b?.[k] ?? 0))
  return out
}
/** All of them together. */
export function chargesSum(list: Array<SubCharges | undefined>): SubCharges {
  const out: SubCharges = { errors: list.flatMap((c) => c?.errors ?? []) }
  for (const k of CHARGE_COUNTS) out[k] = list.reduce((a, c) => a + (c?.[k] ?? 0), 0)
  return out
}
const chargesFrom = (v: unknown): SubCharges | undefined => {
  if (!isObj(v)) return undefined
  const c: SubCharges = { errors: (Array.isArray(v.errors) ? v.errors : []).map(posOf).filter(Boolean) }
  for (const k of CHARGE_COUNTS) c[k] = intOf(v[k], 1)
  return chargesOrNone(c)
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
    const slot = intOf(x.slot, 0), row = intOf(x.row, 1)
    subs.push({ kind: (SUB_KINDS.has(k) ? k : 'DEF') as DayRosterSub['kind'], in: name, out: nameOf(x.out), pos: posOf(x.pos), inning: intOf(x.inning, 0) ?? 0, half: x.half === 'bottom' ? 'bottom' : 'top', ...(slot === undefined ? {} : { slot }), ...(row === undefined ? {} : { row }) })
    const before = chargesFrom(x.before), after = chargesFrom(x.after)
    if (before) subs[subs.length - 1].before = before
    if (after) subs[subs.length - 1].after = after
  }
  const r = isObj(v.rules) ? v.rules : undefined
  const innings = r ? intOf(r.innings, 1) : undefined
  const rules = r && innings ? { innings, tiebreakFrom: intOf(r.tiebreakFrom, 1) ?? null, tiebreakBases: String(r.tiebreakBases ?? '').replace(/[^123]/g, '') } : undefined
  // an older game with no names can still carry the rules it was played by (set in 修改資料)
  if (!starters.length && !bench.length && !subs.length && !rules) return undefined
  // 隊內賽: the other side's name and its own lineup, bench and substitutions (parsed the same way)
  const x = isObj(v.intra) ? v.intra : undefined
  const team = x ? nameOf(x.team) : ''
  const opp = x && team ? parseDayRoster(x.opp) : undefined
  const mirrorOf = x && typeof x.mirrorOf === 'string' && x.mirrorOf ? { mirrorOf: x.mirrorOf } : {}
  const intra = team ? { intra: { team, opp: { starters: opp?.starters ?? [], bench: opp?.bench ?? [], ...(opp?.subs ? { subs: opp.subs } : {}) }, ...mirrorOf } } : {}
  // subs is left out when empty so a roster without substitutions looks the same before and after a save
  return { starters, bench, ...(subs.length ? { subs } : {}), reentry: v.reentry === true || v.reentry === 1 || v.reentry === 'true', ...(rules ? { rules } : {}), ...intra }
}

/** Every name a day roster mentions (starters, bench, substitutions in and out). */
/** Whether the roster lists anyone (a roster saved only for its rules does not). */
export const hasRosterNames = (r?: GameDayRoster) => !!r && (r.starters.length > 0 || r.bench.length > 0 || (r.subs?.length ?? 0) > 0)

export function dayRosterNames(r?: GameDayRoster): string[] {
  if (!r) return []
  const out = new Set<string>()
  for (const s of r.starters) out.add(s.name)
  for (const n of r.bench) out.add(n)
  for (const s of r.subs ?? []) { out.add(s.in); out.add(s.out) }
  // (隊內賽: the other side is our players too)
  for (const s of r.intra?.opp.starters ?? []) out.add(s.name)
  for (const n of r.intra?.opp.bench ?? []) out.add(n)
  for (const s of r.intra?.opp.subs ?? []) { out.add(s.in); out.add(s.out) }
  out.delete('')
  return [...out]
}

/** Apply player renames ([from, to] pairs) inside a day roster. Returns the same object when nothing changed. */
export function renameInDayRoster<T extends GameDayRoster | undefined>(r: T, renames: Array<[string, string]>): T {
  if (!r || !renames.length) return r
  const map = new Map(renames)
  if (!dayRosterNames(r).some((n) => map.has(n))) return r
  const rn = (n: string) => map.get(n) ?? n
  const side = <T extends Pick<GameDayRoster, 'starters' | 'bench' | 'subs'>>(x: T): T => ({ ...x, starters: x.starters.map((s) => ({ ...s, name: rn(s.name) })), bench: x.bench.map(rn), ...(x.subs ? { subs: x.subs.map((s) => ({ ...s, in: rn(s.in), out: rn(s.out) })) } : {}) })
  const next: GameDayRoster = { ...side(r), ...(r.intra ? { intra: { ...r.intra, opp: side(r.intra.opp) } } : {}) }
  // a rename onto a name already listed would duplicate it; parsing again dedupes
  return (parseDayRoster(next) ?? next) as T
}

/** A position-only change (守備調動, 「只改守位」 on 紀錄比賽): the same player in and out, `pos` his new position. */
export const isMove = (s: Pick<DayRosterSub, 'in' | 'out'>): boolean => !!s.in && s.in === s.out

const FIELD = new Set(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'])
const halfOrd = (inning: number, half: 'top' | 'bottom') => inning * 2 + (half === 'bottom' ? 1 : 0)

/** Who stood where in one half-inning: position → player and player → position (field positions only; P included);
 *  who was in the game (the batting order and the pitcher, positioned or not) and each one's batting slot (0 = leadoff). */
export interface Defense { byPos: Map<string, string>; byName: Map<string, string>; inGame: Set<string>; slot: Map<string, number> }

/**
 * 守備陣容 over the game, from the 當日登錄名單: the starters' positions, then every substitution in the order it was
 * logged, up to and including the half-inning asked for (a change logged while we bat counts from our next fielding
 * half). A newcomer with a position takes it; a 代打／代跑 (PH / PR) who stays in takes the position of the man he
 * replaced until a later change puts someone else there or moves him; a 守備調動 (isMove) moves the player; a double
 * switch or a swap is just several of these. When two players end up at one position, the later change wins.
 * A change logged in the middle of our fielding half (`row`) counts from that row on: `row` asks for the alignment at
 * that half's row (0 = its first opponent row); left out, every change of the half counts (its last alignment).
 * `stop` (the alignment just before or just after one change, DayRosterSub before / after): the changes up to that one
 * (subs[stop.index]), it included or not.
 * A 換投 takes the old pitcher off the mound only (he stays at a field position he moved to before).
 * undefined when the roster has no starter with a field position (old games: callers keep their own rules).
 */
export interface DefenseStop { index: number; include: boolean }
export function defenseTimeline(r?: Pick<GameDayRoster, 'starters' | 'subs'>): ((inning: number, half: 'top' | 'bottom', row?: number, stop?: DefenseStop) => Defense) | undefined {
  if (!r?.starters.some((s) => FIELD.has(s.pos))) return undefined
  const subs = (r.subs ?? []).map((s, i) => ({ s, at: halfOrd(s.inning, s.half), i })).sort((a, b) => a.at - b.at || a.i - b.i)
  return (inning, half, row = Infinity, stop) => {
    const when = halfOrd(inning, half)
    const where = new Map<string, { pos: string; seq: number }>()
    const inGame = new Set<string>()
    const slot = new Map<string, number>()
    let seq = 0
    for (const s of r.starters) {
      inGame.add(s.name)
      if (s.order !== undefined) slot.set(s.name, s.order - 1)
      if (FIELD.has(s.pos)) where.set(s.name, { pos: s.pos, seq: seq++ })
    }
    function apply(s: DayRosterSub) {
      if (isMove(s)) { if (FIELD.has(s.pos)) where.set(s.in, { pos: s.pos, seq: seq++ }); else where.delete(s.in); return }
      const prev = s.out ? where.get(s.out) : undefined
      // (a 換投 whose old pitcher already moved to a field position leaves him there, in the game)
      const stays = s.kind === 'P' && !!prev && prev.pos !== 'P'
      if (s.out && !stays) {
        where.delete(s.out); inGame.delete(s.out)
        if (!slot.has(s.in) && slot.has(s.out)) slot.set(s.in, slot.get(s.out)!)
        slot.delete(s.out)
      }
      if (!slot.has(s.in) && s.slot !== undefined && s.slot >= 0 && ![...slot.values()].includes(s.slot)) slot.set(s.in, s.slot)
      inGame.add(s.in)
      if (FIELD.has(s.pos)) where.set(s.in, { pos: s.pos, seq: seq++ })
      // (keeps the old claim's order: anyone set at that position later wins over the inherited claim)
      else if (prev && !stays) where.set(s.in, prev)
    }
    for (const { s, at, i } of subs) {
      if (at > when) break
      const last = stop?.index === i
      if (last && !stop.include) break
      if (!(at === when && s.row !== undefined && row < s.row)) apply(s)
      if (last) break
    }
    const best = new Map<string, { name: string; seq: number }>()
    for (const [name, w] of where) { const b = best.get(w.pos); if (!b || w.seq > b.seq) best.set(w.pos, { name, seq: w.seq }) }
    const byPos = new Map([...best].map(([pos, b]) => [pos, b.name]))
    return { byPos, byName: new Map([...byPos].map(([pos, name]) => [name, pos])), inGame, slot }
  }
}

/** One player line of the 當日登錄名單 view. `kind` / `replaced` only come from a recorded substitution log. */
export interface AppearanceRow { name: string; pos?: string; order?: number; kind?: DayRosterSub['kind']; inning?: number; half?: 'top' | 'bottom'; replaced?: string
  /** a 守備調動 (isMove): he only changed position, to `pos` */
  move?: true }
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
  const subs: AppearanceRow[] = (r?.subs ?? []).map((s) => ({ name: s.in, pos: s.pos || undefined, kind: s.kind, inning: s.inning || undefined, half: s.half, ...(isMove(s) ? { move: true as const } : { replaced: s.out || undefined }) }))
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
