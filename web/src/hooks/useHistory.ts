import { buildHistory, type HistoryIndex } from '../data/history'
import { resolveParams } from '../data/stats'
import type { Dataset, StatParams } from '../data/types'
import { effectiveDataset, useDataStore } from '../store/data'

// one index for the whole site: rebuilt only when the dataset object (any edit, demo on/off) or the settings change
let cache: { ds: Dataset; raw: StatParams; h: HistoryIndex } | null = null

/** Every played game at once (紀錄簿, 生涯, 里程碑), ignoring the filter bar. */
export function historyFor(ds: Dataset, raw: StatParams): HistoryIndex {
  if (!cache || cache.ds !== ds || cache.raw !== raw) cache = { ds, raw, h: buildHistory(ds, resolveParams(raw, ds.pitching)) }
  return cache.h
}

export function useHistory(): HistoryIndex {
  const base = useDataStore((s) => s.base)
  const demo = useDataStore((s) => s.demo)
  const raw = useDataStore((s) => s.params)
  return historyFor(effectiveDataset(base, demo), raw)
}
