/**
 * 數據故事: short, true sentences picked out of the numbers ("梁睿至 連續 5 場有安打", "目前 3 連勝").
 * Everything is computed from the same filtered slice the page shows, so a story never disagrees with a table.
 * Thresholds keep them honest for amateur sample sizes: a leader needs a fair share of the team's plate
 * appearances / innings, a hot streak needs at-bats behind it.
 */
import { battingLines, isHitResult, NON_AB_RESULTS, pitchingLines, type BattingLine, type GameSummary, type PitchingLine } from './stats'
import type { BattingPA, Dataset, PitchingPA, StatParams } from './types'
import { DEFAULT_PARAMS } from './types'

export type StoryTone = 'good' | 'bad' | 'neutral'
export interface Story {
  id: string
  /** short label above the sentence (e.g. 連勝, 打擊率領先) */
  kicker: string
  /** the headline number, drawn large (e.g. ".391", "5") */
  figure?: string
  text: string
  tone: StoryTone
  /** player the story is about (links to their page) */
  player?: string
}

const f3 = (v: number | null) => (v === null ? '—' : v.toFixed(3).replace(/^0/, ''))
const f2 = (v: number | null) => (v === null ? '—' : v.toFixed(2))

/** Most recent run of the same result (W or L; a tie ends it). */
export function currentStreak(summaries: GameSummary[]): { result: 'W' | 'L'; n: number } | null {
  const last = summaries[summaries.length - 1]
  if (!last || last.result === 'T') return null
  let n = 0
  for (let i = summaries.length - 1; i >= 0 && summaries[i].result === last.result; i--) n++
  return { result: last.result, n }
}

/** Per game (in order) a player's hits, for the games they batted in. */
function hitsByGame(pas: BattingPA[], gameOrder: string[]): Map<string, Array<{ gameId: string; h: number; ab: number }>> {
  const per = new Map<string, Map<string, { h: number; ab: number }>>()
  for (const p of pas) {
    if (!p.batter || !p.result) continue
    let m = per.get(p.batter)
    if (!m) { m = new Map(); per.set(p.batter, m) }
    const g = m.get(p.gameId) ?? { h: 0, ab: 0 }
    if (isHitResult(p.result)) g.h++
    if (!NON_AB_RESULTS.has(p.result)) g.ab++
    m.set(p.gameId, g)
  }
  const out = new Map<string, Array<{ gameId: string; h: number; ab: number }>>()
  for (const [name, m] of per) out.set(name, gameOrder.filter((id) => m.has(id)).map((id) => ({ gameId: id, ...m.get(id)! })))
  return out
}

/** Games in a row (ending with the player's latest game) with at least one hit. */
export function hitStreak(games: Array<{ h: number }>): number {
  let n = 0
  for (let i = games.length - 1; i >= 0 && games[i].h > 0; i--) n++
  return n
}

/** Batters with a fair share of the plate appearances: at least 2 per team game and at least 10. */
export const qualifiedBatters = (lines: BattingLine[], games: number) => lines.filter((l) => l.pa >= Math.max(10, games * 2))
/** Pitchers with at least one inning per team game and at least 3 innings. */
export const qualifiedPitchers = (lines: PitchingLine[], games: number) => lines.filter((l) => l.outs >= Math.max(9, games * 3))

const top = <T,>(xs: T[], key: (x: T) => number | null, dir: 'max' | 'min' = 'max'): T | undefined => {
  const ok = xs.filter((x) => key(x) !== null)
  if (!ok.length) return undefined
  const best = ok.reduce((a, b) => ((dir === 'max' ? key(b)! > key(a)! : key(b)! < key(a)!) ? b : a))
  // a tie for first is not a story
  return ok.filter((x) => key(x) === key(best)).length === 1 ? best : undefined
}

export interface StoryInput { dataset: Dataset; summaries: GameSummary[]; batting: BattingPA[]; pitching: PitchingPA[]; params?: StatParams }

/** Up to `max` team stories, most interesting first, at most one per player. */
export function teamStories({ dataset, summaries, batting, pitching, params = DEFAULT_PARAMS }: StoryInput, max = 4): Story[] {
  const out: Story[] = []
  const used = new Set<string>()
  const add = (s: Story) => { if (out.length >= max || (s.player && used.has(s.player))) return; out.push(s); if (s.player) used.add(s.player) }
  const order = summaries.map((s) => s.game.id)
  const games = summaries.length
  if (!games) return out

  const streak = currentStreak(summaries)
  if (streak && streak.n >= 2) {
    add({ id: 'streak', kicker: streak.result === 'W' ? '連勝中' : '連敗中', figure: String(streak.n), tone: streak.result === 'W' ? 'good' : 'bad',
      text: streak.result === 'W' ? `目前 ${streak.n} 連勝，最近一場 ${summaries[games - 1].runsUs}：${summaries[games - 1].runsOpp} 擊敗${summaries[games - 1].game.opponent}` : `目前 ${streak.n} 連敗，最近一場 ${summaries[games - 1].runsUs}：${summaries[games - 1].runsOpp} 輸給${summaries[games - 1].game.opponent}` })
  }

  const byGame = hitsByGame(batting, order)
  const streaks = [...byGame].map(([name, g]) => ({ name, n: hitStreak(g) })).filter((s) => s.n >= 3).sort((a, b) => b.n - a.n)
  for (const s of streaks.slice(0, 1)) add({ id: `hit-${s.name}`, kicker: '連續安打', figure: String(s.n), tone: 'good', player: s.name, text: `${s.name} 連續 ${s.n} 場有安打` })

  // hot over the last 5 team games
  if (games >= 6) {
    const recent = new Set(order.slice(-5))
    const hot = battingLines(dataset, batting.filter((p) => recent.has(p.gameId)), params).filter((l) => l.ab >= 8 && (l.avg ?? 0) >= 0.4)
    const best = top(hot, (l) => l.avg)
    if (best) add({ id: `hot-${best.name}`, kicker: '近 5 場手感', figure: f3(best.avg), tone: 'good', player: best.name, text: `${best.name} 近 5 場 ${best.ab} 打數 ${best.h} 安，打擊率 ${f3(best.avg)}` })
  }

  const lines = battingLines(dataset, batting, params)
  const q = qualifiedBatters(lines, games)
  const avg = top(q, (l) => l.avg)
  if (avg) add({ id: `avg-${avg.name}`, kicker: '打擊率領先', figure: f3(avg.avg), tone: 'neutral', player: avg.name, text: `${avg.name} ${avg.ab} 打數 ${avg.h} 安，打擊率全隊最高` })
  const ops = top(q, (l) => l.ops)
  if (ops) add({ id: `ops-${ops.name}`, kicker: 'OPS 領先', figure: f3(ops.ops), tone: 'neutral', player: ops.name, text: `${ops.name} 上壘率 ${f3(ops.obp)}、長打率 ${f3(ops.slg)}，攻擊指數全隊第一` })
  const hr = top(lines.filter((l) => l.hr > 0), (l) => l.hr)
  if (hr) add({ id: `hr-${hr.name}`, kicker: '全壘打', figure: String(hr.hr), tone: 'neutral', player: hr.name, text: `${hr.name} 已敲 ${hr.hr} 支全壘打，全隊最多` })
  const sb = top(lines.filter((l) => l.sb >= 3), (l) => l.sb)
  if (sb) add({ id: `sb-${sb.name}`, kicker: '盜壘', figure: String(sb.sb), tone: 'neutral', player: sb.name, text: `${sb.name} ${sb.sb} 次盜壘成功${sb.cs ? `、${sb.cs} 次失敗` : '，還沒失手過'}` })

  const pl = pitchingLines(pitching, summaries.map((s) => s.game), params)
  const era = top(qualifiedPitchers(pl, games), (l) => l.era, 'min')
  if (era) add({ id: `era-${era.name}`, kicker: '防禦率最佳', figure: f2(era.era), tone: 'neutral', player: era.name, text: `${era.name} 投 ${era.ipDisplay} 局，防禦率全隊最低` })
  const k = top(pl.filter((l) => l.k >= 5), (l) => l.k)
  if (k) add({ id: `k-${k.name}`, kicker: '三振', figure: String(k.k), tone: 'neutral', player: k.name, text: `${k.name} 投 ${k.ipDisplay} 局送出 ${k.k} 次三振，全隊最多` })

  if (out.length < max && games >= 5) {
    const last5 = summaries.slice(-5)
    const w = last5.filter((s) => s.result === 'W').length, l = last5.filter((s) => s.result === 'L').length
    const rs = last5.reduce((a, s) => a + s.runsUs, 0)
    add({ id: 'last5', kicker: '近 5 場', figure: `${w}-${l}`, tone: w > l ? 'good' : w < l ? 'bad' : 'neutral', text: `近 5 場 ${w} 勝 ${l} 敗${5 - w - l ? ` ${5 - w - l} 和` : ''}，場均得 ${(rs / 5).toFixed(1)} 分` })
  }
  return out
}

/** Up to `max` sentences about one player, from the same slice the player page shows. */
export function playerStories(name: string, { dataset, summaries, batting, pitching, params = DEFAULT_PARAMS }: StoryInput, max = 3): Story[] {
  const out: Story[] = []
  const add = (s: Story) => { if (out.length < max) out.push(s) }
  const games = summaries.length
  if (!games) return out
  const order = summaries.map((s) => s.game.id)
  const lines = battingLines(dataset, batting, params)
  const me = lines.find((l) => l.name === name)
  const q = qualifiedBatters(lines, games)

  const mine = hitsByGame(batting, order).get(name) ?? []
  const streak = hitStreak(mine)
  if (streak >= 2) add({ id: 'streak', kicker: '連續安打', figure: String(streak), tone: 'good', text: `連續 ${streak} 場有安打` })

  if (me && q.some((l) => l.name === name)) {
    const rank = (key: (l: BattingLine) => number | null, dir: 'max' | 'min' = 'max') => {
      const v = key(me)
      if (v === null) return null
      const better = q.filter((l) => key(l) !== null && (dir === 'max' ? key(l)! > v : key(l)! < v)).length
      return better + 1
    }
    const ranked: Array<{ id: string; label: string; r: number | null; fig: string; note: string }> = [
      { id: 'avg', label: '打擊率', r: rank((l) => l.avg), fig: f3(me.avg), note: `${me.ab} 打數 ${me.h} 安` },
      { id: 'ops', label: 'OPS', r: rank((l) => l.ops), fig: f3(me.ops), note: `上壘率 ${f3(me.obp)}・長打率 ${f3(me.slg)}` },
      { id: 'obp', label: '上壘率', r: rank((l) => l.obp), fig: f3(me.obp), note: `${me.bb + me.hbp} 次保送觸身` },
      { id: 'k', label: '三振率', r: rank((l) => l.kPct, 'min'), fig: me.kPct === null ? '—' : `${Math.round(me.kPct * 100)}%`, note: `${me.pa} 打席 ${me.so} 次三振` },
      { id: 'whiff', label: '揮空率', r: rank((l) => l.whiffPct, 'min'), fig: me.whiffPct === null ? '—' : `${Math.round(me.whiffPct * 100)}%`, note: `${me.swings} 次揮棒 ${me.whiffs} 次落空` },
      { id: 'risp', label: '得點圈打擊率', r: me.rispAB >= 5 ? rank((l) => (l.rispAB >= 5 ? l.rispAvg : null)) : null, fig: f3(me.rispAvg), note: `${me.rispAB} 打數 ${me.rispH} 安` },
    ]
    for (const x of ranked.filter((x) => x.r !== null && x.r <= 3).sort((a, b) => a.r! - b.r!)) {
      const low = x.id === 'k' || x.id === 'whiff'
      add({ id: x.id, kicker: `${x.label}${low ? (x.r === 1 ? '隊內最低' : `隊內第 ${x.r} 低`) : (x.r === 1 ? '隊內第一' : `隊內第 ${x.r}`)}`, figure: x.fig, tone: x.r === 1 ? 'good' : 'neutral', text: x.note })
    }
  }

  if (mine.length >= 6) {
    const last = mine.slice(-5)
    const h = last.reduce((a, g) => a + g.h, 0), ab = last.reduce((a, g) => a + g.ab, 0)
    if (ab >= 8) add({ id: 'last5', kicker: '個人近 5 場', figure: f3(ab ? h / ab : null), tone: h / ab >= 0.35 ? 'good' : 'neutral', text: `${ab} 打數 ${h} 安` })
  }
  const best = mine.reduce<{ gameId: string; h: number } | null>((a, g) => (g.h >= 3 && (!a || g.h > a.h) ? g : a), null)
  if (best) {
    const g = summaries.find((s) => s.game.id === best.gameId)!.game
    add({ id: 'best', kicker: '單場最多安打', figure: String(best.h), tone: 'good', text: `${g.date.slice(5).replace('-', '/')} 對${g.opponent}` })
  }

  const pl = pitchingLines(pitching, summaries.map((s) => s.game), params)
  const p = pl.find((l) => l.name === name)
  if (p && p.outs >= 9) {
    const qp = qualifiedPitchers(pl, games)
    const isQ = qp.some((l) => l.name === name)
    const betterEra = qp.filter((l) => l.era !== null && p.era !== null && l.era < p.era).length
    if (isQ && p.era !== null && betterEra === 0) add({ id: 'era', kicker: '防禦率隊內最佳', figure: f2(p.era), tone: 'good', text: `投 ${p.ipDisplay} 局` })
    else add({ id: 'ip', kicker: '投球', figure: p.ipDisplay, tone: 'neutral', text: `${p.g} 場登板，${p.k} 次三振、防禦率 ${f2(p.era)}` })
  }
  return out
}
