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
import { ARCHIVE } from '../config/archive'
import { claimEditor, cloudConfigured, currentUser, deleteCloudGame, END_TIME_COLUMN, fetchCloudDataset, fetchIsEditor, type EditorAccess, onAuthChange, OPP_HAND_COLUMN, OPP_PITCHER_COLUMN, pushCloudDataset, ERRORS_COLUMN, EVENTS_COLUMN, pushRoster, RUNNER_COLUMN, SAVE_GAMES_FN, SAVE_GAMES_UNSUPPORTED, subscribeCloudChanges, subscribeRegistrationChanges, updateGameDayRosters, updateGameHolds } from '../data/supabase'
import { applyRosterChange, renamesOf, validateRosterChange, type RosterChange } from '../data/roster'
import { deleteCloudAlbum, loadCloudAlbums, readLocalAlbums, saveCloudAlbum, writeLocalAlbums, type AlbumLink } from '../data/albums'
import {
  deleteCloudRegistration, loadCloudRegistrations, parseRegistration, readLocalRegistrations, removeFromRegistrations, renameInRegistrations, saveCloudRegistration,
  withoutRegistration, withRegistration, writeLocalRegistrations, REGISTRATIONS_UNSUPPORTED,
} from '../data/registrations'
import { DAY_ROSTER_UNSUPPORTED, ERRORS_UNSUPPORTED, EVENTS_UNSUPPORTED, RUNNER_UNSUPPORTED } from '../data/gameRoster'
import { applyGameEdit, normalizeGameEdit, removeGame, type GameEdit } from '../data/edit'
import { ALL_RECORD_FIELDS, recordFieldWarnings, type RecordFields } from '../data/recordFields'
import type { GameWarning } from '../data/normalize'
import { DEFAULT_FILTERS, DEFAULT_PARAMS, EMPTY_DATASET, type Dataset, type Filters, type Registration, type StatParams } from '../data/types'

const DATA_KEY = 'bafin.dataset.v1'
const DEMO_KEY = 'bafin.demo'
const PARAMS_KEY = 'bafin.params'

function readJSON<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null } catch { return null }
}
/** false when the browser refused the write (storage full or blocked) */
function writeJSON(key: string, value: unknown | null): boolean {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false }
}
export const STORAGE_FULL = '這台裝置的瀏覽器儲存空間不足（或被封鎖），這次的資料沒有存起來，重新整理後會回到之前的樣子。請先到「資料匯入」按「匯出備份」，再清理瀏覽器空間。'
/** Without the cloud the data lives only in this browser: a write that did not stick is an error, not a success. */
function keepLocal(value: Persisted) { if (!writeJSON(DATA_KEY, value)) throw new Error(STORAGE_FULL) }
/** The cloud copy kept on this device is only a cache: drop it to make room (e.g. for a game in progress). */
export function dropCloudCache() { if (cloudConfigured) writeJSON(DATA_KEY, null) }

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
  cloud: { configured: boolean; status: CloudStatus; error: string | null; user: User | null; lastSync: string | null; pushing: boolean; /** signed in AND on the editors allowlist (true while unknown) */ isEditor: boolean
    /** why a signed-in account cannot write yet (need_code: enter the 邀請碼…); null when it can, or unknown */
    access?: EditorAccess | null }
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
  /** 啟用紀錄員權限 with the one-time 邀請碼 */
  claimWithCode: (code: string) => Promise<EditorAccess>
  /** Ask the database again whether the signed-in account may write (after 快速登入) */
  recheckAccess: () => Promise<void>
  /** photo album links (see data/albums.ts) */
  albums: AlbumLink[]
  albumsSupported: boolean
  loadAlbums: () => Promise<void>
  saveAlbum: (a: AlbumLink) => Promise<void>
  deleteAlbum: (id: string) => Promise<void>
  /** false once a cloud save reported that games.day_roster is missing (supabase/migrations/2026-09-26_rosters.sql not run) */
  dayRosterSupported: boolean
  /** whether the cloud has the 2026-10-14 columns (結束時間, 對方投手); refreshed on every loadCloud, always true without the cloud */
  recordFields: RecordFields
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
/** Turn the cloud's missing columns into warnings the save UIs already show. 結束時間／對方投手 only when what was saved
 *  had them: toGameRow always sends end_time (null when blank), so the old schema drops it on every save. */
const droppedWarnings = (dropped: string[], saved: Parameters<typeof recordFieldWarnings>[1], gameId = ''): GameWarning[] => [
  ...(dropped.includes('day_roster') ? [{ gameId, message: DAY_ROSTER_UNSUPPORTED }] : []),
  ...(dropped.includes(RUNNER_COLUMN) ? [{ gameId, message: RUNNER_UNSUPPORTED }] : []),
  ...(dropped.includes(ERRORS_COLUMN) ? [{ gameId, message: ERRORS_UNSUPPORTED }] : []),
  ...(dropped.includes(EVENTS_COLUMN) ? [{ gameId, message: EVENTS_UNSUPPORTED }] : []),
  ...(dropped.includes(SAVE_GAMES_FN) ? [{ gameId, message: SAVE_GAMES_UNSUPPORTED }] : []),
  ...recordFieldWarnings({ endTime: !dropped.includes(END_TIME_COLUMN), oppPitcher: !dropped.includes(OPP_PITCHER_COLUMN) && !dropped.includes(OPP_HAND_COLUMN) }, saved, gameId),
]
/** The same warning once (a dropped column and the columns check can both report it). */
const dedupe = (ws: GameWarning[]): GameWarning[] => { const seen = new Set<string>(); return ws.filter((w) => !seen.has(w.message) && !!seen.add(w.message)) }
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
        if (r.dropped.includes('day_roster')) set({ dayRosterSupported: false })
        await get().loadCloud()
        // (the columns check runs on what was just loaded back)
        result = { ...r, warnings: dedupe([...droppedWarnings(r.dropped, ds), ...recordFieldWarnings(get().recordFields, ds)]) }
      }
      catch (e) { set({ cloud: { ...get().cloud, pushing: false, error: e instanceof Error ? e.message : String(e) } }); throw e }
      set({ cloud: { ...get().cloud, pushing: false } })
      return result
    }
    const importedAt = new Date().toISOString()
    keepLocal({ base: ds, importedAt })
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
        return { ...r, warnings: dedupe([...droppedWarnings(r.dropped, ds), ...recordFieldWarnings(get().recordFields, ds)]) }
      }
      catch (e) { set({ cloud: { ...get().cloud, pushing: false, error: e instanceof Error ? e.message : String(e) } }); throw e }
    }
    const merged = mergeDatasets(get().base, ds)
    // games whose 比賽ID is already here are skipped
    const games = merged.games.length - get().base.games.length
    const importedAt = new Date().toISOString()
    keepLocal({ base: merged, importedAt })
    set({ base: merged, source: 'imported', importedAt })
    return { games, skipped: ds.games.length - games, dropped: [], warnings: [] }
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
        warnings.push(...droppedWarnings(dropped, fragment, game.id))
        if (dropped.includes('day_roster')) set({ dayRosterSupported: false })
        else if (game.dayRoster) set({ dayRosterSupported: true })
        // the upsert leaves day_roster out when the game has none, so a roster removed in the editor is cleared explicitly
        else if (base.games.find((g) => g.id === game.id)?.dayRoster) await updateGameDayRosters([{ id: game.id, day_roster: null }])
        await get().loadCloud()
        const lost = recordFieldWarnings(get().recordFields, fragment, game.id).filter((w) => !warnings.some((x) => x.message === w.message))
        warnings.push(...lost)
      }
      catch (e) { set({ cloud: { ...get().cloud, pushing: false, error: e instanceof Error ? e.message : String(e) } }); throw e }
      set({ cloud: { ...get().cloud, pushing: false } })
      return warnings
    }
    const next = applyGameEdit(base, fragment)
    const importedAt = new Date().toISOString()
    keepLocal({ base: next, importedAt })
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
        // and the 中繼成功 lists (an array column)
        const holdsWas = new Map(base.games.map((g) => [g.id, (g.holds ?? []).join('\u0000')]))
        const holds = next.games.filter((g) => (g.holds ?? []).join('\u0000') !== holdsWas.get(g.id)).map((g) => ({ id: g.id, holds: g.holds?.length ? g.holds : null }))
        if (holds.length) await updateGameHolds(holds)
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
    keepLocal({ base: next, importedAt })
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
    keepLocal({ base: next, importedAt })
    set({ base: next, source: 'imported', importedAt })
  },
  setParams: (patch) => { const params = { ...get().params, ...patch }; writeJSON(PARAMS_KEY, params); set({ params }) },
  loadCloud: async () => {
    if (!cloudConfigured) return
    set({ cloud: { ...get().cloud, status: get().base.games.length ? get().cloud.status : 'loading', error: null } })
    try {
      const { dataset: ds, missing } = await fetchCloudDataset()
      const lastSync = new Date().toISOString()
      writeJSON(DATA_KEY, { base: ds, importedAt: lastSync } satisfies Persisted)
      // the 2026-10-14 columns: read off the rows just loaded, so the notes go away right after the admin runs the SQL
      const recordFields: RecordFields = { endTime: !missing.includes(END_TIME_COLUMN), oppPitcher: !missing.includes(OPP_HAND_COLUMN) }
      const was = get().recordFields
      set({ base: ds, source: 'cloud', importedAt: lastSync, cloud: { ...get().cloud, status: 'ready', error: null, lastSync },
        ...(was.endTime !== recordFields.endTime || was.oppPitcher !== recordFields.oppPitcher ? { recordFields } : {}) })
    } catch (e) {
      set({ cloud: { ...get().cloud, status: 'error', error: e instanceof Error ? e.message : String(e) } })
    }
  },
  setCloudUser: (user) => {
    if (user?.is_anonymous) {
      // a 快速登入 account counts as signed in only once the database says it is a live quick session: while the
      // password is being checked, after a wrong one, or once it expired, the site shows the sign-in form
      const c0 = get().cloud
      if (c0.user?.id !== user.id) set({ cloud: { ...c0, user: null, isEditor: false, access: null } })
      void claimEditor().then((a) => {
        const c = get().cloud
        if (a === 'ok') set({ cloud: { ...c, user, isEditor: true, access: null } })
        // (an answer from before the password was accepted never takes it back)
        else if (c.user?.id === user.id && !c.isEditor) set({ cloud: { ...c, user: null, isEditor: false, access: null } })
      }, () => undefined)
      return
    }
    set({ cloud: { ...get().cloud, user, isEditor: false, access: null } })
    if (!user) return
    // the account must be the one bound to its listed email (a database without the security migration: email check)
    // a check started before a 邀請碼 was used may answer after it: never take access back from the same account
    const settle = (isEditor: boolean, access: EditorAccess | null) => { const c = get().cloud; if (c.user?.id === user.id && !(c.isEditor && !isEditor)) set({ cloud: { ...c, isEditor, access: isEditor ? null : access } }) }
    void claimEditor()
      .then(async (a) => (a === null ? settle(await fetchIsEditor(user.email), 'not_listed') : settle(a === 'ok', a)))
      .catch(() => settle(false, null))
  },
  recheckAccess: async () => {
    const user = get().cloud.user ?? (await currentUser())
    if (!user) return
    const a = await claimEditor()
    if (a === null) return
    if (user.is_anonymous) { if (a === 'ok') set({ cloud: { ...get().cloud, user, isEditor: true, access: null } }); return }
    if (get().cloud.user?.id === user.id) set({ cloud: { ...get().cloud, isEditor: a === 'ok', access: a === 'ok' ? null : a } })
  },
  claimWithCode: async (code) => {
    const user = get().cloud.user
    if (!user) return 'not_signed_in'
    const a = await claimEditor(code)
    if (a === null) return 'ok'
    if (get().cloud.user?.id === user.id) set({ cloud: { ...get().cloud, isEditor: a === 'ok', access: a === 'ok' ? null : a } })
    return a
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
  recordFields: ALL_RECORD_FIELDS,
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
  // a saved older version of the site (網站版本) only shows the data: nobody signs in there
  if (!ARCHIVE) {
    void currentUser().then((u) => st.setCloudUser(u))
    onAuthChange((u) => useDataStore.getState().setCloudUser(u))
  }
  subscribeCloudChanges(() => { const s = useDataStore.getState(); void s.loadCloud(); void s.loadAlbums(); void s.loadRegistrations() })
}

let demoCache: { base: Dataset; ds: Dataset } | null = null
/** Base dataset merged with the deterministic demo overlay when enabled. Cached per base object, so any edit invalidates it. */
export function effectiveDataset(base: Dataset, demo: boolean): Dataset {
  if (!demo) return base
  if (!demoCache || demoCache.base !== base) demoCache = { base, ds: mergeDatasets(base, generateDemo(base.roster)) }
  return demoCache.ds
}
