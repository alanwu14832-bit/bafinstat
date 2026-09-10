import { useMemo } from 'react'
import { applyFilters, uniqueSorted, type FilteredData } from '../data/filters'
import { battingLines, errorsByPosition, fieldingLines, pitchingLines, teamBatting, teamPitching, teamSummary, type BattingLine, type FieldingStat, type PitchingLine, type TeamSummary } from '../data/stats'
import type { Dataset } from '../data/types'
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
}

/** Everything the pages need, recomputed only when data/filters change. */
export function useStats(): Computed {
  const base = useDataStore((s) => s.base)
  const demo = useDataStore((s) => s.demo)
  const filters = useDataStore((s) => s.filters)
  const params = useDataStore((s) => s.params)
  return useMemo(() => {
    const dataset = effectiveDataset(base, demo)
    const fd = applyFilters(dataset, filters)
    return {
      ...fd, dataset,
      batters: battingLines(dataset, fd.batting, params),
      team: teamBatting(dataset, fd.batting, params),
      pitchers: pitchingLines(fd.pitching, fd.games, params),
      teamPitch: teamPitching(fd.pitching, params),
      fielders: fieldingLines(fd.fielding),
      errorsByPos: errorsByPosition(fd.fielding),
      summary: teamSummary(fd.summaries),
      hasDemo: dataset.games.some((g) => g.isDemo),
    }
  }, [base, demo, filters, params])
}

/** Option lists for the global filter bar (from the unfiltered dataset). */
export function useFilterOptions() {
  const base = useDataStore((s) => s.base)
  const demo = useDataStore((s) => s.demo)
  return useMemo(() => {
    const ds = effectiveDataset(base, demo)
    return {
      tournaments: uniqueSorted(ds.games.map((g) => g.tournament)),
      opponents: uniqueSorted(ds.games.map((g) => g.opponent)),
      positions: uniqueSorted([...ds.batting.map((p) => p.pos), ...ds.fielding.map((f) => f.pos)]),
      minDate: ds.games.reduce<string>((m, g) => (m && m < g.date ? m : g.date), ''),
      maxDate: ds.games.reduce<string>((m, g) => (m > g.date ? m : g.date), ''),
    }
  }, [base, demo])
}
