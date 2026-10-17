/**
 * 文字轉播: the words of 即時比分 (/live) and of the game page's 文字轉播 tab, in the CPBL style (中職文字轉播, trimmed):
 * one sentence per plate appearance — 「劉哲宏 擊出左外野高飛球，二壘安打，2 分打點；林昱丞、陳威任回本壘得分。」 —, the
 * runner plays between pitches under it (「第 2 球 蘇柏愷盜壘上二壘」), one line per substitution (「更換投手：許振謙 →
 * 梁睿至」), a header per half-inning with its summary (「2 分・3 安打・0 失誤・1 殘壘」, the MLB footer), the score after
 * each scoring play and the out count after each out. Pure: built from the game's rows (a draft or a saved game) and,
 * on /live, the plate appearance in progress. Who ran where comes from record/timeline.ts (inferHalf); a half-inning
 * it cannot follow (older imports without 壘上(前)) drops the runner clauses instead of guessing names.
 *
 * The board's numbers live here too, one format each: the inning 「5局上」 (feed headers in Chinese numerals 「三局上」),
 * the count 「1-2」 (balls first), 「45 球」, a pitcher's line today 「2.1 局 5 安 2 失分 1 四死 3 三振」.
 */
import { HIT_BASE_COUNT, isOppPinchHit, isPA, isPlaced, isRelief, OPP_BATS_LABEL, OPP_HAND_LABEL, OPP_PR_UNNAMED, oppBatterName, POSITION_BY_NUMBER, type BattingPA, type Dataset, type DayRosterSub, type Game, type OppHand, type PAResult, type PitchingPA, type PlayEvent } from './types'
import { WHERE, countBefore } from './gameText'
import { SEASON_START, seasonOfDate } from './seasons'
import { playWhen } from './plays'
import { errorsOf, oppErrorList, oppErrorsOf } from './errors'
import { ipDisplay, pitchingLines } from './stats'
import { count, lastOppName, offense, oppBatterOf, oppStintStart, type Half, type OppPitcher, type RecordState, type Runner } from '../record/model'
import { homesIn, inferHalf, isBatterOutMark, midOf, outsIn, placedBases, stepAfter, type Half as Timeline, type Step } from '../record/timeline'

type Row = BattingPA | PitchingPA
export type FeedSide = 'us' | 'opp'

/* ------------------------------------------------------------------ one format per kind of number */

const ZH = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']
/** 1–12 → 一…十二 (the feed's half headers); beyond that, digits. */
export const zhInning = (n: number): string => (n >= 1 && n <= 12 ? ZH[n] : String(n))
const halfWord = (h: Half) => (h === 'top' ? '上' : '下')
/** The board's inning: 「5局上」. */
export const boardInning = (inning: number, half: Half): string => `${inning}局${halfWord(half)}`
/** 「三局上 我隊進攻」 */
export const halfTitle = (inning: number, half: Half, side: FeedSide): string => `${zhInning(inning)}局${halfWord(half)} ${side === 'us' ? '我隊進攻' : '對方進攻'}`
/** 「2 分・3 安打・0 失誤・1 殘壘」 */
export const halfSummary = (h: { r: number; h: number; e: number; lob: number }): string => `${h.r} 分・${h.h} 安打・${h.e} 失誤・${h.lob} 殘壘`
/** The count, balls first: 「1-2」. */
export const countText = (c: { balls: number; strikes: number }): string => `${c.balls}-${c.strikes}`

/* ------------------------------------------------------------------ pitches */

/** The word of each pitch in the expanded rows (CPBL 「好球沒揮棒」「揮棒落空」), and its one-character token. */
export const PITCH_WORD: Record<string, string> = { B: '壞球', CS: '好球沒揮棒', S: '好球', SS: '揮棒落空', F: '擊出界外球', IP: '擊出' }
export const PITCH_TOKEN: Record<string, string> = { B: '壞', CS: '好', S: '好', SS: '空', F: '界', IP: '擊' }
export const pitchToken = (p: string): string => PITCH_TOKEN[p] ?? p
/** 「壞 好 界」 */
export const pitchTokens = (pitches: string[]): string => pitches.map(pitchToken).join(' ')
/** One row per pitch with the count after it (the pitch put in play keeps the count before it, the MLB way). */
export function pitchList(pitches: string[]): Array<{ n: number; word: string; count: string }> {
  return pitches.map((p, i) => ({ n: i + 1, word: PITCH_WORD[p] ?? p, count: countText(count(p === 'IP' ? pitches.slice(0, i) : pitches.slice(0, i + 1))) }))
}

/* ------------------------------------------------------------------ words for the field */

const OUTFIELD = new Set([7, 8, 9, 78, 89])
/** Where the ball went: outfield and its gaps as is (「左外野」「右中間」), the infield with 方向 (「游擊方向」「三游間方向」). */
export const dirWord = (loc?: number): string => (!loc || !WHERE[loc] ? '' : OUTFIELD.has(loc) ? WHERE[loc] : `${WHERE[loc]}方向`)
const TRAJ_WORD: Record<string, string> = { G: '滾地球', L: '平飛球', F: '高飛球', P: '內野高飛球' }
const FIELDER: Record<string, string> = { P: '投手', C: '捕手', '1B': '一壘手', '2B': '二壘手', '3B': '三壘手', SS: '游擊手', LF: '左外野手', CF: '中外野手', RF: '右外野手' }
/** 「游擊手」; '?' or anything unknown is 「野手」. */
export const fielderWord = (pos?: string): string => (pos && FIELDER[pos]) || '野手'
const BASE_ZH: Record<number, string> = { 1: '一壘', 2: '二壘', 3: '三壘' }
const inField = (t: string) => (t.startsWith('內野') ? t : `內野${t}`)

/* ------------------------------------------------------------------ 3.1 results */

export interface ResultArgs { loc?: number; traj?: string; pitches: string[]; /** 不死三振: the batter reached */ reached?: boolean; /** 失誤: who erred */ fielder?: string; /** 全壘打: his home run number this season */ hrNo?: number }
type ResultFn = (a: ResultArgs) => string

const hit = (name: string): ResultFn => (a) => {
  const label = name === '全壘打' && a.hrNo ? `全壘打（本季第 ${a.hrNo} 支）` : name
  const W = dirWord(a.loc), T = a.traj ? TRAJ_WORD[a.traj] ?? '' : ''
  if (W && T) return `擊出${W}${T}，${label}`
  if (W) return `擊出${WHERE[a.loc!]}方向${label}`
  if (T) return `擊出${T}，${label}`
  return label
}
/** A ball in play with its own ending: 「擊出游擊方向滾地球，出局」; `noLoc` when no 落點 was recorded. */
const play = (traj: (t?: string) => string, end: string, noLoc: (T: string) => string): ResultFn => (a) => {
  const T = traj(a.traj)
  const W = dirWord(a.loc)
  return W ? `擊出${W}${T}，${end}` : noLoc(T)
}
const tw = (dflt: string) => (t?: string) => TRAJ_WORD[t ?? dflt] ?? TRAJ_WORD[dflt]
const flyOr = (base: string) => (t?: string) => (t === 'L' ? '平飛球' : base)
const strike = (a: ResultArgs) => { const last = a.pitches[a.pitches.length - 1]; return last === 'SS' ? '揮棒落空，' : last === 'CS' || last === 'S' ? '好球沒揮棒，' : '' }

/** Every result chip's sentence (CPBL wording, trimmed). A new result in PA_RESULTS fails to compile until it has one. */
export const RESULT_TEXT: Record<PAResult | '突破僵局', ResultFn> = {
  一安: hit('一壘安打'),
  內安: (a) => (a.loc && WHERE[a.loc] ? `擊出${WHERE[a.loc]}方向內野安打` : '內野安打'),
  二安: hit('二壘安打'),
  場地二安: hit('二壘場地安打'),
  三安: hit('三壘安打'),
  全壘打: hit('全壘打'),
  內滾: play(tw('G'), '出局', (T) => `擊出${inField(T)}，出局`),
  內飛: play(flyOr('內野高飛球'), '接殺出局', (T) => `擊出${inField(T)}，接殺出局`),
  外飛: play(flyOr('高飛球'), '接殺出局', (T) => `擊出外野${T}，接殺出局`),
  界外飛: play(() => '界外飛球', '接殺出局', () => '擊出界外飛球，接殺出局'),
  雙殺: play(tw('G'), '雙殺打', (T) => `擊出${inField(T)}，雙殺打`),
  犧觸: play(() => '觸擊球', '犧牲短打', () => '犧牲短打'),
  犧牲: play(() => '觸擊球', '犧牲短打', () => '犧牲短打'),
  犧飛: play(flyOr('高飛球'), '犧牲飛球', () => '犧牲飛球'),
  野選: play(tw('G'), '野手選擇上壘', () => '野手選擇上壘'),
  失誤: (a) => {
    const F = fielderWord(a.fielder)
    const W = dirWord(a.loc), T = a.traj ? TRAJ_WORD[a.traj] ?? '' : ''
    return W && T ? `擊出${W}${T}，${F}失誤上壘` : `${F}失誤上壘`
  },
  三振: (a) => `${strike(a)}${a.reached ? '不死三振上壘' : '三振出局'}`,
  保送: () => '四壞球上壘',
  故四: () => '故意四壞球上壘',
  觸身: () => '觸身死球上壘',
  妨礙: () => '捕手妨礙打擊上壘',
  突破僵局: () => '突破僵局上壘',
}

const OUT_CODES = new Set(['I', 'II', 'III'])
const BATTER_OUTS = new Set(['三振', '內滾', '內飛', '外飛', '界外飛', '犧觸', '犧牲', '犧飛', '雙殺'])
/** Who erred on a 失誤 result: the fielder at its 落點, else the first one the row lists (ours or theirs). */
export function errFielder(row: Row, side: FeedSide): string | undefined {
  const own = row.loc ? POSITION_BY_NUMBER[row.loc] : undefined
  if (own) return own
  return side === 'opp' ? errorsOf(row as PitchingPA).positions[0] : oppErrorList(row as BattingPA)[0]
}

/**
 * The result part of a sentence, with the RBI: 「擊出左外野高飛球，二壘安打，2 分打點」 (no batter, no period).
 * `reached` (不死三振) defaults to the row's code: a 三振 with a code that is not an out.
 */
export function resultText(row: Row, side: FeedSide, opts: { reached?: boolean; hrNo?: number } = {}): string {
  const r = row.result
  if (!r) return ''
  const fn = (RESULT_TEXT as Record<string, ResultFn>)[r]
  const reached = opts.reached ?? (r === '三振' && !!row.code && !OUT_CODES.has(row.code))
  const base = fn ? fn({ loc: row.loc, traj: row.traj, pitches: row.pitches ?? [], reached, fielder: r === '失誤' ? errFielder(row, side) : undefined, hrNo: opts.hrNo }) : r
  const rbi = row.rbi ?? 0
  return rbi > 0 && !isPlaced(row) ? `${base}，${rbi} 分打點` : base
}

/** The batter as the feed names him: ours by name; theirs by name, else 「對方第 3 棒」, else 「對方打者」. */
export function batterLabel(row: Row, side: FeedSide): string {
  if (side === 'us') return (row as BattingPA).batter || '打者'
  const p = row as PitchingPA
  return oppBatterName(p.oppBatter) || (p.oppOrder ? `對方第 ${p.oppOrder} 棒` : '對方打者')
}
/** The batter beside his order chip: an opponent known only by his order is 「對方打者」 (the chip already says 第 7 棒). */
export const chipWho = (who: string, order?: number): string => (order && who === `對方第 ${order} 棒` ? '對方打者' : who)
/** The runner of a row: his pinch runner once there is one (ours by name; theirs by name or 「代跑」), else the batter. */
export function runnerLabel(row: Row, side: FeedSide): string {
  if (row.runner) return row.runner === OPP_PR_UNNAMED ? '代跑' : row.runner
  return batterLabel(row, side)
}
/** 「劉哲宏 擊出左外野高飛球，二壘安打，2 分打點；林昱丞回本壘得分。」 */
export function paSentence(row: Row, side: FeedSide, opts: { clauses?: string[]; reached?: boolean; hrNo?: number } = {}): string {
  const t = resultText(row, side, opts)
  if (!t) return ''
  return `${batterLabel(row, side)} ${t}${opts.clauses?.length ? `；${opts.clauses.join('，')}` : ''}。`
}

/* ------------------------------------------------------------------ 3.3 runner plays between pitches */

const PLAY_PHRASE: Record<string, { base?: string; home?: string; out?: string }> = {
  sb: { base: '盜壘上', home: '盜壘回本壘得分' },
  cs: { out: '盜壘刺出局' },
  wp: { base: '投手暴投上', home: '投手暴投回本壘得分' },
  pb: { base: '捕手捕逸上', home: '捕手捕逸回本壘得分' },
  bk: { base: '投手犯規上', home: '投手犯規回本壘得分' },
  err: { base: '因失誤上', home: '因失誤回本壘得分' },
  throw: { base: '趁傳上', home: '趁傳回本壘得分' },
  pk: { out: '遭牽制出局' },
  advance: { base: '上', home: '回本壘得分' },
  score: { base: '上', home: '回本壘得分' },
  out: { out: '跑壘出局' },
}
const CAUSE: Record<string, string> = { sb: '盜壘', cs: '盜壘失敗', wp: '投手暴投', pb: '捕手捕逸', bk: '投手犯規', err: '失誤', throw: '趁傳', pk: '牽制', advance: '進壘', score: '得分', out: '跑壘', outPlay: '' }
const destPlain = (to: PlayEvent['to']) => (to === 'home' ? '回本壘得分' : to === 'out' ? '出局' : `上${BASE_ZH[to]}`)
/** One runner's play: 「盜壘上二壘」「投手暴投回本壘得分」「遭牽制出局」. */
export function playPhrase(kind: string, to: PlayEvent['to']): string {
  const p = PLAY_PHRASE[kind]
  if (to === 'out') return p?.out ?? `${CAUSE[kind] ?? kind}出局`
  if (to === 'home') return p?.home ?? `${CAUSE[kind] ?? kind}回本壘得分`
  return p?.base ? `${p.base}${BASE_ZH[to]}` : `${CAUSE[kind] ?? kind}上${BASE_ZH[to]}`
}
/** The battery's plays read cause first (CPBL 「投手暴投，一壘跑者上二壘」): 「對方第 3 棒投手暴投…」 would read as their pitcher. */
const CAUSE_FIRST = new Set(['wp', 'pb', 'bk'])
/**
 * Plays on one pitch, one sentence: 「林昱丞盜壘上二壘」, 「投手暴投，林昱丞回本壘得分」, or several runners on the same play
 * 「投手暴投：林昱丞回本壘得分，陳威任上三壘」.
 */
export function playsSentence(kind: string, runners: Array<{ name: string; to: PlayEvent['to'] }>): string {
  if (runners.length === 1 && CAUSE_FIRST.has(kind)) return `${CAUSE[kind]}，${runners[0].name}${destPlain(runners[0].to)}`
  if (runners.length === 1) return `${runners[0].name}${playPhrase(kind, runners[0].to)}`
  return `${CAUSE[kind] ?? kind}：${runners.map((r) => `${r.name}${destPlain(r.to)}`).join('，')}`
}
interface NamedMove { at: number; kind: string; name: string; to: PlayEvent['to'] }
/** Moves grouped by pitch and kind: `body` 「林昱丞盜壘上二壘」, `text` with its 「第 n 球」 in front. */
function groupMoves(moves: NamedMove[]): Array<{ at: number; body: string; text: string; runs: number; outs: number }> {
  const out: Array<{ at: number; body: string; text: string; runs: number; outs: number }> = []
  let i = 0
  while (i < moves.length) {
    let j = i + 1
    while (j < moves.length && moves[j].at === moves[i].at && moves[j].kind === moves[i].kind) j++
    const g = moves.slice(i, j)
    const body = playsSentence(g[0].kind, g)
    out.push({ at: g[0].at, body, text: `${playWhen(g[0].at)} ${body}`, runs: g.filter((m) => m.to === 'home').length, outs: g.filter((m) => m.to === 'out').length })
    i = j
  }
  return out
}

/* ------------------------------------------------------------------ 3.5 substitutions */

/** 「更換投手：許振謙 → 梁睿至」「更換守備：A → B（中外野手）」 */
export function subText(sub: Pick<DayRosterSub, 'kind' | 'in' | 'out' | 'pos'>): string {
  switch (sub.kind) {
    case 'P': return `更換投手：${sub.out} → ${sub.in}`
    case 'PH': return `更換代打：${sub.out} → ${sub.in}`
    case 'PR': return `更換代跑：${sub.out} → ${sub.in}`
    // (a position-only change: the same player in and out)
    default: if (sub.in && sub.in === sub.out) return `守備異動：${sub.in} 改守${FIELDER[sub.pos] ?? (sub.pos || '其他位置')}`
      return `更換守備：${sub.out} → ${sub.in}${FIELDER[sub.pos] ? `（${FIELDER[sub.pos]}）` : ''}`
  }
}
/** 「右投 王」, 「左投」, 「王」, '' */
export const oppPitcherName = (p?: { name?: string; hand?: OppHand }): string => [p?.hand ? OPP_HAND_LABEL[p.hand] : '', p?.name ?? ''].filter(Boolean).join(' ')
const oppPitcherKey = (p: { oppPitcher?: string; oppHand?: OppHand }) => `${p.oppPitcher ?? ''}|${p.oppHand ?? ''}`
export const oppPitchSub = (from: string, to: string) => `對方更換投手：${from || '對方投手'} → ${to || '對方投手'}`
export const oppPinchHitSub = (from: string, name: string) => `對方更換代打：${from} → ${name || '代打'}`
export const oppPinchRunSub = (from: string, runner: string) => `對方更換代跑：${from} → ${runner === OPP_PR_UNNAMED || !runner ? '代跑' : runner}`

/**
 * The opponent pitcher each of these plate appearances was the first one against (keyed by row index): 「對方先發・右投 王」,
 * later 「對方換投・左投 林」. Rows without any opponent pitcher are skipped (the next one with one starts a new stint).
 */
export function oppPitcherMarks(pas: BattingPA[]): Map<number, string> {
  const out = new Map<number, string>()
  const seen = new Map<string, string>()   // game → the last opponent pitcher key
  pas.forEach((p, i) => {
    if ((!p.oppHand && !p.oppPitcher) || isPlaced(p)) return
    const key = oppPitcherKey(p)
    const was = seen.get(p.gameId)
    if (was === key) return
    out.set(i, `${was === undefined ? '對方先發' : '對方換投'}・${oppPitcherName({ name: p.oppPitcher, hand: p.oppHand })}`)
    seen.set(p.gameId, key)
  })
  return out
}

/* ------------------------------------------------------------------ the feed */

export interface LiveSource {
  inning: number; half: Half; outs: number; pitches: string[]; plays: PlayEvent[]; runners: Runner[]
  /** bats: their batter's 左打／右打 when picked (record/model oppBatsBySlot) */
  batter: { order: number; label: string; bats?: string }
  /** our pitcher on the mound (their half), the opponent pitcher now (ours), their batter's raw name (a 代打 mark) */
  pitcher?: string; oppPitcher?: OppPitcher; oppBatter?: string
  /** 準備上場: the batting team's first three, shown on the half's header before anything happened in it */
  dueUp?: string
}
export interface FeedSource {
  homeAway: '主' | '客'; opponent: string
  batting: BattingPA[]; pitching: PitchingPA[]
  /** RecordState.subs or game.dayRoster.subs */
  subs?: DayRosterSub[]
  /** only on /live */
  live?: LiveSource
  /** our batters' home runs this season before this game (by name), for 「全壘打（本季第 3 支）」 */
  priorHr?: Map<string, number>
}
export interface Score2 { away: number; home: number }
export type FeedItem =
  | { kind: 'pa'; key: string; side: FeedSide; order?: number; who: string; /** (their batter) 左打 / 右打 when recorded */ bats?: string; text: string; meta: string
      pitches: Array<{ n: number; word: string; count: string }>; plays: string[]; /** the same plays without 「第 n 球」, by when they happened (the expanded pitch list) */ moves: Array<{ at: number; text: string }>; pitcher: string
      runs: number; score?: Score2; outs?: number; hr: boolean }
  | { kind: 'event'; key: string; side: FeedSide; text: string; at: number; runs: number; score?: Score2; outs?: number; /** a play of the plate appearance in progress (shown in its block) */ during?: boolean }
  | { kind: 'sub'; key: string; side: FeedSide; text: string }
  | { kind: 'placed'; key: string; side: FeedSide; text: string }
  | { kind: 'live'; key: string; side: FeedSide; who: string; order?: number; bats?: string; count: string; tokens: string; plays: string[]; runs: number; score?: Score2; outs?: number }
export interface FeedHalf {
  key: string; inning: number; half: Half; side: FeedSide; title: string
  /** 「投手 梁睿至」 / 「對方投手 右投 王」 / '' : who started the half */
  pitcher: string
  done: boolean; summary?: string; dueUp?: string
  /** the half's runs (the line score), and whether the timeline could follow it: when not, which plate appearance
   *  brought each run in is only partly known (data/broadcast producedRuns), so 得分 keeps the whole half */
  runs: number; followed: boolean
  /** chronological */
  items: FeedItem[]
}

/** What /live adds to the feed from the draft: the plate appearance in progress. */
export function liveSourceOf(s: RecordState, dueUp?: string): LiveSource {
  const us = offense(s) === 'us'
  const side = us ? undefined : s.oppBatsBySlot?.[s.oppOrder]
  const batter = us ? { order: s.slot + 1, label: s.lineup[s.slot]?.name || '打者' } : { order: s.oppOrder, label: oppBatterName(oppBatterOf(s)) || `對方第 ${s.oppOrder} 棒`, ...(side === 'L' || side === 'R' ? { bats: OPP_BATS_LABEL[side] } : {}) }
  return {
    inning: s.inning, half: s.half, outs: s.outs, pitches: s.pitches, plays: s.plays ?? [], runners: s.runners, batter,
    pitcher: s.pitcher, ...(s.oppPitcher ? { oppPitcher: s.oppPitcher } : {}), ...(s.oppBatter ? { oppBatter: s.oppBatter } : {}), ...(dueUp ? { dueUp } : {}),
  }
}

/** The whole text of an item, as row 最新 shows it. */
export function itemText(it: FeedItem): string {
  if (it.kind === 'pa') return `${it.who} ${it.text}`
  if (it.kind === 'live') return `${it.who} 打擊中`
  return it.text
}
/** The newest finished item of either side (a plate appearance, or a runner play / substitution after it). */
export function latestItem(halves: FeedHalf[]): FeedItem | null {
  for (let h = halves.length - 1; h >= 0; h--) {
    const items = halves[h].items
    for (let i = items.length - 1; i >= 0; i--) if (items[i].kind !== 'live') return items[i]
  }
  return null
}
/** Did it score? (the 得分 filter) */
export const scoredItem = (it: FeedItem): boolean => (it.kind === 'pa' || it.kind === 'event' || it.kind === 'live') && it.runs > 0

const ord = (inning: number, half: Half) => inning * 2 + (half === 'bottom' ? 1 : 0)
const halfOf = (side: FeedSide, weTop: boolean): Half => ((side === 'us') === weTop ? 'top' : 'bottom')

interface Anchors { before: Map<string, FeedItem[]>; start: Map<string, FeedItem[]>; live: Map<string, FeedItem[]>; end: Map<string, FeedItem[]> }
const push = (m: Map<string, FeedItem[]>, k: string, it: FeedItem) => { const l = m.get(k); if (l) l.push(it); else m.set(k, [it]) }
const hkey = (inning: number, half: Half) => `${inning}${half}`

/** Where each substitution goes (none is stored with its plate appearance, so it is inferred; see the header). */
function placeSubs(src: FeedSource, weTop: boolean): Anchors {
  const a: Anchors = { before: new Map(), start: new Map(), live: new Map(), end: new Map() }
  const { batting, pitching, live } = src
  const liveHalf = live ? hkey(live.inning, live.half) : ''
  const liveSide: FeedSide | null = live ? ((live.half === 'top') === weTop ? 'us' : 'opp') : null
  const nextPA = (rows: Row[], from: number, inning: number) => { for (let k = from + 1; k < rows.length; k++) { if (rows[k].inning !== inning) return -1; if (isPA(rows[k])) return k } return -1 }
  ;(src.subs ?? []).forEach((sub, n) => {
    const side: FeedSide = sub.kind === 'P' ? 'opp' : 'us'
    const it: FeedItem = { kind: 'sub', key: `sub:${n}`, side, text: subText(sub) }
    const at = hkey(sub.inning, sub.half)
    if (sub.kind === 'PH') {
      const i = batting.findIndex((b) => b.inning === sub.inning && isPA(b) && b.batter === sub.in)
      if (i >= 0) return push(a.before, `us:${i}`, it)
      if (live && liveSide === 'us' && liveHalf === at && live.batter.label === sub.in) return push(a.live, liveHalf, it)
      return push(a.end, at, it)
    }
    if (sub.kind === 'P') {
      // before the first row he pitched, at or after the half it was logged in (a change between innings is logged
      // while we bat and shows at the top of their next half); a change in the middle of a plate appearance goes before it
      const from = ord(sub.inning, sub.half)
      const i = pitching.findIndex((p) => p.pitcher === sub.in && ord(p.inning, halfOf('opp', weTop)) >= from)
      if (i >= 0) return isPA(pitching[i]) ? push(a.before, `opp:${i}`, it) : push(a.start, hkey(pitching[i].inning, halfOf('opp', weTop)), it)
      if (live && liveSide === 'opp' && ord(live.inning, live.half) >= from) return push(a.live, liveHalf, it)
      return push(a.end, at, it)
    }
    if (sub.kind === 'PR') {
      const j = batting.findIndex((b) => b.inning === sub.inning && b.runner === sub.in)
      const k = j >= 0 ? nextPA(batting, j, sub.inning) : -1
      if (k >= 0) return push(a.before, `us:${k}`, it)
      if (live && liveSide === 'us' && j >= 0 && liveHalf === hkey(batting[j].inning, halfOf('us', weTop))) return push(a.live, liveHalf, it)
      return push(a.end, j >= 0 ? hkey(batting[j].inning, halfOf('us', weTop)) : at, it)
    }
    push(a.start, at, it)
  })
  // the opponent's changes have no log: read them off the rows
  let stint: string | undefined, stintText = ''
  batting.forEach((b, i) => {
    if ((!b.oppHand && !b.oppPitcher) || isPlaced(b)) return
    const key = oppPitcherKey(b), text = oppPitcherName({ name: b.oppPitcher, hand: b.oppHand })
    if (stint !== undefined && stint !== key) push(a.before, `us:${i}`, { kind: 'sub', key: `oppP:${i}`, side: 'us', text: oppPitchSub(stintText, text) })
    stint = key; stintText = text
  })
  if (live && liveSide === 'us' && stint !== undefined && live.oppPitcher && (live.oppPitcher.name || live.oppPitcher.hand)) {
    const key = oppPitcherKey({ oppPitcher: live.oppPitcher.name, oppHand: live.oppPitcher.hand })
    if (key !== stint) push(a.live, liveHalf, { kind: 'sub', key: 'oppP:live', side: 'us', text: oppPitchSub(stintText, oppPitcherName(live.oppPitcher)) })
  }
  pitching.forEach((p, i) => {
    const from = (order?: number) => lastOppName(pitching.slice(0, i), order ?? 0) || `第 ${order ?? '?'} 棒`
    if (isPA(p) && isOppPinchHit(p.oppBatter)) push(a.before, `opp:${i}`, { kind: 'sub', key: `oppPH:${i}`, side: 'opp', text: oppPinchHitSub(from(p.oppOrder), oppBatterName(p.oppBatter)) })
    if (p.runner) {
      const it: FeedItem = { kind: 'sub', key: `oppPR:${i}`, side: 'opp', text: oppPinchRunSub(oppBatterName(p.oppBatter) || `第 ${p.oppOrder ?? '?'} 棒`, p.runner) }
      const k = nextPA(pitching, i, p.inning)
      const h = hkey(p.inning, halfOf('opp', weTop))
      if (k >= 0) push(a.before, `opp:${k}`, it)
      else if (live && liveSide === 'opp' && liveHalf === h) push(a.live, liveHalf, it)
      else push(a.end, h, it)
    }
  })
  if (live && liveSide === 'opp' && isOppPinchHit(live.oppBatter)) {
    push(a.live, liveHalf, { kind: 'sub', key: 'oppPH:live', side: 'opp', text: oppPinchHitSub(lastOppName(pitching, live.batter.order) || `第 ${live.batter.order} 棒`, oppBatterName(live.oppBatter)) })
  }
  return a
}

/**
 * How a runner was put out after the batter's out, when no play says it (the half ended on the bases before the next
 * batter had a row): a 盜壘失敗 or 牽制 the rows count but no play of that step shows — ours on the runner's row, theirs
 * on the half's last row (record/model settlePending) —, else just 出局.
 */
function laterOut(rows: Row[], runner: number, st: Step, at: number, side: FeedSide): string {
  return laterReason(rows, runner, st, at, side) || '出局'
}
/**
 * The play a count on the rows shows and no play of this step does ('' when there is none): ours 盜壘刺 on the runner's
 * row (and, for the batter himself, whose row counts nothing else of his own plate appearance, 牽制／跑壘出局); theirs
 * 盜壘刺 or 牽制 on the half's last row.
 */
function laterReason(rows: Row[], runner: number, st: Step, at: number, side: FeedSide): string {
  const moves = (kind: string, row?: number) => st.moves.filter((m) => m.kind === kind && (row === undefined || m.row === row)).length
  if (side === 'us') {
    const b = rows[runner] as BattingPA
    if (b.cs > moves('cs', runner)) return '盜壘刺出局'
    // (a batter put out on his own play after reaching carries a mark saying so: that out was not later)
    if (runner === at && b.outOnBase > 0 && !(b.events ?? []).some(isBatterOutMark)) return (b.baserunningOuts ?? 0) > 0 ? '跑壘出局' : '遭牽制出局'
    return ''
  }
  const p = rows[at] as PitchingPA
  return p.cs > moves('cs') ? '盜壘刺出局' : p.pk > moves('pk') ? '遭牽制出局' : ''
}

/**
 * The runs a plate appearance drove in, for a half the timeline cannot follow (who crossed the plate on which play is
 * not known there; a batter's own 得分 is not the play that brought him home): its RBI, a home run at least its own.
 * Runs on errors or wild pitches there are only in the half's summary.
 */
const producedRuns = (r: Row): number => Math.max(r.rbi ?? 0, r.result === '全壘打' ? 1 : 0)

/** A stand-in row for the plate appearance in progress, so the timeline sees its runner plays (and the runs and outs on
 *  them) as its own, not as the end of the last finished plate appearance. */
function liveRow(live: LiveSource, side: FeedSide, inning: number): Row {
  const on = live.runners.filter((r) => r.side === side).map((r) => r.base).sort().join('') || '無'
  return { gameId: '', inning, outsBefore: live.outs, basesBefore: on, pitches: live.pitches, result: '', events: live.plays, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, batter: '', pitcher: '', sba: 0, wp: 0, pb: 0, pk: 0 } as unknown as Row
}

/**
 * The game as 文字轉播, half by half in the order they were played (the UI shows them newest first). Score after a
 * scoring play is the running total, so the last one equals the scoreboard.
 */
export function buildFeed(src: FeedSource): FeedHalf[] {
  const weTop = src.homeAway === '客'
  const sideOf = (half: Half): FeedSide => ((half === 'top') === weTop ? 'us' : 'opp')
  const keys = new Map<string, { inning: number; half: Half }>()
  for (const b of src.batting) keys.set(hkey(b.inning, halfOf('us', weTop)), { inning: b.inning, half: halfOf('us', weTop) })
  for (const p of src.pitching) keys.set(hkey(p.inning, halfOf('opp', weTop)), { inning: p.inning, half: halfOf('opp', weTop) })
  const live = src.live
  if (live) keys.set(hkey(live.inning, live.half), { inning: live.inning, half: live.half })
  const order = [...keys.values()].sort((a, b) => ord(a.inning, a.half) - ord(b.inning, b.half))
  const anchors = placeSubs(src, weTop)
  const total = { us: 0, opp: 0 }
  const scoreNow = (): Score2 => (weTop ? { away: total.us, home: total.opp } : { away: total.opp, home: total.us })
  // our home runs so far this season, by name (only for batters with an earlier game this season)
  const hrSeen = new Map<string, number>()

  return order.map(({ inning, half }) => {
    const side = sideOf(half)
    const tl: 'bat' | 'pit' = side === 'us' ? 'bat' : 'pit'
    const rows: Row[] = side === 'us' ? src.batting : src.pitching
    const idx = rows.flatMap((r, i) => (r.inning === inning && !isRelief(r) ? [i] : []))
    const key = hkey(inning, half)
    const isLive = !!live && live.inning === inning && live.half === half
    const items: FeedItem[] = []
    // the timeline; on /live the plate appearance in progress is a row of its own
    let timeline: Timeline | null = null
    let liveStep: Step | null = null
    if (isLive) {
      const ext = [...rows, liveRow(live!, side, inning)]
      const t = inferHalf(ext, [...idx, rows.length], tl)
      if (t) { liveStep = t.steps[t.steps.length - 1]; timeline = { ...t, steps: t.steps.slice(0, -1) } }
      // (it cannot be followed: no runner clauses in this half)
    } else timeline = idx.length ? inferHalf(rows, idx, tl) : null
    const steps = new Map((timeline?.steps ?? []).map((s) => [s.index, s]))
    // (the half's last plate appearance, when nothing follows it: on /live the one in progress does)
    const lastStep = isLive ? undefined : timeline?.steps.at(-1)
    const name = (row: number) => runnerLabel(rows[row], side)
    const pitcherOf = (r: Row) => (side === 'opp' ? (r as PitchingPA).pitcher : oppPitcherName({ name: (r as BattingPA).oppPitcher, hand: (r as BattingPA).oppHand }) || '對方投手')
    let outs = 0
    // the half's runs, by the line score's rule (our 得分 flags, their R/ER codes)
    const halfRuns = side === 'us' ? idx.reduce((a, i) => a + ((rows[i] as BattingPA).run ?? 0), 0) : idx.filter((i) => rows[i].code === 'R' || rows[i].code === 'ER').length
    // between halves: nobody up yet (the header lists who is due up)
    const fresh = isLive && !idx.length && !live!.pitches.length && !live!.plays.length
    const add = (runs: number) => { if (side === 'us') total.us += runs; else total.opp += runs }

    items.push(...(anchors.start.get(key) ?? []))
    // 突破僵局: one line, lead runner first
    const placed = idx.filter((i) => isPlaced(rows[i]))
    if (placed.length) {
      const bases: Record<number, unknown> = timeline ? Object.fromEntries(placed.map((i) => [i, steps.get(i)?.batter])) : placedBases(rows, idx)
      items.push({ kind: 'placed', key: `placed:${key}`, side, text: `突破僵局：${placed.map((i) => `${batterLabel(rows[i], side)}${typeof bases[i] === 'number' ? `上${BASE_ZH[bases[i] as number]}` : '上壘'}`).join('、')}` })
    }
    for (const i of idx) {
      const r = rows[i]
      if (!isPA(r)) continue
      items.push(...(anchors.before.get(`${side}:${i}`) ?? []))
      const st = steps.get(i)
      const outCode = OUT_CODES.has(r.code ?? '') ? ['I', 'II', 'III'].indexOf(r.code!) + 1 : 0
      let runs = 0, madeOuts = 0
      const clauses: string[] = []
      let moves: ReturnType<typeof groupMoves> = []
      const later: FeedItem[] = []
      let reached: boolean | undefined
      if (st) {
        moves = groupMoves(st.moves.map((m) => ({ at: m.at, kind: m.kind, name: name(m.row), to: m.to })))
        runs = moves.reduce((a, m) => a + m.runs, 0) + homesIn(st)
        madeOuts = outsIn(st)
        const mid = midOf(st)
        const events = r.events ?? []
        const onPlay = (to: PlayEvent['to'], batter: boolean) => events.find((e) => e.play && !!e.batter === batter && (e.kind === 'throw' || e.kind === 'err') && e.to === to)
        const scorers = mid.filter((o) => st.dest[o.row] === 'home')
        if (scorers.length) clauses.push(`${scorers.map((o) => name(o.row)).join('、')}回本壘得分`)
        // The half's last out made on the bases during the next batter's pitches (a 盜壘刺 or a 牽制 before he had a
        // row: record/model settlePending keeps only the counts) is in this step too. When the rows count a play no
        // move shows, the step's last out is that play: its own line after this plate appearance — the batter
        // himself too, when he had reached (his hit stays a hit, a 不死三振 reads 上壘).
        const outNo = (x: number) => ['I', 'II', 'III'].indexOf(rows[x].code ?? '') + 1
        const atPlate = BATTER_OUTS.has(r.result) && r.result !== '三振'
        // runners put out on the result or later with no play to show how
        const loose = mid.filter((o) => st.dest[o.row] === 'out')
        // theirs count the play on the plate appearance's row, not the runner's: a struck-out batter is the one who made
        // it only when no runner of this step was put out unexplained (else that runner was caught, and the batter's
        // strikeout stands)
        const oppK = side === 'opp' && r.result === '三振' && loose.length > 0
        const hiOut = st.outs.length ? Math.max(...st.outs.map(outNo)) : 0
        const lateRow = st === lastStep && hiOut ? st.outs.find((x) => outNo(x) === hiOut && !(x === i && (atPlate || oppK)) && laterReason(rows, x, st, i, side)) : undefined
        const laterLine = (x: number) => {
          later.push({ kind: 'event', key: `ev:${side}:${i}:${x}`, side, at: r.pitches.length, text: `${name(x)}${laterOut(rows, x, st, i, side)}。`, runs: 0, outs: outNo(x) })
          madeOuts--
        }
        const batterOut = st.batter === 'out' && lateRow !== i
        reached = r.result === '三振' ? !batterOut : undefined
        // (a runner put out after the batter's own out, the same way, when nothing counts the play: 「出局」)
        const batterOutNo = batterOut ? outCode : 0
        const isLater = (row: number) => row === lateRow || (!!batterOutNo && outNo(row) > batterOutNo)
        // the play a count shows for a runner put out in the plate appearance: ours on his own row; theirs (one count on
        // the batter's row) for the earliest such out, when no later line took it
        const inPA = loose.filter((o) => !isLater(o.row))
        const oppTaker = side === 'opp' && lateRow === undefined && inPA.length === loose.length && inPA.length
          ? inPA.reduce((a, o) => (outNo(o.row) < outNo(a.row) ? o : a)).row : undefined
        const inPAReason = (row: number) => (side === 'us' || row === oppTaker ? laterReason(rows, row, st, i, side) : '')
        for (const o of mid) {
          const d = st.dest[o.row]
          if (d === 'home' || d === o.base) continue
          if (d === 'out') {
            if (isLater(o.row)) { laterLine(o.row); continue }
            clauses.push(`${name(o.row)}${inPAReason(o.row) || '出局'}`)
            continue
          }
          const e = onPlay(d, false)
          clauses.push(`${name(o.row)}${e ? (e.kind === 'throw' ? '趁傳' : '因失誤') : ''}上${BASE_ZH[d]}`)
        }
        const be = st.batter !== 'out' ? onPlay(st.batter, true) : undefined
        if (be) clauses.push(`打者${be.kind === 'throw' ? '趁傳' : '因失誤'}${destPlain(be.to)}`)
        // a batter who reached and was put out on the same play (thrown out stretching it)
        if (batterOut && !atPlate && r.result !== '三振' && !isPlaced(r)) clauses.push('打者出局')
        if (lateRow === i) laterLine(i)
        later.sort((a, b) => ((a as { outs: number }).outs - (b as { outs: number }).outs))
      } else {
        // no timeline: the row's own code tells whether the batter made an out
        madeOuts = outCode && BATTER_OUTS.has(r.result) ? 1 : 0
        moves = groupMoves((r.events ?? []).filter((e) => !e.play).map((e) => ({ at: e.at, kind: e.kind, name: `${BASE_ZH[e.from]}跑者`, to: e.to })))
      }
      let hrNo: number | undefined
      if (side === 'us' && r.result === '全壘打' && src.priorHr) {
        const b = (r as BattingPA).batter
        if (src.priorHr.has(b)) { const n = (hrSeen.get(b) ?? src.priorHr.get(b)!) + 1; hrSeen.set(b, n); hrNo = n }
      }
      const c = countBefore(r.pitches, r.result)
      const tokens = pitchTokens(r.pitches)
      const meta = !r.pitches.length ? '' : r.pitches[r.pitches.length - 1] === 'IP' ? [c ? `${countText(c)} 後` : '', tokens].filter(Boolean).join('・') : `${r.pitches.length} 球・${tokens}`
      if (st) add(runs)
      if (st) outs += madeOuts
      else if (madeOuts) outs = outCode
      items.push({
        kind: 'pa', key: `${side}:${i}`, side, order: side === 'us' ? (r as BattingPA).order : (r as PitchingPA).oppOrder, who: batterLabel(r, side),
        ...(side === 'opp' && (r as PitchingPA).oppBats ? { bats: OPP_BATS_LABEL[(r as PitchingPA).oppBats!] } : {}),
        text: `${resultText(r, side, { reached, hrNo })}${clauses.length ? `；${clauses.join('，')}` : ''}。`, meta,
        pitches: pitchList(r.pitches), plays: moves.map((m) => m.text), moves: moves.map((m) => ({ at: m.at, text: m.body })), pitcher: pitcherOf(r),
        runs: st ? runs : producedRuns(r), ...(st && runs > 0 ? { score: scoreNow() } : {}), ...(madeOuts > 0 ? { outs } : {}), hr: r.result === '全壘打',
      })
      for (const e of later) { outs = (e as { outs: number }).outs; items.push(e) }
    }
    // a half the timeline could not follow: its runs go in at its end (no score chip inside it)
    if (idx.length && !timeline) add(halfRuns)
    // the plate appearance in progress
    if (isLive) {
      items.push(...(anchors.live.get(key) ?? []))
      const lv = live!
      let named: NamedMove[]
      if (liveStep) named = liveStep.moves.map((m) => ({ at: m.at, kind: m.kind, name: name(m.row), to: m.to }))
      else {
        // (no timeline: undo the plays over the runners now on base to tell who made each one)
        const on = new Map(lv.runners.filter((r) => r.side === side).map((r) => [r.base as number, r.name]))
        const who: string[] = []
        for (const e of [...lv.plays].reverse()) {
          const n = typeof e.to === 'number' ? on.get(e.to) : undefined
          if (typeof e.to === 'number') on.delete(e.to)
          on.set(e.from, n ?? `${BASE_ZH[e.from]}跑者`)
          who.unshift(n ?? `${BASE_ZH[e.from]}跑者`)
        }
        named = lv.plays.map((e, n) => ({ at: e.at, kind: e.kind, name: who[n], to: e.to }))
      }
      const groups = groupMoves(named)
      let liveRuns = 0, liveOuts = 0
      groups.forEach((g, n) => {
        // (without the timeline the half's runs, these too, already went in from the rows)
        if (liveStep) add(g.runs)
        liveRuns += g.runs
        if (g.outs) { outs += g.outs; liveOuts += g.outs }
        items.push({ kind: 'event', key: `live:${key}:${n}`, side, text: `${g.body}。`, at: g.at, runs: g.runs, ...(g.runs ? { score: scoreNow() } : {}), ...(g.outs ? { outs } : {}), during: true })
      })
      if (!(fresh && lv.dueUp)) items.push({ kind: 'live', key: 'live', side, who: lv.batter.label, order: lv.batter.order, ...(lv.batter.bats ? { bats: lv.batter.bats } : {}), count: countText(count(lv.pitches)), tokens: pitchTokens(lv.pitches), plays: groups.map((g) => g.text), runs: liveRuns, ...(liveRuns ? { score: scoreNow() } : {}), ...(liveOuts ? { outs } : {}) })
    }
    items.push(...(anchors.end.get(key) ?? []))

    // the header: who started the half, and the summary once it is over
    const first = idx.map((i) => rows[i]).find((r) => side === 'opp' ? !!(r as PitchingPA).pitcher : isPA(r) && !!((r as BattingPA).oppPitcher || (r as BattingPA).oppHand))
    const pName = side === 'opp' ? ((first as PitchingPA | undefined)?.pitcher || (isLive ? live!.pitcher : '') || '') : first ? oppPitcherName({ name: (first as BattingPA).oppPitcher, hand: (first as BattingPA).oppHand }) : isLive ? oppPitcherName(live!.oppPitcher) : ''
    const pitcher = pName ? (side === 'opp' ? `投手 ${pName}` : `對方投手 ${pName}`) : ''
    const done = !isLive
    let summary: string | undefined
    if (done) {
      const r = halfRuns
      const h = idx.filter((i) => rows[i].result in HIT_BASE_COUNT).length
      const e = idx.reduce((a, i) => a + (side === 'us' ? oppErrorsOf(rows[i] as BattingPA).count : (() => { const x = errorsOf(rows[i] as PitchingPA); return x.positions.length + x.unknown })()), 0)
      const last = timeline?.steps[timeline.steps.length - 1]
      const lob = last ? stepAfter(last).length : idx.filter((i) => rows[i].code === 'L').length
      summary = halfSummary({ r, h, e, lob })
    }
    return { key, inning, half, side, title: halfTitle(inning, half, side), pitcher, done, runs: halfRuns, followed: !idx.length || !!timeline, ...(summary ? { summary } : {}), ...(fresh && live!.dueUp ? { dueUp: live!.dueUp } : {}), items }
  })
}

/**
 * Our batters' home runs this season before `game` (by name; only batters with a plate appearance this season before
 * it), for 「全壘打（本季第 3 支）」. The game page's tab; /live reads the same from its live context.
 */
export function seasonHrBefore(ds: Pick<Dataset, 'games' | 'batting'>, game: Pick<Game, 'id' | 'date'>, start = SEASON_START): Map<string, number> {
  const season = seasonOfDate(game.date, start)
  const before = new Set(ds.games.filter((g) => !g.status && !g.isDemo && g.id !== game.id && (g.date < game.date || (g.date === game.date && g.id < game.id)) && seasonOfDate(g.date, start) === season).map((g) => g.id))
  return hrCounts(ds.batting.filter((p) => before.has(p.gameId)))
}
/** Home runs by batter in these rows (every batter with a plate appearance is in it, 0 when none). */
export function hrCounts(rows: BattingPA[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of rows) if (p.batter && isPA(p)) out.set(p.batter, (out.get(p.batter) ?? 0) + (p.result === '全壘打' ? 1 : 0))
  return out
}

/* ------------------------------------------------------------------ the board's facts (/live) */

/** Our pitcher today: pitches (every one, the ball put in play too — the 紀錄比賽 count) and 「2.1 局 5 安 2 失分 1 四死 3 三振」. */
export function pitcherToday(pitching: PitchingPA[], name: string, livePitches = 0): { pc: number; line: string } {
  const rows = pitching.filter((p) => p.pitcher === name)
  const pc = rows.reduce((a, p) => a + p.pitches.length, 0) + livePitches
  // (pitchingLines credits each out to the pitcher on the mound when it was made, over the whole game)
  const l = pitchingLines(pitching, []).find((x) => x.name === name)
  const line = `${ipDisplay(l?.outs ?? 0)} 局 ${l?.h ?? 0} 安 ${l?.r ?? 0} 失分 ${(l?.bb ?? 0) + (l?.hbp ?? 0)} 四死 ${l?.k ?? 0} 三振`
  return { pc, line }
}

/** Our plate appearances against the opponent pitcher on the mound now (record/model oppPitchCount's rule). */
export function oppStintRows(batting: BattingPA[], oppPitcher?: OppPitcher, from?: { row: number; pitches: number }): BattingPA[] {
  return batting.slice(oppStintStart(batting, oppPitcher, from))
}
/** Their pitcher's line against us: 「被安 5・四死 2・三振 3」. */
export function oppPitcherToday(rows: BattingPA[]): string {
  const pa = rows.filter(isPA)
  const h = pa.filter((p) => p.result in HIT_BASE_COUNT).length
  const bb = pa.filter((p) => p.result === '保送' || p.result === '故四' || p.result === '觸身').length
  const k = pa.filter((p) => p.result === '三振').length
  return `被安 ${h}・四死 ${bb}・三振 ${k}`
}

/** A runner on the board's 壘上 row: ours (or a pinch runner) by name; theirs by name, else 「第 3 棒」. */
export function runnerShort(row: Row | undefined, side: FeedSide, fallback = ''): string {
  if (!row) return fallback
  if (row.runner) return row.runner === OPP_PR_UNNAMED ? '代跑' : row.runner
  if (side === 'us') return (row as BattingPA).batter || fallback
  const p = row as PitchingPA
  return oppBatterName(p.oppBatter) || (p.oppOrder ? `第 ${p.oppOrder} 棒` : fallback)
}

/** Today's plate appearances of the batter up now (ours by name; theirs by batting slot, not another named batter in it). */
export function batterRowsToday(s: RecordState): Row[] {
  if (offense(s) === 'us') {
    const name = s.lineup[s.slot]?.name
    return name ? s.batting.filter((b) => isPA(b) && b.batter === name) : []
  }
  const cur = oppBatterName(oppBatterOf(s))
  return s.pitching.filter((p) => isPA(p) && p.oppOrder === s.oppOrder && !(cur && oppBatterName(p.oppBatter) && oppBatterName(p.oppBatter) !== cur))
}

/** 「三壘 林昱丞・一壘 陳威任」 (lead runner first), or 「無人」. */
export function basesLine(runners: Array<{ base: number; name: string }>): string {
  return runners.length ? [...runners].sort((a, b) => b.base - a.base).map((r) => `${BASE_ZH[r.base]} ${r.name}`).join('・') : '無人'
}

/** Who is up, short: ours 「7 謝昊瑾」; theirs 「8 陳某」 or, nobody named, 「第 8、9 棒」 (`opp` = 「對方第 8、9 棒」). */
export function upList(list: Array<{ us: boolean; order: number; name: string; avg?: string }>, opts: { opp?: boolean } = {}): string {
  if (!list.length) return ''
  if (list.every((b) => !b.us && !b.name)) return `${opts.opp ? '對方' : ''}第 ${list.map((b) => b.order).join('、')} 棒`
  return list.map((b) => (b.name ? `${b.order} ${b.name}${b.avg ? ` ${b.avg}` : ''}` : `第 ${b.order} 棒`)).join('・')
}
