/**
 * Games being recorded right now (比賽進行中). While 紀錄比賽 runs, its game rows are already saved (cloud and local),
 * so every page would treat the game as played and show 勝／敗 from the current score. The live state is the
 * recorder's draft: record_drafts in the cloud, or this device's own draft without one (hooks/useLiveGames.ts reads
 * them). A draft counts only while it is not finished, not a practice, and touched in the last 12 hours, so a
 * progress left on a phone never marks its game live for good.
 *
 * The ids of those games are kept here, one set for the whole site: data/stats.ts summarizeGame reads it (its
 * `result` is then 'live'), and every team tally (teamSummary, streaks, 紀錄簿, 逐季戰績, stories) skips a live game.
 */
import { isPracticeId } from './types'
import { addDays, localDate } from '../lib/dates'

/** a draft untouched this long is an abandoned one, not a game in progress */
export const LIVE_STALE_MS = 12 * 60 * 60 * 1000

/** What the live list needs of a draft (record/model RecordState has these fields). */
export interface LiveDraftState { game: { id: string }; finished?: boolean; practice?: boolean; startedAt?: string; updatedAt?: string; /** 保留比賽: when it was suspended (resumed another day) */ suspended?: string | null }
export interface LiveDraft<S extends LiveDraftState = LiveDraftState> { state: S; updatedAt: string; by?: string | null }

const timeOf = (iso: string | undefined) => { const t = iso ? Date.parse(iso) : NaN; return Number.isNaN(t) ? null : t }

/** True when the draft is a game in progress at `now`: unfinished, no practice, updated within LIVE_STALE_MS. */
export function isLiveDraft(d: LiveDraft, now: number = Date.now()): boolean {
  const s = d.state
  if (!s?.game?.id || s.finished || s.practice || isPracticeId(s.game.id)) return false
  // 保留比賽 (suspended, to be resumed another day): in progress however long ago it was touched — no 勝／敗 yet
  if (s.suspended) return true
  const t = timeOf(d.updatedAt) ?? timeOf(s.updatedAt) ?? timeOf(s.startedAt)
  return t !== null && now - t <= LIVE_STALE_MS
}

/** The drafts that are games in progress, the most recently updated first. */
export function liveDraftsOf<S extends LiveDraftState>(drafts: Array<LiveDraft<S>>, now: number = Date.now()): Array<LiveDraft<S>> {
  return drafts.filter((d) => isLiveDraft(d, now)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
}

/**
 * Could this game be the one being recorded? Only a game dated today or yesterday (a draft goes stale after 12 hours)
 * that is not scheduled or cancelled. Used while the list has not been read yet: such a game shows neither 勝／敗 nor
 * 比賽進行中 until it is known.
 */
export function mayBeLive(game: { date: string; status?: string }, today: string = localDate()): boolean {
  return !game.status && game.date >= addDays(today, -1) && game.date <= today
}

// ---------------------------------------------------------------- the site-wide set
const EMPTY: ReadonlySet<string> = new Set()
let ids: ReadonlySet<string> = EMPTY
const listeners = new Set<() => void>()

/** The ids of the games in progress (the same Set object until the list changes, so it can key a cache). */
export const liveGameIds = (): ReadonlySet<string> => ids
export const isLiveGame = (id: string) => ids.has(id)
// the ones of them suspended (保留比賽): shown as 保留中, not 比賽進行中
let held: ReadonlySet<string> = EMPTY
export const isSuspendedGame = (id: string) => held.has(id)
export function setSuspendedGameIds(next: Iterable<string>) { const n = new Set(next); held = n.size ? n : EMPTY }
/** A short key of the set, for cache keys. */
export const liveKey = (s: ReadonlySet<string> = ids) => [...s].sort().join(',')

/** Replace the set; listeners hear about it only when the ids changed. */
export function setLiveGameIds(next: Iterable<string>) {
  const n = new Set(next)
  if (n.size === ids.size && [...n].every((id) => ids.has(id))) return
  ids = n.size ? n : EMPTY
  for (const fn of [...listeners]) fn()
}
/** Take one game off at once (結束比賽／放棄 on this device), before the next refresh confirms it. */
export function forgetLiveGame(id: string) { if (ids.has(id)) setLiveGameIds([...ids].filter((x) => x !== id)) }

export function subscribeLiveGameIds(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
