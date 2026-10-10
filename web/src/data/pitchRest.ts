/**
 * 投手休息表: how many days each pitcher should rest after his outings, following the team's rules
 * (config/teamDefaults.ts pitchRest — MLB Pitch Smart 19–22 歲建議 by default). A recommendation, never a league rule:
 * nothing on the site blocks a pitching change with it.
 *
 * Pitches are every recorded pitch of the pitcher's plate appearances (pitchTotals, the same as the 投球 page's PC).
 * Pitches of a plate appearance that never ended (the half ended on a caught stealing) are on no row, so they are not
 * counted; plate appearances without pitches (old imports) are flagged instead of guessed.
 */
import { TEAM } from '../config/team'
import { addDays, weekday } from '../lib/dates'
import { playedGames } from './filters'
import { outsCredited, pitchTotals } from './stats'
import { isPA, type Dataset } from './types'

/** Same shape as TEAM_DEFAULTS.pitchRest. */
export interface RestRules {
  source: string
  /** [most pitches that day, rest days], increasing */
  tiers: Array<[number, number]>
  /** rest days past the last tier */
  over: number
  dailyMax: number
  maxConsecutiveDays: number
  oneGamePerDay: boolean
  warnWithin: number
  windowDays: number
}

const DEFAULT_RULES: RestRules = TEAM.pitchRest

/** Rest days after `p` pitches in a day (0 pitches → 0). */
export function restDays(p: number, rules: RestRules = DEFAULT_RULES): number {
  if (p <= 0) return 0
  const t = rules.tiers.find(([upTo]) => p <= upTo)
  return t ? t[1] : rules.over
}

/** The next tier up from `p` pitches: from `at` pitches on, rest `rest` days; null past the last tier. */
export function nextTier(p: number, rules: RestRules = DEFAULT_RULES): { at: number; rest: number } | null {
  const i = rules.tiers.findIndex(([upTo]) => p <= upTo)
  if (i < 0) return null
  return { at: rules.tiers[i][0] + 1, rest: i + 1 < rules.tiers.length ? rules.tiers[i + 1][1] : rules.over }
}

/** What is wrong with a set of rules (empty when they are fine). */
export function checkRestRules(rules: RestRules): string[] {
  const errs: string[] = []
  if (!rules.tiers.length) return ['至少要有一級用球數']
  rules.tiers.forEach(([upTo, rest], i) => {
    if (i === 0) return
    const [pu, pr] = rules.tiers[i - 1]
    if (upTo <= pu) errs.push(`第 ${i + 1} 級的球數（${upTo}）要比前一級（${pu}）多`)
    if (rest <= pr) errs.push(`第 ${i + 1} 級的休息天數（${rest}）要比前一級（${pr}）多`)
  })
  const [lastUp, lastRest] = rules.tiers[rules.tiers.length - 1]
  if (rules.over < lastRest) errs.push(`超過最後一級的休息天數（${rules.over}）不能比最後一級（${lastRest}）少`)
  if (rules.dailyMax <= lastUp) errs.push(`單日上限（${rules.dailyMax}）要比最後一級的球數（${lastUp}）多`)
  return errs
}

/** One pitcher in one game. */
export interface Outing {
  pitcher: string
  gameId: string
  date: string
  time?: string
  opponent: string
  pitches: number
  /** plate appearances (突破僵局 runners are not batters) */
  batters: number
  outs: number
  /** plate appearances with no pitches recorded (an empty 故四 is complete: no pitch is thrown) */
  unknownPAs: number
}

/** Every pitcher's outing in every played game, by date, time and game id. */
export function outings(ds: Dataset): Outing[] {
  const games = playedGames(ds)
  const ids = new Set(games.map((g) => g.id))
  const rows = ds.pitching.filter((p) => ids.has(p.gameId))
  const credit = outsCredited(rows)
  const by = new Map<string, Outing>()
  for (const p of rows) {
    const key = `${p.gameId}\u0000${p.pitcher}`
    let o = by.get(key)
    if (!o) { o = { pitcher: p.pitcher, gameId: p.gameId, date: '', opponent: '', pitches: 0, batters: 0, outs: 0, unknownPAs: 0 }; by.set(key, o) }
    o.pitches += pitchTotals(p.pitches ?? []).pitches
    o.outs += credit.get(p) ?? 0
    if (isPA(p)) {
      o.batters += 1
      if (!(p.pitches ?? []).length && p.result !== '故四') o.unknownPAs += 1
    }
  }
  const gameOf = new Map(games.map((g) => [g.id, g]))
  const out: Outing[] = []
  for (const o of by.values()) {
    const g = gameOf.get(o.gameId)!
    // a pitcher with only 突破僵局 rows (changed before a pitch) did not pitch
    if (!o.pitcher || (!o.batters && !o.pitches)) continue
    out.push({ ...o, date: g.date, ...(g.time ? { time: g.time } : {}), opponent: g.opponent })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.gameId.localeCompare(b.gameId))
}

/** One day of one pitcher (Pitch Smart counts by the day: a doubleheader adds up). */
export interface PitchDay {
  date: string
  pitches: number
  games: Outing[]
  rest: number
  /** first day he may pitch again */
  until: string
  overMax: boolean
  unknownPAs: number
}

export interface RestStatus {
  name: string
  asOf: string
  /** his days in the window, oldest first */
  days: PitchDay[]
  /** the first day he may pitch (asOf when he has no outing in the window) */
  earliest: string
  available: boolean
  /** why `earliest` is that day: 「10/07 投 85 球，要休 4 天」 or 「已連續 2 天出賽」 */
  reason?: string
  warnings: string[]
  /** pitches asOf−6 … asOf */
  last7: number
}

/** 'MM/DD' */
export const md = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`
/** 'MM/DD（星期）', padded like md so a sentence never mixes 10/9 and 10/09: '10/09（五）' */
export const mdWeek = (iso: string) => `${md(iso)}（${weekday(iso)}）`

/** Where one pitcher stands on `asOf` (yyyy-mm-dd). excludeGameId leaves out the game being recorded. */
export function restStatus(name: string, all: Outing[], asOf: string, rules: RestRules = DEFAULT_RULES, opts: { excludeGameId?: string } = {}): RestStatus {
  const from = addDays(asOf, -rules.windowDays)
  const mine = all.filter((o) => o.pitcher === name && o.gameId !== opts.excludeGameId && o.date >= from && o.date <= asOf)
  const byDate = new Map<string, Outing[]>()
  for (const o of mine) (byDate.get(o.date) ?? byDate.set(o.date, []).get(o.date)!).push(o)
  const days: PitchDay[] = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, games]) => {
    const pitches = games.reduce((n, o) => n + o.pitches, 0)
    const rest = restDays(pitches, rules)
    return { date, pitches, games, rest, until: addDays(date, rest === 0 && !rules.oneGamePerDay ? 0 : rest + 1), overMax: pitches > rules.dailyMax, unknownPAs: games.reduce((n, o) => n + o.unknownPAs, 0) }
  })
  const pitched = new Set(days.map((d) => d.date))
  const streak = (day: string) => { let n = 0; while (pitched.has(addDays(day, -(n + 1)))) n++; return n }
  let decisive: PitchDay | undefined
  for (const d of days) if (!decisive || d.until >= decisive.until) decisive = d
  let earliest = decisive ? decisive.until : asOf
  let pushed = 0
  for (let i = 0; i < 30 && days.length && streak(earliest) >= rules.maxConsecutiveDays; i++) { if (!pushed) pushed = streak(earliest); earliest = addDays(earliest, 1) }
  const available = earliest <= asOf
  const reason = pushed ? `已連續 ${pushed} 天出賽`
    : decisive ? `${md(decisive.date)} 投 ${decisive.pitches} 球，${decisive.rest ? `要休 ${decisive.rest} 天` : '一天只投一場'}` : undefined

  const warnings: string[] = []
  let prev: PitchDay | undefined   // the earlier day that asks for the most rest
  days.forEach((d, i) => {
    if (d.overMax) warnings.push(`${md(d.date)} 投 ${d.pitches} 球，超過單日上限 ${rules.dailyMax} 球`)
    if (rules.oneGamePerDay && d.games.length > 1) warnings.push(`${md(d.date)} 一天投了 ${d.games.length} 場`)
    if (prev && d.date < prev.until) warnings.push(`${md(d.date)} 出賽時休息不夠（${md(prev.date)} 投 ${prev.pitches} 球，建議 ${md(prev.until)} 起再投）`)
    // a run of days in a row, said once at its last day
    const next = days[i + 1]
    if (!next || next.date !== addDays(d.date, 1)) {
      const run = streak(d.date) + 1
      if (run > rules.maxConsecutiveDays) warnings.push(`${md(addDays(d.date, -(run - 1)))}–${md(d.date)} 連續 ${run} 天出賽`)
    }
    if (d.unknownPAs) warnings.push(`${md(d.date)} 有 ${d.unknownPAs} 個打席沒記球數，實際用球可能更多`)
    if (!prev || d.until >= prev.until) prev = d
  })
  const week = addDays(asOf, -6)
  const last7 = days.filter((d) => d.date >= week).reduce((n, d) => n + d.pitches, 0)
  return { name, asOf, days, earliest, available, ...(reason ? { reason } : {}), warnings, last7 }
}

/** The rest table: who may pitch on `asOf`, who is resting (soonest back first), and the roster's pitchers with no outing in the window. */
export function restBoard(ds: Dataset, asOf: string, rules: RestRules = DEFAULT_RULES, all: Outing[] = outings(ds)): { available: RestStatus[]; resting: RestStatus[]; idle: string[] } {
  const from = addDays(asOf, -rules.windowDays)
  const names = [...new Set(all.filter((o) => o.date >= from && o.date <= asOf).map((o) => o.pitcher))]
  const order = new Map(ds.roster.map((p, i) => [p.name, i]))
  const rank = (n: string) => order.get(n) ?? Number.MAX_SAFE_INTEGER
  const statuses = names.map((n) => restStatus(n, all, asOf, rules))
  const seen = new Set(names)
  return {
    available: statuses.filter((s) => s.available).sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)),
    resting: statuses.filter((s) => !s.available).sort((a, b) => a.earliest.localeCompare(b.earliest) || rank(a.name) - rank(b.name)),
    idle: ds.roster.filter((p) => (p.primaryPos === 'P' || p.secondaryPos === 'P') && (!p.status || p.status === '現役') && !seen.has(p.name)).map((p) => p.name),
  }
}

/** Pitches thrown on `date` in other games (a doubleheader). */
export function pitchesToday(name: string, date: string, all: Outing[], excludeGameId?: string): number {
  return all.filter((o) => o.pitcher === name && o.date === date && o.gameId !== excludeGameId).reduce((n, o) => n + o.pitches, 0)
}

export type RestTone = 'ok' | 'warning' | 'critical'
/** The line under the pitch count on 紀錄比賽, for `n` pitches today. */
export function liveRestHint(n: number, rules: RestRules = DEFAULT_RULES): { rest: number; short: string; warn: string | null; tone: RestTone } {
  const rest = restDays(n, rules)
  const short = rest ? `需休 ${rest} 天` : '不用休息'
  const max = rules.dailyMax
  if (n > max) return { rest, short, warn: `超過單日上限 ${max} 球（多 ${n - max} 球）`, tone: 'critical' }
  if (n === max) return { rest, short, warn: `已達單日上限 ${max} 球`, tone: 'critical' }
  if (max - n <= rules.warnWithin) return { rest, short, warn: `離單日上限 ${max} 球還有 ${max - n} 球`, tone: 'warning' }
  const t = nextTier(n, rules)
  if (t && t.at - n <= rules.warnWithin) {
    const more = t.rest - rest
    return { rest, short, warn: `再投 ${t.at - n} 球就要${more > 1 ? `多休 ${more} 天` : '多休一天'}（${t.at} 球起休 ${t.rest} 天）`, tone: 'warning' }
  }
  return { rest, short, warn: null, tone: 'ok' }
}

/** The rules in plain lines (the 規則 card, the guide). */
export function rulesText(rules: RestRules = DEFAULT_RULES): string[] {
  const lines = rules.tiers.map(([upTo, rest], i) => `${i ? rules.tiers[i - 1][0] + 1 : 1}–${upTo} 球：${rest ? `休 ${rest} 天` : '不用休息'}`)
  const last = rules.tiers[rules.tiers.length - 1]?.[0] ?? 0
  lines.push(`${last + 1} 球以上：休 ${rules.over} 天`, `一天最多 ${rules.dailyMax} 球`, `不要連續 ${rules.maxConsecutiveDays + 1} 天出賽`)
  if (rules.oneGamePerDay) lines.push('一天只投一場')
  return lines
}

/** 「10/12（一）起可投」 */
export const backOn = (s: RestStatus) => `${mdWeek(s.earliest)}起可投`
