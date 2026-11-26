/**
 * 限時動態 (Instagram story) cards: what each one says, worked out from the records. The numbers always come from here;
 * the one sentence under them (`headline`) is composed here too and the reader may reword it before sharing.
 * lib/storyImage.ts draws a card; components/ui/StoryDialog.tsx picks one.
 */
import { battingLines, pitchingLines, resultText, summarizeGame, type BattingLine, type PitchingLine } from './stats'
import { isPA, type Dataset, type Game, type StatParams } from './types'
import { opponentLabel, isMirror } from './intrasquad'
import { seasonLabel, seasonOfDate } from './seasons'
import { f2, f3 } from '../lib/fmt'

export type StoryKind = 'game-bat' | 'game-pit' | 'season-bat' | 'season-pit'
export const STORY_KIND_LABEL: Record<StoryKind, string> = { 'game-bat': '單場打擊', 'game-pit': '單場投球', 'season-bat': '本季打擊', 'season-pit': '本季投球' }
export interface StoryStat { label: string; value: string }
export interface StoryCard {
  kind: StoryKind
  team: string
  /** 「vs 長安國中」 / 「114 學年」 */
  title: string
  /** a game's outcome and score, ours first: 「勝 8:5」 */
  result?: { text: string; win: boolean }
  /** 「2026.11.18・大專盃」 / 「12 場・截至 2026.11.18」 */
  sub: string
  name: string; number?: string
  /** 「第 3 棒・游擊手」 / 「先發投手」 */
  role: string
  /** the two or three numbers in large type */
  big: StoryStat[]
  /** the smaller line under them (at most four) */
  small: StoryStat[]
  /** the poster templates' numbers, scorebook style: 「H-AB 2-4」「HR 1」… / 「IP 3.2」「K 3」… */
  stats: StoryStat[]
  /** the same in one line: 「2-4 1HR 3RBI 1SB」 / 「3.2 IP  3 K  0 BB  0 R」 (the reader may reword it) */
  statLine: string
  /** 好球率 bar (pitchers, when pitches were recorded) */
  bar?: { strikes: number; balls: number }
  headline: string
  /** 「114 學年 打擊率 .345・3 全壘打・12 打點」; '' when the season may not be shown */
  footer: string
  /** the site's address without https:// */
  site: string
}

export interface StorySource {
  team: string; site: string
  /** every game, a 隊內賽 with both views (useStats().full): a single game's rows come from here */
  full: Dataset
  /** the games the season counts (useStats().dataset: the 隊內賽 filter applied) */
  counted: Dataset
  params: StatParams
  /** false: leave out anything about the season (the reader may only see single games) */
  season: boolean
}

const POS: Record<string, string> = { P: '投手', C: '捕手', '1B': '一壘手', '2B': '二壘手', '3B': '三壘手', SS: '游擊手', LF: '左外野手', CF: '中外野手', RF: '右外野手', DH: '指定打擊', PH: '代打', PR: '代跑' }
const dots = (iso: string) => iso.replaceAll('-', '.')
const host = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

/** The games a player has a card for, newest first: those he batted (or ran) in, those he pitched in. */
export function storyGames(full: Dataset, name: string): { bat: Game[]; pit: Game[] } {
  const bat = new Set(full.batting.filter((p) => (p.batter === name && isPA(p)) || p.runner === name).map((p) => p.gameId))
  const pit = new Set(full.pitching.filter((p) => p.pitcher === name).map((p) => p.gameId))
  const played = full.games.filter((g) => g.status !== 'scheduled' && g.status !== 'cancelled').sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1))
  return { bat: played.filter((g) => bat.has(g.id)), pit: played.filter((g) => pit.has(g.id)) }
}

/** Our players in a game, batting order first, then the pitchers who did not bat. */
export function storyPlayers(full: Dataset, gameId: string): string[] {
  const names: string[] = []
  const add = (n?: string) => { if (n && !names.includes(n)) names.push(n) }
  for (const p of full.batting) if (p.gameId === gameId) { if (isPA(p)) add(p.batter); add(p.runner) }
  for (const p of full.pitching) if (p.gameId === gameId) add(p.pitcher)
  return names
}

function gameHead(src: StorySource, game: Game): Pick<StoryCard, 'team' | 'title' | 'result' | 'sub' | 'site'> {
  const s = summarizeGame(src.full, game)
  const text = s.result === 'live' ? '進行中' : resultText(s.result)
  return {
    team: src.team, site: host(src.site), title: `vs ${opponentLabel(game)}`,
    result: { text: `${text} ${s.runsUs}:${s.runsOpp}`, win: s.result === 'W' },
    sub: [dots(game.date), game.tournament].filter(Boolean).join('・'),
  }
}
const numberOf = (ds: Dataset, name: string) => ds.roster.find((p) => p.name === name)?.number || undefined

/** The season's rows: the counted games of the season `date` falls in, up to and including that day. */
function seasonRows(src: StorySource, date: string) {
  const season = seasonOfDate(date)
  const ids = new Set(src.counted.games.filter((g) => !isMirror(g) && seasonOfDate(g.date) === season && g.date <= date).map((g) => g.id))
  return { season, games: src.counted.games.filter((g) => ids.has(g.id)), batting: src.counted.batting.filter((p) => ids.has(p.gameId)), pitching: src.counted.pitching.filter((p) => ids.has(p.gameId)) }
}
const seasonBatText = (season: number, l: BattingLine) => `${seasonLabel(season)} 打擊率 ${f3(l.avg)}・${l.hr} 全壘打・${l.rbi} 打點`
const seasonPitText = (season: number, l: PitchingLine) => `${seasonLabel(season)} 防禦率 ${f2(l.era)}・${l.w} 勝 ${l.l} 敗・${l.k} 三振`

/** 「猛打賞：4 打數 3 安打，1 全壘打、2 打點」: the line as a sentence, the at bats first, then what stands out. */
export function batHeadline(l: Pick<BattingLine, 'ab' | 'h' | 'hr' | 'rbi' | 'r' | 'sb' | 'bb' | 'hbp'>): string {
  const extras = [l.hr && `${l.hr} 全壘打`, l.rbi && `${l.rbi} 打點`, l.r && `${l.r} 得分`, l.sb && `${l.sb} 盜壘`, l.bb + l.hbp && (l.hbp ? `${l.bb + l.hbp} 四死球` : `${l.bb} 保送`)].filter(Boolean).slice(0, 3) as string[]
  const base = l.ab ? `${l.ab} 打數 ${l.h} 安打` : ''
  const text = [base, extras.join('、')].filter(Boolean).join('，')
  return `${l.h >= 3 ? '猛打賞：' : ''}${text || '上場'}`
}
/** 「勝投：6.0 局 8 三振，失 1 分」 */
export function pitHeadline(l: Pick<PitchingLine, 'ipDisplay' | 'k' | 'r' | 'w' | 'l' | 'sv' | 'hld'>): string {
  const dec = l.w ? '勝投：' : l.sv ? '救援成功：' : l.hld ? '中繼成功：' : ''
  return `${dec}${l.ipDisplay} 局 ${l.k} 三振，${l.r ? `失 ${l.r} 分` : '無失分'}`
}

/** A single game's batting in scorebook shorthand: 安打-打數 first, then what happened (at most four more). */
export function batStats(l: Pick<BattingLine, 'ab' | 'h' | 'hr' | 'rbi' | 'r' | 'sb' | 'bb' | 'hbp' | 'h2' | 'h3'>): StoryStat[] {
  const more = ([['HR', l.hr], ['3B', l.h3], ['2B', l.h2], ['RBI', l.rbi], ['BB', l.bb], ['HBP', l.hbp], ['SB', l.sb], ['R', l.r]] as const).filter(([, v]) => v > 0).slice(0, 4)
  return [{ label: 'H-AB', value: `${l.h}-${l.ab}` }, ...more.map(([label, v]) => ({ label, value: String(v) }))]
}
/** A single game's pitching: 局數, 三振, 四壞, 失分 (always all four: a 0 there is the good news). */
export function pitStats(l: Pick<PitchingLine, 'ipDisplay' | 'k' | 'bb' | 'r'>): StoryStat[] {
  return [{ label: 'IP', value: l.ipDisplay }, { label: 'K', value: String(l.k) }, { label: 'BB', value: String(l.bb) }, { label: 'R', value: String(l.r) }]
}
/** The numbers in one line: a game's 安打-打數 stands alone, the rest read 「1HR」; pitching and seasons read 「3.2 IP」. */
export function statLine(stats: StoryStat[]): string {
  // 「1HR」, but a double reads 「2B」 (one) or 「2×2B」, never 「12B」
  const one = (x: StoryStat) => (/^\d/.test(x.label) ? (x.value === '1' ? x.label : `${x.value}×${x.label}`) : `${x.value}${x.label}`)
  if (stats[0]?.label === 'H-AB') return [stats[0].value, ...stats.slice(1).map(one)].join(' ')
  return stats.map((x) => `${x.value} ${x.label}`).join('  ')
}
const withStats = (stats: StoryStat[]) => ({ stats, statLine: statLine(stats) })

/** 單場打擊: null when he has no line in that game. */
export function gameBatCard(src: StorySource, gameId: string, name: string): StoryCard | null {
  const game = src.full.games.find((g) => g.id === gameId)
  if (!game) return null
  const rows = src.full.batting.filter((p) => p.gameId === gameId)
  const l = battingLines(src.full, rows, src.params).find((x) => x.name === name)
  if (!l || !(l.pa || l.r || l.sb)) return null
  const first = rows.find((p) => p.batter === name && isPA(p))
  const role = first ? [first.order ? `第 ${first.order} 棒` : '', POS[first.pos ?? ''] ?? ''].filter(Boolean).join('・') : '代跑'
  // after 打數–安打: the two that stand out most (never empty: 打點 and 得分 fill in), the rest below
  const rest: StoryStat[] = [['全壘打', l.hr], ['打點', l.rbi], ['得分', l.r], ['盜壘', l.sb], ['二安', l.h2], ['三安', l.h3], ['保送', l.bb], ['觸身', l.hbp]].filter(([, v]) => (v as number) > 0).map(([label, v]) => ({ label: label as string, value: String(v) }))
  const big = [{ label: '打數–安打', value: `${l.ab}-${l.h}` }, ...rest.slice(0, 2)]
  for (const label of ['打點', '得分']) if (big.length < 3 && !big.some((b) => b.label === label)) big.push({ label, value: '0' })
  let footer = ''
  if (src.season) {
    const sr = seasonRows(src, game.date)
    const sl = battingLines(src.counted, sr.batting, src.params).find((x) => x.name === name)
    if (sl && sl.pa) footer = seasonBatText(sr.season, sl)
  }
  return { kind: 'game-bat', ...gameHead(src, game), name, number: numberOf(src.full, name), role, big, small: rest.slice(2, 6), ...withStats(batStats(l)), headline: batHeadline(l), footer }
}

/** 單場投球: null when he did not pitch in that game. */
export function gamePitCard(src: StorySource, gameId: string, name: string): StoryCard | null {
  const game = src.full.games.find((g) => g.id === gameId)
  if (!game) return null
  const rows = src.full.pitching.filter((p) => p.gameId === gameId)
  const l = pitchingLines(rows, [game], src.params).find((x) => x.name === name)
  if (!l) return null
  const role = rows.find((p) => p.pitcher)?.pitcher === name ? '先發投手' : '後援投手'
  const small: StoryStat[] = [{ label: '被安打', value: String(l.h) }, { label: '四死球', value: String(l.bb + l.hbp) }, { label: '自責分', value: String(l.er) }]
  if (l.pc) small.push({ label: '用球數', value: String(l.pc) })
  let footer = ''
  if (src.season) {
    const sr = seasonRows(src, game.date)
    const sl = pitchingLines(sr.pitching, sr.games, src.params).find((x) => x.name === name)
    if (sl) footer = seasonPitText(sr.season, sl)
  }
  return {
    kind: 'game-pit', ...gameHead(src, game), name, number: numberOf(src.full, name), role,
    big: [{ label: '局數', value: l.ipDisplay }, { label: '三振', value: String(l.k) }, { label: '失分', value: String(l.r) }], small, ...withStats(pitStats(l)),
    ...(l.strikes + l.balls > 0 ? { bar: { strikes: l.strikes, balls: l.balls } } : {}), headline: pitHeadline(l), footer,
  }
}

/** The season a player's newest counted game is in, and that game's date; null when he has none. */
function latest(src: StorySource, name: string, side: 'bat' | 'pit'): string | null {
  const ids = new Set(side === 'bat' ? src.counted.batting.filter((p) => (p.batter === name && isPA(p)) || p.runner === name).map((p) => p.gameId) : src.counted.pitching.filter((p) => p.pitcher === name).map((p) => p.gameId))
  const dates = src.counted.games.filter((g) => ids.has(g.id) && !isMirror(g)).map((g) => g.date).sort()
  return dates.length ? dates[dates.length - 1] : null
}
const seasonHead = (src: StorySource, season: number, g: number, date: string): Pick<StoryCard, 'team' | 'title' | 'sub' | 'site'> => ({ team: src.team, site: host(src.site), title: `${seasonLabel(season)}累計`, sub: `${g} 場・截至 ${dots(date)}` })

/** 本季打擊: the season of his newest game, every counted game of it. */
export function seasonBatCard(src: StorySource, name: string): StoryCard | null {
  const date = src.season ? latest(src, name, 'bat') : null
  if (!date) return null
  const sr = seasonRows(src, date)
  const l = battingLines(src.counted, sr.batting, src.params).find((x) => x.name === name)
  if (!l || !l.pa) return null
  const pos = src.counted.roster.find((p) => p.name === name)?.primaryPos
  return {
    kind: 'season-bat', ...seasonHead(src, sr.season, l.g, date), name, number: numberOf(src.counted, name), role: POS[pos ?? ''] ?? '打者',
    big: [{ label: '打擊率', value: f3(l.avg) }, { label: '全壘打', value: String(l.hr) }, { label: '打點', value: String(l.rbi) }],
    small: [{ label: '安打', value: String(l.h) }, { label: '上壘率', value: f3(l.obp) }, { label: 'OPS', value: f3(l.ops) }, { label: '盜壘', value: String(l.sb) }],
    ...withStats([{ label: 'AVG', value: f3(l.avg) }, { label: 'HR', value: String(l.hr) }, { label: 'RBI', value: String(l.rbi) }, { label: 'OPS', value: f3(l.ops) }]),
    headline: `${l.g} 場 ${l.ab} 打數 ${l.h} 安打，${l.hr} 全壘打、${l.rbi} 打點`, footer: '',
  }
}

/** 本季投球 */
export function seasonPitCard(src: StorySource, name: string): StoryCard | null {
  const date = src.season ? latest(src, name, 'pit') : null
  if (!date) return null
  const sr = seasonRows(src, date)
  const l = pitchingLines(sr.pitching, sr.games, src.params).find((x) => x.name === name)
  if (!l) return null
  return {
    kind: 'season-pit', ...seasonHead(src, sr.season, l.g, date), name, number: numberOf(src.counted, name), role: '投手',
    big: [{ label: '防禦率', value: f2(l.era) }, { label: '局數', value: l.ipDisplay }, { label: '三振', value: String(l.k) }],
    small: [{ label: '勝–敗', value: `${l.w}-${l.l}` }, ...(l.sv ? [{ label: '救援', value: String(l.sv) }] : []), { label: 'WHIP', value: f2(l.whip) }, { label: '四死球', value: String(l.bb + l.hbp) }],
    ...withStats([{ label: 'ERA', value: f2(l.era) }, { label: 'IP', value: l.ipDisplay }, { label: 'K', value: String(l.k) }, { label: 'WHIP', value: f2(l.whip) }]),
    ...(l.strikes + l.balls > 0 ? { bar: { strikes: l.strikes, balls: l.balls } } : {}),
    headline: `${l.g} 場 ${l.ipDisplay} 局，${l.k} 三振、防禦率 ${f2(l.era)}`, footer: '',
  }
}

/** The card of a kind (a game kind needs `gameId`). */
export function storyCard(src: StorySource, kind: StoryKind, name: string, gameId?: string): StoryCard | null {
  if (kind === 'game-bat') return gameId ? gameBatCard(src, gameId, name) : null
  if (kind === 'game-pit') return gameId ? gamePitCard(src, gameId, name) : null
  return kind === 'season-bat' ? seasonBatCard(src, name) : seasonPitCard(src, name)
}

/** 「限動_林昱丞_2026-11-18.png」 */
export const storyFileName = (card: StoryCard, date?: string) => `限動_${card.name}_${date ?? card.kind}.png`
