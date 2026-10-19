/**
 * The games being recorded right now, for every page at once: one list, one fetch shared by every component that asks
 * (data/liveGames.ts keeps the ids that summarizeGame reads). With the cloud it is the record_drafts table (any
 * device's 紀錄比賽), without it this device's own draft. The list refreshes every 30 s while the page is visible (or
 * faster while a page asks for it: 即時比分 every 5 s), when the window gets the focus again, and when a page says a
 * game was finished or abandoned (refreshLiveGames).
 *
 * The 30 s check every page runs reads only each draft's head (game id, time, finished / practice: a few bytes); the
 * whole recording state is downloaded only while a page asks for it (`full`: 即時比分).
 *
 * The last list read in this tab is kept in sessionStorage, so a reload starts from it instead of from 「nothing is
 * live」 (a live game would otherwise show 勝／敗 for the length of the first read).
 */
import { useLayoutEffect, useSyncExternalStore } from 'react'
import { cloudConfigured, listCloudDraftHeads, listCloudDrafts } from '../data/supabase'
import { DRAFT_KEY, readDraft } from '../record/draft'
import type { RecordState } from '../record/model'
import { forgetLiveGame, LIVE_STALE_MS, liveDraftsOf, liveGameIds, setLiveGameIds, setSuspendedGameIds, subscribeLiveGameIds, type LiveDraft } from '../data/liveGames'

export const LIVE_POLL_MS = 30_000
export const DRAFTS_MISSING = '雲端尚未建立 record_drafts 表，無法顯示即時比分'

export interface LiveGames {
  /** the games in progress (unfinished, no practice, updated in the last 12 hours), the latest first, with their full
   *  recording state: filled by the reads made while a page asks for `full` (the head-only reads keep the last ones,
   *  minus the games no longer live) */
  drafts: Array<LiveDraft<RecordState>>
  /** their game ids (the same set summarizeGame reads) */
  ids: ReadonlySet<string>
  /** why the list could not be read (the last good list is kept) */
  error: string | null
  /** false until the first read finished */
  loaded: boolean
  /** true once a read succeeded (or this device's own draft was read): until then a game may be live without the
   *  site knowing yet, so the game page shows neither 勝／敗 nor 比賽進行中 for a recent game */
  known: boolean
}

// ---------------------------------------------------------------- the last list of this tab (sessionStorage)
const CACHE_KEY = 'bafin.liveGames'
function readCache(): string[] {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? 'null') as { ids?: unknown; at?: unknown } | null
    if (!c || !Array.isArray(c.ids) || typeof c.at !== 'number' || Date.now() - c.at > LIVE_STALE_MS) return []
    return c.ids.filter((x): x is string => typeof x === 'string')
  } catch { return [] }
}
function writeCache(ids: ReadonlySet<string>) {
  try {
    if (ids.size) sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ids: [...ids], at: Date.now() }))
    else sessionStorage.removeItem(CACHE_KEY)
  } catch { /* private window / storage blocked: the first read decides */ }
}
if (cloudConfigured) setLiveGameIds(readCache())

const INITIAL: LiveGames = { drafts: [], ids: liveGameIds(), error: null, loaded: false, known: false }
let snap: LiveGames = INITIAL
const subs = new Set<() => void>()
const emit = () => { for (const fn of [...subs]) fn() }
const subscribe = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn) } }

// the ids changed elsewhere (forgetLiveGame on 結束比賽, a test): the list follows them
subscribeLiveGameIds(() => {
  const ids = liveGameIds()
  if (snap.ids === ids) return
  snap = { ...snap, ids, drafts: snap.drafts.filter((d) => ids.has(d.state.game.id)) }
  emit()
})

/** A read came back: `full` = with the recording states (else only the heads: the ids change, the states stay). */
function apply(all: LiveDraft[], error: string | null, full: boolean) {
  const live = liveDraftsOf(all)
  setSuspendedGameIds(live.filter((d) => d.state.suspended).map((d) => d.state.game.id))
  setLiveGameIds(live.map((d) => d.state.game.id))
  const ids = liveGameIds()
  if (cloudConfigured) writeCache(ids)
  const drafts = full ? (live as unknown as Array<LiveDraft<RecordState>>) : snap.drafts.filter((d) => ids.has(d.state.game.id))
  snap = { drafts, ids, error, loaded: true, known: true }
  emit()
}
function readLocal() {
  const local = readDraft()
  apply(local ? [{ state: local, updatedAt: local.updatedAt ?? local.startedAt }] : [], null, true)
}

let inflight: Promise<void> | null = null
let again = false
let lastRead = 0
/** whether the read on its way / the last finished read brought the full states */
let readingFull = false
let lastFull = false

/** Read the list again now (one read at a time; a call during a read gets one more read after it). */
export function refreshLiveGames(): Promise<void> {
  lastRead = Date.now()
  if (!cloudConfigured) { readLocal(); return Promise.resolve() }
  if (inflight) { again = true; return inflight }
  const run = (async () => {
    try {
      do {
        again = false
        const full = readingFull = wantFull()
        try {
          if (full) {
            const d = await listCloudDrafts<RecordState>()
            if (d === null) apply([], DRAFTS_MISSING, true)
            else apply(d.map((x) => ({ state: x.state, updatedAt: x.updated_at, by: x.updated_by })), null, true)
          } else {
            const d = await listCloudDraftHeads()
            if (d === null) apply([], DRAFTS_MISSING, false)
            else apply(d.map((x) => ({ state: { game: { id: x.game_id }, finished: x.finished === true, practice: x.practice === true, ...(x.suspended ? { suspended: String(x.suspended) } : {}) }, updatedAt: x.updated_at })), null, false)
          }
          lastFull = full
        } catch (e) {
          snap = { ...snap, error: e instanceof Error ? e.message : String(e), loaded: true }
          emit()
        }
      } while (again)
    } finally { inflight = null }
  })()
  inflight = run
  return run
}

/** 結束比賽／放棄 on this device: the game shows its result at once, then the list is read again. */
export function liveGameEnded(id: string): Promise<void> {
  forgetLiveGame(id)
  return refreshLiveGames()
}

// ---------------------------------------------------------------- polling, while any component wants the list
const wants = new Map<object, { ms: number; full: boolean }>()
const wantFull = () => [...wants.values()].some((w) => w.full)
let timer: number | undefined
const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
const onFocus = () => { if (visible()) void refreshLiveGames() }
const onStorage = (e: StorageEvent) => { if (!cloudConfigured && (e.key === null || e.key === DRAFT_KEY)) readLocal() }
let listening = false

function schedule() {
  if (timer !== undefined) { window.clearInterval(timer); timer = undefined }
  if (!wants.size) {
    if (listening) { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('storage', onStorage); listening = false }
    return
  }
  const ms = Math.min(...[...wants.values()].map((w) => w.ms))
  timer = window.setInterval(() => { if (visible()) void refreshLiveGames() }, ms)
  if (!listening) { window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus); window.addEventListener('storage', onStorage); listening = true }
}

/**
 * The games in progress. Mounting it starts the shared refresh (every `pollMs`, 30 s by default; the fastest asked
 * for wins) and reads the list at once unless it was read in the last few seconds. `full`: this page shows the
 * recording itself (即時比分), so the reads download the drafts' whole state while it is open.
 */
export function useLiveGames({ pollMs = LIVE_POLL_MS, full = false }: { pollMs?: number; full?: boolean } = {}): LiveGames {
  // (a layout effect: this device's own draft is read before the first paint, so a live game never flashes 勝／敗)
  useLayoutEffect(() => {
    const key = {}
    wants.set(key, { ms: pollMs, full })
    schedule()
    // (one read for components mounting together: a read on its way already serves them, unless this one needs the
    // full states and that read brings only the heads)
    const needFull = full && !lastFull
    if (!cloudConfigured) void refreshLiveGames()
    else if (inflight) { if (needFull && !readingFull) again = true }
    else if (!snap.loaded || needFull || Date.now() - lastRead > 3000) void refreshLiveGames()
    return () => { wants.delete(key); schedule() }
  }, [pollMs, full])
  return useSyncExternalStore(subscribe, () => snap)
}

/** Only the ids (no refresh of its own): re-renders when a game starts or stops being live. */
export function useLiveIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeLiveGameIds, liveGameIds)
}

/** Tests: forget everything (the list, the ids, the timers). */
export function resetLiveGames() {
  wants.clear(); schedule()
  inflight = null; again = false; lastRead = 0; readingFull = false; lastFull = false
  try { sessionStorage.removeItem(CACHE_KEY) } catch { /* no storage */ }
  setLiveGameIds([])
  snap = { ...INITIAL, ids: liveGameIds() }
  emit()
}
