/**
 * Data model of the BAFIN platform. Mirrors the input columns of the master
 * workbook (打席紀錄 / 投球紀錄 / 守備紀錄 / 比賽清單 / 球員名單). Everything
 * derived (AVG, ERA, Whiff% …) is computed in stats.ts, never stored.
 */
import { TEAM } from '../config/team'

export type HomeAway = '主' | '客'
export type GameResult = 'W' | 'L' | 'T'
export type Hand = 'R' | 'L' | 'S'
export type Trajectory = 'G' | 'F' | 'L'
export type Quality = '強' | '中' | '弱'

/** Pitch codes: S 好球 · SS 揮空 · CS 未揮好球 · F 界外 · IP 擊進場內 · B 壞球 */
export type PitchCode = 'S' | 'SS' | 'CS' | 'F' | 'IP' | 'B'
export const PITCH_CODES: PitchCode[] = ['S', 'SS', 'CS', 'F', 'IP', 'B']

export const PA_RESULTS = [
  '一安', '內安', '二安', '場地二安', '三安', '全壘打', '保送', '故四', '觸身', '三振', '內滾', '內飛', '外飛', '界外飛', '野選', '失誤', '犧觸', '犧飛', '雙殺', '妨礙',
] as const
export type PAResult = (typeof PA_RESULTS)[number] | '犧牲'
/** Bases of each hit (內安 = 內野安打 is a single). 場地二安 (ground-rule double: over the fence on a bounce, or stuck in it) is a double in every
 * stat; the batter gets second and every runner exactly two bases. */
export const HIT_BASE_COUNT: Record<string, 1 | 2 | 3 | 4> = { 一安: 1, 內安: 1, 二安: 2, 場地二安: 2, 三安: 3, 全壘打: 4 }
export const isDouble = (r: string) => r === '二安' || r === '場地二安'
/** 內安 (infield single: the ball never left the infield) is a single in every stat; only forced runners move up. */
export const isSingle = (r: string) => r === '一安' || r === '內安'

/** I/II/III = this PA produced the Nth out · L 殘壘 · R 得分（非自責） · ER 自責分 */
export type OutcomeCode = 'I' | 'II' | 'III' | 'L' | 'R' | 'ER'

export const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'PH', 'PR'] as const
export type Position = (typeof POSITIONS)[number]
export const POSITION_BY_NUMBER: Record<number, Position> = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF' }
/** The nine fielding positions, in scorer's number order. */
export const FIELD_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const
/** What a roster entry can say a player plays: a specific spot, or a flexible group (內野手 / 外野手 / 工具人). */
export const ROSTER_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'IF', 'OF', 'UT'] as const

/**
 * 落點 codes. 1–9 is the fielder who handled (or was closest to) the ball; a two-digit code names the gap a
 * ball went through, for hits and errors where no fielder touched it: 56 三游 · 46 二游（中間）· 34 一二 · 78 左中 · 89 右中.
 */
export const LOC_HOLES: Record<number, string> = { 56: '三游', 46: '二游', 34: '一二', 78: '左中', 89: '右中' }
export const LOC_CODES: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 56, 46, 34, 78, 89]
export const isHoleLoc = (loc?: number): loc is number => !!loc && loc in LOC_HOLES
/** Short label for any 落點 code (守位 for 1–9, gap name for holes). */
export const locLabel = (loc?: number): string => (loc ? (LOC_HOLES[loc] ?? POSITION_BY_NUMBER[loc] ?? String(loc)) : '')

export interface Player {
  number?: string
  name: string
  primaryPos?: string
  secondaryPos?: string
  bats?: Hand
  throws?: Hand
  status?: string
  note?: string
}

export interface Game {
  id: string
  /** ISO date yyyy-mm-dd */
  date: string
  time?: string
  tournament: string
  opponent: string
  homeAway: HomeAway
  venue?: string
  weather?: string
  recorder?: string
  /** innings scheduled / played */
  innings?: number
  winningPitcher?: string
  losingPitcher?: string
  savePitcher?: string
  holds?: string[]
  note?: string
  /** Synthetic game generated for demonstration; always labelled in the UI. */
  isDemo?: boolean
  /** undefined = played (has records); scheduled games appear on 賽程 and are excluded from every statistic */
  status?: GameStatus
  /** 當日登錄名單 (who was available, who started, substitutions). Optional: older games, imports and demo games have none. */
  dayRoster?: GameDayRoster
}
export type GameStatus = 'scheduled' | 'cancelled'

/** One substitution during a game (recorded live on 紀錄比賽). */
export interface DayRosterSub { kind: 'PH' | 'PR' | 'DEF' | 'P'; in: string; out: string; pos: string; inning: number; half: 'top' | 'bottom'; slot?: number }
/** Who was available for one game: starters (with batting order; the non-batting pitcher under a DH has no order), bench (到場未先發), substitutions, re-entry rule. */
export interface GameDayRoster { starters: Array<{ name: string; pos: string; order?: number }>; bench: string[]; subs?: DayRosterSub[]; reentry: boolean }

/** A tournament registration list (報名名單) for one year. Not part of Dataset: it lives in its own store slice (like albums). */
export interface Registration { season: number; tournament: string; players: string[]; updatedAt?: string }

/**
 * Something that happened to a runner between pitches of a plate appearance (盜壘, 暴投進壘, 牽制出局…), in order.
 * `at` = how many pitches had been thrown when it happened; `from` = the base he was on; `to` = where he ended up
 * ('out', a base, or 'home'). Kept on the plate appearance it happened during, so the editor can replay it pitch by pitch.
 */
export interface PlayEvent {
  at: number; kind: string; from: 1 | 2 | 3; to: 'out' | 1 | 2 | 3 | 'home'
  /** on the batted-ball play itself, not between pitches: 趁傳進壘 after a hit, `from` is where the hit alone put him */
  play?: true
  /** (on the play) it was the batter */
  batter?: true
}
export const PLAY_EVENT_LABELS: Record<string, string> = {
  sb: '盜壘', cs: '盜壘失敗', wp: '暴投', pb: '捕逸', err: '失誤進壘', throw: '趁傳進壘', pk: '牽制出局', pkSafe: '牽制', advance: '進壘', score: '得分', out: '壘死',
}

export interface BattingPA {
  gameId: string
  inning: number
  outsBefore?: number
  /** 無 / 1 / 2 / 3 / 12 / 13 / 23 / 123 */
  basesBefore?: string
  order?: number
  /** Defensive position of the batter in this game (filterable). */
  pos?: string
  batter: string
  /** 代跑: who ran for the batter after he reached; the run, SB, CS and out on base are his, the rest is the batter's. */
  runner?: string
  pitches: string[]
  result: string
  /** Batted-ball location: 1–9 or a gap code (see LOC_HOLES) */
  loc?: number
  traj?: string
  quality?: string
  sb: number
  cs: number
  advOnError: number
  outOnBase: number
  run: number
  rbi: number
  code?: string
  note?: string
  /** runner moves between this plate appearance's pitches, in order */
  events?: PlayEvent[]
}

export interface PitchingPA {
  gameId: string
  inning: number
  outsBefore?: number
  basesBefore?: string
  oppOrder?: number
  pitcher: string
  oppBatter?: string
  pitches: string[]
  result: string
  loc?: number
  traj?: string
  quality?: string
  /** stolen bases allowed */
  sba: number
  /** caught stealing (runner out) */
  cs: number
  wp: number
  pb: number
  /** pickoffs */
  pk: number
  /** 守備失誤: our fielders' positions that erred during this plate appearance (one entry per error), see data/errors.ts */
  errors?: string[]
  code?: string
  note?: string
  /** runner moves between this plate appearance's pitches, in order */
  events?: PlayEvent[]
}

export interface FieldingLine {
  gameId: string
  player: string
  pos: string
  innings?: number
  po: number
  a: number
  e: number
  dp: number
  pb: number
  sb: number
  cs: number
  note?: string
}

export interface Dataset {
  roster: Player[]
  games: Game[]
  batting: BattingPA[]
  pitching: PitchingPA[]
  fielding: FieldingLine[]
}

export const EMPTY_DATASET: Dataset = { roster: [], games: [], batting: [], pitching: [], fielding: [] }

export interface Filters {
  tournament: string
  from: string
  to: string
  position: string
  opponent: string
  homeAway: 'all' | HomeAway
  result: 'all' | GameResult
}

export const DEFAULT_FILTERS: Filters = {
  tournament: 'all', from: '', to: '', position: 'all', opponent: 'all', homeAway: 'all', result: 'all',
}

/** Tunable constants (same defaults as the workbook's 設定 sheet). */
export interface StatParams {
  inningsPerGame: number
  fipConstant: number
  wBB: number
  wHBP: number
  w1B: number
  w2B: number
  w3B: number
  wHR: number
  /** live scoring: pitch count that turns the counter amber / red */
  pitchWarn: number
  pitchMax: number
}

/** FanGraphs Guts! 2025 linear weights (see docs/ANALYTICS_RESEARCH.md). */
export const DEFAULT_PARAMS: StatParams = {
  inningsPerGame: TEAM.innings, fipConstant: 3.135, wBB: 0.691, wHBP: 0.722, w1B: 0.882, w2B: 1.252, w3B: 1.584, wHR: 2.037,
  pitchWarn: 80, pitchMax: 100,
}
