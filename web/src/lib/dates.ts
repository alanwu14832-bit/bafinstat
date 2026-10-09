/**
 * Calendar dates as the site stores them ('yyyy-mm-dd'), in the device's own time zone.
 * Never build today's date with toISOString(): that is UTC, so a Taiwan morning before 08:00 becomes yesterday.
 * Day arithmetic goes through Date.UTC, so daylight-saving changes never shift a day.
 */
const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date 'yyyy-mm-dd' of `d` (default: now). */
export function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local clock time 'HH:MM' of a Date or an ISO timestamp. */
export function hhmm(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`
}

const utcOf = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) }
const isoOfUtc = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` }

/** 'yyyy-mm-dd' plus n days (n may be negative). */
export function addDays(iso: string, n: number): string {
  return isoOfUtc(utcOf(iso) + n * 86400000)
}

/** Whole days from a to b ('2026-10-07' → '2026-10-12' = 5). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utcOf(b) - utcOf(a)) / 86400000)
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
/** 星期: '一' … '日'. */
export function weekday(iso: string): string {
  return WEEKDAYS[new Date(utcOf(iso)).getUTCDay()]
}

/** '10/12（一）' */
export function mdw(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${m}/${d}（${weekday(iso)}）`
}
