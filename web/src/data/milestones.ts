/**
 * 里程碑: round career numbers (50 安, 25 局…). `nextMilestone` is pure (the live page uses it with its own career
 * totals); upcoming / reached read the history index (data/history.ts). A milestone is 「在望」 only for a current
 * player with something already on the board (so 「再 1 支就首轟」 never shows) and within the ladder's window.
 */
import { isActive, type GameRef, type HistoryIndex } from './history'
import { ipDisplay } from './stats'

export type MilestoneKey = 'h' | 'hr' | 'rbi' | 'r' | 'sb' | 'g' | 'k' | 'outs' | 'w'
export interface Milestone {
  key: MilestoneKey
  side: 'bat' | 'pit'
  /** 「生涯安打」 */
  label: string
  steps: number[]
  /** how close counts as 在望 (same unit as the value; outs for 局數) */
  window: number
  /** what is left, as words: 「2 支」「0.2 局」 */
  left: (n: number) => string
  /** the value as shown: 「48」「24.1」 */
  show: (n: number) => string
  /** 「再 2 支安打就生涯 50 安」 (without the name) */
  phrase: (left: number, target: number) => string
  /** 「敲出生涯第 50 支安打」 (without the name and the game) */
  reached: (target: number) => string
}

const n = String
export const MILESTONES: Milestone[] = [
  { key: 'h', side: 'bat', label: '生涯安打', steps: [10, 25, 50, 75, 100, 150, 200, 250, 300], window: 3, left: (x) => `${x} 支`, show: n, phrase: (l, t) => `再 ${l} 支安打就生涯 ${t} 安`, reached: (t) => `敲出生涯第 ${t} 支安打` },
  { key: 'hr', side: 'bat', label: '生涯全壘打', steps: [1, 5, 10, 15, 20, 30, 40, 50], window: 1, left: (x) => `${x} 支`, show: n, phrase: (l, t) => `再 ${l} 支全壘打就生涯 ${t} 轟`, reached: (t) => (t === 1 ? '敲出生涯第一支全壘打' : `敲出生涯第 ${t} 支全壘打`) },
  { key: 'rbi', side: 'bat', label: '生涯打點', steps: [10, 25, 50, 75, 100, 150, 200], window: 3, left: (x) => `${x} 分`, show: n, phrase: (l, t) => `再 ${l} 分打點就生涯 ${t} 打點`, reached: (t) => `拿下生涯第 ${t} 分打點` },
  { key: 'r', side: 'bat', label: '生涯得分', steps: [10, 25, 50, 75, 100, 150, 200], window: 3, left: (x) => `${x} 分`, show: n, phrase: (l, t) => `再得 ${l} 分就生涯 ${t} 分得分`, reached: (t) => `跑回生涯第 ${t} 分` },
  { key: 'sb', side: 'bat', label: '生涯盜壘', steps: [10, 25, 50, 75, 100], window: 2, left: (x) => `${x} 次`, show: n, phrase: (l, t) => `再 ${l} 次盜壘就生涯 ${t} 盜`, reached: (t) => `完成生涯第 ${t} 次盜壘` },
  { key: 'g', side: 'bat', label: '生涯出賽', steps: [25, 50, 75, 100, 150, 200], window: 1, left: (x) => `${x} 場`, show: n, phrase: (l, t) => `再出賽 ${l} 場就生涯 ${t} 場`, reached: (t) => `生涯第 ${t} 場出賽` },
  { key: 'k', side: 'pit', label: '生涯三振', steps: [25, 50, 100, 150, 200, 300], window: 5, left: (x) => `${x} 次`, show: n, phrase: (l, t) => `再 ${l} 次三振就生涯 ${t} K`, reached: (t) => `送出生涯第 ${t} 次三振` },
  { key: 'outs', side: 'pit', label: '生涯投球局數', steps: [25, 50, 100, 150, 200].map((x) => x * 3), window: 9, left: (x) => `${ipDisplay(x)} 局`, show: ipDisplay, phrase: (l, t) => `再 ${ipDisplay(l)} 局就生涯投滿 ${t / 3} 局`, reached: (t) => `生涯投球滿 ${t / 3} 局` },
  { key: 'w', side: 'pit', label: '生涯勝投', steps: [1, 5, 10, 15, 20, 30], window: 1, left: (x) => `${x} 勝`, show: n, phrase: (l, t) => `再 ${l} 勝就生涯 ${t} 勝`, reached: (t) => (t === 1 ? '拿下生涯第一勝' : `拿下生涯第 ${t} 勝`) },
]
const BY_KEY = new Map(MILESTONES.map((m) => [m.key, m]))

/** The next round number within reach: { target, left } when value > 0 and 0 < target − value ≤ the window; else null. */
export function nextMilestone(key: MilestoneKey, value: number): { target: number; left: number } | null {
  const m = BY_KEY.get(key)
  if (!m || !(value > 0)) return null
  const target = m.steps.find((s) => s > value)
  if (target === undefined) return null
  const left = target - value
  return left > 0 && left <= m.window ? { target, left } : null
}

/** The figure a milestone story shows: the target (innings for 局數). */
export const milestoneFigure = (key: MilestoneKey, target: number) => String(key === 'outs' ? target / 3 : target)

const careerValue = (h: HistoryIndex, name: string, m: Milestone): number => {
  const l = m.side === 'bat' ? h.batCareer.get(name) : h.pitCareer.get(name)
  return l ? ((l as unknown as Record<string, number>)[m.key] ?? 0) : 0
}

export interface UpcomingMilestone { key: MilestoneKey; label: string; value: number; target: number; left: number; text: string; progress: string }
/** Milestones in reach for a current player, closest first (by what is left over the window). */
export function upcomingMilestones(h: HistoryIndex, name: string): UpcomingMilestone[] {
  if (!isActive(h, name)) return []
  const out: Array<UpcomingMilestone & { rel: number }> = []
  for (const m of MILESTONES) {
    const value = careerValue(h, name, m)
    const next = nextMilestone(m.key, value)
    if (!next) continue
    out.push({ key: m.key, label: m.label, value, ...next, rel: next.left / m.window, text: `${name} ${m.phrase(next.left, next.target)}`, progress: `${m.label} ${m.show(value)}／${m.show(next.target)}・再 ${m.left(next.left)}` })
  }
  return out.sort((a, b) => a.rel - b.rel).map(({ rel: _rel, ...x }) => x)
}

export interface ReachedMilestone { key: MilestoneKey; label: string; target: number; game: GameRef; text: string; short: string }
/** Every round number he has passed, with the game it happened in (oldest first). */
export function reachedMilestones(h: HistoryIndex, name: string): ReachedMilestone[] {
  const out: ReachedMilestone[] = []
  for (const m of MILESTONES) {
    const rows = (m.side === 'bat' ? h.batGames.get(name) : h.pitGames.get(name)) ?? []
    let total = 0
    for (const r of rows) {
      const before = total
      total += (r.line as unknown as Record<string, number>)[m.key] ?? 0
      for (const t of m.steps) if (before < t && t <= total) {
        out.push({ key: m.key, label: m.label, target: t, game: r.game, short: m.reached(t).replace(/^(敲出|拿下|跑回|完成|送出)/, ''), text: `${name} ${r.game.date.slice(5).replace('-', '/')} 對${r.game.opponent}${m.reached(t)}` })
      }
    }
  }
  return out.sort((a, b) => a.game.date.localeCompare(b.game.date) || a.game.id.localeCompare(b.game.id))
}

export interface MilestoneStory { kind: 'reached' | 'upcoming'; player: string; key: MilestoneKey; target: number; text: string }
/** Milestones reached in the team's latest game first, then the ones in reach; `player` narrows to one person. */
export function milestoneCandidates(h: HistoryIndex, names: string[]): MilestoneStory[] {
  const last = h.games[h.games.length - 1]
  if (!last) return []
  const reached: MilestoneStory[] = []
  const upcoming: Array<MilestoneStory & { rel: number }> = []
  for (const name of names) {
    for (const r of reachedMilestones(h, name)) if (r.game.id === last.id) reached.push({ kind: 'reached', player: name, key: r.key, target: r.target, text: r.text })
    for (const u of upcomingMilestones(h, name)) upcoming.push({ kind: 'upcoming', player: name, key: u.key, target: u.target, text: u.text, rel: u.left / BY_KEY.get(u.key)!.window })
  }
  // the biggest number reached first; the closest one in reach first
  reached.sort((a, b) => b.target - a.target || a.player.localeCompare(b.player, 'zh-Hant'))
  upcoming.sort((a, b) => a.rel - b.rel || b.target - a.target || a.player.localeCompare(b.player, 'zh-Hant'))
  return [...reached, ...upcoming.map(({ rel: _rel, ...x }) => x)]
}
