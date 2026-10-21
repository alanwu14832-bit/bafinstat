/**
 * Live scorekeeping state machine. Pure functions over a RecordState; the page keeps history for undo.
 * Rows are written in exactly the shape of the 單場-打擊 / 單場-投球 templates, so the finished game
 * goes through normalizeDataset and the stats engine like any import:
 *   - 局 / 出局(前) / 壘上(前) are filled from the live state
 *   - the batter's fate code (I/II/III out, L left on base, R scored; opp: R unearned / ER earned) is written
 *     on that batter's own row when it happens, exactly like the paper sheet
 *   - runner events (盜壘 / 盜壘失敗 / 失誤進壘 / 壘死) land on the runner's own row (our offense) or as
 *     被盜壘 / 阻殺 / 暴投 / 捕逸 / 牽制 on the current opponent PA (their offense)
 *   - a pickoff throw that does not get the runner (牽制・安全) has no column in the template, so it is written
 *     into the row's 備註 as「牽制 N 次」
 *   - a ball in play always ends with an IP pitch: 界外飛 recorded as F becomes IP, a missing IP is appended
 *   - every runner move between pitches is also logged in order (第 2 球暴投 1B→2B) and saved on the plate appearance
 *     it happened in as `events`; one that ends the half-inning before that batter's result is not (there is no row)
 *   - the opponent pitcher (hand, name) set by the recorder is stamped on each of our plate appearances; the opponent
 *     batter's name comes from the one-off name or, when 記對方打者姓名 is on, their batting order (oppLineup)
 *   - both are asked before the pitch pad works (needsOppHand / needsOppBats; 「不知道」 counts as an answer): the
 *     opponent pitcher's hand when we bat (first, and after every 對方換投), the opponent batter's side (左打／右打) when
 *     they bat, remembered per batting-order slot for the game (oppBatsBySlot) and stamped on their row as oppBats
 *   - the time of the first pitch and of the last plate appearance are kept (stampTimes) for 比賽時間
 *   - 延長賽突破僵局 (record/tiebreak.ts): the runners the rule puts on base are rows of their own (result 突破僵局, no
 *     pitches) before the half's first plate appearance; they are not plate appearances. A balk (投手犯規, balk())
 *     moves every runner up one base and is only logged in the plays (kind 'bk'), no column.
 *   - 代跑: ours through substitute() (BattingPA.runner + a PR substitution); theirs through pinchRunOpp()
 *     (PitchingPA.runner, a name or 對方代跑): either way the runner keeps the row he reached on, only the name changes.
 */
import { UNKNOWN_FIELDER, withOurErrors } from '../data/errors'
import { chargesMinus, chargesOrNone, chargesSum, defenseTimeline } from '../data/gameRoster'
import { END_PITCH, HIT_BASE_COUNT, isNoBatter, isPA, isPlaced, OPP_PR_UNNAMED, oppPrMark, RELIEF, UNFINISHED, oppBatterName, oppPinchHitter, POSITION_BY_NUMBER, TIEBREAK, TRAJ_OF, type BattingPA, type DayRosterSub, type Game, type GameDayRoster, type OppBats, type OppHand, type OutAt, type PitchingPA, type PlayEvent, type PriorPitch, type SubCharges } from '../data/types'
import type { GameEdit } from '../data/edit'
import { batterOutMark, inferHalf, leftMarks, reachedOn } from './timeline'
import { earnedCalls } from './earned'
import { hhmm, localDate } from '../lib/dates'
import { TEAM } from '../config/team'

export type Half = 'top' | 'bottom'
export type Side = 'us' | 'opp'
export type Base = 1 | 2 | 3
export type Dest = 'out' | 1 | 2 | 3 | 'home'
export interface LineupSlot { name: string; pos: string }
export interface Runner { base: Base; side: Side; row: number; name: string }
/** pka = pickoff throws where the runner was safe (noted, not a template column) */
export interface Extras { sba: number; cs: number; wp: number; pb: number; pk: number; pka: number; /** 守備失誤: positions of our fielders who erred */ errors?: string[]
  /** (we bat) 對方失誤: positions of their fielders who erred ('?' = 不知道) */ oppErrors?: string[] }

export interface RecordState {
  game: Game
  /** their pinch hitter came in with two strikes (rule 9.15(b)): a strikeout is `was`'s (the name the row would have had; '' = by slot) */
  oppPh2?: { was: string }
  /** their 代跑 put in during the plate appearance in progress: who, after how many pitches (noted on that row) */
  oppPrAt?: Array<{ label: string; at: number }>
  /** a pinch hitter came in with two strikes on the batter (rule 9.15(b)): a strikeout goes to `out` */
  phTwoStrikes?: { in: string; out: string }
  /** 保留比賽: when the game was suspended (to be resumed another day); cleared by 恢復比賽 */
  suspended?: string
  lineup: LineupSlot[]
  /** index of the next batter in `lineup` */
  slot: number
  pitcher: string
  oppOrder: number
  oppBatter: string
  inning: number
  half: Half
  outs: number
  runners: Runner[]
  batting: BattingPA[]
  pitching: PitchingPA[]
  /** pitches of the plate appearance in progress */
  pitches: string[]
  /** (we field) pitchers who threw the first pitches of the plate appearance in progress and left before it ended: their
   *  counts, in order (the rest of `pitches` is `pitcher`'s); goes on the row at commitPA (PitchingPA.priorPitchers) */
  priorPitchers?: PriorPitch[]
  /** opponent-offense events during the PA in progress */
  extras: Extras
  /** runner moves during the PA in progress, in order (saved on its row as `events`) */
  plays?: PlayEvent[]
  finished: boolean
  startedAt: string
  /** last local change (ISO); used to pick the newer of a local vs cloud draft */
  updatedAt?: string
  // 當日登錄名單. All optional: drafts started before these existed (this device, record_drafts, the public Live page)
  // lack them, so every reader goes through startersOf / appeared / … below, which fall back to the rows.
  /** the lineup as the game started (substitute() overwrites `lineup` in place) */
  starters?: LineupSlot[]
  startingPitcher?: string
  /** 板凳: came today, did not start */
  bench?: string[]
  /** 允許再上場: players substituted out may come back */
  reentry?: boolean
  /** every substitution, in the order it happened */
  subs?: DayRosterSub[]
  /** opponent runs called by hand (earned or not), by pitching row; every other run follows the rules (record/earned.ts) */
  earnedByHand?: Record<number, boolean>
  // 比賽時間, 對方投手, 對方打者姓名. All optional too: drafts without them resume unchanged (the Live page reads drafts).
  /** when the first pitch (or the first row / runner play) went in (ISO) */
  firstPitchAt?: string
  /** when the last plate appearance was sent (ISO) */
  lastPlayAt?: string
  /** the opponent pitcher now (stamped on each of our plate appearances) */
  oppPitcher?: OppPitcher
  /** 對方打者左右打, per slot of their batting order (1–9) for this game: what their batter in that slot batted from
   *  ('?' = 不知道 was picked). Set once per batter (setOppBats); a 對方代打 / 對方代跑 / a renamed slot clears it. */
  oppBatsBySlot?: Record<number, OppBats | '?'>
  /** where the opponent pitcher now came in (set on a 換投): our plate appearance (batting index) and how many of its
   *  pitches had been thrown before him, so his 用球 starts there even when the name and hand stay the same */
  oppPitcherFrom?: { row: number; pitches: number }
  /** every 換投 of this game in order, the last one being oppPitcherFrom, with the pitcher who left: the Box Score
   *  keeps each opponent pitcher's own row and 用球 even when two in a row have the same name and hand (右投, 右投) */
  oppPitcherChanges?: Array<{ row: number; pitches: number; out: OppPitcher }>
  /** 記對方打者姓名 (opt-in per game) */
  oppNames?: boolean
  /** their batting order, 9 names ('' = not typed); a change in the middle of the game is a pinch hitter */
  oppLineup?: string[]
  // 延長賽突破僵局. Optional: drafts without it use the team's default rule (record/tiebreak.ts tiebreakRuleOf).
  /** the rule for this game; null = 不採用 */
  tiebreak?: TiebreakRule | null
  /** extra half-innings where the recorder pressed 「這局不用」, as `${inning}${half}` ('8top') */
  tiebreakSkip?: string[]
  /** 練習紀錄: a practice game, kept only on this device (record/draft.ts PRACTICE_KEY); never saved or synced */
  practice?: boolean
}
/** 突破僵局: from which inning on, and the bases the runners are put on. */
export interface TiebreakRule { from: number; bases: Base[] }
/** handUnknown: 「不知道」 was picked for his hand (he still counts as asked: needsOppHand). Never set with `hand`. */
export interface OppPitcher { name?: string; hand?: OppHand; handUnknown?: true }

export const OUT_RESULTS = new Set(['三振', '內滾', '內飛', '外飛', '界外飛', '犧觸', '犧飛', '雙殺', '其他出局'])
/** Results where the ball was put in play (the PA's last pitch is IP). */
export const BIP_RESULTS = new Set(['一安', '內安', '二安', '場地二安', '三安', '全壘打', '內滾', '內飛', '外飛', '界外飛', '犧觸', '犧飛', '雙殺', '野選', '失誤'])
export const REACH_RESULTS = new Set(['一安', '內安', '二安', '場地二安', '三安', '全壘打', '保送', '故四', '觸身', '失誤', '野選', '妨礙'])
const HIT_BASES: Record<string, Dest> = { 一安: 1, 內安: 1, 二安: 2, 場地二安: 2, 三安: 3, 全壘打: 'home' }
/** 軌跡 implied by the result (filled in for the recorder, who can still change it). */
export { TRAJ_OF } from '../data/types'

/** 落點 and 軌跡 are required for every batted ball (data/types.missingBattedBall). */
export { missingBattedBall, missingBattedBallText } from '../data/types'
const ROMAN = ['I', 'II', 'III'] as const
const EXTRAS0: Extras = { sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, pka: 0 }

export const weBatTop = (s: RecordState) => s.game.homeAway === '客'
export const offense = (s: RecordState): Side => (s.half === 'top') === weBatTop(s) ? 'us' : 'opp'
export const basesString = (runners: Runner[]) => { const b = runners.map((r) => r.base).sort().join(''); return b || '無' }

export function count(pitches: string[]): { balls: number; strikes: number } {
  let balls = 0, strikes = 0
  for (const p of pitches) {
    if (p === 'B') balls++
    else if (p === 'S' || p === 'SS' || p === 'CS' || p === 'T') strikes++
    else if (p === 'F' && strikes < 2) strikes++
  }
  return { balls, strikes }
}

/** Result the count implies (4 balls → 保送, 3 strikes → 三振), or null. */
export function impliedResult(pitches: string[]): '保送' | '三振' | null {
  const c = count(pitches)
  if (c.balls >= 4) return '保送'
  if (c.strikes >= 3) return '三振'
  return null
}

/** Pitch list with the ball-in-play pitch guaranteed for a BIP result (a caught foul is IP, not F). */
export function withInPlay(pitches: string[], result: string): string[] {
  // a 觸身／妨礙 ends on a pitch too: HP / CI (one pitch more, no ball or strike in the count)
  const end = END_PITCH[result]
  if (end) return pitches[pitches.length - 1] === end ? pitches : [...pitches, end]
  if (!BIP_RESULTS.has(result)) return pitches
  const last = pitches[pitches.length - 1]
  if (last === 'IP') return pitches
  if (last === 'F' || last === 'S' || last === 'CS') return [...pitches.slice(0, -1), 'IP']
  return [...pitches, 'IP']
}

export function newGame(game: Game, lineup: LineupSlot[], pitcher: string, opts: { bench?: string[]; reentry?: boolean; oppNames?: boolean; oppLineup?: string[]; tiebreak?: TiebreakRule | null } = {}): RecordState {
  // the bench never repeats a starter (Setup may have promoted a bench player into the lineup)
  const starting = new Set([...lineup.map((l) => l.name), pitcher])
  const bench = [...new Set((opts.bench ?? []).filter((n) => n && !starting.has(n)))]
  return {
    game, lineup, slot: 0, pitcher, oppOrder: 1, oppBatter: '', inning: 1, half: 'top', outs: 0, runners: [], batting: [], pitching: [], pitches: [], extras: { ...EXTRAS0 }, finished: false, startedAt: new Date().toISOString(),
    starters: lineup.map((l) => ({ ...l })), startingPitcher: pitcher, bench, reentry: !!opts.reentry, subs: [],
    ...(opts.oppNames !== undefined ? { oppNames: opts.oppNames } : {}), ...(opts.oppLineup ? { oppLineup: lineupOf(opts.oppLineup) } : {}),
    ...(opts.tiebreak !== undefined ? { tiebreak: opts.tiebreak } : {}),
  }
}

/* ------------------------------------------------ 比賽時間 */
const hasPlay = (s: RecordState) => s.pitches.length > 0 || s.batting.length > 0 || s.pitching.length > 0 || (s.plays?.length ?? 0) > 0
/**
 * Keep the time of the first pitch and of the last plate appearance: `prev` is the state before a tap, `next` after it.
 * The first pitch (or a plate appearance sent without pitches, or a runner play) stamps firstPitchAt; a new row
 * stamps lastPlayAt. Undo goes back to the state without the stamp. (A draft from before these fields that already
 * has plays dates its first pitch from when it was set up.)
 */
export function stampTimes(prev: RecordState, next: RecordState, now: string): RecordState {
  let out = next
  if (!next.firstPitchAt && hasPlay(next)) out = { ...out, firstPitchAt: hasPlay(prev) ? prev.startedAt : now }
  if (next.batting.length + next.pitching.length > prev.batting.length + prev.pitching.length) out = { ...out, lastPlayAt: now }
  return out
}
/**
 * The 開賽 / 結束 times the 結束比賽 dialog starts from. Recorded live (same day, 20 minutes to 6 hours from the first
 * pitch to the last plate appearance): those clock times. Otherwise (from a video, a test game) the game's own times.
 */
export function finishTimes(s: RecordState): { start: string; end: string; live: boolean } {
  const first = s.firstPitchAt ?? (s.batting.length || s.pitching.length ? s.startedAt : undefined)
  const last = s.lastPlayAt ?? s.updatedAt
  if (first && last) {
    const a = new Date(first), b = new Date(last)
    const minutes = (b.getTime() - a.getTime()) / 60000
    // (Setup used to default the date to the UTC day: a draft set up that way still counts)
    const sameDay = localDate(a) === s.game.date || first.slice(0, 10) === s.game.date
    if (sameDay && minutes >= 20 && minutes <= 360) return { start: hhmm(a), end: hhmm(b), live: true }
  }
  return { start: s.game.time ?? '', end: s.game.endTime ?? '', live: false }
}

/* ------------------------------------------------ 對方打者姓名 */
const lineupOf = (names: string[]) => Array.from({ length: 9 }, (_, i) => (names[i] ?? '').trim())
/** The opponent batter up now: a name typed for this plate appearance, else (記對方打者姓名) their batting order's. */
export const oppBatterOf = (s: RecordState): string => s.oppBatter || (s.oppNames ? s.oppLineup?.[s.oppOrder - 1] ?? '' : '')
/** The latest batter's name in one of their batting-order slots from today's rows ('' when none has one). A 對方代跑
 *  replaced that batter, so the search stops there: the slot is his now (with 記對方打者姓名 on, the lineup has his name). */
export function lastOppName(pitching: PitchingPA[], order: number): string {
  for (let i = pitching.length - 1; i >= 0; i--) {
    const p = pitching[i]
    if (p.oppOrder !== order) continue
    if (p.runner) return ''
    if (p.oppBatter) return oppBatterName(p.oppBatter)
  }
  return ''
}
export const setOppNames = (s: RecordState, on: boolean): RecordState => ({ ...s, oppNames: on, oppLineup: s.oppLineup ?? Array(9).fill('') })
/** Their batting order (9 names). A slot changed in the middle of the game is a pinch hitter: rows already sent keep their names. */
export function setOppLineup(s: RecordState, names: string[]): RecordState {
  const next = lineupOf(names)
  let out: RecordState = { ...s, oppLineup: next }
  // (a name typed into a blank slot is the same batter; a different name is a new one: his side is asked again)
  for (let i = 0; i < 9; i++) { const was = s.oppLineup?.[i] ?? ''; if (was && was !== next[i]) out = clearOppBats(out, i + 1) }
  return out
}

/* ------------------------------------------------ 對方投手 */
/** The opponent pitcher's fields on one of our plate appearances (keys left out when unknown). */
export const oppFields = (p?: OppPitcher): Pick<BattingPA, 'oppPitcher' | 'oppHand'> => ({ ...(p?.name ? { oppPitcher: p.name } : {}), ...(p?.hand ? { oppHand: p.hand } : {}) })
/**
 * The opponent pitcher from now on. The first time it is set while we bat, this half-inning's plate appearances so
 * far get it too (the recorder noticed after a batter or two); earlier innings and later changes never rewrite rows.
 */
export function setOppPitcher(s: RecordState, p: OppPitcher): RecordState {
  let next = cleanOppPitcher(p)
  // a 換投 to one who reads the same as the man he replaced (no name, the same hand): the saved rows could not tell them
  // apart, so he gets a name by his turn — 第 2 任投手
  if (s.oppPitcher && next && !next.name && !s.oppPitcher.name && next.hand === s.oppPitcher.hand && !!next.handUnknown === !!s.oppPitcher.handUnknown) {
    next = { ...next, name: `第${(s.oppPitcherChanges?.length ?? 0) + 2}任投手` }
  }
  const out: RecordState = { ...s, oppPitcher: next }
  // a pitcher already on the mound: this is a 換投 (the sheet says so), even to one with the same hand or no name
  if (s.oppPitcher && next) {
    out.oppPitcherFrom = { row: s.batting.length, pitches: offense(s) === 'us' ? s.pitches.length : 0 }
    out.oppPitcherChanges = [...(s.oppPitcherChanges ?? []), { ...out.oppPitcherFrom, out: s.oppPitcher }]
  }
  if (!s.oppPitcher && next && offense(s) === 'us') {
    out.batting = s.batting.map((b) => (b.inning === s.inning && !b.oppHand && !b.oppPitcher ? { ...b, ...oppFields(next) } : b))
  }
  return out
}
/** A name (trimmed) and/or a hand, or 不知道 for the hand (handUnknown); undefined when there is nothing. */
function cleanOppPitcher(p: OppPitcher): OppPitcher | undefined {
  const name = p.name?.trim() || undefined
  const unknown = !p.hand && !!p.handUnknown
  return name || p.hand || unknown ? { ...(name ? { name } : {}), ...(p.hand ? { hand: p.hand } : {}), ...(unknown ? { handUnknown: true as const } : {}) } : undefined
}
const oppKey = (p?: OppPitcher) => `${p?.name ?? ''}\u0000${p?.hand ?? ''}`
/**
 * Where the stint of the opponent pitcher on the mound now starts in our rows: where the last 換投 put him in
 * (oppPitcherFrom), else back to the first of the rows that carry him without a break (all of them while nobody was
 * named). The 對方投手 count, his line on /live and 更正這位投手 all use it.
 */
export function oppStintStart(batting: BattingPA[], oppPitcher?: OppPitcher, from?: { row: number; pitches: number }): number {
  if (from && from.row <= batting.length) return from.row
  const now = oppKey(oppPitcher)
  let i = batting.length
  while (i > 0 && oppKey({ name: batting[i - 1].oppPitcher, hand: batting[i - 1].oppHand }) === now) i--
  return i
}
/**
 * 對方投手 用球: the pitches the opponent pitcher on the mound now has thrown to us — our plate appearances of his stint
 * (oppStintStart), less the pitches of the plate appearance he came into, plus the one in progress.
 */
export function oppPitchCount(s: RecordState): number {
  const live = offense(s) === 'us' ? s.pitches.length : 0
  const from = s.oppPitcherFrom && s.oppPitcherFrom.row <= s.batting.length ? s.oppPitcherFrom : undefined
  const start = oppStintStart(s.batting, s.oppPitcher, from)
  return Math.max(0, s.batting.slice(start).reduce((n, b) => n + b.pitches.length, live) - (from?.pitches ?? 0))
}
/**
 * 更正這位投手: the pitcher on the mound is the same man, only his name or hand was written down wrong (左投 instead of
 * 右投). Every one of our rows of his stint so far gets the corrected name / hand and so does the live state; where his
 * stint starts stays, so his pitch count, his line and the play-by-play stay one stint. With nobody on the mound yet
 * it is the first entry (setOppPitcher).
 */
export function correctOppPitcher(s: RecordState, p: OppPitcher): RecordState {
  if (!s.oppPitcher) return setOppPitcher(s, p)
  const next = cleanOppPitcher(p)
  if (!next) return s
  const start = oppStintStart(s.batting, s.oppPitcher, s.oppPitcherFrom)
  const was = oppKey(s.oppPitcher)
  const batting = s.batting.map((b, i) => {
    if (i < start || oppKey({ name: b.oppPitcher, hand: b.oppHand }) !== was) return b
    const { oppPitcher: _n, oppHand: _h, ...rest } = b
    void _n; void _h
    return { ...rest, ...oppFields(next) }
  })
  return { ...s, oppPitcher: next, batting }
}
/**
 * 對方投手左右投 is required while we bat (when the cloud can store it: `on`): before the first pitch of our first
 * half and after every 對方換投, until 左投／右投 or 不知道 is picked. A pitcher with only a name is asked too. (Drafts
 * from before this rule that pressed the old 「不記」 are asked once.)
 */
export const needsOppHand = (s: RecordState, on: boolean): boolean =>
  on && !s.finished && offense(s) === 'us' && !s.oppPitcher?.hand && !s.oppPitcher?.handUnknown
/**
 * The hand picked from the 「對方投手是？」 question: the first entry sets him (setOppPitcher); a pitcher already on the
 * mound with no hand yet (a name only, or a 換投 without one) gets it on his stint so far (correctOppPitcher), not a 換投.
 */
export function answerOppHand(s: RecordState, hand: OppHand | null): RecordState {
  const p: OppPitcher = hand ? { name: s.oppPitcher?.name, hand } : { name: s.oppPitcher?.name, handUnknown: true }
  return s.oppPitcher ? correctOppPitcher(s, p) : setOppPitcher(s, p)
}

/* ------------------------------------------------ 對方打者左右打 */
/** Their batter up now: the side picked for his slot this game, '?' = 不知道, undefined = not asked yet. */
export const oppBatsNow = (s: RecordState): OppBats | '?' | undefined => s.oppBatsBySlot?.[s.oppOrder]
/** While they bat (when the cloud can store it: `on`), the pitch pad and the results wait for 左打／右打. */
export const needsOppBats = (s: RecordState, on: boolean): boolean => on && !s.finished && offense(s) === 'opp' && (!oppBatsNow(s) || oppBatsNow(s) === '?')
/** 左打 / 右打 for their batter up now (no 不知道: a draft saved with one is asked again); his later plate appearances this game start from it. */
export function setOppBats(s: RecordState, bats: OppBats): RecordState {
  return { ...s, oppBatsBySlot: { ...s.oppBatsBySlot, [s.oppOrder]: bats } }
}
/** Someone else is in that slot now (對方代打, 對方代跑, a new name in their order): ask again. */
function clearOppBats(s: RecordState, slot: number): RecordState {
  if (!s.oppBatsBySlot || !(slot in s.oppBatsBySlot)) return s
  const { [slot]: _x, ...rest } = s.oppBatsBySlot
  void _x
  return { ...s, oppBatsBySlot: rest }
}

/** Our pitchers who came in after the starter, in the order they pitched (who can get a 中繼). */
export function reliefPitchers(s: RecordState): string[] {
  const sp = startingPitcherOf(s)
  return [...new Set([...s.pitching.map((p) => p.pitcher), s.pitcher])].filter((n) => n && n !== sp)
}

/** A ball in play (IP) is the last pitch of the plate appearance: nothing is added after it (a double tap stays one IP). */
export const addPitch = (s: RecordState, code: string): RecordState => (s.pitches[s.pitches.length - 1] === 'IP' ? s : { ...s, pitches: [...s.pitches, code] })
/** (we field) the pitches of the count in progress by who threw them: the pitcher now's, and the ones who left (priorPitchers). */
export function liveSplit(s: RecordState): { current: number; prior: PriorPitch[] } {
  const prior = s.priorPitchers ?? []
  return { current: Math.max(0, s.pitches.length - prior.reduce((a, p) => a + p.pitches, 0)), prior }
}
export function undoPitch(s: RecordState): RecordState {
  const pitches = s.pitches.slice(0, -1)
  // (a pitch taken back that an earlier pitcher threw comes off his count)
  let over = (s.priorPitchers ?? []).reduce((a, p) => a + p.pitches, 0) - pitches.length
  const prior = (s.priorPitchers ?? []).slice()
  for (let i = prior.length - 1; i >= 0 && over > 0; i--) { const cut = Math.min(over, prior[i].pitches); prior[i] = { ...prior[i], pitches: prior[i].pitches - cut }; over -= cut }
  const kept = prior.filter((p) => p.pitches > 0)
  const { priorPitchers: _p, ...rest } = s
  void _p
  return { ...rest, pitches, ...(kept.length ? { priorPitchers: kept } : {}) }
}
export const addExtra = (s: RecordState, key: Exclude<keyof Extras, 'errors' | 'oppErrors'>): RecordState => ({ ...s, extras: { ...s.extras, [key]: s.extras[key] + 1 } })
/** One error by our fielder at `pos` during the opponent plate appearance in progress (a hit plus an error, a bad throw…). */
export const addError = (s: RecordState, pos: string): RecordState => ({ ...s, extras: { ...s.extras, errors: [...(s.extras.errors ?? []), pos] } })
export function removeError(s: RecordState, pos: string): RecordState {
  const list = [...(s.extras.errors ?? [])]
  const i = list.lastIndexOf(pos)
  if (i >= 0) list.splice(i, 1)
  return { ...s, extras: { ...s.extras, errors: list } }
}
/** 對方失誤 while we bat: one error by their fielder at `pos` (UNKNOWN_FIELDER '?' = 不知道) during our plate appearance in
 *  progress — a dropped foul fly, a bobble that moved nobody, a bad throw. A 失誤 result is its own error (not pressed here). */
export const addOppError = (s: RecordState, pos: string): RecordState => ({ ...s, extras: { ...s.extras, oppErrors: [...(s.extras.oppErrors ?? []), pos] } })
export function removeOppError(s: RecordState, pos: string): RecordState {
  const list = [...(s.extras.oppErrors ?? [])]
  const i = list.lastIndexOf(pos)
  if (i >= 0) list.splice(i, 1)
  return { ...s, extras: { ...s.extras, oppErrors: list } }
}
export const setOppBatter = (s: RecordState, name: string): RecordState => ({ ...s, oppBatter: name })
/**
 * 對方代打: their batter up now is a pinch hitter (a name or jersey number, optional: blank = OPP_PH_UNNAMED; typed = 「代打 99號」, see oppPinchHitter). Only this
 * plate appearance's name changes; with 記對方打者姓名 on and a name typed, his slot of their order becomes him.
 */
export function pinchHitOpp(s: RecordState, name: string): RecordState {
  const typed = name.trim().slice(0, 40)
  const next: RecordState = { ...clearOppBats(s, s.oppOrder), oppBatter: oppPinchHitter(typed) }
  // with two strikes on the batter: a strikeout is still the batter he replaced's (rule 9.15(b))
  if (offense(s) === 'opp' && count(s.pitches).strikes >= 2 && !s.oppPh2) next.oppPh2 = { was: oppBatterOf(s) }
  if (s.oppNames && typed) next.oppLineup = lineupOf(s.oppLineup ?? []).map((n, i) => (i === s.oppOrder - 1 ? typed : n))
  return next
}
/**
 * New pitcher, logged as a 換投. Without a DH the old pitcher bats in the lineup as P: a pitcher from the bench takes
 * that slot; a fielder who moves to the mound keeps his own slot (now P) and the old pitcher's slot is left for the
 * recorder to change. With a DH (the old pitcher is not in the lineup) only `pitcher` changes.
 */
export function changePitcher(s: RecordState, name: string): RecordState {
  if (!name || name === s.pitcher) return { ...s, pitcher: name }
  const old = s.lineup.findIndex((l) => l.name === s.pitcher)
  let lineup = s.lineup
  const fielder = s.lineup.findIndex((l) => l.name === name)
  if (old >= 0 && s.lineup[old].pos === 'P') {
    lineup = s.lineup.map((l, i) => (fielder >= 0 ? (i === fielder ? { ...l, pos: 'P' } : l) : i === old ? { name, pos: 'P' } : l))
  } else if (old < 0 && fielder >= 0 && s.lineup[fielder].pos !== 'P') {
    // (a DH game: one who bats and fields goes to the mound — he pitches from now on; the 指定打擊 is over)
    lineup = s.lineup.map((l, i) => (i === fielder ? { ...l, pos: 'P' } : l))
  }
  const sub = withBefore(s, { kind: 'P', in: name, out: s.pitcher, pos: 'P', inning: s.inning, half: s.half, ...(old >= 0 ? { slot: old } : {}), ...rowNow(s) })
  // a change with a count on the batter: the pitches so far are the pitcher who leaves's, the rest the new one's
  const left = offense(s) === 'opp' && s.pitcher ? s.pitches.length - (s.priorPitchers ?? []).reduce((a, p) => a + p.pitches, 0) : 0
  const priorPitchers = left > 0 ? [...(s.priorPitchers ?? []), { name: s.pitcher, pitches: left }] : s.priorPitchers
  // a new pitcher before the first pitch of a tie-break half takes over its placed runners (the pitcher who starts
  // the half is charged with them)
  let pitching = s.pitching
  if (offense(s) === 'opp' && !s.pitches.length) {
    const half = s.pitching.filter((p) => p.inning === s.inning)
    // (only while nothing has happened yet: a pickoff or a balk before the first pitch is the old pitcher's)
    if (half.some(isPlaced) && !half.some(isPA) && !s.plays?.length) pitching = s.pitching.map((p) => (p.inning === s.inning && isPlaced(p) ? { ...p, pitcher: name } : p))
  }
  return { ...s, pitcher: name, lineup, pitching, subs: [...(s.subs ?? []), sub], ...(priorPitchers?.length ? { priorPitchers } : {}) }
}
/** A change made while we field, after some of this half's opponent rows: DayRosterSub.row (those rows keep the old
 *  alignment, data/gameRoster defenseTimeline). Nothing at the start of the half or while we bat. */
function rowNow(s: RecordState): { row?: number } {
  if (offense(s) !== 'opp') return {}
  const n = s.pitching.filter((p) => p.inning === s.inning).length
  return n ? { row: n } : {}
}
/** The changes logged during the plate appearance in progress while we field (indices in `subs`): this half's, at its
 *  current row (rowNow). */
function paSubs(s: RecordState): number[] {
  if (offense(s) !== 'opp') return []
  const n = s.pitching.filter((p) => p.inning === s.inning).length
  return (s.subs ?? []).flatMap((x, i) => (x.inning === s.inning && x.half === s.half && (x.row ?? 0) === n ? [i] : []))
}
/** What our fielders did so far in the plate appearance in progress (it goes on its row once sent). */
const pendingCharges = (s: RecordState): SubCharges => ({ errors: s.extras.errors ?? [], sba: s.extras.sba, cs: s.extras.cs, pb: s.extras.pb, pk: s.extras.pk })
/** A change logged in the middle of a plate appearance while we field keeps what our fielders had done in it since the
 *  previous change (DayRosterSub.before): that row takes the new alignment, these stay with the old one. */
function withBefore(s: RecordState, sub: DayRosterSub): DayRosterSub {
  if (offense(s) !== 'opp') return sub
  const subs = s.subs ?? []
  const before = chargesOrNone(chargesMinus(pendingCharges(s), chargesSum(paSubs(s).map((i) => subs[i].before))))
  return before ? { ...sub, before } : sub
}
/**
 * The plate appearance in progress ends without a row (settlePending): its changes' `before` would point at a row that
 * never comes. When what it had goes on the half's last row (`folded`, a row from before these changes), each change
 * says what came after it instead (DayRosterSub.after): up to the next change (its `before`), the last one the rest.
 */
function settlePaSubs(s: RecordState, folded: boolean): DayRosterSub[] | undefined {
  const idx = paSubs(s)
  if (!idx.length) return s.subs
  const subs = [...s.subs!]
  const befores = idx.map((i) => subs[i].before)
  idx.forEach((i, k) => {
    const { before: _b, after: _a, ...rest } = subs[i]
    void _b; void _a
    const after = folded ? chargesOrNone(k < idx.length - 1 ? befores[k + 1] ?? {} : chargesMinus(pendingCharges(s), chargesSum(befores))) : undefined
    subs[i] = after ? { ...rest, after } : rest
  })
  return subs
}
export const setSlot = (s: RecordState, slot: number): RecordState => ({ ...s, slot: ((slot % s.lineup.length) + s.lineup.length) % s.lineup.length })
export const setOppOrder = (s: RecordState, n: number): RecordState => ({ ...s, oppOrder: ((n - 1 + 9) % 9) + 1 })
/**
 * Substitute (pinch hitter / defensive change) in a lineup slot, logged in `subs`. A position-only change (no name, or
 * the same one: 只改守位) is logged too, as a 守備調動 (the same player in and out, data/gameRoster isMove): errors,
 * putouts and 守備局數 are charged to whoever stood at a position in that half-inning (defenseTimeline). Changing the
 * same player's position again in the same half, with no plate appearance in between, replaces that entry (a correction).
 */
export function substitute(s: RecordState, slot: number, name: string, pos: string): RecordState {
  // someone new taking the current pitcher's slot at P is a pitching change: route it so `pitcher` follows
  const cur = s.lineup[slot]
  if (cur && name && name !== cur.name && cur.name === s.pitcher && (pos || cur.pos) === 'P') return changePitcher(s, name)
  let next = lineupChange(s, slot, name, pos)
  // a pinch hitter with two strikes on the batter: if he strikes out, it is the first batter's (rule 9.15(b))
  const cur0 = s.lineup[slot]
  if (pos === 'PH' && name && cur0?.name && cur0.name !== name && offense(s) === 'us' && slot === s.slot && count(s.pitches).strikes >= 2) next = { ...next, phTwoStrikes: { in: name, out: cur0.name } }
  // anyone else put at P (a new pitcher in the slot of the one who pinch-hit for the pitcher, a fielder moved to the mound
  // once the DH is gone) is the pitcher from now on: the pitching change goes with it, so his pitches are his
  const atP = next.lineup[slot]
  return atP?.pos === 'P' && atP.name && atP.name !== next.pitcher ? changePitcher(next, atP.name) : next
}
function lineupChange(s: RecordState, slot: number, name: string, pos: string): RecordState {
  const lineup = s.lineup.map((l, i) => (i === slot ? { name: name || l.name, pos: pos || l.pos } : l))
  const old = s.lineup[slot]
  if (!old || !name || name === old.name) {
    if (!old?.name || !pos || pos === old.pos) return { ...s, lineup }
    const subs = s.subs ?? []
    const last = subs[subs.length - 1]
    // (a correction: nothing recorded since that move — once a plate appearance went by, it is a second move of its own)
    const again = !!last && last.kind === 'DEF' && last.in === old.name && last.out === old.name && last.inning === s.inning && last.half === s.half && last.row === rowNow(s).row
    // (a correction keeps the row it was first made at, and what came before it)
    const move: DayRosterSub = again
      ? { ...last, pos, slot }
      : withBefore(s, { kind: 'DEF', in: old.name, out: old.name, pos, inning: s.inning, half: s.half, slot, ...rowNow(s) })
    return { ...s, lineup, subs: again ? [...subs.slice(0, -1), move] : [...subs, move] }
  }
  // replacing someone who is on base is 代跑 whatever the position box says: he takes over the runner (and its run / SB / CS)
  const onBase = s.runners.find((r) => r.side === 'us' && r.name === old.name && s.batting[r.row])
  const kind: DayRosterSub['kind'] = onBase || pos === 'PR' ? 'PR' : pos === 'PH' ? 'PH' : 'DEF'
  // (the box starts at PH while we bat: on a runner that means PR)
  const inPos = onBase && (!pos || pos === 'PH') ? 'PR' : pos || old.pos
  const sub = withBefore(s, { kind, in: name, out: old.name, pos: inPos, inning: s.inning, half: s.half, slot, ...rowNow(s) })
  const next: RecordState = { ...s, lineup: lineup.map((l, i) => (i === slot ? { ...l, pos: inPos } : l)), subs: [...(s.subs ?? []), sub] }
  if (onBase) {
    next.runners = s.runners.map((r) => (r === onBase ? { ...r, name } : r))
    next.batting = s.batting.map((p, i) => (i === onBase.row ? { ...p, runner: name } : p))
  }
  return next
}
export const setReentry = (s: RecordState, on: boolean): RecordState => ({ ...s, reentry: on })

/**
 * 對方代跑: the opponent runner on `row` (the pitching row where he reached, a 突破僵局 runner too) is replaced by `name`
 * (a name or jersey number, optional: blank = OPP_PR_UNNAMED). He keeps his base and everything stays on that row (the
 * run, our pitcher's R/ER, a pickoff or CS of him): only the name changes, on the runner and as the row's `runner`, the
 * same rule as our BattingPA.runner. A second 代跑 for the same runner replaces the first. With 記對方打者姓名 on and
 * the row's batting slot known, that slot of their order becomes the pinch runner (rows already sent keep their names),
 * so his next plate appearance shows him.
 */
/**
 * 臨時代跑 (the amateur courtesy runner, e.g. for the catcher): someone runs for our runner without a substitution — the
 * one on base only changes his name while he is out there; the row (and its run, steals) stays the batter's, with a note.
 */
export function courtesyRunner(s: RecordState, row: number, name: string): RecordState {
  const r = s.runners.find((x) => x.row === row && x.side === 'us')
  if (!r || !name) return s
  const batting = s.batting.map((p, i) => (i === row ? { ...p, note: [p.note, `臨時代跑 ${name}`].filter(Boolean).join('；') } : p))
  return { ...s, batting, runners: s.runners.map((x) => (x === r ? { ...x, name } : x)) }
}
export function pinchRunOpp(s: RecordState, row: number, name: string): RecordState {
  const runner = s.runners.find((r) => r.side === 'opp' && r.row === row)
  const pa = s.pitching[row]
  if (!runner || !pa) return s
  const typed = name.trim().slice(0, 40)
  const label = typed || OPP_PR_UNNAMED
  const next: RecordState = {
    ...(pa.oppOrder ? clearOppBats(s, pa.oppOrder) : s),
    runners: s.runners.map((r) => (r === runner ? { ...r, name: label } : r)),
    pitching: s.pitching.map((p, i) => (i === row ? { ...p, runner: label } : p)),
    // when he came in: written on the plate appearance in progress once it is sent
    // (only when it matters: during a count, or not right after his own plate appearance — else the 文字轉播 places him
    // before the next batter anyway)
    ...(offense(s) === 'opp' && (s.pitches.length > 0 || s.pitching.length > row + 1) ? { oppPrAt: [...(s.oppPrAt ?? []), { label, at: s.pitches.length }] } : {}),
  }
  const slot = pa.oppOrder
  if (s.oppNames && slot && slot >= 1 && slot <= 9) next.oppLineup = lineupOf(s.oppLineup ?? []).map((n, i) => (i === slot - 1 ? typed : n))
  return next
}

/* ------------------------------------------------ who is in the game (all tolerant of drafts without the roster fields) */
/** Our fielders right now, position → name (the lineup's positions, the pitcher at P): who an error picked now is
 *  charged to (「6 SS 王鼎鈞」 in the 誰失誤 pickers). Two players at one position: the later slot (posIssues flags it). */
export function fieldersNow(s: RecordState): Map<string, string> {
  // the same alignment the saved game charges errors by (a 代打 not yet given a position takes the one he left open)
  const timeline = defenseTimeline(dayRosterOf(s))
  const out = timeline ? new Map(timeline(s.inning, s.half).byPos) : new Map<string, string>()
  if (!timeline) for (const l of s.lineup) if (l.name && l.pos && !['DH', 'PH', 'PR'].includes(l.pos)) out.set(l.pos, l.name)
  if (s.pitcher) out.set('P', s.pitcher)
  return out
}
/** In the game right now: the batting order plus the pitcher (under a DH he is not in `lineup`). */
export function onField(s: RecordState): Set<string> {
  return new Set([...s.lineup.map((l) => l.name), s.pitcher].filter(Boolean))
}
/** The starting lineup. Older drafts have no copy: the first batter in each slot started there (a pinch hitter shares the order). */
export function startersOf(s: RecordState): LineupSlot[] {
  if (s.starters) return s.starters
  return s.lineup.map((l, i) => { const p = s.batting.find((b) => b.order === i + 1 && b.batter); return p ? { name: p.batter, pos: p.pos ?? l.pos } : l })
}
export function startingPitcherOf(s: RecordState): string {
  return s.startingPitcher ?? (s.pitching.find((p) => p.pitcher)?.pitcher || s.pitcher)
}
/** Everyone who has been in the game (started, came in, batted, pitched, or is out there now). */
export function appeared(s: RecordState): Set<string> {
  const subs = s.subs ?? []
  const out = new Set<string>([...startersOf(s).map((l) => l.name), startingPitcherOf(s), ...subs.flatMap((x) => [x.out, x.in]), ...s.batting.map((p) => p.batter), ...s.pitching.map((p) => p.pitcher), ...onField(s)])
  out.delete('')
  return out
}
/** Substituted out: was in the game, is not any more. */
export function leftGame(s: RecordState): string[] {
  const now = onField(s)
  return [...appeared(s)].filter((n) => !now.has(n))
}
/** Bench players who have not come in yet. */
export function unusedBench(s: RecordState): string[] {
  const seen = appeared(s)
  return (s.bench ?? []).filter((n) => !seen.has(n))
}

export interface SubCandidates { names: string[]; disabled: Set<string>; tag: (name: string) => string | undefined }
/**
 * Who can come in, best first: today's unused bench, then the rest of `pool` who have not played, (for a pitching
 * change) the fielders who could move to the mound, then players already substituted out, who stay greyed out
 * unless re-entry is allowed.
 */
export function subCandidates(s: RecordState, pool: string[], mode: 'batter' | 'pitcher'): SubCandidates {
  // today's bench in the pool's order (the 球員排序 chosen on the site)
  const rank = new Map(pool.map((n, i) => [n, i]))
  const bench = [...unusedBench(s)].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity))
  const seen = appeared(s)
  const left = leftGame(s)
  const fielders = mode === 'pitcher' ? s.lineup.map((l) => l.name).filter((n) => n && n !== s.pitcher) : []
  // a pitcher without a batting slot (pinch-hit for without a DH, then relieved) must be able to take that slot
  const mound = mode === 'batter' && s.pitcher && !s.lineup.some((l) => l.name === s.pitcher) ? [s.pitcher] : []
  const names = [...new Set([...bench, ...pool.filter((n) => !seen.has(n)), ...mound, ...fielders, ...left])]
  const benchSet = new Set(bench), leftSet = new Set(left)
  // 允許再上場 (the college rule): a starter, once, back into his own slot — the others are marked, still pickable
  const startSlot = new Map(startersOf(s).flatMap((l, i) => (l.name ? [[l.name, i + 1] as const] : [])))
  const leftTag = (n: string) => {
    if (!s.reentry) return '（已下場）'
    const slot = startSlot.get(n)
    if (!slot) return '（已下場・不是先發，依大專規則不能再上場）'
    if ((s.subs ?? []).some((x) => x.in === n && !(x.out === n && x.kind === 'DEF'))) return '（已下場・已經再上場過一次）'
    return `（先發・可再上場，回第 ${slot} 棒）`
  }
  return { names, disabled: s.reentry ? new Set() : leftSet, tag: (n) => (benchSet.has(n) ? '（板凳）' : leftSet.has(n) ? leftTag(n) : mound.includes(n) ? '（投手）' : undefined) }
}

export interface PAPlan {
  result: string
  loc?: number
  traj?: string
  quality?: string
  batter: Dest
  /** destination per runner, keyed by that runner's row index */
  runners: Record<number, Dest>
  rbi: number
  /** opponent runs the recorder called by hand (earned true / false), by the scorer's row or 'batter'; the rest
   *  follow the rules (record/earned.ts) */
  earnedBy?: Record<string, boolean>
  /** 趁傳進壘: who took the bases beyond what the hit gave him on the throw (runner rows, or the batter) */
  throws?: Array<number | 'batter'>
  /** 失誤進壘 on the play: who took the extra bases on a fielding (throwing) error instead — no RBI for those runs */
  errAdv?: Array<number | 'batter'>
  /** (we field) whose error it was: positions, counted as our errors on this plate appearance */
  errBy?: string[]
  /** 壘死: runner rows put out by their own baserunning mistake on the play (the rest of the runners out are just 出局) */
  runningOuts?: number[]
  /** (we bat) the batter reached, then was put out on the same play by his own baserunning mistake: 壘死, not just 出局 */
  batterRunningOut?: boolean
  /** 死在哪個壘包 for a 壘死 runner (by row) or the batter who reached and was put out ('batter'); left out = defaultOutAt */
  outAt?: Record<string, OutAt>
  /** 備註 typed in the confirm panel (kept on the row's note, after 「牽制 N 次」) */
  note?: string
  /** (三振, 保送…) how a runner set to 出局 on that pitch was put out: 盜壘失敗 (default), 牽制出局, 跑壘出局 */
  outHow?: Record<number, OutHow>
  /** runner rows put out by the batted ball itself hitting them (rule 5.09(b)(7)): the nearest fielder's putout, no assist */
  hitByBall?: number[]
}
export type OutHow = 'cs' | 'pk' | 'run'
export const OUT_HOW_LABEL: Record<OutHow, string> = { cs: '盜壘失敗', pk: '牽制出局', run: '跑壘出局' }
/** Results with no ball in play: a runner out on that pitch was thrown out stealing, picked off or out running. */
export const NO_BIP_OUT = new Set(['三振', '保送', '故四', '觸身', '妨礙'])
/**
 * 三振雙殺 and the like: a runner put out on the pitch that ended the plate appearance with no ball in play is recorded as
 * that runner event right after it (盜壘失敗 by default — the catcher's 阻殺 and the 盜壘刺 count), then the plate
 * appearance without him. Other results go through unchanged.
 */
export function baseOutsFirst(s: RecordState, plan: PAPlan): { s: RecordState; plan: PAPlan } {
  if (!NO_BIP_OUT.has(plan.result)) return { s, plan }
  const runners = { ...plan.runners }
  for (const r of [...s.runners].sort((a, b) => b.base - a.base)) {
    if (plan.runners[r.row] !== 'out') continue
    const how = plan.outHow?.[r.row] ?? 'cs'
    s = runnerEvent(s, r.row, r.side, how === 'run' ? 'out' : how)
    delete runners[r.row]
  }
  return { s, plan: { ...plan, runners, runningOuts: (plan.runningOuts ?? []).filter((w) => runners[w] === 'out') } }
}

const destNum = (d: Dest | undefined) => (d === 'home' ? 4 : typeof d === 'number' ? d : 0)
/** Whether `who` goes further than the result alone sends him (so the extra bases can be marked 趁傳進壘). */
export function beyondDefault(s: RecordState, plan: PAPlan, who: number | 'batter'): boolean {
  const was = expectedBase(s, plan.result, who)
  const now = who === 'batter' ? plan.batter : plan.runners[who]
  return was !== null && was < 4 && destNum(now) > was
}
/** Where the result alone leaves `who`, as a base (本壘 4); a 野選's runner, out by default, who was safe: the base he ran to. */
function expectedBase(s: RecordState, result: string, who: number | 'batter'): number | null {
  const base = defaultPlan(s, result)
  const was = who === 'batter' ? base.batter : base.runners[who]
  if (typeof was === 'number') return was
  if (was === 'home') return 4
  const r = typeof who === 'number' ? s.runners.find((x) => x.row === who) : undefined
  return was === 'out' && result === '野選' && r ? Math.min(4, r.base + 1) : null
}

/**
 * The base a 壘死 is most likely made at: the one after where the result alone leaves him (a single, then out at 2B; a
 * runner the single sends to 2B, out at 3B; one the result would score, out at the plate; doubled off after a fly ball,
 * the base he stands on). The recorder can pick another.
 */
const FLY_OUTS = new Set(['內飛', '外飛', '界外飛', '犧飛'])
/** A ball in play that put the batter on (a hit — not a home run, which nobody is out on — an error or a fielder's choice). */
export const liveBall = (result: string): boolean => (result in HIT_BASE_COUNT && result !== '全壘打') || result === '失誤' || result === '野選'
/** A runner put out on this result is asked where (the base says who made the putout): a ball that put the batter on, a
 *  double play, or one doubled off after a catch / thrown out on a 犧飛 or a ground out (two outs on the play). */
export const outAtAsked = (result: string): boolean => liveBall(result) || result === '雙殺' || FLY_OUTS.has(result) || result === '內滾' || result === '犧觸'
export function defaultOutAt(s: RecordState, plan: Pick<PAPlan, 'result'> & { traj?: string }, who: number | 'batter'): OutAt {
  const base = defaultPlan(s, plan.result)
  const was = who === 'batter' ? base.batter : base.runners[who]
  const stood = s.runners.find((r) => r.row === who)?.base ?? 1
  // a fly ball (or a line-drive double play) caught with him off the bag: he is doubled off where he stands
  if (typeof who === 'number' && (FLY_OUTS.has(plan.result) || (plan.result === '雙殺' && (plan.traj === 'L' || plan.traj === 'F' || plan.traj === 'P')))) return stood
  const n = was === 'home' ? 4 : typeof was === 'number' ? was : stood
  return n >= 3 ? 'home' : ((n + 1) as 1 | 2 | 3)
}

/** Sensible default destinations for a result; the recorder adjusts before confirming. */
export function defaultPlan(s: RecordState, result: string): PAPlan {
  const runners: Record<number, Dest> = {}
  const adv = (r: Runner, n: number): Dest => { const b = r.base + n; return b >= 4 ? 'home' : (b as Base) }
  let batter: Dest = 'out'
  if (result in HIT_BASES && result !== '內安') {
    batter = HIT_BASES[result]
    const n = HIT_BASE_COUNT[result]
    for (const r of s.runners) runners[r.row] = adv(r, n)
  } else if (result === '內安' || result === '保送' || result === '故四' || result === '觸身' || result === '妨礙') {
    // (an infield single moves only the runners it forces, like a walk)
    batter = 1
    // forced runners only
    const on = new Set(s.runners.map((r) => r.base))
    for (const r of s.runners) {
      const forced = r.base === 1 || (r.base === 2 && on.has(1)) || (r.base === 3 && on.has(1) && on.has(2))
      runners[r.row] = forced ? adv(r, 1) : r.base
    }
  } else if (result === '失誤' || result === '野選') {
    // the batter on, the runners he forces one base on, the others where they are (a 野選: the runner from first is the
    // out, or the lead runner); the recorder sends anyone further
    batter = 1
    const forced = forcedRows(s)
    for (const r of s.runners) runners[r.row] = result === '野選' && r.base === 1 ? 'out' : forced.has(r.row) ? adv(r, 1) : r.base
    if (result === '野選' && !s.runners.some((r) => r.base === 1) && s.runners.length) runners[s.runners[0].row] = 'out'
  } else if (result === '內滾') {
    // a ground out: the runners he forced take the base (nearly always), the others hold
    const forced = forcedRows(s)
    for (const r of s.runners) runners[r.row] = forced.has(r.row) ? adv(r, 1) : r.base
  } else if (result === '犧飛') {
    for (const r of s.runners) runners[r.row] = r.base === 3 ? 'home' : r.base
  } else if (result === '犧觸') {
    for (const r of s.runners) runners[r.row] = adv(r, 1)
  } else if (result === '雙殺') {
    const lead = s.runners.find((r) => r.base === 1) ?? s.runners[0]
    for (const r of s.runners) runners[r.row] = r === lead ? 'out' : r.base
  } else {
    for (const r of s.runners) runners[r.row] = r.base
  }
  // the trajectory the result already tells: grounders G, fly balls F (a hit or an error can be any of them)
  const traj = TRAJ_OF[result]
  const plan: PAPlan = { result, batter, runners, rbi: 0, ...(traj ? { traj } : {}) }
  // the play ends the half-inning: nobody scores by default (rule 5.08(a); a tag out after the run crossed is the
  // recorder's call), the runners not put out stay where they were (left on base)
  if (s.outs + outsOnPlay(s, plan) >= 3) for (const r of s.runners) if (plan.runners[r.row] !== 'out') plan.runners[r.row] = r.base
  plan.rbi = defaultRbi(plan)
  return walkOffPlan(s, plan) ?? plan
}

/**
 * 再見 (rule 9.06(f)): the home team, batting in the last scheduled inning or later, goes ahead on this play. The game
 * ends as the winning run scores: only the runs up to it count, and a hit is credited with as many bases as the winning
 * runner advanced (bases loaded, a double that scores him from third is a single) — everyone else moves that many bases.
 * A home run counts every run. Null when the play is no walk-off or there is nothing to trim.
 */
export function walkOffPlan(s: RecordState, plan: PAPlan): PAPlan | null {
  const w = walkOffRunner(s, plan)
  if (!w || w.credit >= 4) return null
  const { winner, credit } = w
  const adv = (base: number): Dest => (base + credit >= 4 ? 'home' : ((base + credit) as Base))
  const runners: Record<number, Dest> = {}
  for (const r of s.runners) runners[r.row] = plan.runners[r.row] === 'out' ? 'out' : r.base >= winner.base ? (plan.runners[r.row] === 'home' ? 'home' : plan.runners[r.row]) : adv(r.base)
  const hit = plan.result in HIT_BASES && plan.result !== '全壘打'
  const result = hit && HIT_BASE_COUNT[plan.result] > credit ? (credit === 1 ? '一安' : credit === 2 ? '二安' : '三安') : plan.result
  const batter: Dest = plan.batter === 'out' ? 'out' : hit ? (Math.min(credit, HIT_BASE_COUNT[plan.result]) as Base) : plan.batter === 'home' ? adv(0) : plan.batter
  const next: PAPlan = { ...plan, result, batter, runners }
  if (result === plan.result && batter === plan.batter && s.runners.every((r) => runners[r.row] === plan.runners[r.row])) return null
  return { ...next, rbi: defaultRbi(next) }
}
/** The runner whose run wins the game on this play (home team, last inning or later) and the bases he advanced; null otherwise. */
export function walkOffRunner(s: RecordState, plan: Pick<PAPlan, 'result' | 'batter' | 'runners'>, regulation = s.game.innings ?? TEAM.innings): { winner: Runner | { base: 0 }; credit: number } | null {
  if (s.half !== 'bottom' || s.inning < regulation || plan.result === '全壘打') return null
  const sc = score(s)
  const need = (offense(s) === 'us' ? sc.opp - sc.us : sc.us - sc.opp) + 1
  if (need < 1) return null
  const scorers: Array<Runner | { base: 0 }> = [...s.runners].filter((r) => plan.runners[r.row] === 'home').sort((a, b) => b.base - a.base)
  if (plan.batter === 'home') scorers.push({ base: 0 })
  if (scorers.length < need) return null
  const winner = scorers[need - 1]
  return { winner, credit: 4 - winner.base }
}

/** The outs a plan makes: the batter and the runners it puts out. */
export function outsOnPlay(s: RecordState, plan: Pick<PAPlan, 'batter' | 'runners'>): number {
  return (plan.batter === 'out' ? 1 : 0) + s.runners.filter((r) => plan.runners[r.row] === 'out').length
}
/** The runners the batter forces once he runs (every base behind them taken). */
function forcedRows(s: RecordState): Set<number> {
  const on = new Set(s.runners.map((r) => r.base))
  return new Set(s.runners.filter((r) => r.base === 1 || (r.base === 2 && on.has(1)) || (r.base === 3 && on.has(1) && on.has(2))).map((r) => r.row))
}
/**
 * Rule 5.08(a): no run scores on a play whose third out is the batter put out (a strikeout, a ground out, a caught fly —
 * before he reaches first base) or a runner forced out. When the third out is a tag on a runner, a run that crossed the
 * plate before it counts — a reminder, not a block (`warn`).
 */
export function thirdOutRule(s: RecordState, plan: Pick<PAPlan, 'batter' | 'runners'>): { block?: string; warn?: string } {
  const outs = outsOnPlay(s, plan)
  const scores = s.runners.some((r) => plan.runners[r.row] === 'home') || plan.batter === 'home'
  if (!outs || !scores || s.outs + outs < 3) return {}
  if (plan.batter === 'out') return { block: '第三個出局是打者出局（三振、在一壘前出局、被接殺），這一分不算（規則 5.08）：請把得分的跑者改回壘上' }
  const forced = forcedRows(s)
  const outRows = s.runners.filter((r) => plan.runners[r.row] === 'out').map((r) => r.row)
  if (outRows.length === 1 && forced.has(outRows[0])) return { block: '第三個出局是封殺，這一分不算（規則 5.08）：請把得分的跑者改回壘上' }
  return { warn: '這球形成第三個出局：只有跑者在出局之前就踩到本壘，這一分才算；不是的話請把他改回壘上' }
}

/** What is impossible about where the plan sends everyone: two runners on one base, or a runner passing the one ahead. */
/**
 * What the plan does that the rule book does not allow but an umpire may still have let stand: warned, not blocked
 * (the record keeps what happened on the field).
 */
export function planWarnings(s: RecordState, plan: PAPlan): string[] {
  const out: string[] = []
  // 不死三振: the batter may run only with first base open, or with two out (rule 5.05(a)(2))
  if (plan.result === '三振' && plan.batter !== 'out' && s.outs < 2 && s.runners.some((r) => r.base === 1)) out.push('一壘有人、未滿兩出局時打者不能不死三振（規則 5.05(a)(2)），通常要設成出局；裁判真的判他上壘的話照實際送出')
  return out
}
export function planProblems(s: RecordState, plan: PAPlan): string[] {
  const side = offense(s)
  const batterName = side === 'us' ? s.lineup[s.slot]?.name ?? '打者' : '打者'
  const people = [
    ...s.runners.filter((r) => r.side === side).map((r) => ({ name: r.name, from: r.base as number, to: plan.runners[r.row] ?? r.base })),
    { name: batterName, from: 0, to: plan.batter },
  ].sort((a, b) => b.from - a.from)
  const out: string[] = []
  let ahead: { name: string; to: number } | null = null
  const label = (b: number) => (b === 4 ? '本壘' : `${b}B`)
  // nobody goes back to a base behind the one he stands on now (a steal or a wild pitch while the result was open)
  for (const p of people) if (p.from > 0 && typeof p.to === 'number' && p.to < p.from) out.push(`${p.name} 已經在 ${label(p.from)}，不能退回 ${label(p.to)}`)
  for (const p of people) {
    // someone put out is off the bases and blocks nobody; scoring counts as base 4, which several runners may reach
    if (p.to === 'out') continue
    const to = p.to === 'home' ? 4 : p.to
    if (ahead && to === ahead.to && to < 4) out.push(`${ahead.name} 和 ${p.name} 都停在 ${label(to)}`)
    else if (ahead && to > ahead.to) out.push(`${p.name} 跑到${label(to)}，超過了前面的 ${ahead.name}（${label(ahead.to)}）`)
    ahead = { name: p.name, to }
  }
  // a half-inning has three outs: more on one play is a mistake (a 雙殺 with two out, a runner marked out twice)
  const outs = s.outs + outsOnPlay(s, plan)
  if (outs > 3) out.push(`這個打席加起來會有 ${outs} 個出局，一個半局只有 3 個：請把多的出局改回壘上${plan.result === '雙殺' ? '（兩出局時不會有雙殺，請改記內滾或野選）' : ''}`)
  const third = thirdOutRule(s, plan).block
  if (third) out.push(third)
  const walk = walkOffRunner(s, plan)
  if (walk && walk.credit < 4 && scoredOn(plan) > scoredOn(walkOffPlan(s, plan) ?? plan)) out.push('再見：比賽在致勝的那一分回來時就結束，之後的跑者不算得分（規則 9.06(f)）')
  return out
}

/**
 * The plan after the runners moved while it was open (a steal, a wild pitch, a balk recorded after the result came up —
 * ball four, strike three): a destination behind where the runner stands now takes the result's default from his new
 * base; a runner who is no longer on (scored, out) drops out of the plan. The rest of what the recorder picked stays.
 */
export function refreshPlan(s: RecordState, plan: PAPlan, rbiTouched = false): PAPlan {
  const base = defaultPlan(s, plan.result)
  const runners: Record<number, Dest> = {}
  for (const r of s.runners) {
    const d = plan.runners[r.row]
    runners[r.row] = d === 'out' || d === 'home' || (typeof d === 'number' && d >= r.base) ? d : base.runners[r.row]
  }
  const next = { ...plan, runners }
  return rbiTouched ? next : { ...next, rbi: defaultRbi(next) }
}

/** Runs scored on the play, minus the cases that never earn an RBI (error, double play). */
export function scoredOn(plan: PAPlan): number { return Object.values(plan.runners).filter((d) => d === 'home').length + (plan.batter === 'home' ? 1 : 0) }
export function defaultRbi(plan: PAPlan): number {
  if (plan.result === '失誤' || plan.result === '雙殺') return 0
  // a run that only scored because of an error on the play is no RBI
  const onError = (plan.errAdv ?? []).filter((w) => (w === 'batter' ? plan.batter : plan.runners[w]) === 'home').length
  return Math.max(0, scoredOn(plan) - onError)
}

/** Commit the plate appearance in progress. Returns the new state (half-inning ends automatically at 3 outs). */
export function commitPA(s: RecordState, plan: PAPlan): RecordState {
  // a pinch hitter who came in with two strikes and struck out: the strikeout (and the at-bat) is the batter he replaced's (rule 9.15(b))
  const ph2 = s.phTwoStrikes
  if (ph2) { const { phTwoStrikes: _p, ...rest } = s; void _p; s = rest }
  const side = offense(s)
  const batting = s.batting.map((p) => ({ ...p }))
  const pitching = s.pitching.map((p) => ({ ...p }))
  let outs = s.outs
  const base = { gameId: s.game.id, inning: s.inning, outsBefore: s.outs, basesBefore: basesString(s.runners), pitches: withInPlay(s.pitches, plan.result), result: plan.result, loc: plan.loc, traj: plan.traj, quality: plan.quality }
  // (their 代跑 put in during this plate appearance: when, for the 文字轉播 — data/broadcast.ts oppPrMarks)
  const prs = side === 'opp' ? (s.oppPrAt ?? []).map((x) => oppPrMark(x.label, x.at)) : []
  const note = [s.extras.pka ? `牽制 ${s.extras.pka} 次` : '', ...prs, plan.note?.trim() ?? ''].filter(Boolean).join('；') || undefined
  const extras = { sba: s.extras.sba, cs: s.extras.cs, wp: s.extras.wp, pb: s.extras.pb, pk: s.extras.pk }
  let rowIndex: number
  if (side === 'us') {
    const slot = s.lineup[s.slot]
    // 對方失誤: the ones pressed (and 失誤進壘 between pitches), plus a 失誤進壘 on the play — whose (their fielders), or
    // 不知道; on a 失誤 result the extra bases came on that same error unless another fielder is named
    const onPlay = plan.errAdv?.length ? (plan.errBy?.length ? plan.errBy : plan.result === '失誤' ? [] : [UNKNOWN_FIELDER]) : []
    const oppErrors = [...(s.extras.oppErrors ?? []), ...onPlay]
    batting.push({ ...base, order: s.slot + 1, pos: slot?.pos || undefined, batter: ph2 && plan.result === '三振' && ph2.in === slot?.name ? ph2.out : slot?.name ?? '', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: plan.rbi, note, ...(oppErrors.length ? { errors: oppErrors } : {}), ...oppFields(s.oppPitcher) })
    rowIndex = batting.length - 1
  } else {
    // our errors: the ones pressed between pitches, then whose error the 失誤進壘 on the play was. On a 失誤 result the
    // fielder picked at its 落點 is that same error (picking one is required), any other is one more
    const own = plan.result === '失誤' && plan.loc ? POSITION_BY_NUMBER[plan.loc] : undefined
    const errors = withOurErrors(undefined, s.extras.errors ?? [], plan.result, plan.loc)
    let ownSeen = !!own && errors.includes(own)
    for (const pos of plan.errAdv?.length ? plan.errBy ?? [] : []) {
      if (pos === own && ownSeen) { ownSeen = false; continue }
      errors.push(pos)
    }
    const bats = oppBatsNow(s)
    pitching.push({ ...base, oppOrder: s.oppOrder, pitcher: s.pitcher, oppBatter: (s.oppPh2 && plan.result === '三振' ? s.oppPh2.was : oppBatterOf(s)) || undefined, ...extras, ...(errors.length ? { errors } : {}), ...(plan.rbi > 0 ? { rbi: plan.rbi } : {}), ...(bats === 'L' || bats === 'R' ? { oppBats: bats } : {}), ...(s.priorPitchers?.length ? { priorPitchers: s.priorPitchers.map((p) => ({ ...p })) } : {}), note })
    rowIndex = pitching.length - 1
  }
  // the plays between pitches, then 趁傳進壘／失誤進壘 on the batted ball (from where the hit alone put him)
  const def = plan.throws?.length || plan.errAdv?.length ? defaultPlan(s, plan.result) : null
  const onPlay = (who: number | 'batter', kind: 'throw' | 'err'): PlayEvent[] => {
    void def
    const was = expectedBase(s, plan.result, who)
    const now = who === 'batter' ? plan.batter : plan.runners[who]
    if (was === null || was >= 4 || now === undefined || now === 'out' || destNum(now) <= was) return []
    // 失誤進壘 while we bat: one per base on the runner's own row
    if (kind === 'err' && side === 'us') batting[who === 'batter' ? rowIndex : who].advOnError += destNum(now) - was
    return [{ at: base.pitches.length, kind, from: was as Base, to: now, play: true as const, ...(who === 'batter' ? { batter: true as const } : {}) }]
  }
  const errAdv = new Set(plan.errAdv ?? [])
  // runners put out on the play: a 壘死 (his own baserunning mistake) is kind 'out'; on a ball that put the batter on
  // (a hit, an error, a 野選) or a double play any other runner out is a 'tag' (被刺殺／封殺): both say where, either side
  const mistakes = new Set(plan.runningOuts ?? [])
  const runningOut = s.runners.flatMap((r) => {
    if (plan.runners[r.row] !== 'out' || !(mistakes.has(r.row) || outAtAsked(plan.result))) return []
    return [{ at: base.pitches.length, kind: mistakes.has(r.row) ? 'out' : plan.hitByBall?.includes(r.row) ? 'hbb' : 'tag', from: r.base, to: 'out' as const, play: true as const, outAt: plan.outAt?.[r.row] ?? defaultOutAt(s, plan, r.row) }]
  })
  // the batter who reached and was put out on the same play (a triple, then thrown out at home; a single stretched):
  // an out on the bases, marked as made on the play (record/timeline batterOutMark) — theirs too, so the box can say where
  const batterOnBases = plan.batter === 'out' && reachedOn(plan.result)
  const thrown: PlayEvent[] = [
    ...runningOut,
    ...(batterOnBases ? [batterOutMark(plan.result, base.pitches.length, plan.outAt?.batter ?? defaultOutAt(s, plan, 'batter'))] : []),
    ...(plan.throws ?? []).filter((w) => !errAdv.has(w)).flatMap((w) => onPlay(w, 'throw')),
    ...[...errAdv].flatMap((w) => onPlay(w, 'err')),
  ]
  // the third out on the play: where the runners left on base stopped is written down too (the editor reads it back)
  const outsAfter = s.outs + (plan.batter === 'out' ? 1 : 0) + Object.values(plan.runners).filter((d) => d === 'out').length
  if (outsAfter >= 3) thrown.push(...leftMarks(s.runners.map((r) => ({ row: r.row, base: r.base })), plan.runners, { row: rowIndex, result: plan.result, end: plan.batter }, thrown, base.pitches.length))
  const events = [...(s.plays ?? []).map((e) => ({ ...e })), ...thrown]
  if (events.length) (side === 'us' ? batting : pitching)[rowIndex].events = events
  const next: RecordState = { ...s, batting, pitching }
  const markOut = (row: number, rside: Side, isBatter: boolean) => {
    outs = Math.min(3, outs + 1)
    const r = rside === 'us' ? batting[row] : pitching[row]
    if ((!isBatter || batterOnBases) && rside === 'us') (r as BattingPA).outOnBase += 1
    if (rside === 'us' && (isBatter ? batterOnBases && plan.batterRunningOut : plan.runningOuts?.includes(row))) { const b = r as BattingPA; b.baserunningOuts = (b.baserunningOuts ?? 0) + 1 }
    r.code = ROMAN[outs - 1]
  }
  const markRun = (row: number, rside: Side) => {
    const r = rside === 'us' ? batting[row] : pitching[row]
    // an opponent run: worked out from the inning below; this is what stands when the inning cannot be followed
    if (rside === 'us') { (r as BattingPA).run = 1; r.code = 'R' } else r.code = UNEARNED_REACH.has(r.result) || errAdv.has(row === rowIndex ? 'batter' : row) ? 'R' : 'ER'
  }
  // runners first, lead runner first, then the batter
  const runners: Runner[] = []
  for (const r of [...s.runners].sort((a, b) => b.base - a.base)) {
    const d = plan.runners[r.row] ?? r.base
    if (d === 'out') markOut(r.row, r.side, false)
    else if (d === 'home') markRun(r.row, r.side)
    else runners.push({ ...r, base: d })
  }
  const batterName = side === 'us' ? (s.lineup[s.slot]?.name ?? '') : (oppBatterOf(s) || `對方 ${s.oppOrder} 棒`)
  if (plan.batter === 'out') markOut(rowIndex, side, true)
  else if (plan.batter === 'home') markRun(rowIndex, side)
  else runners.push({ base: plan.batter, side, row: rowIndex, name: batterName })
  if (side === 'opp') {
    // 自責／非自責: the calls made on this play are kept by hand; every run of the inning that was not called by hand
    // follows the rules on the inning as it now stands (a later home run can make an earlier run earned)
    const byHand = { ...s.earnedByHand }
    for (const [who, on] of Object.entries(plan.earnedBy ?? {})) byHand[who === 'batter' ? rowIndex : Number(who)] = on
    next.earnedByHand = byHand
    recallEarned(pitching, s.inning, byHand)
  }
  next.outs = outs
  next.runners = runners.sort((a, b) => b.base - a.base)
  next.pitches = []
  delete next.priorPitchers
  if (side === 'opp') { delete next.oppPrAt; delete next.oppPh2 }
  next.extras = { ...EXTRAS0 }
  next.plays = []
  if (side === 'us') next.slot = (s.slot + 1) % s.lineup.length
  else { next.oppOrder = (s.oppOrder % 9) + 1; next.oppBatter = '' }
  return outs >= 3 ? endHalf(next) : next
}

/** 自責／非自責 of every opponent run of `inning` not called by hand, by the rules on the inning as it now stands
 *  (record/earned.ts); `pitching` is changed in place. */
function recallEarned(pitching: PitchingPA[], inning: number, byHand: Record<number, boolean> = {}) {
  const idx = pitching.flatMap((p, i) => (p.inning === inning && !isNoBatter(p) ? [i] : []))
  const half = inferHalf(pitching, idx, 'pit')
  const calls = half ? earnedCalls(pitching, half) : new Map<number, { earned: boolean }>()
  for (const i of idx) {
    const p = pitching[i]
    if (p.code !== 'R' && p.code !== 'ER') continue
    const on = byHand[i] ?? calls.get(i)?.earned
    if (on !== undefined && p.code !== (on ? 'ER' : 'R')) pitching[i] = { ...p, code: on ? 'ER' : 'R' }
  }
}

/** A run by someone who got on this way is never earned; one that came in on these plays most likely is not. */
const UNEARNED_REACH = new Set(['失誤', '妨礙', TIEBREAK])
const AIDED_KINDS = new Set<string>(['pb', 'err'])

/**
 * A reliever who came in this half-inning and makes an out on the bases before he has a row of his own (the 牽制出局 of
 * the runner he inherited, a 盜壘阻殺) has no plate appearance to hold that out, and the row before it is the pitcher he
 * replaced — who would be credited with it. So he gets a 換投後未面對打者 row (types.RELIEF) now, with the outs as they stand
 * (the out about to be made is the next one), and his later plays and a half that ends on this out land on it.
 * Only while we field and only when the last row of the inning is another pitcher's.
 */
function withReliefRow(s: RecordState): RecordState {
  if (offense(s) !== 'opp' || !s.pitcher) return s
  let last = -1
  s.pitching.forEach((p, i) => { if (p.inning === s.inning) last = i })
  if (last < 0 || s.pitching[last].pitcher === s.pitcher) return s
  const row: PitchingPA = { gameId: s.game.id, inning: s.inning, outsBefore: s.outs, basesBefore: basesString(s.runners), pitcher: s.pitcher, pitches: [], result: RELIEF, sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 }
  return { ...s, pitching: [...s.pitching, row] }
}

/** throw = 趁傳進壘: moved up on a throw (to another base, or back to the pitcher); no stat, the runner just advances.
 *  bk = 投手犯規 (balk): every runner moves up one (see balk); no column, BK is counted from the plays. */
export type RunnerEvent = 'sb' | 'cs' | 'wp' | 'pb' | 'err' | 'throw' | 'pk' | 'pkSafe' | 'advance' | 'score' | 'out' | 'bk' | 'di' | 'pocs'

/** Something happened to a runner between pitches. `logAs` names the move in the play log when it differs from what
 *  is counted (the other runners moving on one wild pitch advance on that wild pitch, counted once). */
export function runnerEvent(s: RecordState, row: number, side: Side, ev: RunnerEvent, logAs?: RunnerEvent, errBy?: string, outAt?: OutAt): RecordState {
  let runner = s.runners.find((r) => r.row === row && r.side === side)
  if (!runner) return s
  // an out on the bases by a reliever who has no row yet gets him one first (withReliefRow)
  if (side === 'opp' && (ev === 'cs' || ev === 'pk' || ev === 'out' || ev === 'pocs')) s = withReliefRow(s)
  // moving up into an occupied base pushes the runner ahead first: a double steal credits both, a wild pitch or an
  // error just moves him along (counted once), so two runners never share a base
  if (ev === 'sb' || ev === 'wp' || ev === 'pb' || ev === 'bk' || ev === 'err' || ev === 'throw' || ev === 'advance' || ev === 'di') {
    const ahead = runner.base < 3 ? s.runners.find((x) => x.side === side && x.base === runner!.base + 1) : undefined
    if (ahead) {
      s = runnerEvent(s, ahead.row, side, ev === 'sb' || ev === 'di' ? ev : 'advance', ev === 'wp' || ev === 'pb' || ev === 'bk' ? ev : undefined)
      if (s.outs >= 3 || offense(s) !== side) return s
      runner = s.runners.find((r) => r.row === row && r.side === side)
      if (!runner) return s
    }
  }
  const batting = s.batting.map((p) => ({ ...p }))
  const pitching = s.pitching.map((p) => ({ ...p }))
  const extras = { ...s.extras }
  let outs = s.outs
  const r = side === 'us' ? batting[row] : pitching[row]
  const at = runner.base
  const advance = (n: number): Dest => { const b = at + n; return b >= 4 ? 'home' : (b as Base) }
  let dest: Dest = runner.base
  switch (ev) {
    case 'sb': dest = advance(1); if (side === 'us') (r as BattingPA).sb += 1; else extras.sba += 1; break
    case 'cs': dest = 'out'; if (side === 'us') (r as BattingPA).cs += 1; else extras.cs += 1; break
    case 'wp': dest = advance(1); if (side === 'opp') extras.wp += 1; break
    case 'pb': dest = advance(1); if (side === 'opp') extras.pb += 1; break
    case 'bk': dest = advance(1); break
    // 失誤進壘: one error — theirs while we bat (whose, or 不知道), ours while we field (whose: the recorder picks)
    case 'err': dest = advance(1)
      if (side === 'us') { (r as BattingPA).advOnError += 1; extras.oppErrors = [...(extras.oppErrors ?? []), errBy || UNKNOWN_FIELDER] }
      else if (errBy) extras.errors = [...(extras.errors ?? []), errBy]
      break
    case 'pk': dest = 'out'; if (side === 'us') (r as BattingPA).outOnBase += 1; else extras.pk += 1; break
    // 牽制後盜壘失敗 (picked off, then caught going to the next base): the runner's 盜壘失敗, the pitcher's 牽制出局 —
    // the pitcher and the first baseman make the play, not the catcher
    case 'pocs': dest = 'out'; if (side === 'us') (r as BattingPA).cs += 1; else extras.pk += 1; break
    case 'pkSafe': extras.pka = (extras.pka ?? 0) + 1; break
    // 守備無視: the defence let him go — no stolen base
    case 'throw': case 'advance': case 'di': dest = advance(1); break
    case 'score': dest = 'home'; break
    case 'out': dest = 'out'; if (side === 'us') { const b = r as BattingPA; b.outOnBase += 1; b.baserunningOuts = (b.baserunningOuts ?? 0) + 1 } break
  }
  let runners = s.runners.filter((x) => x !== runner)
  if (dest === 'out') { outs = Math.min(3, outs + 1); r.code = ROMAN[outs - 1] }
  // (an opponent run between pitches: called again by the rules once this plate appearance is sent)
  else if (dest === 'home') { if (side === 'us') { (r as BattingPA).run = 1; r.code = 'R' } else r.code = (s.earnedByHand?.[row] ?? !(AIDED_KINDS.has(logAs ?? ev) || UNEARNED_REACH.has(r.result))) ? 'ER' : 'R' }
  else runners = [...runners, { ...runner, base: dest }]
  const plays = dest === at ? s.plays : [...(s.plays ?? []), { at: s.pitches.length, kind: logAs ?? ev, from: at, to: dest, ...(dest === 'out' && ev === 'out' && outAt ? { outAt } : {}) }]
  const next: RecordState = { ...s, batting, pitching, extras, outs, plays, runners: runners.sort((a, b) => b.base - a.base) }
  return outs >= 3 ? endHalf(next) : next
}

/** 暴投 / 捕逸 from the pitch row: the runners in `rows` (default: all) move up one, lead runner first, and the
 *  pitch is counted once. A runner left out stays put unless the one behind him has to take his base. */
export function wildPitch(s: RecordState, kind: 'wp' | 'pb', rows?: number[]): RecordState {
  const side = offense(s)
  const moving = s.runners.filter((r) => r.side === side && (!rows || rows.includes(r.row))).sort((a, b) => b.base - a.base).map((r) => r.row)
  if (!moving.length) return addExtra(s, kind)
  // the pitch is counted on the last (trailing) runner's move; the others just advance
  moving.forEach((row, i) => { s = runnerEvent(s, row, side, i === moving.length - 1 ? kind : 'advance', kind) })
  return s
}

/**
 * 投手犯規 (balk) with runners on: every runner of the side at bat moves up one base, lead runner first, and the
 * pitch does not count (the plate appearance goes on). Logged once per runner as a 'bk' play; a run that scores on
 * it is earned and nobody's RBI. With nobody on there is no balk (that pitch is a ball), so nothing happens.
 */
export function balk(s: RecordState): RecordState {
  const side = offense(s)
  const moving = s.runners.filter((r) => r.side === side).sort((a, b) => b.base - a.base).map((r) => r.row)
  for (const row of moving) { if (offense(s) !== side || s.outs >= 3) break; s = runnerEvent(s, row, side, 'bk') }
  return s
}

/** Correct the RBI of one of our plate appearances after it was sent (a run scored on it was entered later). */
export function setRbi(s: RecordState, index: number, rbi: number): RecordState {
  // (a 突破僵局 runner did not bat: never an RBI)
  if (!s.batting[index] || isPlaced(s.batting[index])) return s
  return { ...s, batting: s.batting.map((p, i) => (i === index ? { ...p, rbi: Math.max(0, Math.min(4, rbi)) } : p)) }
}

/** Correct their batter's RBI after it was sent (the same as setRbi for ours). */
export function setOppRbi(s: RecordState, index: number, rbi: number): RecordState {
  const p = s.pitching[index]
  if (!p || isPlaced(p)) return s
  const n = Math.max(0, Math.min(4, rbi))
  return { ...s, pitching: s.pitching.map((x, i) => { if (i !== index) return x; const { rbi: _r, ...rest } = x; void _r; return n ? { ...rest, rbi: n } : rest }) }
}

/** Flip an opponent run between earned (ER) and unearned (R). */
export function toggleEarned(s: RecordState, row: number): RecordState {
  const p = s.pitching[row]
  if (!p || (p.code !== 'R' && p.code !== 'ER')) return s
  const code = p.code === 'ER' ? 'R' : 'ER'
  // called by hand: later plate appearances leave it alone
  return { ...s, pitching: s.pitching.map((x, i) => (i === row ? { ...x, code } : x)), earnedByHand: { ...s.earnedByHand, [row]: code === 'ER' } }
}

/**
 * The plate appearance in progress gets no row when the half or the game ends before it is sent (the third out on
 * the bases, 結束半局, a walk-off balk or wild pitch). What only it would have carried goes on the half's last row of
 * the side at bat instead, so it is not lost: our pitcher's 被盜壘／阻殺／暴投／捕逸／牽制出局 and errors, and the
 * 投手犯規 plays (BK is counted from them), written as plays on that row's last play, like where the runners ended.
 * (The other runner plays are already counted on the runners' own rows; the timeline folds them into that row.)
 * Only when our pitcher on the mound pitched that row: a reliever who came in during this plate appearance has no
 * row yet, so his balk, wild pitch or pickoff is dropped rather than charged to the pitcher he replaced.
 */
export function settlePending(s: RecordState): RecordState {
  const side = offense(s)
  const rows: Array<BattingPA | PitchingPA> = side === 'us' ? s.batting : s.pitching
  let last = -1
  rows.forEach((r, i) => { if (r.inning === s.inning) last = i })
  if (side === 'opp' && last >= 0 && (rows[last] as PitchingPA).pitcher !== s.pitcher) last = -1
  // (a 失誤進壘 between pitches: its error is kept in the row's list — 守備失誤 / 對方失誤 — and the runner's own row has
  // the base; the play itself is not, the timeline would read it as a move on the batted ball)
  const bk = (s.plays ?? []).filter((e) => e.kind === 'bk')
  const x = s.extras
  const counts = side === 'opp' ? (x.sba || x.cs || x.wp || x.pb || x.pk || x.errors?.length) : x.oppErrors?.length
  if (last < 0 || (!bk.length && !counts)) return { ...s, subs: settlePaSubs(s, false), plays: [], extras: { ...EXTRAS0 } }
  const r = rows[last]
  const events = bk.length ? [...(r.events ?? []), ...bk.map((e) => ({ ...e, at: r.pitches.length, play: true as const }))] : r.events
  const row = { ...r, ...(events ? { events } : {}) }
  if (side === 'us') {
    const b = row as BattingPA
    const errors = [...(b.errors ?? []), ...(x.oppErrors ?? [])]
    return { ...s, batting: s.batting.map((q, i) => (i === last ? { ...b, ...(errors.length ? { errors } : {}) } : q)), plays: [], extras: { ...EXTRAS0 } }
  }
  const p = row as PitchingPA
  const errors = withOurErrors(p.errors, x.errors ?? [], p.result, p.loc)
  const settled: PitchingPA = { ...p, sba: p.sba + x.sba, cs: p.cs + x.cs, wp: p.wp + x.wp, pb: p.pb + x.pb, pk: p.pk + x.pk, ...(errors.length ? { errors } : {}) }
  return { ...s, pitching: s.pitching.map((q, i) => (i === last ? settled : q)), subs: settlePaSubs(s, true), plays: [], extras: { ...EXTRAS0 } }
}

/**
 * The count in progress as a 未完成打席 row (the half or the game ended before the plate appearance did): its pitches
 * (counted for the pitcher who threw them, no plate appearance). The batter stays up (he leads off next time). Called
 * after settlePending, which put the plays' counts on the half's last row.
 */
export function unfinishedRow(s: RecordState): RecordState {
  if (!s.pitches.length) return s
  const base = { gameId: s.game.id, inning: s.inning, outsBefore: s.outs, basesBefore: basesString(s.runners), pitches: s.pitches.slice(), result: UNFINISHED }
  if (offense(s) === 'us') {
    const slot = s.lineup[s.slot]
    const row: BattingPA = { ...base, order: s.slot + 1, batter: slot?.name ?? '', ...(slot?.pos ? { pos: slot.pos } : {}), sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...oppFields(s.oppPitcher) }
    return { ...s, batting: [...s.batting, row], pitches: [] }
  }
  if (!s.pitcher) return s
  const row: PitchingPA = { ...base, pitcher: s.pitcher, sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...(s.priorPitchers?.length ? { priorPitchers: s.priorPitchers.map((p) => ({ ...p })) } : {}) }
  return { ...s, pitching: [...s.pitching, row], pitches: [] }
}

/** End the half-inning: runners left on base get L, sides switch, inning advances after the bottom half. */
export function endHalf(s: RecordState): RecordState {
  // the count on the batter when the half ended between pitches (a 盜壘失敗 or 牽制 for the third out): those pitches were
  // thrown — a 未完成打席 row holds them (no plate appearance), on either side
  s = unfinishedRow(settlePending(s))
  const batting = s.batting.map((p) => ({ ...p }))
  const pitching = s.pitching.map((p) => ({ ...p }))
  for (const r of s.runners) { const row = r.side === 'us' ? batting[r.row] : pitching[r.row]; if (!row.code) row.code = 'L' }
  // their half over (the third out between pitches, or 結束半局): the inning is complete now, so its runs are called
  // again the way the saved game reads them
  if (offense(s) === 'opp') recallEarned(pitching, s.inning, s.earnedByHand)
  const { priorPitchers: _pp, oppPrAt: _pr, oppPh2: _ph, ...kept } = s
  void _pp; void _pr; void _ph
  return { ...kept, batting, pitching, runners: [], outs: 0, pitches: [], extras: { ...EXTRAS0 }, plays: [], half: s.half === 'top' ? 'bottom' : 'top', inning: s.half === 'bottom' ? s.inning + 1 : s.inning }
}

export interface Score { us: number; opp: number; lineUs: number[]; lineOpp: number[] }
export function score(s: RecordState): Score {
  const n = Math.max(s.inning, s.game.innings ?? 0)
  const lineUs = Array.from({ length: n }, () => 0), lineOpp = Array.from({ length: n }, () => 0)
  for (const p of s.batting) if (p.run) lineUs[p.inning - 1] += p.run
  for (const p of s.pitching) if (p.code === 'R' || p.code === 'ER') lineOpp[p.inning - 1] += 1
  return { us: lineUs.reduce((a, b) => a + b, 0), opp: lineOpp.reduce((a, b) => a + b, 0), lineUs, lineOpp }
}

/** The 當日登錄名單 this game produces: starters with their batting order (the non-batting pitcher under a DH without one), bench, substitutions. */
export function dayRosterOf(s: RecordState): GameDayRoster {
  const starters: GameDayRoster['starters'] = startersOf(s).flatMap((l, i) => (l.name ? [{ name: l.name, pos: l.pos, order: i + 1 }] : []))
  const sp = startingPitcherOf(s)
  if (sp && !starters.some((x) => x.name === sp)) starters.push({ name: sp, pos: 'P' })
  // the rules it is played by (record/tiebreak tiebreakRuleOf: drafts from before the setting use the team's default)
  const innings = s.game.innings ?? TEAM.innings
  const tbBases = s.tiebreak === undefined ? String(TEAM.tiebreak ?? '').replace(/[^123]/g, '') : s.tiebreak ? s.tiebreak.bases.join('') : ''
  const tbFrom = s.tiebreak === undefined ? (tbBases ? innings + 1 : null) : s.tiebreak?.from ?? null
  return { starters, bench: s.bench ?? [], subs: s.subs ?? [], reentry: !!s.reentry, rules: { innings, tiebreakFrom: tbFrom, tiebreakBases: tbBases } }
}

/** Package the game for saveGame (normalize derives fielding, innings and warnings). */
export function toGameEdit(s: RecordState, extra: Partial<Game> = {}): GameEdit {
  // a game that ended in the middle of a plate appearance (a walk-off balk): what it had goes on the last row
  // (the pitches of the count it ended in: a 未完成打席 row)
  if (s.finished) s = unfinishedRow(settlePending(s))
  // ended in the middle of a half-inning (a walk-off, time called): the runners still on are left on base, as 結束半局 does
  if (s.finished && s.runners.length) {
    const batting = s.batting.map((p) => ({ ...p })), pitching = s.pitching.map((p) => ({ ...p }))
    for (const r of s.runners) { const row = r.side === 'us' ? batting[r.row] : pitching[r.row]; if (row && !row.code) row.code = 'L' }
    s = { ...s, batting, pitching }
  }
  const played = Math.max(1, ...s.batting.map((p) => p.inning), ...s.pitching.map((p) => p.inning))
  // only drafts started with the roster fields know the bench; older ones keep whatever the game already had
  const roster = s.starters ? { dayRoster: dayRosterOf(s) } : {}
  return { game: { ...s.game, innings: s.finished ? played : s.game.innings ?? played, ...roster, ...extra }, batting: s.batting, pitching: s.pitching, fielding: [] }
}

/** G+YYYYMMDD-NN, NN = next free sequence for that date. */
export function nextGameId(date: string, existing: string[]): string {
  const prefix = `G${date.replace(/-/g, '')}-`
  let n = 1
  while (existing.includes(`${prefix}${String(n).padStart(2, '0')}`)) n++
  return `${prefix}${String(n).padStart(2, '0')}`
}
