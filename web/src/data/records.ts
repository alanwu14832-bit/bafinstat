/**
 * 紀錄簿: the top of every list over all games (data/history.ts), not the filter. Ranks are competition ranks (ties
 * share the number, the next rank skips); tied rows read oldest first, then by name. Rate lists need 大專規程 規定打席
 * or 規定局數 (data/qualify.ts): per season against that season's team games, career against all games (capped).
 * Losing records (most strikeouts, most errors…) are deliberately not kept.
 */
import { careerMinOuts, careerMinPA, minOutsPitched, minPlateAppearances } from './qualify'
import { hitStreaks, isActive, largestComeback, onBaseStreaks, scorelessStreaks, winRuns, type GameRef, type HistoryIndex, type Streak } from './history'
import { compareNames } from './rosterSort'
import { currentSeason, seasonLabel, seasonSpan } from './seasons'
import { div, ipDisplay, type BattingLine, type PitchingLine } from './stats'
import { f2, f3 } from '../lib/fmt'
import { localDate } from '../lib/dates'

export type RecordCategory = 'game' | 'season' | 'career' | 'team'

export interface RecordEntry {
  rank: number
  value: number
  /** the value as shown (「.412」「4.2」「2」) */
  display: string
  /** the player (team records have none) */
  name?: string
  /** main line for a team record (「2025/12/22 對 工海物治」); players show their name instead */
  title?: string
  /** small line under the name: 「2026/03/14 對 群風」「114 學年・98 打席」「113–115 學年・58 場」 */
  context: string
  /** the game the context names (single-game and team records), for its link */
  gameId?: string
  /** 進行中: the current season, or a streak still going */
  ongoing?: boolean
  /** 示範: a demo game */
  demo?: boolean
  /** a current player (the 現役 dot in career lists) */
  active?: boolean
  /** sample for the CSV (「98 打席」「10.0 局」) */
  sample?: string
  /** 對手 for the CSV */
  opponent?: string
  /** season or date for the CSV */
  when?: string
}

export interface RecordList {
  id: string
  category: RecordCategory
  side: 'bat' | 'pit' | 'team'
  title: string
  /** the rule written under the title (what it takes to be listed) */
  rule: string
  /** unit for the 「另有 6 人次並列 2 支」 footer */
  unit: string
  entries: RecordEntry[]
  /** a tie too big for the cut: how many rows share `moreValue` and were left out */
  moreTied: number
  moreValue: number | null
  moreDisplay: string
}

// ------------------------------------------------------------------ ranking
export interface Ranked<T> { item: T; rank: number; value: number }
/**
 * Top `n` by `value` (descending; ascending with `low`), competition ranking. Rows ranked ≤ n are kept; if that
 * makes more than n + 2 rows, the tied group at the cut is dropped and reported as moreTied / moreValue.
 */
export function rankTop<T>(items: T[], value: (x: T) => number | null, opts: { n?: number; low?: boolean; order?: (a: T, b: T) => number } = {}): { rows: Ranked<T>[]; moreTied: number; moreValue: number | null } {
  const n = opts.n ?? 5
  const vals = items.map((item) => ({ item, value: value(item) })).filter((x): x is { item: T; value: number } => x.value !== null && Number.isFinite(x.value))
  const dir = opts.low ? 1 : -1
  vals.sort((a, b) => (a.value - b.value) * dir || (opts.order ? opts.order(a.item, b.item) : 0))
  const rows: Ranked<T>[] = []
  for (let i = 0; i < vals.length; i++) {
    const rank = i > 0 && vals[i].value === vals[i - 1].value ? rows[i - 1].rank : i + 1
    if (rank > n) break
    rows.push({ ...vals[i], rank })
  }
  if (rows.length <= n + 2) return { rows, moreTied: 0, moreValue: null }
  const cut = rows[rows.length - 1].rank
  const kept = rows.filter((r) => r.rank < cut)
  return { rows: kept, moreTied: rows.length - kept.length, moreValue: rows[rows.length - 1].value }
}

/** Minimums for a single game to be listed. */
export const SINGLE_GAME_MIN = { h: 2, tb: 4, hr: 1, rbi: 3, r: 2, sb: 2, bb: 2, k: 4, outs: 9 } as const

const fullDate = (iso: string) => iso.replace(/-/g, '/')
const monthDay = (iso: string) => iso.slice(5).replace('-', '/')
/**
 * A run of games as dates: 「10/10–12/22」 inside one year, 「2025/12/22–2026/02/15」 across years (so a streak over
 * New Year never reads as one season); `full` writes the first date with its year even inside one year.
 */
export function dateRange(from: string, to: string, full = false): string {
  if (!to || to === from) return full ? fullDate(from) : monthDay(from)
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${fullDate(from)}–${fullDate(to)}`
  return `${full ? fullDate(from) : monthDay(from)}–${monthDay(to)}`
}
/** The season of a run: one label, or a span (「2023–2026 年」) when it crosses seasons. */
const runSeason = (h: HistoryIndex, fromId: string, toId: string) => seasonSpan([seasonOf(h, fromId), seasonOf(h, toId)], h.start)
const vs = (g: GameRef) => `${fullDate(g.date)} 對 ${g.opponent}`
const byDateName = <T extends { date: string; name: string }>(a: T, b: T) => a.date.localeCompare(b.date) || compareNames(a.name, b.name)
const int = (v: number) => String(v)
const rate3 = (v: number) => f3(v)
const ip = (outs: number) => ipDisplay(outs)

function list(id: string, category: RecordCategory, side: RecordList['side'], title: string, rule: string, unit: string, ranked: ReturnType<typeof rankTop<RecordEntry>>, fmt: (v: number) => string): RecordList {
  const entries = ranked.rows.map((r) => ({ ...r.item, rank: r.rank, value: r.value, display: fmt(r.value) }))
  return { id, category, side, title, rule, unit, entries, moreTied: ranked.moreTied, moreValue: ranked.moreValue, moreDisplay: ranked.moreValue === null ? '' : fmt(ranked.moreValue) }
}
/** placeholder rank / value / display, filled in by list() */
const blank = { rank: 0, value: 0, display: '' }

// ------------------------------------------------------------------ 單場
type GameStatKey = 'h' | 'tb' | 'hr' | 'rbi' | 'r' | 'sb' | 'bb'
const GAME_BAT: Array<[GameStatKey, string, string]> = [['h', '安打', '支'], ['tb', '壘打數', '壘打'], ['hr', '全壘打', '支'], ['rbi', '打點', '分'], ['r', '得分', '分'], ['sb', '盜壘', '次'], ['bb', '保送', '次']]

export function gameRecords(h: HistoryIndex, opts: { activeOnly?: boolean } = {}): { bat: RecordList[]; pit: RecordList[] } {
  const keep = (name: string) => !opts.activeOnly || isActive(h, name)
  type Row = { name: string; date: string; game: GameRef; v: number }
  const rows = <L,>(m: Map<string, Array<{ game: GameRef; line: L }>>, get: (l: L) => number) => {
    const out: Row[] = []
    for (const [name, games] of m) if (keep(name)) for (const g of games) out.push({ name, date: g.game.date, game: g.game, v: get(g.line) })
    return out
  }
  const make = (id: string, side: 'bat' | 'pit', title: string, min: number, unit: string, src: Row[], fmt: (v: number) => string, minText: string) => {
    const items = src.filter((r) => r.v >= min)
    const ranked = rankTop(items, (r) => r.v, { order: byDateName })
    const mapped = { ...ranked, rows: ranked.rows.map((r) => ({ ...r, item: { ...blank, name: r.item.name, context: vs(r.item.game), gameId: r.item.game.id, demo: r.item.game.isDemo, opponent: r.item.game.opponent, when: r.item.game.date } as RecordEntry })) }
    return list(id, 'game', side, title, `單場至少 ${minText}才列入`, unit, mapped, fmt)
  }
  const bat = GAME_BAT.map(([key, title, unit]) => make(`game-${key}`, 'bat', title, SINGLE_GAME_MIN[key], unit, rows(h.batGames, (l: BattingLine) => l[key]), int, `${SINGLE_GAME_MIN[key]} ${unit === '壘打' ? '個壘打' : unit}`))
  const pit = [
    make('game-k', 'pit', '三振', SINGLE_GAME_MIN.k, '次', rows(h.pitGames, (l: PitchingLine) => l.k), int, `${SINGLE_GAME_MIN.k} 次`),
    make('game-outs', 'pit', '投球局數', SINGLE_GAME_MIN.outs, '局', rows(h.pitGames, (l: PitchingLine) => l.outs), ip, `${SINGLE_GAME_MIN.outs / 3} 局`),
  ]
  return { bat, pit }
}

// ------------------------------------------------------------------ 單季
type SeasonRow<L> = { name: string; date: string; season: number; label: string; teamGames: number; line: L }
const SEASON_BAT: Array<[keyof BattingLine & string, string, string]> = [['h', '安打', '支'], ['hr', '全壘打', '支'], ['rbi', '打點', '分'], ['r', '得分', '分'], ['sb', '盜壘', '次'], ['h2', '二壘安打', '支'], ['bb', '保送', '次']]
const SEASON_BAT_RATE: Array<[keyof BattingLine & string, string]> = [['avg', '打擊率'], ['obp', '上壘率'], ['slg', '長打率'], ['ops', 'OPS']]
const SEASON_PIT: Array<[keyof PitchingLine & string, string, string]> = [['w', '勝投', '勝'], ['sv', '救援', '次'], ['k', '三振', '次'], ['outs', '投球局數', '局']]
const SEASON_PIT_RATE: Array<[keyof PitchingLine & string, string]> = [['era', '防禦率'], ['whip', 'WHIP']]

export function seasonRecords(h: HistoryIndex, opts: { activeOnly?: boolean; today?: string } = {}): { bat: RecordList[]; pit: RecordList[] } {
  const now = currentSeason(opts.today ?? localDate(), h.start)
  const keep = (name: string) => !opts.activeOnly || isActive(h, name)
  const rows = <L,>(m: Map<string, Array<{ season: number; label: string; teamGames: number; line: L }>>) => {
    const out: Array<SeasonRow<L>> = []
    for (const [name, seasons] of m) if (keep(name)) for (const s of seasons) out.push({ name, date: String(s.season).padStart(4, '0'), ...s })
    return out
  }
  const bat = rows(h.batSeasons)
  const pit = rows(h.pitSeasons)
  const entry = <L,>(r: SeasonRow<L>, sample: string): RecordEntry => ({ ...blank, name: r.name, context: `${r.label}・${sample}`, ongoing: r.season !== 0 && r.season === now, sample, when: r.label })
  const count = <L,>(id: string, side: 'bat' | 'pit', title: string, unit: string, src: Array<SeasonRow<L>>, get: (l: L) => number, sample: (l: L) => string, fmt = int) => {
    const ranked = rankTop(src.filter((r) => get(r.line) >= 1), (r) => get(r.line), { order: byDateName })
    return list(id, 'season', side, title, '單季累計', unit, { ...ranked, rows: ranked.rows.map((x) => ({ ...x, item: entry(x.item, sample(x.item.line)) })) }, fmt)
  }
  const rate = <L,>(id: string, side: 'bat' | 'pit', title: string, src: Array<SeasonRow<L>>, get: (l: L) => number | null, ok: (r: SeasonRow<L>) => boolean, sample: (l: L) => string, rule: string, low: boolean, fmt: (v: number) => string) => {
    const ranked = rankTop(src.filter(ok), (r) => get(r.line), { low, order: byDateName })
    return list(id, 'season', side, title, rule, '', { ...ranked, rows: ranked.rows.map((x) => ({ ...x, item: entry(x.item, sample(x.item.line)) })) }, fmt)
  }
  const pa = (l: BattingLine) => `${l.pa} 打席`
  const ipText = (l: PitchingLine) => `${l.ipDisplay} 局`
  const qualPA = (r: SeasonRow<BattingLine>) => r.line.pa >= minPlateAppearances('college', r.teamGames)
  const qualOuts = (r: SeasonRow<PitchingLine>) => r.line.outs >= minOutsPitched('college', r.teamGames)
  return {
    bat: [
      ...SEASON_BAT.map(([k, title, unit]) => count(`season-${k}`, 'bat', title, unit, bat, (l) => l[k] as number, pa)),
      ...SEASON_BAT_RATE.map(([k, title]) => rate(`season-${k}`, 'bat', title, bat, (l) => l[k] as number | null, qualPA, pa, '需達規定打席：2.1 × 當季球隊場數（進位）', false, rate3)),
    ],
    pit: [
      ...SEASON_PIT.map(([k, title, unit]) => count(`season-${k}`, 'pit', title, unit, pit, (l) => l[k] as number, ipText, k === 'outs' ? ip : int)),
      ...SEASON_PIT_RATE.map(([k, title]) => rate(`season-${k}`, 'pit', title, pit, (l) => l[k] as number | null, qualOuts, ipText, '需達規定局數：1 × 當季球隊場數', true, f2)),
    ],
  }
}

// ------------------------------------------------------------------ 生涯
const CAREER_BAT: Array<[keyof BattingLine & string, string, string]> = [['g', '出賽', '場'], ['h', '安打', '支'], ['hr', '全壘打', '支'], ['rbi', '打點', '分'], ['r', '得分', '分'], ['sb', '盜壘', '次'], ['h2', '二壘安打', '支'], ['bb', '保送', '次']]
const CAREER_PIT: Array<[keyof PitchingLine & string, string, string]> = [['g', '出賽', '場'], ['w', '勝投', '勝'], ['sv', '救援', '次'], ['hld', '中繼', '次'], ['k', '三振', '次'], ['outs', '投球局數', '局']]
export const STREAK_MIN_GAMES = 3
export const STREAK_MIN_OUTS = 9

const shortRange = (s: Streak) => dateRange(s.from, s.toId !== s.fromId ? s.to : s.from)

export function careerRecords(h: HistoryIndex, opts: { activeOnly?: boolean } = {}): { bat: RecordList[]; pit: RecordList[] } {
  const total = h.games.length
  const minPA = careerMinPA(total), minOuts = careerMinOuts(total)
  const keep = (name: string) => !opts.activeOnly || isActive(h, name)
  const seasonsOf = (m: Map<string, Array<{ season: number }>>, name: string) => (m.get(name) ?? []).map((s) => s.season)
  type Row<L> = { name: string; date: string; line: L; span: string }
  const firstDate = <L,>(m: Map<string, Array<{ game: GameRef; line: L }>>, name: string) => m.get(name)?.[0]?.game.date ?? ''
  const bat: Array<Row<BattingLine>> = [...h.batCareer].filter(([n]) => keep(n)).map(([name, line]) => ({ name, line, date: firstDate(h.batGames, name), span: seasonSpan(seasonsOf(h.batSeasons, name), h.start) }))
  const pit: Array<Row<PitchingLine>> = [...h.pitCareer].filter(([n]) => keep(n)).map(([name, line]) => ({ name, line, date: firstDate(h.pitGames, name), span: seasonSpan(seasonsOf(h.pitSeasons, name), h.start) }))
  const entry = <L,>(r: Row<L>, sample: string): RecordEntry => ({ ...blank, name: r.name, context: `${r.span}・${sample}`, active: isActive(h, r.name), sample, when: r.span })
  const count = <L,>(id: string, side: 'bat' | 'pit', title: string, unit: string, src: Array<Row<L>>, get: (l: L) => number, sample: (l: L) => string, fmt = int) => {
    const ranked = rankTop(src.filter((r) => get(r.line) >= 1), (r) => get(r.line), { order: byDateName })
    return list(id, 'career', side, title, '所有比賽累計', unit, { ...ranked, rows: ranked.rows.map((x) => ({ ...x, item: entry(x.item, sample(x.item.line)) })) }, fmt)
  }
  const rate = <L,>(id: string, side: 'bat' | 'pit', title: string, src: Array<Row<L>>, get: (l: L) => number | null, ok: (l: L) => boolean, sample: (l: L) => string, rule: string, low: boolean, fmt: (v: number) => string) => {
    const ranked = rankTop(src.filter((r) => ok(r.line)), (r) => get(r.line), { low, order: byDateName })
    return list(id, 'career', side, title, rule, '', { ...ranked, rows: ranked.rows.map((x) => ({ ...x, item: entry(x.item, sample(x.item.line)) })) }, fmt)
  }
  const games = (l: { g: number }) => `${l.g} 場`
  const paRule = `生涯至少 ${minPA} 打席${minPA < 100 ? `（2.1 × 全部 ${total} 場，進位；滿 48 場後固定 100 打席）` : ''}`
  const outsRule = `生涯至少 ${minOuts / 3} 局${minOuts < 90 ? `（1 × 全部 ${total} 場；滿 30 場後固定 30 局）` : ''}`
  const streakList = (id: string, side: 'bat' | 'pit', title: string, unit: string, names: string[], get: (name: string) => Streak | null, min: number, rule: string, fmt: (v: number) => string) => {
    const items = names.map((name) => ({ name, s: get(name) })).filter((x): x is { name: string; s: Streak } => !!x.s && x.s.n >= min).map((x) => ({ name: x.name, date: x.s.from, s: x.s }))
    const ranked = rankTop(items, (x) => x.s.n, { order: byDateName })
    return list(id, 'career', side, title, rule, unit, { ...ranked, rows: ranked.rows.map((x) => ({ ...x, item: { ...blank, name: x.item.name, context: `${runSeason(h, x.item.s.fromId, x.item.s.toId)}・${shortRange(x.item.s)}`, ongoing: x.item.s.active, active: isActive(h, x.item.name), gameId: x.item.s.toId, when: `${x.item.s.from}–${x.item.s.to}` } as RecordEntry })) }, fmt)
  }
  const batNames = bat.map((r) => r.name), pitNames = pit.map((r) => r.name)
  return {
    bat: [
      ...CAREER_BAT.map(([k, title, unit]) => count(`career-${k}`, 'bat', title, unit, bat, (l) => l[k] as number, (l) => `${l.g} 場`)),
      ...SEASON_BAT_RATE.map(([k, title]) => rate(`career-${k}`, 'bat', title, bat, (l) => l[k] as number | null, (l) => l.pa >= minPA, (l) => `${l.pa} 打席`, paRule, false, rate3)),
      streakList('career-hitStreak', 'bat', '最長連續安打', '場', batNames, (n) => hitStreaks(h, n).best, STREAK_MIN_GAMES, `至少 ${STREAK_MIN_GAMES} 場；沒有打數也沒有犧飛的比賽（只有保送、觸身、犧觸或代跑）不算也不中斷`, int),
      streakList('career-obStreak', 'bat', '最長連續上壘', '場', batNames, (n) => onBaseStreaks(h, n).best, STREAK_MIN_GAMES, `至少 ${STREAK_MIN_GAMES} 場；安打、保送或觸身都算`, int),
    ],
    pit: [
      ...CAREER_PIT.map(([k, title, unit]) => count(`career-${k}`, 'pit', title, unit, pit, (l) => l[k] as number, k === 'g' ? games : (l) => `${l.ipDisplay} 局`, k === 'outs' ? ip : int)),
      ...SEASON_PIT_RATE.map(([k, title]) => rate(`career-${k}`, 'pit', title, pit, (l) => l[k] as number | null, (l) => l.outs >= minOuts, (l) => `${l.ipDisplay} 局`, outsRule, true, f2)),
      streakList('career-scoreless', 'pit', '最長連續無失分局數', '局', pitNames, (n) => scorelessStreaks(h, n).best, STREAK_MIN_OUTS, `至少 ${STREAK_MIN_OUTS / 3} 局；逐局計算，被記失分的那一局整局不算`, ip),
    ],
  }
}

const seasonOf = (h: HistoryIndex, gameId: string) => h.gameById.get(gameId)?.season ?? 0

// ------------------------------------------------------------------ 球隊
export function teamRecords(h: HistoryIndex, opts: { today?: string } = {}): { game: RecordList[]; season: RecordList[]; streak: RecordList[] } {
  const inningsPerGame = h.params.inningsPerGame
  type Row = { name: string; date: string; ref: GameRef; v: number; inning?: number; score: string }
  const rows = h.summaries.map((s) => {
    const ref = h.gameById.get(s.game.id)!
    return { s, ref, ex: h.extras.get(s.game.id) ?? { sb: 0, k: 0, outs: 0 }, score: `${s.result === 'W' ? '勝' : s.result === 'L' ? '敗' : '和'} ${s.runsUs}：${s.runsOpp}` }
  })
  const teamEntry = (r: Row): RecordEntry => ({ ...blank, title: vs(r.ref), context: r.inning ? `第 ${r.inning} 局・${r.score}` : r.score, gameId: r.ref.id, demo: r.ref.isDemo, opponent: r.ref.opponent, when: r.ref.date })
  const make = (id: string, title: string, rule: string, unit: string, items: Row[], low = false) => {
    const ranked = rankTop(items, (r) => r.v, { low, order: byDateName })
    return list(id, 'team', 'team', title, rule, unit, { ...ranked, rows: ranked.rows.map((x) => ({ ...x, item: teamEntry(x.item) })) }, int)
  }
  const base = (r: (typeof rows)[number], v: number): Row => ({ name: '', date: r.ref.date, ref: r.ref, v, score: r.score })
  const innings: Row[] = rows.flatMap((r) => r.s.lineUs.map((v, i) => ({ ...base(r, v), inning: i + 1 })).filter((x) => x.v >= 3))
  const game = [
    make('team-runs', '最多得分', '單場得分', '分', rows.filter((r) => r.s.runsUs >= 1).map((r) => base(r, r.s.runsUs))),
    make('team-hits', '最多安打', '單場安打', '支', rows.filter((r) => r.s.hitsUs >= 1).map((r) => base(r, r.s.hitsUs))),
    make('team-margin', '最大勝分差', '贏球的比賽', '分', rows.filter((r) => r.s.result === 'W').map((r) => base(r, r.s.runsUs - r.s.runsOpp))),
    make('team-inning', '單局最多得分', '單局至少 3 分才列入', '分', innings),
    make('team-sb', '最多盜壘', '單場盜壘成功', '次', rows.filter((r) => r.ex.sb >= 1).map((r) => base(r, r.ex.sb))),
    make('team-k', '投手群最多三振', '單場我方投手三振', '次', rows.filter((r) => r.ex.k >= 1).map((r) => base(r, r.ex.k))),
    make('team-fewestHits', '最少被安打', `只算我方投滿 ${inningsPerGame} 局的比賽（提前結束、再見輸球不算）`, '支', rows.filter((r) => r.ex.outs >= 3 * inningsPerGame).map((r) => base(r, r.s.hitsOpp)), true),
    make('team-comeback', '最大逆轉勝', '贏球前最多落後幾分（至少 2 分）', '分', rows.map((r) => base(r, largestComeback(r.s))).filter((r) => r.v >= 2)),
  ]

  // seasons
  const now = currentSeason(opts.today ?? localDate(), h.start)
  type SRow = { name: string; date: string; season: number; label: string; games: number; w: number; l: number; rs: number; ra: number }
  const by = new Map<number, SRow>()
  for (const r of rows) {
    const season = r.ref.season
    const x = by.get(season) ?? { name: '', date: String(season).padStart(4, '0'), season, label: seasonLabel(season, h.start), games: 0, w: 0, l: 0, rs: 0, ra: 0 }
    x.games++; if (r.s.result === 'W') x.w++; if (r.s.result === 'L') x.l++; x.rs += r.s.runsUs; x.ra += r.s.runsOpp
    by.set(season, x)
  }
  const seasons = [...by.values()]
  const sEntry = (r: SRow): RecordEntry => ({ ...blank, title: r.label, context: `${r.games} 場・${r.w} 勝 ${r.l} 敗${r.games - r.w - r.l ? ` ${r.games - r.w - r.l} 和` : ''}`, ongoing: r.season !== 0 && r.season === now, when: r.label, sample: `${r.games} 場` })
  const sMake = (id: string, title: string, rule: string, unit: string, items: SRow[], get: (r: SRow) => number | null, fmt: (v: number) => string, low = false) => {
    const ranked = rankTop(items, get, { low, order: byDateName })
    return list(id, 'team', 'team', title, rule, unit, { ...ranked, rows: ranked.rows.map((x) => ({ ...x, item: sEntry(x.item) })) }, fmt)
  }
  const season = [
    sMake('team-season-w', '最多勝', '單季勝場', '勝', seasons.filter((r) => r.w >= 1), (r) => r.w, int),
    sMake('team-season-pct', '最高勝率', '單季至少 5 場分出勝負；勝率 = 勝 ÷（勝＋敗）', '', seasons.filter((r) => r.w + r.l >= 5), (r) => div(r.w, r.w + r.l), rate3),
    sMake('team-season-rpg', '場均得分最多', '單季至少 5 場', '分', seasons.filter((r) => r.games >= 5), (r) => div(r.rs, r.games), (v) => v.toFixed(1)),
    sMake('team-season-rapg', '場均失分最少', '單季至少 5 場', '分', seasons.filter((r) => r.games >= 5), (r) => div(r.ra, r.games), (v) => v.toFixed(1), true),
  ]

  const runs = winRuns(h.summaries).filter((r) => r.n >= 2).map((r) => ({ name: '', date: r.from, r }))
  const ranked = rankTop(runs, (x) => x.r.n, { order: byDateName })
  const streak = [list('team-winStreak', 'team', 'team', '最長連勝', '至少 2 連勝；和局或輸球中斷', '連勝', {
    ...ranked,
    rows: ranked.rows.map((x) => ({ ...x, item: { ...blank, title: dateRange(x.item.r.from, x.item.r.toId !== x.item.r.fromId ? x.item.r.to : x.item.r.from, true), context: runSeason(h, x.item.r.fromId, x.item.r.toId), ongoing: x.item.r.active, gameId: x.item.r.toId, when: `${x.item.r.from}–${x.item.r.to}` } as RecordEntry })),
  }, int)]
  return { game, season, streak }
}

/** 人次 for single games, 筆 for team lists, 人 for seasons and careers. */
export const tieWho = (l: Pick<RecordList, 'category'>) => (l.category === 'game' ? '人次' : l.category === 'team' ? '筆' : '人')
/**
 * The footer of a list whose tie was too big to show: 「另有 6 人次並列 2 支」 under the rows above it, or, when the tie
 * is for first place itself (no rows left), 「共 16 人次並列紀錄 2 支」. Empty when nothing was left out.
 */
export function moreTiedText(l: Pick<RecordList, 'category' | 'entries' | 'moreTied' | 'moreDisplay' | 'unit'>): string {
  if (!l.moreTied) return ''
  const value = `${l.moreDisplay}${l.unit ? ` ${l.unit}` : ''}`
  return l.entries.length ? `另有 ${l.moreTied} ${tieWho(l)}並列 ${value}` : `共 ${l.moreTied} ${tieWho(l)}並列紀錄 ${value}`
}

// ------------------------------------------------------------------ CSV
export interface RecordCsvRow { cat: string; item: string; rank: number | string; player: string; value: string; when: string; opponent: string; sample: string }
const CAT_LABEL: Record<RecordCategory, string> = { game: '單場', season: '單季', career: '生涯', team: '球隊' }
/** Flat rows for 匯出 CSV: 類別, 項目, 名次, 球員, 數值, 季／日期, 對手, 樣本 (a collapsed tie becomes one 「並列」 row). */
export function recordsCsv(lists: RecordList[]): RecordCsvRow[] {
  const out: RecordCsvRow[] = []
  for (const l of lists) {
    for (const e of l.entries) out.push({ cat: CAT_LABEL[l.category], item: l.title, rank: e.rank, player: e.name ?? e.title ?? '', value: e.display, when: e.when ?? '', opponent: e.opponent ?? '', sample: e.sample ?? '' })
    if (l.moreTied) out.push({ cat: CAT_LABEL[l.category], item: l.title, rank: '並列', player: l.entries.length ? `另有 ${l.moreTied} ${tieWho(l)}` : `共 ${l.moreTied} ${tieWho(l)}並列紀錄`, value: l.moreDisplay, when: '', opponent: '', sample: '' })
  }
  return out
}
