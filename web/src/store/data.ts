/**
 * Dataset + global filter store. The imported dataset is persisted in
 * localStorage (guarded); the demo overlay is generated on the fly and never
 * stored. Everything derived is computed via selectors in hooks/useStats.ts.
 */
import { create } from 'zustand'
import { generateDemo, mergeDatasets } from '../data/demo'
import { SEED_DATASET } from '../data/seed'
import { DEFAULT_FILTERS, DEFAULT_PARAMS, type Dataset, type Filters, type StatParams } from '../data/types'

const DATA_KEY = 'bafin.dataset.v1'
const DEMO_KEY = 'bafin.demo'
const PARAMS_KEY = 'bafin.params'

function readJSON<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null } catch { return null }
}
function writeJSON(key: string, value: unknown | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

export type DataSource = 'seed' | 'imported'

interface DataState {
  /** Real data: the seed game, or whatever the user imported. */
  base: Dataset
  source: DataSource
  importedAt: string | null
  /** Show synthetic demo games alongside real ones (always labelled). */
  demo: boolean
  filters: Filters
  params: StatParams
  setFilters: (patch: Partial<Filters>) => void
  resetFilters: () => void
  setDemo: (on: boolean) => void
  replaceDataset: (ds: Dataset) => void
  appendDataset: (ds: Dataset) => void
  resetToSeed: () => void
  setParams: (patch: Partial<StatParams>) => void
}

interface Persisted { base: Dataset; importedAt: string | null }

const persisted = readJSON<Persisted>(DATA_KEY)
const initialBase = persisted?.base ?? SEED_DATASET
const storedDemo = readJSON<boolean>(DEMO_KEY)
// First visit with only the seed game: show the demo overlay so the dashboard is explorable.
const initialDemo = storedDemo ?? initialBase.games.length < 3

export const useDataStore = create<DataState>((set, get) => ({
  base: initialBase,
  source: persisted ? 'imported' : 'seed',
  importedAt: persisted?.importedAt ?? null,
  demo: initialDemo,
  filters: DEFAULT_FILTERS,
  params: { ...DEFAULT_PARAMS, ...(readJSON<Partial<StatParams>>(PARAMS_KEY) ?? {}) },
  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  setDemo: (on) => { writeJSON(DEMO_KEY, on); set({ demo: on }) },
  replaceDataset: (ds) => {
    const importedAt = new Date().toISOString()
    writeJSON(DATA_KEY, { base: ds, importedAt } satisfies Persisted)
    set({ base: ds, source: 'imported', importedAt, filters: DEFAULT_FILTERS })
  },
  appendDataset: (ds) => {
    const merged = mergeDatasets(get().base, ds)
    const importedAt = new Date().toISOString()
    writeJSON(DATA_KEY, { base: merged, importedAt } satisfies Persisted)
    set({ base: merged, source: 'imported', importedAt })
  },
  resetToSeed: () => { writeJSON(DATA_KEY, null); set({ base: SEED_DATASET, source: 'seed', importedAt: null, filters: DEFAULT_FILTERS }) },
  setParams: (patch) => { const params = { ...get().params, ...patch }; writeJSON(PARAMS_KEY, params); set({ params }) },
}))

let demoCache: { key: string; ds: Dataset } | null = null
/** Base dataset merged with the deterministic demo overlay when enabled. */
export function effectiveDataset(base: Dataset, demo: boolean): Dataset {
  if (!demo) return base
  const key = base.roster.map((p) => p.name).join('|') + '#' + base.games.map((g) => g.id).join('|')
  if (!demoCache || demoCache.key !== key) demoCache = { key, ds: mergeDatasets(base, generateDemo(base.roster)) }
  return demoCache.ds
}
