import { buildHistory, type HistoryIndex } from '../data/history'
import { resolveParams } from '../data/stats'
import type { Dataset, StatParams } from '../data/types'
import { effectiveDataset, useDataStore } from '../store/data'
import { liveGameIds } from '../data/liveGames'
import { useLiveIds } from './useLiveGames'

// one index for the whole site: rebuilt only when the dataset object (any edit, demo on/off) or the settings change
let cache: { ds: Dataset; raw: StatParams; live: ReadonlySet<string>; h: HistoryIndex } | null = null

/** Every played game at once (紀錄簿, 生涯, 里程碑), ignoring the filter bar. */
export function historyFor(ds: Dataset, raw: StatParams): HistoryIndex {
  // (and when a game starts or stops being recorded: its result is 'live' meanwhile)
  const live = liveGameIds()
  if (!cache || cache.ds !== ds || cache.raw !== raw || cache.live !== live) cache = { ds, raw, live, h: buildHistory(ds, resolveParams(raw, ds.pitching)) }
  return cache.h
}

export function useHistory(): HistoryIndex {
  const base = useDataStore((s) => s.base)
  const demo = useDataStore((s) => s.demo)
  const raw = useDataStore((s) => s.params)
  useLiveIds()
  return historyFor(effectiveDataset(base, demo), raw)
}
