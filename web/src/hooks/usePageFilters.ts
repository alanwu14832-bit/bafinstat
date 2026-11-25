import { useMemo } from 'react'
import { useInRouterContext, useLocation } from 'react-router-dom'
import { useDataStore } from '../store/data'
import { DEFAULT_FILTERS, type Filters } from '../data/types'

/** One control of the filter bar (期間 is the date range and its 全部／本季／近 90 天 buttons). */
export type FilterKey = 'tournament' | 'period' | 'position' | 'opponent' | 'homeAway' | 'result' | 'intra'
export const ALL_FILTERS: FilterKey[] = ['tournament', 'period', 'position', 'opponent', 'homeAway', 'result', 'intra']
/** the games only: 守位 narrows plate appearances and fielding lines, which these pages do not list */
const GAME_FILTERS: FilterKey[] = ['tournament', 'period', 'opponent', 'homeAway', 'result', 'intra']

/**
 * The filters each page offers (2026-11-25): 總覽, 投球 and 比賽 have no 守位; the 打擊, 守備 and 球員 pages have all of them;
 * every other page (即時比分, 紀錄比賽, 使用指南…) shows no filter bar. A filter a page does not offer does not apply there
 * either, so a 守位 picked on 打擊 never changes 總覽's numbers unseen.
 */
const PAGE_FILTERS: Array<{ path: string; keys: FilterKey[] }> = [
  { path: '/', keys: GAME_FILTERS },
  { path: '/batting', keys: ALL_FILTERS },
  { path: '/pitching', keys: GAME_FILTERS },
  { path: '/fielding', keys: ALL_FILTERS },
  { path: '/players', keys: ALL_FILTERS },
  { path: '/games', keys: GAME_FILTERS },
]

/** The filters `pathname` offers ([] = no filter bar). */
export function filterKeysFor(pathname: string): FilterKey[] {
  const p = pathname.replace(/\/+$/, '') || '/'
  return PAGE_FILTERS.find((x) => x.path === p)?.keys ?? []
}

/** `f` with the filters a page does not offer back at their defaults. */
export function maskFilters(f: Filters, keys: FilterKey[] | null): Filters {
  if (!keys) return f
  const on = new Set(keys)
  return {
    ...f,
    ...(on.has('tournament') ? {} : { tournament: DEFAULT_FILTERS.tournament }),
    ...(on.has('period') ? {} : { from: DEFAULT_FILTERS.from, to: DEFAULT_FILTERS.to }),
    ...(on.has('position') ? {} : { position: DEFAULT_FILTERS.position }),
    ...(on.has('opponent') ? {} : { opponent: DEFAULT_FILTERS.opponent }),
    ...(on.has('homeAway') ? {} : { homeAway: DEFAULT_FILTERS.homeAway }),
    ...(on.has('result') ? {} : { result: DEFAULT_FILTERS.result }),
    ...(on.has('intra') ? {} : { intra: DEFAULT_FILTERS.intra }),
  }
}

/** The filters this page offers; null outside the router (a component rendered on its own: every filter applies). */
export function usePageFilterKeys(): FilterKey[] | null {
  const inRouter = useInRouterContext()
  // (inRouter never changes for a mounted component, so the hook order stays the same)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const pathname = inRouter ? useLocation().pathname : null
  return useMemo(() => (pathname === null ? null : filterKeysFor(pathname)), [pathname])
}

/** The global filters as this page applies them. */
export function usePageFilters(): Filters {
  const filters = useDataStore((s) => s.filters)
  const keys = usePageFilterKeys()
  return useMemo(() => maskFilters(filters, keys), [filters, keys])
}
