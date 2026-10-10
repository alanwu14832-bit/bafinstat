import { useMemo } from 'react'
import { applyFilters, uniqueSorted, type FilteredData } from '../data/filters'
import { battingLines, errorsByPosition, fieldingLines, ourRunsOf, pitchingLines, resolveParams, teamBatting, teamPitching, teamSummary, type BattingLine, type FieldingStat, type PitchingLine, type TeamSummary } from '../data/stats'
import type { Dataset, StatParams } from '../data/types'
import { effectiveDataset, useDataStore } from '../store/data'

export interface Computed extends FilteredData {
  dataset: Dataset
  batters: BattingLine[]
  team: BattingLine
  pitchers: PitchingLine[]
  teamPitch: PitchingLine
  fielders: FieldingStat[]
  errorsByPos: Record<string, number>
  summary: TeamSummary
  hasDemo: boolean
  /** the parameters these numbers were computed with (the automatic FIP constant filled in) */
  params: StatParams
}

type Inputs = [base: unknown, demo: unknown, filters: unknown, params: unknown]
/** The last pass, shared by every component that calls useStats (a page and its 情境拆分 card…): one pass per change. */
let last: { inputs: Inputs; out: Computed } | null = null

/** Everything the pages need, recomputed only when data/filters change. */
export function useStats(): Computed {
  const base = useDataStore((s) => s.base)
  const demo = useDataStore((s) => s.demo)
  const filters = useDataStore((s) => s.filters)
  const rawParams = useDataStore((s) => s.params)
  return useMemo(() => {
    const inputs: Inputs = [base, demo, filters, rawParams]
    if (last && last.inputs.every((x, i) => x === inputs[i])) return last.out
    const out = compute(base, demo, filters, rawParams)
    last = { inputs, out }
    return out
  }, [base, demo, filters, rawParams])
}

type State = ReturnType<typeof useDataStore.getState>
function compute(base: State['base'], demo: State['demo'], filters: State['filters'], rawParams: State['params']): Computed {
  const dataset = effectiveDataset(base, demo)
  const params = resolveParams(rawParams, dataset.pitching)
  const fd = applyFilters(dataset, filters)
  // the score by inning: inherited runners, blown saves… need it
  const ctx = { ourRuns: ourRunsOf(fd.summaries) }
  return {
    ...fd, dataset,
    batters: battingLines(dataset, fd.batting, params),
    team: teamBatting(dataset, fd.batting, params),
    pitchers: pitchingLines(fd.pitching, fd.games, params, ctx),
    teamPitch: teamPitching(fd.pitching, params, fd.games, ctx),
    fielders: fieldingLines(fd.fielding),
    errorsByPos: errorsByPosition(fd.fielding),
    summary: teamSummary(fd.summaries),
    hasDemo: dataset.games.some((g) => g.isDemo),
    params,
  }
}

/** Option lists for the global filter bar (from the unfiltered dataset). Tournaments also come from the 報名名單, so a
 *  tournament registered before its first game can already be picked (and recorded under the same name). */
export function useFilterOptions() {
  const base = useDataStore((s) => s.base)
  const demo = useDataStore((s) => s.demo)
  const registrations = useDataStore((s) => s.registrations)
  return useMemo(() => {
    const ds = effectiveDataset(base, demo)
    return {
      tournaments: uniqueSorted([...ds.games.map((g) => g.tournament), ...registrations.map((r) => r.tournament)]),
      opponents: uniqueSorted(ds.games.map((g) => g.opponent)),
      positions: uniqueSorted([...ds.batting.map((p) => p.pos), ...ds.fielding.map((f) => f.pos)]),
      minDate: ds.games.reduce<string>((m, g) => (m && m < g.date ? m : g.date), ''),
      maxDate: ds.games.reduce<string>((m, g) => (m > g.date ? m : g.date), ''),
    }
  }, [base, demo, registrations])
}
