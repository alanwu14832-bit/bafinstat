// wave-2 stand-in: batch 6 owns the scoresheet model (data/scoresheet.ts: buildScoresheet, Scoresheet, SheetLine, SheetCell).
// DEFERRED-TO-MERGE: after the merge, delete this file, import `type Scoresheet` from '../../data/scoresheet' in
// Scoresheet.tsx / pages/Print.tsx, and build the sheet with buildScoresheet(rows, side, { innings, subs }) — it adds the
// running paths, scoreMark codes (1B7, G6, K…), counts, pitch numbers and notes this placeholder leaves out.
import type { BattingPA, Game, PitchingPA } from '../../data/types'
import { isPA } from '../../data/types'
import { isHitResult } from '../../data/stats'
import { TEAM } from '../../config/team'

/** What the printed sheet reads of batch 6's SheetCell (a subset with the same names and types). */
export interface SheetCellLike {
  player: string
  kind: 'pa' | 'placed' | 'pr'
  mark: string
  looking?: boolean
  out?: 1 | 2 | 3
  /** furthest base reached, home = 4 */
  reached: number
  /** put out going to this base (× on the way there) */
  outAt?: number
  scored: boolean
  earned?: boolean
  left: boolean
  rbi: number
  count: string
  pitches: number
  notes: string[]
  /** a new pitcher from this plate appearance on */
  pitcherChange?: string
}
export interface SheetLineLike { order: number | null; players: Array<{ name: string; pos?: string; sub?: boolean | string }>; cells: Record<number, SheetCellLike[]> }
export interface ScoresheetLike {
  innings: number
  lines: SheetLineLike[]
  perInning: Record<number, { r: number; h: number; e: number | null; lob: number }>
  /** innings drawn without running paths */
  unfollowed: number[]
}

const OUT_NO: Record<string, 1 | 2 | 3> = { I: 1, II: 2, III: 3 }

/** Placeholder until batch 6's buildScoresheet is merged: slots, players and the plain result of each plate appearance,
 *  with outs, runs and 殘壘 from the result codes (no running paths: every inning counts as unfollowed). */
export function placeholderSheet(game: Game, rows: Array<BattingPA | PitchingPA>, side: 'bat' | 'pit'): ScoresheetLike {
  const maxInn = Math.max(game.innings ?? TEAM.innings, ...rows.map((r) => r.inning), 1)
  const slotOf = (r: BattingPA | PitchingPA) => (side === 'bat' ? (r as BattingPA).order : (r as PitchingPA).oppOrder) ?? null
  const nameOf = (r: BattingPA | PitchingPA) => (side === 'bat' ? (r as BattingPA).batter : (r as PitchingPA).oppBatter ?? '')
  const lines = new Map<number | null, SheetLineLike>()
  const perInning: ScoresheetLike['perInning'] = {}
  // the opponent's page counts our errors from the errors arrays (batch 6's rule); a game whose batters reached on 失誤
  // with no errors arrays at all was recorded before they existed: print a blank E row (null), not a misleading 0
  const oldData = side === 'pit' && !rows.some((r) => Array.isArray((r as PitchingPA).errors))
    && rows.some((r) => r.result === '失誤' || r.result === '妨礙')
  for (let i = 1; i <= maxInn; i++) perInning[i] = { r: 0, h: 0, e: oldData ? null : 0, lob: 0 }
  let pitcher = ''
  for (const r of rows) {
    const slot = slotOf(r)
    const line = lines.get(slot) ?? { order: slot, players: [], cells: {} }
    lines.set(slot, line)
    const name = nameOf(r) || (slot ? `第 ${slot} 棒` : '')
    if (name && !line.players.some((p) => p.name === name)) line.players.push({ name, pos: side === 'bat' ? (r as BattingPA).pos : undefined })
    const scored = side === 'bat' ? (r as BattingPA).run > 0 : r.code === 'R' || r.code === 'ER'
    const p = side === 'pit' ? (r as PitchingPA).pitcher : ''
    const cell: SheetCellLike = {
      player: name, kind: isPA(r) ? 'pa' : 'placed', mark: isPA(r) ? r.result : 'TB', out: OUT_NO[r.code ?? ''],
      reached: scored ? 4 : 0, scored, earned: side === 'pit' ? r.code === 'ER' : undefined, left: r.code === 'L',
      rbi: side === 'bat' ? (r as BattingPA).rbi : 0, count: '', pitches: r.pitches.length, notes: [],
      pitcherChange: p && pitcher && p !== pitcher ? p : undefined,
    }
    if (p) pitcher = p
    ;(line.cells[r.inning] ??= []).push(cell)
    const inn = perInning[r.inning]
    if (inn) {
      if (scored) inn.r += side === 'bat' ? (r as BattingPA).run : 1
      if (isHitResult(r.result)) inn.h++
      if (r.code === 'L') inn.lob++
      if (side === 'bat' && (r.result === '失誤' || r.result === '妨礙')) inn.e = (inn.e ?? 0) + 1
      if (side === 'pit' && !oldData) inn.e = (inn.e ?? 0) + ((r as PitchingPA).errors?.length ?? 0)
    }
  }
  const ordered = [...lines.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
  // the nine slots are always printed, even when one never came up (a blank line to fill in by hand)
  for (let k = 1; k <= 9; k++) if (!ordered.some((l) => l.order === k)) ordered.push({ order: k, players: [], cells: {} })
  ordered.sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
  return { innings: maxInn, lines: ordered, perInning, unfollowed: Array.from({ length: maxInn }, (_, i) => i + 1).filter((i) => rows.some((r) => r.inning === i)) }
}
