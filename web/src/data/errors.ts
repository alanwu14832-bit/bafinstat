/**
 * 守備失誤, both teams, one rule (the site's E columns, the scoresheet, the Live page and the Excel 總表 all use it):
 *  - ours, on an opponent plate appearance (PitchingPA.errors): which of our fielders erred while that batter was up (a
 *    hit plus an error, a bad throw on a steal, a dropped fly…), one position per error, so two errors by the shortstop
 *    are ['SS', 'SS'];
 *  - theirs, on one of our plate appearances (BattingPA.errors): their fielders' positions the same way, '?' when the
 *    recorder did not know who (「不知道」).
 * A 失誤 result is one error at its 落點 (unknown without one); 妨礙 (catcher's interference) is the catcher's error.
 *  - Their list never holds the result's own error, so it is always added on top.
 *  - Our list may (rows typed before the rule, and the Excel help: 「已經填了同一個守位就不重複算」): when it already
 *    names the result's position, that entry is the result's own error. So whoever writes our list adds the result's
 *    own position as soon as another error at that position goes in (withOurErrors), and the count stays right.
 * A 趁傳進壘 is not an error (a throw to another base, nobody's fault), a 失誤進壘 is.
 */
import { POSITION_BY_NUMBER, type BattingPA, type PitchingPA, type PlayEvent } from './types'

export const FIELD_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const
/** Their error, fielder not known (「不知道」). Only in BattingPA.errors. */
export const UNKNOWN_FIELDER = '?'
const VALID = new Set<string>(FIELD_POSITIONS)
const ALIAS: Record<string, string> = { 投: 'P', 投手: 'P', 捕: 'C', 捕手: 'C', 一壘: '1B', 二壘: '2B', 三壘: '3B', 游擊: 'SS', 游: 'SS', 左外野: 'LF', 左: 'LF', 中外野: 'CF', 中: 'CF', 右外野: 'RF', 右: 'RF' }
const UNKNOWN_ALIAS = new Set(['?', '？', '不知道', '不明', '未知'])

/** Positions from an array or typed text ('SS、LF', '6 7', '游擊,左外野'); anything else is dropped. With `unknown`
 *  (their errors), 「?」／「不知道」／「不明」 is kept as UNKNOWN_FIELDER. */
export function cleanErrors(v: unknown, opts: { unknown?: boolean } = {}): string[] {
  const parts = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/[\s、,，;；/]+/) : []
  return parts.map((t) => t.trim().toUpperCase()).filter(Boolean)
    .map((t) => (opts.unknown && UNKNOWN_ALIAS.has(t) ? UNKNOWN_FIELDER : /^[1-9]$/.test(t) ? POSITION_BY_NUMBER[Number(t)] : ALIAS[t] ?? t))
    .filter((t) => VALID.has(t) || (opts.unknown && t === UNKNOWN_FIELDER))
}
/** Their errors as typed (Excel 對方失誤, 修改資料): positions and '?'. */
export const cleanOppErrors = (v: unknown) => cleanErrors(v, { unknown: true })

/** The result's own error: a 失誤 at its 落點 (undefined position = not known), 妨礙 at C; null when it is no error. */
function resultError(result: string, loc?: number): { pos?: string } | null {
  if (result === '妨礙') return { pos: 'C' }
  if (result === '失誤') return { pos: loc ? POSITION_BY_NUMBER[loc] : undefined }
  return null
}

/** Our list plus the result's own error, unless the list already holds it (see the top of this file): it names the
 *  result's position, or (a 失誤 without 落點) the list is not empty. */
function withResult(list: string[], result: string, loc?: number): { positions: string[]; unknown: number } {
  const positions = list.filter((x) => x !== UNKNOWN_FIELDER)
  let unknown = list.length - positions.length
  const own = resultError(result, loc)
  if (own && (own.pos ? !list.includes(own.pos) : !list.length)) { if (own.pos) positions.push(own.pos); else unknown++ }
  return { positions, unknown }
}

/**
 * Our list (PitchingPA.errors) after `add` more errors go into it, written so errorsOf counts every one: when the result
 * is a 失誤／妨礙 at a position the list did not name yet and one of the new errors is at that position, the result's own
 * error is written out too (otherwise the two would read as one).
 */
export function withOurErrors(stored: string[] | undefined, add: string[], result: string, loc?: number): string[] {
  const list = [...(stored ?? []), ...add]
  const own = resultError(result, loc)
  if (own?.pos && !(stored ?? []).includes(own.pos) && add.includes(own.pos)) list.push(own.pos)
  return list
}

/** How many 失誤進壘 plays on this row are an error besides the result's own: one per play between pitches, one for the
 *  batted ball unless the result is 失誤 (then it is that same error). */
export function errAdvanceErrors(p: Pick<PitchingPA | BattingPA, 'result' | 'events'>): number {
  const e = errPlays(p.events)
  return e.between + (e.onPlay && p.result !== '失誤' ? 1 : 0)
}

/**
 * 修改資料's 我隊守備失誤 counter: our list with `v` errors at `pos`. Picking the fielder of a 失誤進壘 that has none yet,
 * when he is also the 失誤 result's own position (its 落點; 妨礙 = C), goes through withOurErrors like 紀錄比賽 does, so
 * the result's error is written out too and both count (otherwise the one entry would read as the result's own).
 */
export function setOurErrorCount(p: Pick<PitchingPA, 'errors' | 'result' | 'loc' | 'events'>, pos: string, v: number): string[] {
  const stored = p.errors ?? []
  const before = stored.filter((x) => x === pos).length
  const rest = stored.filter((x) => x !== pos)
  const own = resultError(p.result, p.loc)?.pos
  if (own === pos && before === 0 && v === 1 && stored.length < errAdvanceErrors(p)) return withOurErrors(rest, [pos], p.result, p.loc)
  return [...rest, ...Array.from({ length: v }, () => pos)]
}

/**
 * Their list (BattingPA.errors) when the row's result changes to `result`, the way 紀錄比賽 writes it (commitPA): a
 * 失誤進壘 on the batted ball adds a 不知道 unless the result is 失誤 (it is that same error). Entering 失誤 drops the
 * 不知道 the batted ball's 失誤進壘 had added (the list's last entry, past the ones between pitches); leaving it adds one
 * back unless the list already holds an entry for it. A row without a list keeps none (its errors follow the plays).
 */
export function oppErrorsForResult(b: Pick<BattingPA, 'errors' | 'result' | 'events'>, result: string): string[] {
  const list = b.errors ?? []
  const e = errPlays(b.events)
  if (!list.length || !e.onPlay || (b.result === '失誤') === (result === '失誤')) return list
  if (result === '失誤') return list.length > e.between && list[list.length - 1] === UNKNOWN_FIELDER ? list.slice(0, -1) : list
  return list.length > e.between ? list : [...list, UNKNOWN_FIELDER]
}

/** Our errors charged on this opponent plate appearance (see the top of this file). */
export function errorsOf(p: Pick<PitchingPA, 'errors' | 'result' | 'loc'>): { positions: string[]; unknown: number } {
  return withResult(p.errors ?? [], p.result, p.loc)
}

/** 失誤進壘 plays on a row: between pitches (one error each) and on the batted ball (one error for the whole play). */
const errPlays = (events?: PlayEvent[]) => ({ between: (events ?? []).filter((e) => e.kind === 'err' && !e.play).length, onPlay: (events ?? []).some((e) => e.kind === 'err' && e.play) })

/**
 * Their errors while this batter of ours was up: the list (BattingPA.errors, every error but the 失誤 result's own) plus
 * the result. Rows saved before the list existed count their 失誤進壘 plays instead: one per play between pitches, one
 * for the batted ball (a throw that moves several runners is one error; none extra on a 失誤 result, it is that error).
 */
export function oppErrorsOf(b: Pick<BattingPA, 'errors' | 'result' | 'loc' | 'events'>): { positions: string[]; unknown: number; count: number } {
  const list = b.errors?.length ? b.errors : implicitOppErrors(b)
  const positions = list.filter((x) => x !== UNKNOWN_FIELDER)
  let unknown = list.length - positions.length
  const own = resultError(b.result, b.loc)
  if (own) { if (own.pos) positions.push(own.pos); else unknown++ }
  return { positions, unknown, count: positions.length + unknown }
}
/** What an older row (no list) had as their errors besides its result: '?' per 失誤進壘 play (see oppErrorsOf). */
export function implicitOppErrors(b: Pick<BattingPA, 'result' | 'events'>): string[] {
  const e = errPlays(b.events)
  return Array.from({ length: e.between + (e.onPlay && b.result !== '失誤' ? 1 : 0) }, () => UNKNOWN_FIELDER)
}
/** The 對方失誤 list to write out (Excel, the editor): the stored list, or an older row's implicit errors. */
export const oppErrorList = (b: Pick<BattingPA, 'errors' | 'result' | 'events'>): string[] => (b.errors?.length ? b.errors : implicitOppErrors(b))
/** How many errors a team made, from its fielding plate appearances. */
export const oppErrorCount = (rows: Array<Pick<BattingPA, 'errors' | 'result' | 'loc' | 'events'>>) => rows.reduce((a, b) => a + oppErrorsOf(b).count, 0)
export const ourErrorCount = (rows: Array<Pick<PitchingPA, 'errors' | 'result' | 'loc'>>) => rows.reduce((a, p) => { const e = errorsOf(p); return a + e.positions.length + e.unknown }, 0)

/** 'SS、SS、LF' for the Excel cell and the play-by-play ('?' reads 不明). */
export const errorsText = (e?: string[]) => (e ?? []).map((x) => (x === UNKNOWN_FIELDER ? '不明' : x)).join('、')
