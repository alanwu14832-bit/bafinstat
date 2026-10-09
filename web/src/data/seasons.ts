/**
 * 「季」: what one season means on this site. TEAM.seasonStart is the month a season starts (VITE_TEAM_SEASON_START):
 * 1 = the calendar year (「2026 年」, the default), 8 = 學年度 from August to July (「115 學年」, the season numbered
 * by its start year; ROC year = start year − 1911). Anything else is a season from that month to the month before
 * it a year later. 紀錄簿, 生涯逐季, 逐季戰績, the filter bar's season button, the radar's 上一季 and the live page's
 * 本季 all go through here. 報名名單 keep calendar years (data/registrations.ts seasonOf).
 */
import { TEAM } from '../config/team'
import { localDate } from '../lib/dates'

export const SEASON_START: number = TEAM.seasonStart

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` }

/** The season a date ('yyyy-mm-dd') falls in, numbered by the year it starts in; 0 when the date is blank or unreadable. */
export function seasonOfDate(date: string | undefined, start = SEASON_START): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '')
  if (!m) return 0
  const y = Number(m[1]), mo = Number(m[2])
  if (y < 1000 || mo < 1 || mo > 12) return 0
  return mo >= start ? y : y - 1
}

/** First and last day of a season ('yyyy-mm-dd'); `to` is the day before the next season starts. */
export function seasonRange(season: number, start = SEASON_START): { from: string; to: string } {
  const from = Date.UTC(season, start - 1, 1)
  const next = Date.UTC(season + 1, start - 1, 1)
  return { from: iso(from), to: iso(next - 86400000) }
}

/** '114 學年' (start 8), '2026 年' (start 1), '2025/26 季' (any other start); '日期不明' for season 0. */
export function seasonLabel(season: number, start = SEASON_START): string {
  if (!season) return '日期不明'
  if (start === 1) return `${season} 年`
  if (start === 8) return `${season - 1911} 學年`
  return `${season}/${pad((season + 1) % 100)} 季`
}

/** The seasons a list covers: '113–115 學年', '2024–2026 年'; one season reads as its label. */
export function seasonSpan(seasons: number[], start = SEASON_START): string {
  const xs = seasons.filter((s) => s > 0)
  if (!xs.length) return seasons.length ? seasonLabel(0, start) : ''
  const lo = Math.min(...xs), hi = Math.max(...xs)
  if (lo === hi) return seasonLabel(lo, start)
  if (start === 1) return `${lo}–${hi} 年`
  if (start === 8) return `${lo - 1911}–${hi - 1911} 學年`
  return `${lo}/${pad((lo + 1) % 100)}–${hi}/${pad((hi + 1) % 100)} 季`
}

/** The season today is in (today = the device's local date). */
export function currentSeason(today: string = localDate(), start = SEASON_START): number {
  return seasonOfDate(today, start)
}

/** Column header for a season column: 「年」 (calendar years), 「學年」 or 「季」. */
export function seasonHeader(start = SEASON_START): string {
  return start === 1 ? '年' : start === 8 ? '學年' : '季'
}

/** One line saying what a season is, for subtitles; empty for calendar years (nothing to explain). */
export function seasonNote(start = SEASON_START): string {
  if (start === 1) return ''
  if (start === 8) return '學年 = 8 月到隔年 7 月'
  return `季 = 每年 ${start} 月到隔年 ${start - 1} 月`
}
