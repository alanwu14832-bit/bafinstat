/**
 * The 逐球 tabs' filter chips (全部・得分・安打・全壘打・三振・強勁擊球, and 關鍵打席 once the win-probability
 * batch passes its rows): which rows (indexes into one game's rows of one side) each chip shows.
 */
import { inferAll, inningsOf, type Side } from '../record/timeline'
import { runsIn } from '../record/earned'
import { BIP_RESULTS } from '../record/model'
import { isHitResult } from './stats'
import { isPA, type BattingPA, type PitchingPA } from './types'

export type PbpFilter = 'all' | 'runs' | 'hits' | 'hr' | 'k' | 'hard' | 'key'
export const PBP_FILTER_LABEL: Record<PbpFilter, string> = { all: '全部', runs: '得分', hits: '安打', hr: '全壘打', k: '三振', hard: '強勁擊球', key: '關鍵打席' }
export const PBP_FILTERS: PbpFilter[] = ['all', 'runs', 'hits', 'hr', 'k', 'hard', 'key']

type Row = BattingPA | PitchingPA

/**
 * Rows per chip. 得分: the plate appearances during which a run came home — on the play or between its pitches
 * (wild pitch, steal of home, a bases-loaded walk) — from the runner timeline; an inning it cannot follow (no
 * 壘上(前)) falls back to home runs, RBIs (our side) and runner plays that reached home.
 * Tie-break runners (突破僵局) are never in 安打／全壘打／三振／強勁擊球.
 */
export function pbpFilterSets(rows: Row[], side: Side, keyRows?: Iterable<number>): Record<PbpFilter, Set<number>> {
  const out: Record<PbpFilter, Set<number>> = { all: new Set(), runs: new Set(), hits: new Set(), hr: new Set(), k: new Set(), hard: new Set(), key: new Set(keyRows ?? []) }
  const halves = inferAll(rows, side)
  for (const [inning, idx] of inningsOf(rows)) {
    const half = halves.get(inning)
    if (half) { for (const st of half.steps) if (runsIn(st).length > 0) out.runs.add(st.index); continue }
    for (const i of idx) {
      const r = rows[i]
      if (r.result === '全壘打' || (side === 'bat' && (r as BattingPA).rbi > 0) || (r.events ?? []).some((e) => e.to === 'home')) out.runs.add(i)
    }
  }
  rows.forEach((r, i) => {
    out.all.add(i)
    if (!isPA(r)) return
    if (isHitResult(r.result)) out.hits.add(i)
    if (r.result === '全壘打') out.hr.add(i)
    if (r.result === '三振') out.k.add(i)
    if (r.quality === '強' && BIP_RESULTS.has(r.result)) out.hard.add(i)
  })
  return out
}
