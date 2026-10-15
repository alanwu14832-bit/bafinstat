/**
 * Box Score: one game's lines the newspaper way — 我隊打擊 (by batting-order slot, substitutes under the player they
 * came in for, a 合計 row and a notes line: 二安／三安／全壘打／盜壘), 我隊投球 (in the order they pitched), 對方打擊 (by
 * slot, names when recorded, else 「第 N 棒」) and 對方投手 (from our plate appearances against him).
 *
 * Pure. The numbers are the site's own: battingLines / teamBatting for us, oppBattingLines / oppTotals for them,
 * pitchingLines for our pitchers — the same functions and the same rows as the game page's 攻守成績, so /live and the
 * game page agree once 結束比賽 saves the game. `gameBoxScore` reads a saved game, `liveBoxScore` the recording state
 * (record_drafts or this device's draft): its rows, plus the plate appearance in progress only where it is final — its
 * pitches count in 用球數, nothing else of it does until it is sent.
 */
import { battingLines, pitchingLines, teamBatting, type BattingLine, type PitchingLine } from './stats'
import { oppBatsLabel, oppBattingLines, oppKey, oppRunnerKey, oppTotals, type OppBattingLine } from './opponent'
import { boxOrderOf, pitcherOrder } from './gameNotes'
import { oppPitcherName } from './broadcast'
import {
  DEFAULT_PARAMS, EMPTY_DATASET, HIT_BASE_COUNT, isOppPinchHit, isPA, isPlaced,
  OPP_BATS_LABEL, type BattingPA, type Dataset, type DayRosterSub, type Game, type GameDayRoster, type OppBats, type OppHand, type PitchingPA, type Player, type StatParams,
} from './types'
import { dayRosterOf, offense, oppBatterOf, oppPitchCount, oppStintStart, type OppPitcher, type RecordState } from '../record/model'

/* ------------------------------------------------------------------ the game page's lines (攻守成績) */

/** 我隊打擊 of the game page: battingLines in box order (slot, then first appearance; a 代跑 in the slot he ran for). */
export function ourBattingBox(ds: Pick<Dataset, 'roster'>, pas: BattingPA[], params: StatParams = DEFAULT_PARAMS): BattingLine[] {
  const at = boxOrderOf(pas)
  return battingLines({ ...EMPTY_DATASET, roster: ds.roster }, pas, params).sort((a, b) => at(a.name) - at(b.name))
}
/** 我隊投球 of the game page: pitchingLines in the order they pitched (not by innings). */
export function ourPitchingBox(pas: PitchingPA[], games: Game[], params: StatParams = DEFAULT_PARAMS): PitchingLine[] {
  const order = pitcherOrder(pas)
  return pitchingLines(pas, games, params).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
}

/* ------------------------------------------------------------------ the box */

/** The six numbers of a batting row: 打數 得分 安打 打點 四死 三振. */
export interface BoxCounts { ab: number; r: number; h: number; rbi: number; bb: number; so: number }
export interface BoxBatter extends BoxCounts {
  key: string
  /** batting-order slot (null: not known) and whether this is the slot's first player (the others are indented) */
  slot: number | null; first: boolean
  name: string
  /** 守位 (SS, CF…), 代打 / 代跑, or '' */
  pos: string
  /** the batter at the plate now (/live) */
  atBat: boolean
  /** (their batters) 左打 / 右打 as recorded this game (左右打 when a named batter batted from both sides); left out when unknown, or when an unnamed slot was recorded both ways */
  bats?: string
}
export interface BoxNote { label: '二安' | '三安' | '全壘打' | '盜壘'; text: string }
export interface BoxBatting { rows: BoxBatter[]; total: BoxCounts; notes: BoxNote[] }
export interface BoxPitcher { name: string; ip: string; outs: number; h: number; r: number; er: number; bb: number; k: number; pc: number; /** on the mound while the other side bats (/live) */ now: boolean }
export interface BoxOppPitcher { key: string; name: string; hand?: OppHand; label: string; pa: number; h: number; bb: number; k: number; pc: number; now: boolean }
export interface BoxScore { us: BoxBatting; pitching: BoxPitcher[]; opp: BoxBatting; oppPitchers: BoxOppPitcher[] }

const SUB_TAG: Record<string, string> = { PH: '代打', PR: '代跑' }
const tag = (pos?: string) => (pos ? SUB_TAG[pos] ?? pos : '')
const counts = (l?: BattingLine): BoxCounts => ({ ab: l?.ab ?? 0, r: l?.r ?? 0, h: l?.h ?? 0, rbi: l?.rbi ?? 0, bb: (l?.bb ?? 0) + (l?.hbp ?? 0), so: l?.so ?? 0 })

/**
 * Players by slot in the order they came into the game: each is added with `at`, when he first shows up (gameAt), and
 * a name is listed once, in the slot of his earliest entry. The first of a slot is the starter, the others are indented.
 */
class Slots {
  private list: Array<{ slot: number | null; name: string; pos: string; at: number; seq: number }> = []
  add(slot: number | null | undefined, name: string | undefined, pos = '', at = 0) {
    if (name) this.list.push({ slot: slot ?? null, name, pos, at, seq: this.list.length })
  }
  rows(line: (name: string) => BattingLine | undefined, atBat?: string): BoxBatter[] {
    const bySlot = new Map<number | null, Array<{ name: string; pos: string }>>()
    // every position he played, in order (代打-SS: a pinch hitter who stayed in at short; SS-2B: moved to second)
    const seen = new Map<string, { name: string; pos: string; all: string[] }>()
    for (const e of [...this.list].sort((a, b) => a.at - b.at || a.seq - b.seq)) {
      const had = seen.get(e.name)
      if (had) { if (e.pos && !had.all.includes(e.pos)) { had.all.push(e.pos); had.pos = had.all.join('-') } continue }
      const p = { name: e.name, pos: e.pos, all: e.pos ? [e.pos] : [] }
      seen.set(e.name, p)
      bySlot.set(e.slot, [...(bySlot.get(e.slot) ?? []), p])
    }
    const slots = [...bySlot.keys()].sort((a, b) => (a ?? 1e9) - (b ?? 1e9))
    return slots.flatMap((slot) => bySlot.get(slot)!.map((p, i) => ({ key: `${slot ?? '-'}:${p.name}`, slot, first: i === 0, name: p.name, pos: p.pos, atBat: p.name === atBat, ...counts(line(p.name)) })))
  }
}
/**
 * When something happened, as one number to sort by: the half-inning, then inside it `phase` (1: our plate
 * appearances, by row; 2: a substitution in our own half, which comes after its rows — a 代跑 runs for a batter who
 * has reached — while one in their half, a 守備 change, is simply that half) and `seq`.
 */
const STARTER_AT = -1e12, LINEUP_AT = 1e12
const gameAt = (inning: number, half: 'top' | 'bottom', phase: 1 | 2, seq: number) => ((inning * 2 + (half === 'bottom' ? 1 : 0)) * 3 + phase) * 1e6 + seq

const withCount = (name: string, n: number) => (n > 1 ? `${name} ${n}` : name)
/** 「二安：甲、乙 2」… for the players with any, in box order. */
function notesOf(rows: BoxBatter[], line: (name: string) => BattingLine | undefined): BoxNote[] {
  const pick = (label: BoxNote['label'], n: (l: BattingLine) => number): BoxNote[] => {
    const names = rows.flatMap((r) => { const l = line(r.name); return l && n(l) > 0 ? [withCount(r.name, n(l))] : [] })
    return names.length ? [{ label, text: names.join('、') }] : []
  }
  return [...pick('二安', (l) => l.h2), ...pick('三安', (l) => l.h3), ...pick('全壘打', (l) => l.hr), ...pick('盜壘', (l) => l.sb)]
}

/** The opponent pitchers in the order they faced us: one stint per run of our rows with the same name and hand. */
interface Stint { name?: string; hand?: OppHand; rows: BattingPA[] }
function stintsOf(rows: BattingPA[]): Stint[] {
  const out: Stint[] = []
  const key = (p: { oppPitcher?: string; oppHand?: OppHand }) => `${p.oppPitcher ?? ''}\u0000${p.oppHand ?? ''}`
  for (const p of rows) {
    const last = out.at(-1)
    // (a tie-break runner faced nobody: he never starts or breaks a stint)
    if (isPlaced(p)) { if (last) last.rows.push(p); continue }
    if (last && key({ oppPitcher: last.name, oppHand: last.hand }) === key(p)) last.rows.push(p)
    else out.push({ ...(p.oppPitcher ? { name: p.oppPitcher } : {}), ...(p.oppHand ? { hand: p.oppHand } : {}), rows: [p] })
  }
  return out
}
/**
 * The stints between two cuts of our rows (two 換投, or the start of the game): split further where the name or hand
 * changes; the first one less the pitches thrown before `from` (they were the pitcher's before him), the last one plus
 * the pitches of the plate appearance the next pitcher came into (`to`). With no rows in between (he came in and
 * left in one plate appearance) it is `out`, the pitcher who left at `to`, when he threw any.
 */
function stintsBetween(rows: BattingPA[], from: number, to: { pitches: number; out?: OppPitcher }): Array<{ st: Stint; pc: number }> {
  const sts = stintsOf(rows)
  if (!sts.length) {
    const pc = to.pitches - from
    return pc > 0 ? [{ st: { ...(to.out?.name ? { name: to.out.name } : {}), ...(to.out?.hand ? { hand: to.out.hand } : {}), rows }, pc }] : []
  }
  return sts.map((st, i) => ({ st, pc: rowsPitches(st.rows) - (i === 0 ? from : 0) + (i === sts.length - 1 ? to.pitches : 0) }))
}
function oppPitcherRow(st: Stint, i: number, pc: number, now: boolean): BoxOppPitcher {
  const pa = st.rows.filter(isPA)
  return {
    key: `${i}:${st.name ?? ''}:${st.hand ?? ''}`, ...(st.name ? { name: st.name } : { name: '' }), ...(st.hand ? { hand: st.hand } : {}),
    label: oppPitcherName({ name: st.name, hand: st.hand }) || '對方投手',
    pa: pa.length, h: pa.filter((p) => p.result in HIT_BASE_COUNT).length, bb: pa.filter((p) => p.result === '保送' || p.result === '故四' || p.result === '觸身').length,
    k: pa.filter((p) => p.result === '三振').length, pc, now,
  }
}
const rowsPitches = (rows: BattingPA[]) => rows.reduce((n, p) => n + p.pitches.length, 0)

/** What a box is built from: one game's rows, and on /live what is going on now. */
export interface BoxSource {
  game: Game
  batting: BattingPA[]
  pitching: PitchingPA[]
  /** the 當日登錄名單 (starters with their slot, substitutions) */
  dayRoster?: Pick<GameDayRoster, 'starters' | 'subs'>
  roster?: Player[]
  params?: StatParams
  live?: {
    /** our lineup now (a pinch hitter at the plate has no row yet) */
    lineup: Array<{ name: string; pos: string }>
    /** who is at bat: ours by name, theirs by key (oppKey) */
    atBat?: { side: 'us'; name: string } | { side: 'opp'; key: string; slot: number; pinchHit: boolean; /** 左打／右打 picked for him */ bats?: OppBats }
    /** our pitcher on the mound and the pitches of the plate appearance in progress he threw */
    pitcher: string; pitcherNow: boolean; livePitches: number
    /**
     * the opponent pitcher's stint now: where it starts in our rows, who, his pitch count (record/model oppPitchCount),
     * the pitches of that first plate appearance thrown before him (`carried`) and who he took over from (`out`); and
     * every earlier 換投 (`changes`: row, pitches thrown before the new man, who left), so each pitcher keeps his row
     */
    opp: { start: number; name?: string; hand?: OppHand; pc: number; carried: number; out?: OppPitcher; changes?: Array<{ row: number; pitches: number; out?: OppPitcher }>; now: boolean; show: boolean }
  }
}

export function boxScore(src: BoxSource): BoxScore {
  const params = src.params ?? DEFAULT_PARAMS
  const roster = src.roster ?? []
  const live = src.live
  // ---- 我隊打擊
  const usLines = new Map(ourBattingBox({ roster }, src.batting, params).map((l) => [l.name, l]))
  const us = new Slots()
  // (in the order they came in: a 守備 substitute who never batted stays above the one who later 代打 for him)
  const ourHalf: 'top' | 'bottom' = src.game.homeAway === '客' ? 'top' : 'bottom'
  src.dayRoster?.starters.forEach((st, i) => { if (st.order) us.add(st.order, st.name, st.pos, STARTER_AT + i) })
  src.batting.forEach((p, i) => {
    us.add(p.order, p.batter, tag(p.pos), gameAt(p.inning, ourHalf, 1, i * 2))
    if (p.runner && p.runner !== p.batter) us.add(p.order, p.runner, '代跑', gameAt(p.inning, ourHalf, 1, i * 2 + 1))
  })
  src.dayRoster?.subs?.forEach((s, j) => { if (s.slot !== undefined && s.slot >= 0) us.add(s.slot + 1, s.in, tag(s.pos), gameAt(s.inning, s.half, 2, j)) })
  live?.lineup.forEach((l, i) => us.add(i + 1, l.name, tag(l.pos), LINEUP_AT + i))
  const usLine = (n: string) => usLines.get(n)
  const usRows = us.rows(usLine, live?.atBat?.side === 'us' ? live.atBat.name : undefined)
  const usTotal = counts(teamBatting({ ...EMPTY_DATASET, roster }, src.batting, params))

  // ---- 對方打擊
  const oppLines = new Map<string, OppBattingLine>(oppBattingLines(src.pitching).map((l) => [l.label, l]))
  const opp = new Slots()
  for (const p of src.pitching) {
    const k = oppKey(p)
    opp.add(p.oppOrder, k, isOppPinchHit(p.oppBatter) ? '代打' : '')
    const r = oppRunnerKey(p)
    if (r && r !== k) opp.add(p.oppOrder, r, '代跑')
  }
  const at = live?.atBat?.side === 'opp' ? live.atBat : undefined
  if (at) opp.add(at.slot, at.key, at.pinchHit ? '代打' : '')
  const oppLine = (n: string) => oppLines.get(n)
  // 左打／右打: the sides each of their batters was recorded with this game (and the one at the plate now)
  const sides = new Map<string, Set<OppBats>>()
  const addSide = (k: string, b?: OppBats) => { if (b) sides.set(k, (sides.get(k) ?? new Set<OppBats>()).add(b)) }
  for (const p of src.pitching) if (isPA(p)) addSide(oppKey(p), p.oppBats)
  if (at) addSide(at.key, at.bats)
  // a 「第 N 棒」 row is one man in one game unless someone else came into that slot: a 對方代打 (named or not: without
  // 記對方打者姓名 his later plate appearances are keyed by the slot again) or a 對方代跑 (who bats later in it). Then
  // the row can merge two people, and sides that disagree are left out rather than shown as 左右打; the man at the plate
  // shows the side picked now
  const shared = new Set<string>()
  for (const p of src.pitching) {
    const r = oppRunnerKey(p)
    if (p.oppOrder && (isOppPinchHit(p.oppBatter) || (r && r !== oppKey(p)))) shared.add(oppKey({ oppBatter: '', oppOrder: p.oppOrder }))
  }
  if (at?.pinchHit) shared.add(oppKey({ oppBatter: '', oppOrder: at.slot }))
  const oppRows = opp.rows(oppLine, at?.key).map((r) => {
    const b = oppBatsLabel(r.name, sides.get(r.name), !shared.has(r.name)) ?? (r.atBat && at?.bats ? OPP_BATS_LABEL[at.bats] : undefined)
    return b ? { ...r, bats: b } : r
  })
  const oppTotal = counts(oppTotals(src.pitching))

  // ---- 我隊投球
  const pitchers: BoxPitcher[] = ourPitchingBox(src.pitching, [src.game], params).map((l) => ({
    name: l.name, ip: l.ipDisplay, outs: l.outs, h: l.h, r: l.r, er: l.er, bb: l.bb + l.hbp, k: l.k,
    pc: l.pc + (live && l.name === live.pitcher ? live.livePitches : 0), now: !!live?.pitcherNow && l.name === live.pitcher,
  }))
  // (a reliever who has not faced anyone yet)
  if (live?.pitcher && !pitchers.some((p) => p.name === live.pitcher)) pitchers.push({ name: live.pitcher, ip: '0.0', outs: 0, h: 0, r: 0, er: 0, bb: 0, k: 0, pc: live.livePitches, now: live.pitcherNow })

  // ---- 對方投手
  let oppPitchers: BoxOppPitcher[]
  if (!live) oppPitchers = stintsOf(src.batting).map((st, i) => oppPitcherRow(st, i, rowsPitches(st.rows), false))
  else {
    const o = live.opp
    // the rows before the pitcher now, cut at every 換投 (two right-handers in a row stay two pitchers); the pitches
    // of the plate appearance a reliever came into belong to the pitcher before him
    const cuts = [...(o.changes ?? []).filter((c) => c.row <= o.start), { row: o.start, pitches: o.carried, ...(o.out ? { out: o.out } : {}) }]
    const before: Array<{ st: Stint; pc: number }> = []
    let row = 0, from = 0
    for (const c of cuts) {
      before.push(...stintsBetween(src.batting.slice(row, c.row), from, c))
      row = c.row; from = c.pitches
    }
    oppPitchers = before.map(({ st, pc }, i) => oppPitcherRow(st, i, pc, false))
    if (o.show) oppPitchers.push(oppPitcherRow({ name: o.name, hand: o.hand, rows: src.batting.slice(o.start) }, before.length, o.pc, o.now))
  }

  return {
    us: { rows: usRows, total: usTotal, notes: notesOf(usRows, usLine) },
    pitching: pitchers,
    opp: { rows: oppRows, total: oppTotal, notes: notesOf(oppRows, oppLine) },
    oppPitchers,
  }
}

/** The box of a saved game (the game page's rows). */
export function gameBoxScore(ds: Pick<Dataset, 'roster' | 'batting' | 'pitching'>, game: Game, params: StatParams = DEFAULT_PARAMS): BoxScore {
  return boxScore({
    game, batting: ds.batting.filter((p) => p.gameId === game.id), pitching: ds.pitching.filter((p) => p.gameId === game.id), roster: ds.roster, params,
    ...(game.dayRoster ? { dayRoster: game.dayRoster } : {}),
  })
}

/**
 * The box of the game being recorded. `inPlay`: the half on the board is being played (false once the game is over
 * and the draft waits for 結束比賽: nobody is marked at bat or 投球中 then; pitches typed anyway still count).
 */
const batsNow = (s: RecordState): { bats?: OppBats } => { const b = s.oppBatsBySlot?.[s.oppOrder]; return b === 'L' || b === 'R' ? { bats: b } : {} }
export function liveBoxScore(s: RecordState, opts: { inPlay: boolean; roster?: Player[]; params?: StatParams }): BoxScore {
  const side = offense(s)
  const inPlay = opts.inPlay
  const from = s.oppPitcherFrom && s.oppPitcherFrom.row <= s.batting.length ? s.oppPitcherFrom : undefined
  const start = oppStintStart(s.batting, s.oppPitcher, from)
  const pc = oppPitchCount(s)
  const curBatter = oppBatterOf(s)
  const subs: DayRosterSub[] = s.subs ?? []
  // every 換投 before the one that brought in the pitcher now (the last entry is oppPitcherFrom itself)
  const all = s.oppPitcherChanges ?? []
  const last = all.at(-1)
  const cur = from && last && last.row === from.row && last.pitches === from.pitches ? last : undefined
  const changes = (cur ? all.slice(0, -1) : all).filter((c) => c.row <= start)
  return boxScore({
    game: s.game, batting: s.batting, pitching: s.pitching, roster: opts.roster, params: opts.params,
    dayRoster: { starters: dayRosterOf(s).starters, subs },
    live: {
      lineup: s.lineup,
      ...(inPlay ? { atBat: side === 'us' ? { side: 'us' as const, name: s.lineup[s.slot]?.name ?? '' } : { side: 'opp' as const, key: oppKey({ oppBatter: curBatter, oppOrder: s.oppOrder }), slot: s.oppOrder, pinchHit: isOppPinchHit(s.oppBatter), ...batsNow(s) } } : {}),
      pitcher: s.pitcher, pitcherNow: inPlay && side === 'opp', livePitches: side === 'opp' ? s.pitches.length : 0,
      opp: {
        start, ...(s.oppPitcher?.name ? { name: s.oppPitcher.name } : {}), ...(s.oppPitcher?.hand ? { hand: s.oppPitcher.hand } : {}),
        pc, carried: from && from.row === start ? from.pitches : 0, ...(cur?.out ? { out: cur.out } : {}), changes, now: inPlay && side === 'us',
        show: start < s.batting.length || pc > 0 || !!s.oppPitcher?.name || !!s.oppPitcher?.hand,
      },
    },
  })
}
