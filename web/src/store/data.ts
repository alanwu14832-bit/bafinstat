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
import { TEAM } from '../config/team'
import { cloudConfigured, currentUser, deleteCloudGame, fetchCloudDataset, fetchIsEditor, onAuthChange, pushCloudDataset, pushRoster, subscribeCloudChanges, subscribeRegistrationChanges, updateGameDayRosters } from '../data/supabase'
import { applyRosterChange, renamesOf, validateRosterChange, type RosterChange } from '../data/roster'
import { deleteCloudAlbum, loadCloudAlbums, readLocalAlbums, saveCloudAlbum, writeLocalAlbums, type AlbumLink } from '../data/albums'
import {
  deleteCloudRegistration, loadCloudRegistrations, parseRegistration, readLocalRegistrations, removeFromRegistrations, renameInRegistrations, saveCloudRegistration,
  withoutRegistration, withRegistration, writeLocalRegistrations, REGISTRATIONS_UNSUPPORTED,
} from '../data/registrations'
import { DAY_ROSTER_UNSUPPORTED } from '../data/gameRoster'
import { applyGameEdit, normalizeGameEdit, removeGame, type GameEdit } from '../data/edit'
import type { GameWarning } from '../data/normalize'
import { DEFAULT_FILTERS, DEFAULT_PARAMS, EMPTY_DATASET, type Dataset, type Filters, type Registration, type StatParams } from '../data/types'

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
/** Result of a whole-dataset write. `dropped` = games columns the cloud lacks (migration not run); `warnings` says what that lost. */
export interface PushResult { games: number; skipped: number; dropped: string[]; warnings: GameWarning[] }

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
  replaceDataset: (ds: Dataset) => Promise<PushResult | null>
  appendDataset: (ds: Dataset) => Promise<PushResult | null>
  resetToSeed: () => void
  /** Save an in-app correction of one game (local, or cloud when signed in). Returns review warnings. */
  saveGame: (edit: GameEdit) => Promise<GameWarning[]>
  deleteGame: (id: string) => Promise<void>
  /** Add / edit / rename / remove players (renames follow through to every record). */
  saveRoster: (change: RosterChange) => Promise<void>
  /** True when edits can be written: local mode, or cloud mode with a signed-in user. */
  canEdit: () => boolean
  setParams: (patch: Partial<StatParams>) => void
  loadCloud: () => Promise<void>
  setCloudUser: (user: User | null) => void
  /** photo album links (see data/albums.ts) */
  albums: AlbumLink[]
  albumsSupported: boolean
  loadAlbums: () => Promise<void>
  saveAlbum: (a: AlbumLink) => Promise<void>
  deleteAlbum: (id: string) => Promise<void>
  /** false once a cloud save reported that games.day_roster is missing (supabase/migrations/2026-09-26_rosters.sql not run) */
  dayRosterSupported: boolean
  /** tournament registration lists (報名名單, see data/registrations.ts), sorted season desc */
  registrations: Registration[]
  /** false when the cloud has no registrations table yet (show REGISTRATIONS_UNSUPPORTED instead of the editor) */
  registrationsSupported: boolean
  loadRegistrations: () => Promise<void>
  /** Insert or overwrite the list for r.season + r.tournament. */
  saveRegistration: (r: Registration) => Promise<void>
  deleteRegistration: (season: number, tournament: string) => Promise<void>
}

interface Persisted { base: Dataset; importedAt: string | null }

const persisted = readJSON<Persisted>(DATA_KEY)
// BaFiN's site starts from its recorded games; any other team starts empty (VITE_TEAM_SEED=0).
const STARTER = TEAM.seed ? SEED_DATASET : EMPTY_DATASET
const initialBase = persisted?.base ?? STARTER
const storedDemo = readJSON<boolean>(DEMO_KEY)
// First visit with only the seed game and no cloud: show the demo overlay so the dashboard is explorable.
const initialDemo = cloudConfigured ? (storedDemo ?? false) : (storedDemo ?? initialBase.games.length < 3)

const denied = (cloud: DataState['cloud']) => new Error(cloud.user ? '你的帳號不在紀錄員名單，無法寫入' : '請先登入才能修改雲端資料')
/** Turn the cloud's missing day_roster column into a warning the save UIs already show. */
const droppedWarnings = (dropped: string[], gameId = ''): GameWarning[] => (dropped.includes('day_roster') ? [{ gameId, message: DAY_ROSTER_UNSUPPORTED }] : [])
let registrationsLive = false

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
    let result: PushResult | null = null
    if (cloud.configured && cloud.user) {
      set({ cloud: { ...cloud, pushing: true, error: null } })
      try {
        const r = await pushCloudDataset(ds, 'replace')
        result = { ...r, warnings: droppedWarnings(r.dropped) }
        if (r.dropped.includes('day_roster')) set({ dayRosterSupported: false })
        await get().loadCloud()
      }
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
      try {
        const r = await pushCloudDataset(ds, 'append')
        if (r.dropped.includes('day_roster')) set({ dayRosterSupported: false })
        await get().loadCloud(); set({ cloud: { ...get().cloud, pushing: false } })
        return { ...r, warnings: droppedWarnings(r.dropped) }
      }
      catch (e) { set({ cloud: { ...get().cloud, pushing: false, error: e instanceof Error ? e.message : String(e) } }); throw e }
    }
    const merged = mergeDatasets(get().base, ds)
    const importedAt = new Date().toISOString()
    writeJSON(DATA_KEY, { base: merged, importedAt } satisfies Persisted)
    set({ base: merged, source: 'imported', importedAt })
    return null
  },
  resetToSeed: () => { writeJSON(DATA_KEY, null); set({ base: STARTER, source: 'seed', importedAt: null, filters: DEFAULT_FILTERS }) },
  canEdit: () => { const { cloud } = get(); return !cloud.configured || (!!cloud.user && cloud.isEditor) },
  saveGame: async (edit) => {
    const { cloud, base } = get()
    const { fragment, warnings } = normalizeGameEdit(base.roster, edit)
    if (cloud.configured) {
      if (!cloud.user || !cloud.isEditor) throw denied(cloud)
      const game = fragment.games[0]
      set({ cloud: { ...cloud, pushing: true, error: null } })
      try {
        const { dropped } = await pushCloudDataset(fragment, 'upsert')
        if (dropped.includes('day_roster')) { warnings.push(...droppedWarnings(dropped, game.id)); set({ dayRosterSupported: false }) }
        else if (game.dayRoster) set({ dayRosterSupported: true })
        // the upsert leaves day_roster out when the game has none, so a roster removed in the editor is cleared explicitly
        else if (base.games.find((g) => g.id === game.id)?.dayRoster) await updateGameDayRosters([{ id: game.id, day_roster: null }])
        await get().loadCloud()
      }
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
  saveRoster: async (change) => {
    const { cloud, base } = get()
    const err = validateRosterChange(base, change)
    if (err) throw new Error(err)
    const next = applyRosterChange(base, change)
    const renames = Object.entries(renamesOf(change))
    // registration lists follow renames and removals (unchanged lists keep their identity)
    const fixRegs = (regs: Registration[]) => removeFromRegistrations(renameInRegistrations(regs, renames), change.removed)
    if (cloud.configured) {
      if (!cloud.user || !cloud.isEditor) throw denied(cloud)
      set({ cloud: { ...cloud, pushing: true, error: null } })
      try {
        await pushRoster(next.roster, renamesOf(change), change.removed)
        // pushRoster renames plain columns; names inside the day_roster jsonb are rewritten per game
        const was = new Map(base.games.map((g) => [g.id, g.dayRoster]))
        const moved = next.games.filter((g) => g.dayRoster && g.dayRoster !== was.get(g.id)).map((g) => ({ id: g.id, day_roster: g.dayRoster! }))
        if (moved.length) await updateGameDayRosters(moved) // false = column missing: no rosters in the cloud to fix
        if (renames.length || change.removed.length) {
          const regs = await loadCloudRegistrations() // fresh copy; null = table missing
          if (regs) {
            const fixed = fixRegs(regs)
            const saved = await Promise.all(fixed.map((r, i) => (r === regs[i] ? r : saveCloudRegistration(r, cloud.user?.email))))
            set({ registrations: saved, registrationsSupported: true })
          }
        }
        await get().loadCloud()
      }
      catch (e) { set({ cloud: { ...get().cloud, pushing: false, error: e instanceof Error ? e.message : String(e) } }); throw e }
      set({ cloud: { ...get().cloud, pushing: false } })
      return
    }
    const importedAt = new Date().toISOString()
    writeJSON(DATA_KEY, { base: next, importedAt } satisfies Persisted)
    const regs = get().registrations
    const fixed = fixRegs(regs)
    if (fixed.some((r, i) => r !== regs[i])) writeLocalRegistrations(fixed)
    set({ base: next, source: 'imported', importedAt, registrations: fixed })
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
  albums: cloudConfigured ? [] : readLocalAlbums(),
  albumsSupported: true,
  loadAlbums: async () => {
    if (!cloudConfigured) { set({ albums: readLocalAlbums() }); return }
    try { const list = await loadCloudAlbums(); if (list === null) set({ albumsSupported: false }); else set({ albums: list, albumsSupported: true }) } catch { /* offline: keep what we have */ }
  },
  saveAlbum: async (a) => {
    const { cloud } = get()
    if (cloud.configured) {
      if (!cloud.user || !cloud.isEditor) throw new Error(cloud.user ? '你的帳號不在紀錄員名單，無法寫入' : '請先登入才能修改雲端資料')
      const saved = await saveCloudAlbum(a, cloud.user.email)
      set({ albums: [saved, ...get().albums.filter((x) => x.id !== saved.id)] })
      return
    }
    const next = [a, ...get().albums.filter((x) => x.id !== a.id)]
    writeLocalAlbums(next); set({ albums: next })
  },
  deleteAlbum: async (id) => {
    const { cloud } = get()
    if (cloud.configured) {
      if (!cloud.user || !cloud.isEditor) throw new Error('請先以紀錄員身分登入')
      await deleteCloudAlbum(id)
    } else writeLocalAlbums(get().albums.filter((x) => x.id !== id))
    set({ albums: get().albums.filter((x) => x.id !== id) })
  },
  dayRosterSupported: true,
  registrations: cloudConfigured ? [] : readLocalRegistrations(),
  registrationsSupported: true,
  loadRegistrations: async () => {
    if (!cloudConfigured) { set({ registrations: readLocalRegistrations() }); return }
    try {
      const list = await loadCloudRegistrations()
      if (list === null) { set({ registrationsSupported: false }); return }
      set({ registrations: list, registrationsSupported: true })
      // live refresh only once the table is known to exist (see subscribeRegistrationChanges)
      if (!registrationsLive && typeof window !== 'undefined') { registrationsLive = true; subscribeRegistrationChanges(() => { void useDataStore.getState().loadRegistrations() }) }
    } catch { /* offline: keep what we have */ }
  },
  saveRegistration: async (input) => {
    const r = parseRegistration(input)
    if (!r) throw new Error('請填年度與杯賽')
    const { cloud } = get()
    if (cloud.configured) {
      if (!cloud.user || !cloud.isEditor) throw denied(cloud)
      if (!get().registrationsSupported) throw new Error(REGISTRATIONS_UNSUPPORTED)
      const saved = await saveCloudRegistration(r, cloud.user.email)
      set({ registrations: withRegistration(get().registrations, saved) })
      return
    }
    const next = withRegistration(get().registrations, { ...r, updatedAt: new Date().toISOString() })
    writeLocalRegistrations(next); set({ registrations: next })
  },
  deleteRegistration: async (season, tournament) => {
    const { cloud } = get()
    if (cloud.configured) {
      if (!cloud.user || !cloud.isEditor) throw denied(cloud)
      await deleteCloudRegistration(season, tournament)
    } else writeLocalRegistrations(withoutRegistration(get().registrations, season, tournament))
    set({ registrations: withoutRegistration(get().registrations, season, tournament) })
  },
}))

// Boot the cloud connection: load once, follow auth, refetch on remote changes.
if (cloudConfigured && typeof window !== 'undefined') {
  const st = useDataStore.getState()
  void st.loadCloud()
  void st.loadAlbums()
  void st.loadRegistrations()
  void currentUser().then((u) => st.setCloudUser(u))
  onAuthChange((u) => useDataStore.getState().setCloudUser(u))
  subscribeCloudChanges(() => { const s = useDataStore.getState(); void s.loadCloud(); void s.loadAlbums(); void s.loadRegistrations() })
}

let demoCache: { base: Dataset; ds: Dataset } | null = null
/** Base dataset merged with the deterministic demo overlay when enabled. Cached per base object, so any edit invalidates it. */
export function effectiveDataset(base: Dataset, demo: boolean): Dataset {
  if (!demo) return base
  if (!demoCache || demoCache.base !== base) demoCache = { base, ds: mergeDatasets(base, generateDemo(base.roster)) }
  return demoCache.ds
}
