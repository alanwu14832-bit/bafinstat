// wave-2 stand-in: batch 5 owns this (only what the live page needs; the merge keeps batch 5's version)
/**
 * 「一季」: the calendar year by default (TEAM.seasonStart 1), or a season starting in another month (8 = 學年, Aug–Jul).
 * Every place that means 本季 goes through seasonOfDate, so the setting changes all of them at once.
 */
import { TEAM } from '../config/team'

export const SEASON_START: number = (TEAM as { seasonStart?: number }).seasonStart ?? 1

/** The season a date belongs to, named by the year it starts in ('' or junk -> 0). */
export function seasonOfDate(date: string, start: number = SEASON_START): number {
  const m = /^\s*(\d{4})-(\d{2})/.exec(date ?? '')
  if (!m) return 0
  const y = Number(m[1]), mo = Number(m[2])
  return start > 1 && mo < start ? y - 1 : y
}

/** One line explaining the season, '' for the calendar year. */
export function seasonNote(start: number = SEASON_START): string {
  if (start === 1) return ''
  if (start === 8) return '學年 = 8 月到隔年 7 月'
  return `季 = 每年 ${start} 月到隔年 ${start - 1} 月`
}
