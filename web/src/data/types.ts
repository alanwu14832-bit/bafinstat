/**
 * Data model of the BAFIN platform. Mirrors the input columns of the master
 * workbook (打席紀錄 / 投球紀錄 / 守備紀錄 / 比賽清單 / 球員名單). Everything
 * derived (AVG, ERA, Whiff% …) is computed in stats.ts, never stored.
 */
import { TEAM } from '../config/team'

export type HomeAway = '主' | '客'
export type GameResult = 'W' | 'L' | 'T'
export type Hand = 'R' | 'L' | 'S'
/** G 滾地 · F 飛球 · L 平飛 · P 內野飛球（小飛球，算飛球的一種） */
export type Trajectory = 'G' | 'F' | 'L' | 'P'
export type Quality = '強' | '中' | '弱'

/** Pitch codes: S 好球 · SS 揮空 · CS 未揮好球 · F 界外 · IP 擊進場內 · B 壞球 · T 擦棒（被捕手接住：一個好球，兩好球後就是
 *  三振；算揮棒、有碰到球）· HP 觸身球 · CI 捕手妨礙. HP and CI are the
 *  pitch that ended a 觸身／妨礙 (紀錄比賽 adds it): one more pitch thrown, counted with the balls in the 好球／壞球 totals
 *  (as MLB's pitches-strikes), but no ball or strike in the count. */
export type PitchCode = 'S' | 'SS' | 'CS' | 'F' | 'IP' | 'B' | 'T' | 'HP' | 'CI'
export const PITCH_CODES: PitchCode[] = ['S', 'SS', 'CS', 'F', 'IP', 'B', 'T', 'HP', 'CI']
/** The pitch a 觸身 / 妨礙 ended on (record/model withInPlay). */
export const END_PITCH: Record<string, PitchCode> = { 觸身: 'HP', 妨礙: 'CI' }

export const PA_RESULTS = [
  '一安', '內安', '二安', '場地二安', '三安', '全壘打', '保送', '故四', '觸身', '三振', '內滾', '內飛', '外飛', '界外飛', '野選', '失誤', '犧觸', '犧飛', '雙殺', '其他出局', '妨礙',
] as const
export type PAResult = (typeof PA_RESULTS)[number] | '犧牲'
/**
 * 突破僵局 (WBSC tie-break): a runner the rule puts on base at the start of an extra half-inning. He is a row of his
 * own on the batting side's rows (result 突破僵局, no pitches), lead runner first, before the inning's first plate
 * appearance — but he is NOT a plate appearance: no PA / AB / BF, only his run, steals and outs on the bases count, and
 * an opponent's placed runner who scores is never an earned run. Deliberately not in PA_RESULTS (never a result chip).
 */
export const TIEBREAK = '突破僵局'
/**
 * 換投後未面對打者: a pitching row (our pitcher, 0 pitches) for a reliever who came in and made an out on the bases —
 * a 牽制出局 of the runner he inherited, a 盜壘阻殺 — before he faced anyone, so no plate appearance of his holds that
 * out. It is NOT a plate appearance (no BF, no pitches): only the outs it holds (the inning's outs that passed while it
 * was the last row) and his 牽制／盜壘阻殺／暴投 counts are his; he shows up with a game pitched and 0.1 IP. outsBefore =
 * the outs when he came in. Deliberately not in PA_RESULTS (never a result chip; 修改資料 adds it by hand).
 */
export const RELIEF = '未面對打者'
export const isRelief = (r: { result: string }) => r.result === RELIEF
/**
 * 未完成打席: a pitching row (our pitcher) for the pitches of a plate appearance that never ended because the half-inning
 * did — a 盜壘失敗 or 牽制 for the third out with the batter at 1-1. Not a plate appearance either (no BF, no result):
 * only its pitches (PC, strikes, balls, whiffs, CSW%…) count, as his. The batter bats again next inning with a fresh count.
 */
export const UNFINISHED = '未完成打席'
export const isUnfinished = (r: { result: string }) => r.result === UNFINISHED
/** A pitching row that is no plate appearance and no part of an inning's runner timeline: 未面對打者 or 未完成打席. */
export const isNoBatter = (r: { result: string }) => isRelief(r) || isUnfinished(r)
/** A runner placed by the tie-break rule (not a plate appearance). */
export const isPlaced = (r: { result: string }) => r.result === TIEBREAK
/** A real plate appearance: has a result and is not a tie-break runner. Everything that counts PAs goes through it. */
export const isPA = (r: { result: string }) => !!r.result && !isPlaced(r) && !isNoBatter(r)
/** Bases of each hit (內安 = 內野安打 is a single). 場地二安 (ground-rule double: over the fence on a bounce, or stuck in it) is a double in every
 * stat; the batter gets second and every runner exactly two bases. */
export const HIT_BASE_COUNT: Record<string, 1 | 2 | 3 | 4> = { 一安: 1, 內安: 1, 二安: 2, 場地二安: 2, 三安: 3, 全壘打: 4 }
export const isDouble = (r: string) => r === '二安' || r === '場地二安'
/** 內安 (infield single: the ball never left the infield) is a single in every stat; only forced runners move up. */
export const isSingle = (r: string) => r === '一安' || r === '內安'

/** 軌跡 a result implies when none was recorded (G 滾地 · P 內野飛球 · F 飛球). */
export const TRAJ_OF: Record<string, string> = { 內滾: 'G', 雙殺: 'G', 犧觸: 'G', 野選: 'G', 內飛: 'P', 外飛: 'F', 界外飛: 'F', 犧飛: 'F' }
/** Results without a batted ball: no 落點／軌跡／強度 (every other result put the ball in play, 全壘打 included). */
// (其他出局: batting out of order, the batter's interference — no ball to place)
/** 「代跑 12號（第 2 球後換上）」 on the plate appearance their 代跑 came in during (what 文字轉播 places him by). */
export const oppPrMark = (label: string, at: number) => `代跑 ${label === OPP_PR_UNNAMED ? '對方代跑' : label}（第 ${at} 球後換上）`
/** The 代跑 marks of a row's note: who (as stored on the runner's row) and after how many pitches. */
export function oppPrMarks(note?: string): Array<{ label: string; at: number }> {
  return [...(note ?? '').matchAll(/代跑 (.+?)（第 (\d+) 球後換上）/g)].map((m) => ({ label: m[1] === '對方代跑' ? OPP_PR_UNNAMED : m[1], at: Number(m[2]) }))
}
export const NO_BATTED_BALL = new Set(['三振', '保送', '故四', '觸身', '妨礙', '其他出局'])
/** A batted ball (BIP): a real plate appearance whose result put the ball in play, whether or not its 落點／軌跡／強度 were recorded. */
export const isBattedBall = (r: { result: string }) => isPA(r) && !NO_BATTED_BALL.has(r.result)
/** The details a batted ball still needs: 落點 and 軌跡 are required for every batted ball (not 三振／保送／故四／觸身／
 *  妨礙, not a 突破僵局 runner) — the 紀錄比賽 screen will not send the plate appearance without them; 修改資料 marks the
 *  old ones that lack them. 強度 stays optional. */
export function missingBattedBall(pa: { result: string; loc?: number; traj?: string }): Array<'落點' | '軌跡'> {
  if (!isBattedBall(pa)) return []
  const out: Array<'落點' | '軌跡'> = []
  if (!pa.loc) out.push('落點')
  if (!pa.traj || !['G', 'F', 'L', 'P', 'B'].includes(pa.traj)) out.push('軌跡')
  return out
}
/** 「還沒選落點、軌跡」 for the line under the 送出 button ('' when nothing is missing). */
export const missingBattedBallText = (missing: string[]) => (missing.length ? `還沒選${missing.join('、')}` : '')
/** The tag 修改資料 puts on such a plate appearance: 「缺落點」「缺軌跡」 or 「缺落點／軌跡」. */
export const missingBattedBallTag = (missing: string[]) => `缺${missing.join('／')}`
/** How many batted balls lack 落點 or 軌跡 on each side, in words that name the tab and the tag to look for:
 *  「缺落點或軌跡的擊球：我隊打擊 9 個、我隊投球 9 個」 ('' when none). */
export function missingBattedBallCounts(bat: number, pit: number): string {
  const parts = [bat ? `我隊打擊 ${bat} 個` : '', pit ? `我隊投球 ${pit} 個` : ''].filter(Boolean)
  return parts.length ? `缺落點或軌跡的擊球：${parts.join('、')}` : ''
}
/** What the tags read, for a note that tells the recorder what to look for. */
export const MISSING_BALL_TAGS = '「缺落點」或「缺軌跡」'
/** 強度 values a batted ball can have (Hard% is over the batted balls that have one). */
export const QUALITIES = ['強', '中', '弱'] as const
/** Balls in play on which the batter is out (GO/AO count these; 三振, 犧觸, hits, 野選, 失誤 are neither). */
export const BATTER_OUT_BIP = new Set(['內滾', '內飛', '外飛', '界外飛', '犧飛', '雙殺'])

/** I/II/III = this PA produced the Nth out · L 殘壘 · R 得分（非自責） · ER 自責分 */
export type OutcomeCode = 'I' | 'II' | 'III' | 'L' | 'R' | 'ER'

export const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'PH', 'PR'] as const
export type Position = (typeof POSITIONS)[number]
export const POSITION_BY_NUMBER: Record<number, Position> = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF' }
/** The scorebook number of a fielding position (P 1 … RF 9); undefined for DH, PH, PR, IF, OF, UT. */
export const POSITION_NUMBER: Record<string, number | undefined> = Object.fromEntries(Object.entries(POSITION_BY_NUMBER).map(([n, p]) => [p, Number(n)]))
/** A position with its scorebook number in front, for pickers: 「1 P」「6 SS」; others unchanged (「DH」). */
export const posNum = (p: string): string => (POSITION_NUMBER[p] ? `${POSITION_NUMBER[p]} ${p}` : p)
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
  /** 開賽時間 'HH:MM' */
  time?: string
  /** 結束時間 'HH:MM'. 比賽時間 is always worked out from the two (data/gameTime.ts), never stored. */
  endTime?: string
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
export interface DayRosterSub { kind: 'PH' | 'PR' | 'DEF' | 'P'; in: string; out: string; pos: string; inning: number; half: 'top' | 'bottom'; slot?: number
  /** logged while we fielded, after this many of that half-inning's opponent rows (紀錄比賽): the rows before it keep the
   *  old alignment (an error made just before the fielder was pulled stays his). Absent = from the start of the half. */
  row?: number
  /** logged in the middle of a plate appearance: what our fielders had done earlier in it (an error between pitches, a
   *  盜壘阻殺…). That plate appearance's row is `row` (0 when absent), which takes the new alignment; these are charged
   *  by the alignment just before this change. Left out when there was nothing. */
  before?: SubCharges
  /** the half ended (an out on the bases, 結束半局) before the plate appearance in progress was sent: what our fielders
   *  did in it after this change was put on the half's last row (`row` - 1, which keeps the old alignment); these are
   *  charged by the alignment just after this change. Left out when there was nothing. */
  after?: SubCharges }
/** Part of one opponent row's errors (positions) and catcher plays, charged by another alignment (DayRosterSub before / after). */
export interface SubCharges { errors?: string[]; sba?: number; cs?: number; pb?: number; pk?: number }
/** Who was available for one game: starters (with batting order; the non-batting pitcher under a DH has no order), bench (到場未先發), substitutions, re-entry rule. */
export interface GameDayRoster { starters: Array<{ name: string; pos: string; order?: number }>; bench: string[]; subs?: DayRosterSub[]; reentry: boolean; /** the rules the game was played by (紀錄比賽 saves them): its scheduled innings, and the tie-break from that inning on those bases ('12'; null = none) — the saved 局數 is the innings it went */ rules?: GameRules }
export interface GameRules { innings: number; tiebreakFrom: number | null; tiebreakBases: string }

/** The migration that creates the albums table (photo albums and 比賽影片 links); named in the 開通 sentence. Each
 *  repo's own file, so it lives in config/teamDefaults.ts and this file stays the same in both sites. */
export { ALBUMS_MIGRATION } from '../config/teamDefaults'

/** A tournament registration list (報名名單) for one year. Not part of Dataset: it lives in its own store slice (like albums). */
export interface Registration { season: number; tournament: string; players: string[]; updatedAt?: string }

/** The base an out on the bases was made at (本壘 = 'home'). */
export type OutAt = 1 | 2 | 3 | 'home'
export const OUT_AT_LABEL: Record<string, string> = { 1: '1B', 2: '2B', 3: '3B', home: '本壘' }

/**
 * Something that happened to a runner between pitches of a plate appearance (盜壘, 暴投進壘, 牽制出局…), in order.
 * `at` = how many pitches had been thrown when it happened; `from` = the base he was on; `to` = where he ended up
 * ('out', a base, or 'home'). Kept on the plate appearance it happened during, so the editor can replay it pitch by pitch.
 */
export interface PlayEvent {
  at: number; kind: string; from: 1 | 2 | 3; to: 'out' | 1 | 2 | 3 | 'home'
  /** (to 'out') the base he was put out at: 1B 2B 3B or 本壘 — the base he was heading for, not always the one he came from.
   *  Left out on older games and on a 盜壘失敗 / 牽制出局 (those read as before: from his base). */
  outAt?: OutAt
  /** on the batted-ball play itself, not between pitches: 趁傳進壘 after a hit, `from` is where the hit alone put him */
  play?: true
  /** (on the play) it was the batter */
  batter?: true
}
export const PLAY_EVENT_LABELS: Record<string, string> = {
  sb: '盜壘', cs: '盜壘失敗', wp: '暴投', pb: '捕逸', err: '失誤進壘', throw: '趁傳進壘', pk: '牽制出局', pkSafe: '牽制', advance: '進壘', score: '得分', out: '壘死', bk: '投手犯規', di: '守備無視', pocs: '牽制後盜壘失敗', hbb: '被打擊球擊中',
  // (on the play only: a runner put out trying for a base on a ball that put the batter on — 壘死 is kind 'out', his own mistake)
  tag: '被刺殺',
  // (on the play only, our batter: he reached, then was put out on that same play — record/timeline batterOutMark)
  outPlay: '出局',
}

/** The opponent pitcher's throwing hand: L 左投 · R 右投 */
export type OppHand = 'L' | 'R'
export const OPP_HAND_LABEL: Record<OppHand, string> = { L: '左投', R: '右投' }
/** The side an opponent batter stood on for one plate appearance: L 左打 · R 右打 (a switch hitter: the side he took
 *  this time). Recorded while they bat (PitchingPA.oppBats); 「不知道」 leaves it out. */
export type OppBats = 'L' | 'R'
export const OPP_BATS_LABEL: Record<OppBats, string> = { L: '左打', R: '右打' }

/** 對方代跑 with no name typed: what PitchingPA.runner holds and what the runner is called everywhere. */
export const OPP_PR_UNNAMED = '對方代跑'
/** 對方代打 with no name typed: what PitchingPA.oppBatter holds for him. */
export const OPP_PH_UNNAMED = '對方代打'
/** 對方代打 with a name: PitchingPA.oppBatter holds 「代打 99號」, so the mark is kept on the row (the play-by-play reads
 *  it as is); the batter himself is the name after the mark (oppBatterName). */
export const oppPinchHitter = (typed: string) => (typed.trim() ? `代打 ${typed.trim()}` : OPP_PH_UNNAMED)
/** Whether an oppBatter is a 對方代打 mark (with or without a name). */
export const isOppPinchHit = (v?: string) => { const t = v?.trim() ?? ''; return t === OPP_PH_UNNAMED || /^代打\s+\S/.test(t) }
/** The opponent batter's own name in an oppBatter ('' for an unnamed 對方代打): 「代打 99號」 → 「99號」. */
export const oppBatterName = (v?: string) => { const t = v?.trim() ?? ''; return t === OPP_PH_UNNAMED ? '' : t.replace(/^代打\s+(?=\S)/, '') }
/** The 代跑 mark on a play: 「代跑 12號」, or just 「代跑」 when no name was typed. */
export const pinchMark = (runner: string) => (runner === OPP_PR_UNNAMED ? '代跑' : `代跑 ${runner}`)

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
  /** 壘上出局: put out on the bases after reaching, any way but 盜壘失敗 (the out code on this row is then his) */
  outOnBase: number
  /** 壘死: of those, the outs from his own baserunning mistake (run past a base, doubled off, caught off the bag…) */
  baserunningOuts?: number
  run: number
  rbi: number
  code?: string
  note?: string
  /** runner moves between this plate appearance's pitches, in order */
  events?: PlayEvent[]
  /** 對方失誤: their fielders' positions that erred while he was up (one entry per error, '?' = not known), every error
   *  but a 失誤 result's own; see data/errors.ts oppErrorsOf. Left out when there is none. */
  errors?: string[]
  /** 對方投手 (name, optional). Left out (not undefined) when unknown, like runner / events. */
  oppPitcher?: string
  /** 對方投手 throwing hand. Left out when unknown. */
  oppHand?: OppHand
}

/** Pitches of one plate appearance thrown by a pitcher who left in the middle of it (換投 with a count on the batter). */
export interface PriorPitch { name: string; pitches: number }
/**
 * A plate appearance's pitches split by who threw them: the pitchers who left in the middle of it first (priorPitchers, in
 * order), the row's own pitcher the rest. The result, the batter faced and the 好球 of the first pitch stay with the row's pitcher.
 */
export function pitchesByPitcher(pa: { pitcher: string; pitches: string[]; priorPitchers?: PriorPitch[] }): Array<{ pitcher: string; pitches: string[] }> {
  const out: Array<{ pitcher: string; pitches: string[] }> = []
  let i = 0
  for (const prior of pa.priorPitchers ?? []) {
    const n = Math.max(0, Math.min(prior.pitches, pa.pitches.length - i))
    out.push({ pitcher: prior.name, pitches: pa.pitches.slice(i, i + n) })
    i += n
  }
  out.push({ pitcher: pa.pitcher, pitches: pa.pitches.slice(i) })
  return out
}

export interface PitchingPA {
  gameId: string
  inning: number
  outsBefore?: number
  basesBefore?: string
  oppOrder?: number
  pitcher: string
  oppBatter?: string
  /** 對方代跑: who ran for this opponent batter after he reached (a name or jersey number, OPP_PR_UNNAMED when not typed).
   *  Only the name changes: the run, SB, CS and out on base stay on this row. Left out when there is none. */
  runner?: string
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
  /** their batter's 打點 (the same rules as ours). Left out (0) when there is none. */
  rbi?: number
  /** 對方打者左右打: the side he batted from in this plate appearance. Left out when unknown (older games). */
  oppBats?: OppBats
  /** pitchers who threw the first pitches of this plate appearance and left before it ended (換投 mid-count): their share of
   *  `pitches`, in order; the rest are this row's pitcher's. Left out when nobody did. See pitchesByPitcher. */
  priorPitchers?: PriorPitch[]
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

/** 練習紀錄 (紀錄比賽 ?practice=1): its game id starts with this. Such a game lives only on the device that practised:
 *  never saved, synced or counted (the page, store/data.ts saveGame and data/supabase.ts saveCloudDraft all refuse it). */
export const PRACTICE_PREFIX = 'PRACTICE-'
export const isPracticeId = (id: string) => id.startsWith(PRACTICE_PREFIX)

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
  /** FIP's constant, used as is when fipAuto is off */
  fipConstant: number
  /** FIP constant from our own games (team ERA − team FIP before the constant), so team FIP = team ERA */
  fipAuto: boolean
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
  inningsPerGame: TEAM.innings, fipConstant: 3.135, fipAuto: true, wBB: 0.691, wHBP: 0.722, w1B: 0.882, w2B: 1.252, w3B: 1.584, wHR: 2.037,
  pitchWarn: 80, pitchMax: 100,
}
