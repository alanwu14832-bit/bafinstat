/**
 * Dataset + global filter store.
 *
 * Two modes:
 *  - local (default): the imported dataset is persisted in localStorage.
 *  - cloud (VITE_SUPABASE_* set): Supabase is the source of truth; the local
 *    copy is only a cache for instant first paint. Signed-in users can push.
 * The demo overlay is generated on the fly and never stored anywhere.
 */
import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { generateDemo, mergeDatasets } from '../data/demo'
import { SEED_DATASET } from '../data/seed'
import { cloudConfigured, currentUser, deleteCloudGame, fetchCloudDataset, fetchIsEditor, onAuthChange, pushCloudDataset, subscribeCloudChanges } from '../data/supabase'
import { applyGameEdit, normalizeGameEdit, removeGame, type GameEdit } from '../data/edit'
import type { GameWarning } from '../data/normalize'
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

export type DataSource = 'seed' | 'imported' | 'cloud'
export type CloudStatus = 'off' | 'loading' | 'ready' | 'error'

interface DataState {
  base: Dataset
  source: DataSource
  importedAt: string | null
  demo: boolean
  filters: Filters
  params: StatParams
  cloud: { configured: boolean; status: CloudStatus; error: string | null; user: User | null; lastSync: string | null; pushing: boolean; /** signed in AND on the editors allowlist (true while unknown) */ isEditor: boolean }
  setFilters: (patch: Partial<Filters>) => void
  resetFilters: () => void
  setDemo: (on: boolean) => void
  /** Local replace/append (also pushes to the cloud when signed in). */
  replaceDataset: (ds: Dataset) => Promise<{ games: number; skipped: number } | null>
  appendDataset: (ds: Dataset) => Promise<{ games: number; skipped: number } | null>
  resetToSeed: () => void
  /** Save an in-app correction of one game (local, or cloud when signed in). Returns review warnings. */
  saveGame: (edit: GameEdit) => Promise<GameWarning[]>
  deleteGame: (id: string) => Promise<void>
  /** True when edits can be written: local mode, or cloud mode with a signed-in user. */
  canEdit: () => boolean
  setParams: (patch: Partial<StatParams>) => void
  loadCloud: () => Promise<void>
  setCloudUser: (user: User | null) => void
}

interface Persisted { base: Dataset; importedAt: string | null }

const persisted = readJSON<Persisted>(DATA_KEY)
const initialBase = persisted?.base ?? SEED_DATASET
const storedDemo = readJSON<boolean>(DEMO_KEY)
// First visit with only the seed game and no cloud: show the demo overlay so the dashboard is explorable.
const initialDemo = cloudConfigured ? (storedDemo ?? false) : (storedDemo ?? initialBase.games.length < 3)

export const useDataStore = create<DataState>((set, get) => ({
  base: initialBase,
  source: cloudConfigured ? 'cloud' : persisted ? 'imported' : 'seed',
  importedAt: persisted?.importedAt ?? null,
  demo: initialDemo,
  filters: DEFAULT_FILTERS,
  params: { ...DEFAULT_PARAMS, ...(readJSON<Partial<StatParams>>(PARAMS_KEY) ?? {}) },
  cloud: { configured: cloudConfigured, status: cloudConfigured ? 'loading' : 'off', error: null, user: null, lastSync: null, pushing: false, isEditor: false },
  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  setDemo: (on) => { writeJSON(DEMO_KEY, on); set({ demo: on }) },
  replaceDataset: async (ds) => {
    const { cloud } = get()
    let result: { games: number; skipped: number } | null = null
    if (cloud.configured && cloud.user) {
      set({ cloud: { ...cloud, pushing: true, error: null } })
      try { result = await pushCloudDataset(ds, 'replace'); await get().loadCloud() }
      catch (e) { set({ cloud: { ...get().cloud, pushing: false, error: e instanceof Error ? e.message : String(e) } }); throw e }
      set({ cloud: { ...get().cloud, pushing: false } })
      return result
    }
    const importedAt = new Date().toISOString()
    writeJSON(DATA_KEY, { base: ds, importedAt } satisfies Persisted)
    set({ base: ds, source: 'imported', importedAt, filters: DEFAULT_FILTERS })
    return result
  },
  appendDataset: async (ds) => {
    const { cloud } = get()
    if (cloud.configured && cloud.user) {
      set({ cloud: { ...cloud, pushing: true, error: null } })
      try { const r = await pushCloudDataset(ds, 'append'); await get().loadCloud(); set({ cloud: { ...get().cloud, pushing: false } }); return r }
      catch (e) { set({ cloud: { ...get().cloud, pushing: false, error: e instanceof Error ? e.message : String(e) } }); throw e }
    }
    const merged = mergeDatasets(get().base, ds)
    const importedAt = new Date().toISOString()
    writeJSON(DATA_KEY, { base: merged, importedAt } satisfies Persisted)
    set({ base: merged, source: 'imported', importedAt })
    return null
  },
  resetToSeed: () => { writeJSON(DATA_KEY, null); set({ base: SEED_DATASET, source: 'seed', importedAt: null, filters: DEFAULT_FILTERS }) },
  canEdit: () => { const { cloud } = get(); return !cloud.configured || (!!cloud.user && cloud.isEditor) },
  saveGame: async (edit) => {
    const { cloud, base } = get()
    const { fragment, warnings } = normalizeGameEdit(base.roster, edit)
    if (cloud.configured) {
      if (!cloud.user || !cloud.isEditor) throw new Error(cloud.user ? '你的帳號不在紀錄員名單，無法寫入' : '請先登入才能修改雲端資料')
      set({ cloud: { ...cloud, pushing: true, error: null } })
      try { await pushCloudDataset(fragment, 'upsert'); await get().loadCloud() }
      catch (e) { set({ cloud: { ...get().cloud, pushing: false, error: e instanceof Error ? e.message : String(e) } }); throw e }
      set({ cloud: { ...get().cloud, pushing: false } })
      return warnings
    }
    const next = applyGameEdit(base, fragment)
    const importedAt = new Date().toISOString()
    writeJSON(DATA_KEY, { base: next, importedAt } satisfies Persisted)
    set({ base: next, source: 'imported', importedAt })
    return warnings
  },
  deleteGame: async (id) => {
    const { cloud, base } = get()
    if (cloud.configured) {
      if (!cloud.user || !cloud.isEditor) throw new Error(cloud.user ? '你的帳號不在紀錄員名單，無法寫入' : '請先登入才能修改雲端資料')
      set({ cloud: { ...cloud, pushing: true, error: null } })
      try { await deleteCloudGame(id); await get().loadCloud() }
      catch (e) { set({ cloud: { ...get().cloud, pushing: false, error: e instanceof Error ? e.message : String(e) } }); throw e }
      set({ cloud: { ...get().cloud, pushing: false } })
      return
    }
    const next = removeGame(base, id)
    const importedAt = new Date().toISOString()
    writeJSON(DATA_KEY, { base: next, importedAt } satisfies Persisted)
    set({ base: next, source: 'imported', importedAt })
  },
  setParams: (patch) => { const params = { ...get().params, ...patch }; writeJSON(PARAMS_KEY, params); set({ params }) },
  loadCloud: async () => {
    if (!cloudConfigured) return
    set({ cloud: { ...get().cloud, status: get().base.games.length ? get().cloud.status : 'loading', error: null } })
    try {
      const ds = await fetchCloudDataset()
      const lastSync = new Date().toISOString()
      writeJSON(DATA_KEY, { base: ds, importedAt: lastSync } satisfies Persisted)
      set({ base: ds, source: 'cloud', importedAt: lastSync, cloud: { ...get().cloud, status: 'ready', error: null, lastSync } })
    } catch (e) {
      set({ cloud: { ...get().cloud, status: 'error', error: e instanceof Error ? e.message : String(e) } })
    }
  },
  setCloudUser: (user) => {
    set({ cloud: { ...get().cloud, user, isEditor: false } })
    if (user) void fetchIsEditor(user.email).then((ok) => { if (get().cloud.user?.id === user.id) set({ cloud: { ...get().cloud, isEditor: ok } }) }).catch(() => set({ cloud: { ...get().cloud, isEditor: false } }))
  },
}))

// Boot the cloud connection: load once, follow auth, refetch on remote changes.
if (cloudConfigured && typeof window !== 'undefined') {
  const st = useDataStore.getState()
  void st.loadCloud()
  void currentUser().then((u) => st.setCloudUser(u))
  onAuthChange((u) => useDataStore.getState().setCloudUser(u))
  subscribeCloudChanges(() => void useDataStore.getState().loadCloud())
}

let demoCache: { base: Dataset; ds: Dataset } | null = null
/** Base dataset merged with the deterministic demo overlay when enabled. Cached per base object, so any edit invalidates it. */
export function effectiveDataset(base: Dataset, demo: boolean): Dataset {
  if (!demo) return base
  if (!demoCache || demoCache.base !== base) demoCache = { base, ds: mergeDatasets(base, generateDemo(base.roster)) }
  return demoCache.ds
}
