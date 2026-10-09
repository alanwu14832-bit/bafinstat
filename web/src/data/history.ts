/**
 * 隊史: every played game at once, whatever the filter bar says — the index the 紀錄簿, the 球員 page's 生涯 tab, the
 * 里程碑 and the all-time streak ranks read. Nothing is stored: it is built in the browser from the same rows as every
 * other page (hooks/useHistory.ts caches it per dataset object).
 *
 * 季 = data/seasons.ts (the calendar year by default, 學年 with VITE_TEAM_SEASON_START=8).
 * Streaks follow MLB 9.23(b): a game with no 打數 and no 犧飛 (only walks, HBP, sacrifice bunts, interference, or
 * pinch-running) neither extends nor breaks a hitting streak. The scoreless-innings streak works inning by inning.
 */
import { playedGames } from './filters'
import { isActivePlayer } from './rosterSort'
import { SEASON_START, currentSeason, seasonLabel, seasonOfDate, seasonRange } from './seasons'
import { battingLines, div, outsCredited, pitchingLines, summarizeGame, teamBatting, teamPitching, type BattingLine, type GameSummary, type PitchingLine } from './stats'
import type { BattingPA, Dataset, PitchingPA, Player, StatParams } from './types'
import { DEFAULT_PARAMS } from './types'
import { localDate } from '../lib/dates'

export interface GameRef { id: string; date: string; opponent: string; tournament: string; season: number; isDemo: boolean }
/** One player's line in one game (batting includes games he only pinch-ran in) */
export interface BatGame { game: GameRef; line: BattingLine }
/** One pitcher's line in one game, with that game's 勝／敗／救援／中繼 and GS */
export interface PitGame { game: GameRef; line: PitchingLine }
/** A pitcher's work in one inning of one game: outs credited to him, runs charged to him (R or ER on his rows) */
export interface PitSegment { game: GameRef; inning: number; outs: number; runs: number }
export interface SeasonLine<T> { season: number; label: string; teamGames: number; line: T }
export interface TeamExtras { sb: number; k: number; outs: number }

export interface HistoryIndex {
  start: number
  params: StatParams
  roster: Player[]
  /** played games, oldest first */
  games: GameRef[]
  gameById: Map<string, GameRef>
  summaries: GameSummary[]
  summaryById: Map<string, GameSummary>
  /** seasons with games, ascending */
  seasons: number[]
  teamGames: Map<number, number>
  batGames: Map<string, BatGame[]>
  pitGames: Map<string, PitGame[]>
  segments: Map<string, PitSegment[]>
  extras: Map<string, TeamExtras>
  batSeasons: Map<string, SeasonLine<BattingLine>[]>
  pitSeasons: Map<string, SeasonLine<PitchingLine>[]>
  batCareer: Map<string, BattingLine>
  pitCareer: Map<string, PitchingLine>
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]) }

/** Build the index over every played game of `ds` (oldest first). */
export function buildHistory(ds: Dataset, params: StatParams = DEFAULT_PARAMS, start = SEASON_START): HistoryIndex {
  const played = playedGames(ds)
  const games: GameRef[] = played.map((g) => ({ id: g.id, date: g.date, opponent: g.opponent, tournament: g.tournament, season: seasonOfDate(g.date, start), isDemo: !!g.isDemo }))
  const gameById = new Map(games.map((g) => [g.id, g]))
  const summaries = played.map((g) => summarizeGame(ds, g))
  const summaryById = new Map(summaries.map((s) => [s.game.id, s]))
  const batBy = new Map<string, BattingPA[]>()
  const pitBy = new Map<string, PitchingPA[]>()
  for (const p of ds.batting) if (gameById.has(p.gameId)) push(batBy, p.gameId, p)
  for (const p of ds.pitching) if (gameById.has(p.gameId)) push(pitBy, p.gameId, p)

  const batGames = new Map<string, BatGame[]>()
  const pitGames = new Map<string, PitGame[]>()
  const segments = new Map<string, PitSegment[]>()
  const extras = new Map<string, TeamExtras>()
  for (const [i, ref] of games.entries()) {
    const bat = batBy.get(ref.id) ?? []
    const pit = pitBy.get(ref.id) ?? []
    for (const line of battingLines(ds, bat, params)) push(batGames, line.name, { game: ref, line })
    for (const line of pitchingLines(pit, [played[i]], params)) push(pitGames, line.name, { game: ref, line })
    const credit = outsCredited(pit)
    // per pitcher per inning, in the order he first appears in it (rows are in game order)
    const seg = new Map<string, PitSegment>()
    let outs = 0, k = 0
    for (const p of pit) {
      if (!p.pitcher || !p.result) continue
      const key = `${p.pitcher}\u0000${p.inning}`
      let s = seg.get(key)
      if (!s) { s = { game: ref, inning: p.inning, outs: 0, runs: 0 }; seg.set(key, s); push(segments, p.pitcher, s) }
      const o = credit.get(p) ?? 0
      s.outs += o; outs += o
      if (p.code === 'R' || p.code === 'ER') s.runs++
      if (p.result === '三振') k++
    }
    extras.set(ref.id, { sb: bat.reduce((a, p) => a + (p.result ? p.sb : 0), 0), k, outs })
  }
  // a pitcher's innings in order: game, then inning (an inning he came back to keeps its first place)
  const order = new Map(games.map((g, i) => [g.id, i]))
  for (const segs of segments.values()) segs.sort((a, b) => order.get(a.game.id)! - order.get(b.game.id)! || a.inning - b.inning)

  const seasons = [...new Set(games.map((g) => g.season))].sort((a, b) => a - b)
  const teamGames = new Map<number, number>()
  for (const g of games) teamGames.set(g.season, (teamGames.get(g.season) ?? 0) + 1)
  const batSeasons = new Map<string, SeasonLine<BattingLine>[]>()
  const pitSeasons = new Map<string, SeasonLine<PitchingLine>[]>()
  for (const season of seasons) {
    const ids = games.filter((g) => g.season === season).map((g) => g.id)
    const bat = ids.flatMap((id) => batBy.get(id) ?? [])
    const pit = ids.flatMap((id) => pitBy.get(id) ?? [])
    const tg = teamGames.get(season)!
    const label = seasonLabel(season, start)
    for (const line of battingLines(ds, bat, params)) push(batSeasons, line.name, { season, label, teamGames: tg, line })
    for (const line of pitchingLines(pit, played.filter((g) => ids.includes(g.id)), params)) push(pitSeasons, line.name, { season, label, teamGames: tg, line })
  }
  const allBat = games.flatMap((g) => batBy.get(g.id) ?? [])
  const allPit = games.flatMap((g) => pitBy.get(g.id) ?? [])
  const batCareer = new Map(battingLines(ds, allBat, params).map((l) => [l.name, l]))
  const pitCareer = new Map(pitchingLines(allPit, played, params).map((l) => [l.name, l]))
  return { start, params, roster: ds.roster, games, gameById, summaries, summaryById, seasons, teamGames, batGames, pitGames, segments, extras, batSeasons, pitSeasons, batCareer, pitCareer }
}

/** A current player (blank status or 現役); someone not on the roster counts as current. */
export function isActive(h: Pick<HistoryIndex, 'roster'>, name: string): boolean {
  return isActivePlayer(h.roster.find((p) => p.name === name))
}

/** Every player with a line in the history, batting or pitching. */
export function historyPlayers(h: HistoryIndex): string[] {
  return [...new Set([...h.batCareer.keys(), ...h.pitCareer.keys()])]
}

// ------------------------------------------------------------------ streaks
export type StreakTest = (l: BattingLine) => 'yes' | 'no' | 'skip'
/** 連續安打 (MLB 9.23(b)): a game with no 打數 and no 犧飛 (walks, HBP, sacrifice bunts, interference, pinch-running only) is skipped. */
export const hitTest: StreakTest = (l) => (l.h > 0 ? 'yes' : l.ab === 0 && l.sf === 0 ? 'skip' : 'no')
/** 連續上壘: a hit, a walk or a hit-by-pitch; a game without a plate appearance (pinch-running only) is skipped. */
export const onBaseTest: StreakTest = (l) => (l.h + l.bb + l.hbp > 0 ? 'yes' : l.pa === 0 ? 'skip' : 'no')

export interface Streak {
  n: number
  from: string; to: string
  fromId: string; toId: string
  /** innings of the first and last game (scoreless-innings streaks) */
  fromInning?: number; toInning?: number
  /** it reaches the player's (or the team's) latest game and is still going */
  active: boolean
}
export interface StreakResult { best: Streak | null; current: Streak | null }

/** Every run of `yes` games (skips neither extend nor break a run), oldest first. */
export function streakRuns<T extends { game: GameRef; line: BattingLine }>(rows: T[], test: StreakTest): Streak[] {
  const runs: Streak[] = []
  let cur: Streak | null = null
  for (const r of rows) {
    const t = test(r.line)
    if (t === 'skip') continue
    if (t === 'yes') {
      if (cur) { cur.n++; cur.to = r.game.date; cur.toId = r.game.id } else { cur = { n: 1, from: r.game.date, to: r.game.date, fromId: r.game.id, toId: r.game.id, active: false }; runs.push(cur) }
    } else cur = null
  }
  return runs
}

/**
 * A player's longest run (ties keep the most recent) and the run ending at his last game (null when his last
 * counted game broke it). `active` marks a run that is still going for a current player.
 */
export function streaks<T extends { game: GameRef; line: BattingLine }>(rows: T[], test: StreakTest, playerActive = true): StreakResult {
  const runs = streakRuns(rows, test)
  // the last game that counted (yes or no) decides whether the latest run is still going
  let last: 'yes' | 'no' | null = null
  for (let i = rows.length - 1; i >= 0 && last === null; i--) { const t = test(rows[i].line); if (t !== 'skip') last = t }
  const current = last === 'yes' && runs.length ? runs[runs.length - 1] : null
  if (current) current.active = playerActive
  let best: Streak | null = null
  for (const r of runs) if (!best || r.n >= best.n) best = r
  return { best, current }
}

/** 最長連續無失分局數, in outs: innings without a run charged add their outs, an inning with one ends the run (and its outs do not count). */
export function scorelessStreak(segs: PitSegment[], playerActive = true): StreakResult {
  const runs: Streak[] = []
  let cur: Streak | null = null
  for (const s of segs) {
    if (s.runs > 0) { cur = null; continue }
    if (s.outs === 0) continue
    if (cur) { cur.n += s.outs; cur.to = s.game.date; cur.toId = s.game.id; cur.toInning = s.inning }
    else { cur = { n: s.outs, from: s.game.date, to: s.game.date, fromId: s.game.id, toId: s.game.id, fromInning: s.inning, toInning: s.inning, active: false }; runs.push(cur) }
  }
  if (cur) cur.active = playerActive
  let best: Streak | null = null
  for (const r of runs) if (!best || r.n >= best.n) best = r
  return { best, current: cur }
}

export const hitStreaks = (h: HistoryIndex, name: string) => streaks(h.batGames.get(name) ?? [], hitTest, isActive(h, name))
export const onBaseStreaks = (h: HistoryIndex, name: string) => streaks(h.batGames.get(name) ?? [], onBaseTest, isActive(h, name))
export const scorelessStreaks = (h: HistoryIndex, name: string) => scorelessStreak(h.segments.get(name) ?? [], isActive(h, name))

// ------------------------------------------------------------------ personal bests
export type BestKey = 'h' | 'tb' | 'hr' | 'rbi' | 'r' | 'sb' | 'k' | 'outs'
export interface PersonalBest { key: BestKey; side: 'bat' | 'pit'; label: string; value: number; game: GameRef; times: number }
const BAT_BESTS: Array<[BestKey, string]> = [['h', '單場最多安打'], ['tb', '單場最多壘打'], ['rbi', '單場最多打點'], ['hr', '單場最多全壘打'], ['sb', '單場最多盜壘'], ['r', '單場最多得分']]
const PIT_BESTS: Array<[BestKey, string]> = [['k', '單場最多三振'], ['outs', '單場最長局數']]

/** His single-game highs (counts only): the most recent game with the high and how many games reached it; only highs of 1 or more. */
export function personalBests(h: HistoryIndex, name: string): PersonalBest[] {
  const out: PersonalBest[] = []
  const scan = <L,>(rows: Array<{ game: GameRef; line: L }>, keys: Array<[BestKey, string]>, side: 'bat' | 'pit') => {
    for (const [key, label] of keys) {
      let value = 0, game: GameRef | null = null, times = 0
      for (const r of rows) {
        const v = (r.line as Record<string, unknown>)[key] as number
        if (v > value) { value = v; game = r.game; times = 1 } else if (v === value && v > 0) { game = r.game; times++ }
      }
      if (game && value >= 1) out.push({ key, side, label, value, game, times })
    }
  }
  scan(h.batGames.get(name) ?? [], BAT_BESTS, 'bat')
  scan(h.pitGames.get(name) ?? [], PIT_BESTS, 'pit')
  return out
}

// ------------------------------------------------------------------ team
/** Biggest deficit overcome in a win (0 for anything but a win): walk the half innings in order (we bat first as 客). */
export function largestComeback(s: GameSummary): number {
  if (s.result !== 'W') return 0
  let us = 0, opp = 0, worst = 0
  const n = Math.max(s.lineUs.length, s.lineOpp.length)
  const weFirst = s.game.homeAway === '客'
  for (let i = 0; i < n; i++) {
    for (const half of weFirst ? ['us', 'opp'] : ['opp', 'us']) {
      if (half === 'us') us += s.lineUs[i] ?? 0; else opp += s.lineOpp[i] ?? 0
      worst = Math.max(worst, opp - us)
    }
  }
  return worst
}

export interface WinStreak { n: number; from: string; to: string; fromId: string; toId: string; active: boolean }
/** Every run of wins (a loss or a tie ends one), oldest first; `active` when it reaches the last game. */
export function winRuns(summaries: GameSummary[]): WinStreak[] {
  const runs: WinStreak[] = []
  let cur: WinStreak | null = null
  for (const s of summaries) {
    if (s.result === 'W') {
      if (cur) { cur.n++; cur.to = s.game.date; cur.toId = s.game.id } else { cur = { n: 1, from: s.game.date, to: s.game.date, fromId: s.game.id, toId: s.game.id, active: false }; runs.push(cur) }
    } else cur = null
  }
  if (cur) cur.active = true
  return runs
}
/** The longest winning streak (ties keep the most recent) and the one still going. */
export function winStreaks(summaries: GameSummary[]): { best: WinStreak | null; current: WinStreak | null } {
  const runs = winRuns(summaries)
  let best: WinStreak | null = null
  for (const r of runs) if (!best || r.n >= best.n) best = r
  return { best, current: runs.find((r) => r.active) ?? null }
}

export interface TeamSeasonRow {
  season: number; label: string; from: string; to: string
  games: number; w: number; l: number; t: number; winPct: number | null
  rs: number; ra: number; diff: number
  avg: number | null; ops: number | null; era: number | null
  /** fewer than 10 decided games */
  small: boolean
  /** the season today is in (進行中) */
  current: boolean
}

/** One row per season of the given games (oldest first): record, runs and the team's AVG / OPS / ERA that season. */
export function teamSeasons(summaries: GameSummary[], batting: BattingPA[], pitching: PitchingPA[], ds: Dataset, params: StatParams = DEFAULT_PARAMS, opts: { today?: string; start?: number } = {}): TeamSeasonRow[] {
  const start = opts.start ?? SEASON_START
  const now = currentSeason(opts.today ?? localDate(), start)
  const by = new Map<number, GameSummary[]>()
  for (const s of summaries) push(by, seasonOfDate(s.game.date, start), s)
  return [...by.keys()].sort((a, b) => a - b).map((season) => {
    const ss = by.get(season)!
    const ids = new Set(ss.map((s) => s.game.id))
    const w = ss.filter((s) => s.result === 'W').length, l = ss.filter((s) => s.result === 'L').length
    const rs = ss.reduce((a, s) => a + s.runsUs, 0), ra = ss.reduce((a, s) => a + s.runsOpp, 0)
    const bat = teamBatting(ds, batting.filter((p) => ids.has(p.gameId)), params)
    const pit = teamPitching(pitching.filter((p) => ids.has(p.gameId)), params, ss.map((s) => s.game))
    return {
      season, label: seasonLabel(season, start), ...(season ? seasonRange(season, start) : { from: '', to: '' }),
      games: ss.length, w, l, t: ss.length - w - l, winPct: div(w, w + l), rs, ra, diff: rs - ra,
      avg: bat.avg, ops: bat.ops, era: pit.era, small: w + l < 10, current: season !== 0 && season === now,
    }
  })
}
