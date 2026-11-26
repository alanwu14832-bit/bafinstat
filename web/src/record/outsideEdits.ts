/**
 * 比賽中別台裝置的修改: while a game is being recorded, the recording device writes the whole game back every time its
 * rows change (pages/Record.tsx sync). A second device that fixed something meanwhile in 修改資料 — a 球速 typed in from
 * the back office, a 落點, a note — saved it to the cloud, but the recording device did not know, and its next save put
 * its own copy back over it (a recorder's report, 2026-11-26: 球速 存好了，回去看又不見).
 *
 * So before each save the recording device reads the game from the cloud and compares it with how the cloud was right
 * after its own last save (`base`): whatever another device changed there, and the recording device did not change
 * since, is taken in — field by field, row by row (a three-way merge). What both changed keeps the recording device's
 * version. Rows the other device does not have (it opened the game earlier) are left alone; rows are never added or
 * removed here.
 */
import type { BattingPA, Game, PitchingPA } from '../data/types'
import { applyLiveEdit } from './liveEdit'
import type { RecordState } from './model'

export interface CloudGame { game?: Game; batting: BattingPA[]; pitching: PitchingPA[] }

/** A value as it means: undefined, null, '', an empty list or a list of nothing are all "not filled"; objects key-sorted. */
function canon(v: unknown): string {
  const norm = (x: unknown): unknown => {
    if (x === undefined || x === null || x === '') return null
    if (Array.isArray(x)) { const a = x.map(norm); return a.every((y) => y === null) ? null : a }
    if (typeof x === 'object') { const o: Record<string, unknown> = {}; for (const k of Object.keys(x as object).sort()) { const y = norm((x as Record<string, unknown>)[k]); if (y !== null) o[k] = y } return Object.keys(o).length ? o : null }
    return x
  }
  return JSON.stringify(norm(v))
}
const same = (a: unknown, b: unknown) => canon(a) === canon(b)

/** The fields that carry the game along (who is up, the count, the runners, the outs): the recording screen follows these. */
const FLOW = new Set(['gameId', 'inning', 'outsBefore', 'basesBefore', 'order', 'batter', 'oppOrder', 'oppBatter', 'pitcher', 'pitches', 'result', 'code', 'runner', 'events',
  'sb', 'cs', 'sba', 'advOnError', 'outOnBase', 'run', 'rbi', 'er', 'wp', 'pb', 'pk', 'errors', 'baserunningOuts', 'priorPitchers'])
/** Game fields the recording device writes from its own setup (never taken from another device here). */
const GAME_OWN = new Set(['id', 'dayRoster', 'innings', 'status', 'updatedBy', 'createdBy'])

/** One row merged: each field another device changed (cloud ≠ base) and this one did not (ours = base) comes from the cloud. */
function mergeRow<T extends object>(ours: T, base: T, cloud: T, skip?: Set<string>): T | null {
  let out: T | null = null
  for (const k of new Set([...Object.keys(base), ...Object.keys(cloud)])) {
    if (skip?.has(k)) continue
    const b = (base as Record<string, unknown>)[k], c = (cloud as Record<string, unknown>)[k], o = (ours as Record<string, unknown>)[k]
    if (same(c, b) || !same(o, b) || same(o, c)) continue
    out ??= { ...ours }
    if (c === undefined || c === null) delete (out as Record<string, unknown>)[k]
    else (out as Record<string, unknown>)[k] = c
  }
  return out
}
function mergeRows<T extends object>(ours: T[], base: T[], cloud: T[], skip?: Set<string>): { rows: T[]; changed: number } {
  let changed = 0
  const rows = ours.map((o, i) => {
    if (i >= base.length || i >= cloud.length) return o
    const m = mergeRow(o, base[i], cloud[i], skip)
    if (m) changed++
    return m ?? o
  })
  return { rows, changed }
}

/**
 * The recording state with another device's changes taken in. `changed` counts the plate appearances (and the game
 * itself) that took something; 0 = nothing came in (the same state is returned). A change to how the game went (a
 * result, the runners) that the recording screen cannot follow is left out (`skipped`): the recorder fixes that in
 * 逐打席 — the rest still comes in.
 */
export function mergeOutsideEdits(s: RecordState, base: CloudGame | null, cloud: CloudGame | null): { state: RecordState; changed: number; skipped: number } {
  if (!base || !cloud) return { state: s, changed: 0, skipped: 0 }
  const bat = mergeRows(s.batting, base.batting, cloud.batting)
  const pit = mergeRows(s.pitching, base.pitching, cloud.pitching)
  const g = base.game && cloud.game ? mergeRow(s.game, base.game, cloud.game, GAME_OWN) : null
  const changed = bat.changed + pit.changed + (g ? 1 : 0)
  if (!changed) return { state: s, changed: 0, skipped: 0 }
  const game = g ?? s.game
  try {
    return { state: { ...applyLiveEdit(s, bat.rows, pit.rows), game }, changed, skipped: 0 }
  } catch {
    // the game's flow could not take it: everything but the flow fields comes in
    const bat2 = mergeRows(s.batting, base.batting, cloud.batting, FLOW)
    const pit2 = mergeRows(s.pitching, base.pitching, cloud.pitching, FLOW)
    const kept = bat2.changed + pit2.changed + (g ? 1 : 0)
    return { state: kept ? { ...s, batting: bat2.rows, pitching: pit2.rows, game } : s, changed: kept, skipped: changed - kept || 1 }
  }
}
