/**
 * 比賽時間: a game keeps its 開賽時間 (Game.time) and 結束時間 (Game.endTime) as 'HH:MM'; how long it took is always
 * worked out from the two, never stored.
 */
import type { Game } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** A clock time typed or imported in any common way ('9:05', '15:22:00', '15：22', '15.22', '1522') → 'HH:MM', or undefined. */
export function cleanTime(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  const m = /^(\d{1,2})\s*[:：.]\s*(\d{2})/.exec(s) ?? /^(\d{1,2})(\d{2})$/.exec(s)
  if (!m) return undefined
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return undefined
  return `${pad(h)}:${pad(min)}`
}

/** 'HH:MM' → minutes after midnight, or undefined. */
export function toMinutes(v: string | undefined): number | undefined {
  const t = cleanTime(v)
  if (!t) return undefined
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
}

/** Minutes from start to end (a game past midnight wraps: 23:30 → 01:10 = 100); undefined when either is missing or they are equal. */
export function durationMinutes(start: string | undefined, end: string | undefined): number | undefined {
  const a = toMinutes(start), b = toMinutes(end)
  if (a === undefined || b === undefined) return undefined
  const d = (b - a + 1440) % 1440
  return d === 0 ? undefined : d
}

/** Longer than this (6 hours) is almost surely a typo, e.g. the start after the end: the editors say 「請確認時間」. */
export const LONG_GAME_MINUTES = 360
export const LONG_GAME_NOTE = '超過 6 小時，請確認時間'
export const isLongGame = (minutes: number | undefined): boolean => (minutes ?? 0) > LONG_GAME_MINUTES

/** 135 → '2 小時 15 分', 120 → '2 小時', 45 → '45 分' */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60
  return h ? `${h} 小時${m ? ` ${m} 分` : ''}` : `${m} 分`
}

/** '13:07–15:22・2 小時 15 分', or '13:07 開賽' with no end time, or '' with no start time. */
export function gameTimeText(game: Pick<Game, 'time' | 'endTime'>): string {
  const start = cleanTime(game.time)
  if (!start) return ''
  const end = cleanTime(game.endTime)
  const d = durationMinutes(start, end)
  if (!end || d === undefined) return `${start} 開賽`
  return `${start}–${end}・${formatDuration(d)}`
}
