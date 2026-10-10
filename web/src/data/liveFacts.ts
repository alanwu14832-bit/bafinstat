/**
 * 即時比分's numbers beyond today's game: the batter's 本季 line and one 「本半局看點」 per half-inning.
 *
 * 本季 = the played games (not demo, not scheduled) of the live game's season (data/seasons.ts) dated before it,
 * plus today's rows from the recorder's draft. The live game's own rows in the dataset are always left out (in
 * cloud mode the recorder saves them while the game is on), so today is never counted twice and the numbers do not
 * depend on whether the latest save has reached this viewer.
 *
 * A half-inning's card is picked from fixed rules over what had happened when the half began (earlier games and
 * today's rows from the halves before it), so plate appearances inside the half never change it, every viewer sees
 * the same card, and the same card (id) never shows twice in one game. Texts use counts only: nothing is written by
 * a language model, and thin samples pick nothing.
 */
import { battingLines, ipDisplay, isHitResult, outsCredited, pitchingLines, summarizeGame, type BattingLine, type GameSummary, type PitchingLine } from './stats'
import { currentStreak, hitsByGame, hitStreak, qualifiedBatters, qualifiedPitchers, type Story } from './stories'
import { f2, f3, pct0 } from '../lib/fmt'
import { OUT_RESULTS, weBatTop, type Half, type RecordState } from '../record/model'
import { SEASON_START, seasonOfDate } from './seasons'
import { nextMilestone } from './milestones'
import { TEAM } from '../config/team'
import { isPA, type BattingPA, type Dataset, type Game, type PitchingPA, type StatParams } from './types'

export interface LiveContext {
  ds: Dataset
  params: StatParams
  game: Game
  /** the live game's season (seasonOfDate) */
  season: number
  /** played games of that season before the live game, in order */
  games: Game[]
  batting: BattingPA[]
  pitching: PitchingPA[]
  /** this season's rows by batter */
  battingBy: Map<string, BattingPA[]>
  summaries: GameSummary[]
  /** every earlier game against today's opponent, any season */
  vs: { games: Game[]; batting: BattingPA[]; summaries: GameSummary[] }
  /** every earlier played game, any season (career totals for milestones) */
  career: { games: Game[]; battingBy: Map<string, BattingPA[]> }
}

export interface HalfCard extends Story {
  inning: number
  half: Half
  priority: number
  /** the player the card is about (a batter of the half, or our pitcher) */
  subject?: string
  /** his batting order (batters only) */
  order?: number
}

const groupBy = <T,>(rows: T[], key: (r: T) => string) => {
  const m = new Map<string, T[]>()
  for (const r of rows) { const k = key(r); const a = m.get(k); if (a) a.push(r); else m.set(k, [r]) }
  return m
}

/** Everything earlier than the live game the cards and the 本季 line need (once per loaded dataset). */
export function liveContext(base: Dataset, game: Game, params: StatParams, start: number = SEASON_START): LiveContext {
  const before = (g: Game) => g.date < game.date || (g.date === game.date && g.id < game.id)
  const played = base.games
    .filter((g) => !g.status && !g.isDemo && g.id !== game.id && before(g))
    .sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.date < b.date ? -1 : 1))
  const ids = new Set(played.map((g) => g.id))
  const bat = groupBy(base.batting.filter((p) => ids.has(p.gameId)), (p) => p.gameId)
  const pit = groupBy(base.pitching.filter((p) => ids.has(p.gameId)), (p) => p.gameId)
  const fld = groupBy(base.fielding.filter((f) => ids.has(f.gameId)), (f) => f.gameId)
  const summary = new Map(played.map((g) => [g.id, summarizeGame({ ...base, batting: bat.get(g.id) ?? [], pitching: pit.get(g.id) ?? [], fielding: fld.get(g.id) ?? [] }, g)]))
  const season = seasonOfDate(game.date, start)
  const games = season ? played.filter((g) => seasonOfDate(g.date, start) === season) : []
  const batting = games.flatMap((g) => bat.get(g.id) ?? [])
  const opp = (game.opponent ?? '').trim()
  const vsGames = opp ? played.filter((g) => (g.opponent ?? '').trim() === opp) : []
  return {
    ds: base, params, game, season, games,
    batting,
    pitching: games.flatMap((g) => pit.get(g.id) ?? []),
    battingBy: groupBy(batting.filter((p) => p.batter), (p) => p.batter),
    summaries: games.map((g) => summary.get(g.id)!),
    vs: { games: vsGames, batting: vsGames.flatMap((g) => bat.get(g.id) ?? []), summaries: vsGames.map((g) => summary.get(g.id)!) },
    career: { games: played, battingBy: groupBy(played.flatMap((g) => bat.get(g.id) ?? []).filter((p) => p.batter), (p) => p.batter) },
  }
}

const lineOf = (ds: Dataset, rows: BattingPA[], name: string, params: StatParams): BattingLine | undefined =>
  battingLines(ds, rows, params).find((l) => l.name === name)

/** The batter's 本季 line: this season's earlier games plus today's plate appearances so far; null when he has no
 *  plate appearance in an earlier game this season (the line would only repeat today's). */
export function seasonLine(ctx: LiveContext, today: BattingPA[], name: string): BattingLine | null {
  const prior = ctx.battingBy.get(name) ?? []
  if (!name || !prior.some(isPA)) return null
  return lineOf(ctx.ds, [...prior, ...today.filter((p) => p.batter === name)], name, ctx.params) ?? null
}

/* ------------------------------------------------------------------ one card per half-inning */

interface HalfRef { inning: number; half: Half }
const ordOf = (inning: number, half: Half) => inning * 2 + (half === 'bottom' ? 1 : 0)

/** The half-innings from 1▲ to the one being played. */
function halvesOf(s: RecordState): HalfRef[] {
  const out: HalfRef[] = []
  for (let i = 1; i <= Math.max(1, s.inning); i++) {
    out.push({ inning: i, half: 'top' })
    if (i < s.inning || s.half === 'bottom') out.push({ inning: i, half: 'bottom' })
  }
  return out
}

/** A unique best (a tie for first is no story, as on the 總覽 stories). */
function uniqueTop<T>(xs: T[], key: (x: T) => number | null, dir: 'max' | 'min' = 'max'): T | undefined {
  const ok = xs.filter((x) => key(x) !== null && Number.isFinite(key(x)!))
  if (!ok.length) return undefined
  const best = ok.reduce((a, b) => ((dir === 'max' ? key(b)! > key(a)! : key(b)! < key(a)!) ? b : a))
  return ok.filter((x) => key(x) === key(best)).length === 1 ? best : undefined
}

const OUT_CODES = new Set(['I', 'II', 'III'])
/** The batter was put out: an out result and his own out code (I/II/III). A 不死三振 who reached, or a batter who
 *  was safe on a 雙殺／內滾 force-out／犧觸 (code L, R, ER or none yet), is not. */
const retiredRow = (p: PitchingPA) => OUT_RESULTS.has(p.result) && OUT_CODES.has(p.code ?? '')

/** FNV-1a, enough to tell two row lists apart in a cache key */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(36)
}

const cache = new WeakMap<LiveContext, Map<string, HalfCard[]>>()

/** Everything the half's inputs say about it: who it is about and what had happened before it began. */
function halfInputs(s: RecordState, h: HalfRef) {
  const usHalf: Half = weBatTop(s) ? 'top' : 'bottom'
  const oppHalf: Half = usHalf === 'top' ? 'bottom' : 'top'
  const ord = ordOf(h.inning, h.half)
  const todayBat = s.batting.filter((p) => ordOf(p.inning, usHalf) < ord)
  const todayPit = s.pitching.filter((p) => ordOf(p.inning, oppHalf) < ord)
  const weBat = h.half === usHalf
  const batters: Array<{ name: string; order?: number }> = []
  let pitcher = ''
  // One rule for the half being played and for the halves before it, so a half's card never changes afterwards:
  // its first three batters are the first three plate appearances from that half on (a half with fewer, such as a
  // 突破僵局 half, goes on with the batters who came up next), and while those are not batted yet, the lineup from
  // the leadoff slot. Its pitcher is the first one on a row from that half on, else the pitcher now.
  if (weBat) {
    const from = s.batting.filter((p) => p.inning >= h.inning && isPA(p) && p.batter)
    const len = s.lineup.length
    const lead = from[0]?.order ? from[0].order - 1 : s.slot
    for (let k = 0; k < 3; k++) {
      const row = from[k]
      const slot = len ? (lead + k) % len : -1
      const b = row ? { name: row.batter, order: row.order } : slot >= 0 ? { name: s.lineup[slot]?.name ?? '', order: slot + 1 } : null
      if (b?.name && !batters.some((x) => x.name === b.name)) batters.push(b)
    }
  } else {
    pitcher = s.pitching.find((p) => p.inning >= h.inning && p.pitcher)?.pitcher ?? s.pitcher
  }
  // (a fingerprint of the rows before the half: a row fixed afterwards on 紀錄比賽 gives a new key)
  const rows = hash([...todayBat.map((p) => `${p.batter}${p.result}${p.code ?? ''}${p.rbi}${p.run}${p.sb}`), ...todayPit.map((p) => `${p.pitcher}${p.result}${p.code ?? ''}`)].join('|'))
  const key = `${ord}|${todayBat.length}|${todayPit.length}|${rows}|${batters.map((b) => `${b.order ?? ''}:${b.name}`).join(',')}|${pitcher}`
  return { todayBat, todayPit, weBat, batters, pitcher, key }
}

/** Every card the rules allow for half h, best first (cached per context and the half's inputs). */
export function halfCandidates(ctx: LiveContext, s: RecordState, h: HalfRef): HalfCard[] {
  const inp = halfInputs(s, h)
  let byKey = cache.get(ctx)
  if (!byKey) { byKey = new Map(); cache.set(ctx, byKey) }
  const hit = byKey.get(inp.key)
  if (hit) return hit
  const out = computeCandidates(ctx, h, inp)
  byKey.set(inp.key, out)
  return out
}

function computeCandidates(ctx: LiveContext, h: HalfRef, inp: ReturnType<typeof halfInputs>): HalfCard[] {
  const { ds, params } = ctx
  const { todayBat, todayPit } = inp
  const opp = (ctx.game.opponent ?? '').trim()
  const playedToday = todayBat.some(isPA) || todayPit.some(isPA)
  const gamesN = ctx.games.length + (playedToday ? 1 : 0)
  // 「全隊第一／最低」 needs someone to beat: at least two qualified players, and an earlier game this season (in the
  // season's first game the 規定局數 is 3 innings, so a starter's 3 innings today alone would make him the leader)
  const leaderPool = <T,>(q: T[]): T[] => (ctx.games.length >= 1 && q.length >= 2 ? q : [])
  const out: Array<HalfCard & { rank: number }> = []
  const add = (rank: number, c: Omit<HalfCard, 'inning' | 'half' | 'tone'> & { tone?: HalfCard['tone'] }) => out.push({ tone: 'neutral', ...c, inning: h.inning, half: h.half, rank })

  if (inp.weBat && inp.batters.length) {
    const bat = battingLines(ds, [...ctx.batting, ...todayBat], params)
    const q = leaderPool(qualifiedBatters(bat, gamesN))
    const avg1 = uniqueTop(q, (l) => l.avg), ops1 = uniqueTop(q, (l) => l.ops)
    const order = ctx.games.map((g) => g.id)
    inp.batters.forEach(({ name, order: o }, rank) => {
      const L = o ? `${o} 棒 ${name}` : name
      const who = { subject: name, player: name, ...(o ? { order: o } : {}) }
      const mineToday = todayBat.filter((p) => p.batter === name)
      // 連續安打: earlier games this season, and today's hit so far
      const n = hitStreak(hitsByGame(ctx.battingBy.get(name) ?? [], order).get(name) ?? [])
      const hitToday = mineToday.some((p) => isPA(p) && isHitResult(p.result))
      if (hitToday && n >= 2) add(rank, { ...who, id: `streak:${name}`, priority: 80, kicker: '連續安打', figure: String(n + 1), tone: 'good', text: `${L} 連續 ${n + 1} 場出賽有安打（含今天）` })
      else if (n >= 3) add(rank, { ...who, id: `streak:${name}`, priority: 80, kicker: '連續安打', figure: String(n), tone: 'good', text: `${L} 前 ${n} 場出賽都有安打` })
      // 里程碑: career totals, every earlier game plus today
      const career = lineOf(ds, [...(ctx.career.battingBy.get(name) ?? []), ...mineToday], name, params)
      if (career) {
        const ms = ([['h', career.h], ['hr', career.hr], ['rbi', career.rbi]] as const).map(([k, v]) => ({ k, m: nextMilestone(k, v) })).find((x) => x.m)
        if (ms?.m) {
          const { target, left } = ms.m
          const text = ms.k === 'h' ? `${L} 再 ${left} 支安打就生涯 ${target} 安` : ms.k === 'hr' ? `${L} 再 ${left} 支全壘打就生涯 ${target} 支全壘打` : `${L} 再 ${left} 分打點就生涯 ${target} 分打點`
          add(rank, { ...who, id: `milestone:${name}`, priority: 78, kicker: '里程碑', figure: String(target), text })
        }
      }
      const today = lineOf(ds, mineToday, name, params)
      if (today && today.h >= 2) add(rank, { ...who, id: `today:${name}`, priority: 75, kicker: '今日手感', figure: `${today.h} 安`, tone: 'good', text: `${L} 今天 ${today.ab} 打數 ${today.h} 安${today.hr ? `，含 ${today.hr} 支全壘打` : ''}` })
      const me = bat.find((l) => l.name === name)
      if (me) {
        if (me.rispAB >= 5 && (me.rispAvg ?? 0) >= 0.35) add(rank, { ...who, id: `risp:${name}`, priority: 70, kicker: '得點圈打擊率', figure: f3(me.rispAvg), text: `${L} 本季得點圈 ${me.rispAB} 打數 ${me.rispH} 安` })
      }
      if (opp) {
        const vs = lineOf(ds, [...ctx.vs.batting.filter((p) => p.batter === name), ...mineToday], name, params)
        if (vs && vs.ab >= 5 && (vs.avg ?? 0) >= 0.4) add(rank, { ...who, id: `vs:${name}`, priority: 65, kicker: `生涯對${opp}`, figure: f3(vs.avg), text: `${L} 生涯對${opp} ${vs.ab} 打數 ${vs.h} 安` })
      }
      if (me) {
        if (me.hr >= 2) add(rank, { ...who, id: `hr:${name}`, priority: 60, kicker: '全壘打', figure: String(me.hr), text: `${L} 本季已敲 ${me.hr} 支全壘打${bat.filter((l) => l.hr >= me.hr).length === 1 ? '，全隊最多' : ''}` })
        if (avg1?.name === name) add(rank, { ...who, id: `avg1:${name}`, priority: 56, kicker: '打擊率全隊第一', figure: f3(me.avg), text: `${L} 本季 ${me.ab} 打數 ${me.h} 安` })
        if (ops1?.name === name) add(rank, { ...who, id: `ops1:${name}`, priority: 55, kicker: 'OPS 全隊第一', figure: f3(me.ops), text: `${L} 本季上壘率 ${f3(me.obp)}、長打率 ${f3(me.slg)}` })
        if (me.pa >= 20 && me.kPct !== null && me.kPct <= 0.08) add(rank, { ...who, id: `contact:${name}`, priority: 45, kicker: '很少被三振', figure: pct0(me.kPct), text: `${L} 本季 ${me.pa} 打席只被三振 ${me.so} 次` })
        if (me.sb >= 3) add(rank, { ...who, id: `sb:${name}`, priority: 40, kicker: '盜壘', figure: String(me.sb), text: `${L} 本季 ${me.sb} 次盜壘成功${me.cs ? `、${me.cs} 次失敗` : ''}` })
      }
    })
  }
  if (inp.weBat && ctx.summaries.length >= 4) {
    // the inning we score the most in this season
    const reg = ctx.game.innings ?? TEAM.innings
    const runs = Array.from({ length: reg }, (_, i) => ctx.summaries.reduce((a, sm) => a + (sm.lineUs[i] ?? 0), 0))
    const i = h.inning, x = runs[i - 1]
    if (i <= reg && x >= 5 && runs.filter((r) => r >= x).length === 1) add(4, { id: `inning:${i}`, priority: 45, kicker: `第 ${i} 局`, figure: `${x} 分`, text: `本季第 ${i} 局共得 ${x} 分，是全隊得分最多的一局` })
  }

  const P = inp.pitcher
  if (!inp.weBat && P) {
    const who = { subject: P, player: P }
    const mine = todayPit.filter((p) => p.pitcher === P)
    // 連續解決: counting back over his batters today
    let n = 0
    const faced = mine.filter(isPA)
    for (let i = faced.length - 1; i >= 0 && retiredRow(faced[i]); i--) n++
    if (n >= 6) add(3, { ...who, id: `retired:${P}`, priority: 85, kicker: '連續解決', figure: String(n), tone: 'good', text: `${P} 已連續解決 ${n} 名打者` })
    const k = faced.filter((p) => p.result === '三振').length
    if (k >= 4) {
      const credit = outsCredited(todayPit)
      const outs = mine.reduce((a, p) => a + (credit.get(p) ?? 0), 0)
      add(3, { ...who, id: `todayK:${P}`, priority: 70, kicker: '今日三振', figure: String(k), tone: 'good', text: `${P} 今天已投 ${ipDisplay(outs)} 局、${k} 次三振` })
    }
    const pit: PitchingLine[] = pitchingLines([...ctx.pitching, ...todayPit], [...ctx.games, ctx.game], params)
    const me = pit.find((l) => l.name === P)
    if (me) {
      if (uniqueTop(leaderPool(qualifiedPitchers(pit, gamesN)), (l) => l.era, 'min')?.name === P) add(3, { ...who, id: `era1:${P}`, priority: 55, kicker: '防禦率全隊最低', figure: f2(me.era), text: `${P} 本季投 ${me.ipDisplay} 局` })
      if (me.k >= 10 && uniqueTop(pit, (l) => l.k)?.name === P) add(3, { ...who, id: `k1:${P}`, priority: 50, kicker: '三振全隊最多', figure: String(me.k), text: `${P} 本季投 ${me.ipDisplay} 局送出 ${me.k} 次三振，全隊最多` })
      if (me.swings >= 40 && (me.whiffPct ?? 0) >= 0.3) add(3, { ...who, id: `whiff:${P}`, priority: 35, kicker: '揮空率', figure: pct0(me.whiffPct), text: `${P} 本季 ${me.swings} 次被揮棒、${me.whiffs} 次揮空` })
    }
  }

  // either half: the record against today's opponent, a winning streak coming in
  if (opp && ctx.vs.summaries.length >= 2) {
    const w = ctx.vs.summaries.filter((x) => x.result === 'W').length, l = ctx.vs.summaries.filter((x) => x.result === 'L').length, t = ctx.vs.summaries.length - w - l
    add(4, { id: `vsRec:${opp}`, priority: 30, kicker: `歷年對${opp}`, figure: `${w}-${l}`, text: `歷年對${opp} ${w} 勝 ${l} 敗${t ? ` ${t} 和` : ''}` })
  }
  const streak = currentStreak(ctx.summaries)
  if (streak && streak.result === 'W' && streak.n >= 2) add(4, { id: 'wstreak:team', priority: 25, kicker: '連勝中', figure: String(streak.n), tone: 'good', text: `這場之前已經 ${streak.n} 連勝` })

  // best first; ties: batting position, then the pitcher, then team facts, then id
  return out
    .sort((a, b) => b.priority - a.priority || a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ rank: _rank, ...c }) => c)
}

/** One card (or null) per half-inning from 1▲ to the half being played; no card id twice in one game. */
export function halfCards(s: RecordState, ctx: LiveContext): Array<HalfCard | null> {
  const used = new Set<string>()
  return halvesOf(s).map((h) => {
    const c = halfCandidates(ctx, s, h).find((x) => !used.has(x.id)) ?? null
    if (c) used.add(c.id)
    return c
  })
}

/** The card of the half being played. */
export const currentHalfCard = (s: RecordState, ctx: LiveContext): HalfCard | null => halfCards(s, ctx).at(-1) ?? null

/** A string that changes exactly when the current card may change (a memo key: the polled state is a new object every 5 s). */
export const halfCardKey = (s: RecordState): string =>
  `${s.inning}${s.half}|${s.batting.length}|${s.pitching.length}|${s.slot}|${s.pitcher}|${s.lineup.map((l) => l.name).join(',')}`
