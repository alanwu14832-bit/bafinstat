/**
 * Who is up next on the 即時比分 board: 準備打擊／再下一棒 for the team at bat, and the first three of the other
 * team after the side is retired (攻守交換後, MLB's "due up"). Pure, read only: it never changes the RecordState.
 * The opponent is usually known by batting order only (第 5 棒); a name is added when the recorder typed one
 * (記對方打者姓名, or the name on an earlier row in that slot).
 */
import { offense, oppBatterOf, weBatTop, type RecordState, type Score } from './model'

export interface UpBatter { us: boolean; order: number; name: string }

/** Our batters from lineup index `slot` on, n of them; a lineup shorter than n is never repeated. */
export function ourFrom(s: RecordState, slot: number, n: number): UpBatter[] {
  const len = s.lineup.length
  if (!len) return []
  const out: UpBatter[] = []
  for (let k = 0; k < Math.min(n, len); k++) {
    const i = (((slot + k) % len) + len) % len
    out.push({ us: true, order: i + 1, name: s.lineup[i]?.name ?? '' })
  }
  return out
}

/** Their batters from batting order `order` (1–9) on, n of them. */
export function oppFrom(s: RecordState, order: number, n: number): UpBatter[] {
  return Array.from({ length: n }, (_, k) => {
    const o = ((((order - 1 + k) % 9) + 9) % 9) + 1
    return { us: false, order: o, name: oppNameAt(s, o) }
  })
}

/** The opponent's name in a batting-order slot: the batter at the plate as the record page shows him, else their
 *  typed lineup (記對方打者姓名), else the latest of today's rows in that slot that has one, else ''. */
export function oppNameAt(s: RecordState, order: number): string {
  // (s.oppOrder is the batter at the plate only while they bat; while we bat it is just their next batter)
  if (offense(s) === 'opp' && order === s.oppOrder) return oppBatterOf(s)
  const typed = s.oppNames ? s.oppLineup?.[order - 1] ?? '' : ''
  if (typed) return typed
  for (let i = s.pitching.length - 1; i >= 0; i--) {
    const p = s.pitching[i]
    if (p.oppOrder === order && p.oppBatter) return p.oppBatter
  }
  return ''
}

/** 準備打擊 (on deck) and 再下一棒 (in the hole) of the team at bat; never the batter at the plate. */
export function onDeckOf(s: RecordState): { onDeck: UpBatter | null; inHole: UpBatter | null } {
  const next = offense(s) === 'us'
    ? ourFrom(s, s.slot + 1, 2).filter((b) => b.order - 1 !== s.slot)
    : oppFrom(s, (s.oppOrder % 9) + 1, 2).filter((b) => b.order !== s.oppOrder)
  return { onDeck: next[0] ?? null, inHole: next[1] ?? null }
}

const homeAway = (s: RecordState, sc: Score) => {
  const i = s.inning - 1
  return weBatTop(s)
    ? { home: sc.opp, away: sc.us, homeIn: sc.lineOpp[i] ?? 0, awayIn: sc.lineUs[i] ?? 0 }
    : { home: sc.us, away: sc.opp, homeIn: sc.lineUs[i] ?? 0, awayIn: sc.lineOpp[i] ?? 0 }
}

/**
 * Is the half-inning the draft is on really played? The record page moves on to the next half after every third
 * out, also when the game is already over (until the recorder taps 結束比賽): the bottom of the last inning with the
 * home team ahead, or an extra inning after a half that broke the tie. Judged by the score when the half began.
 */
export function halfPlayed(s: RecordState, sc: Score, regulation: number): boolean {
  const { home, away, homeIn, awayIn } = homeAway(s, sc)
  if (s.half === 'bottom') return s.inning < regulation || home - homeIn <= away
  return s.inning <= regulation || away - awayIn === home
}

/** Will the next half-inning be played? Only the regulation rule: no mercy rule, no time limit. */
export function nextHalfPlayed(s: RecordState, sc: Score, regulation: number): boolean {
  if (!halfPlayed(s, sc, regulation)) return false
  const { home, away } = homeAway(s, sc)
  if (s.inning < regulation) return true
  // top of the last inning (or later) with the home team ahead: the bottom is not played
  if (s.half === 'top') return !(home > away)
  // after the bottom of the last inning (or later) the game goes on only when tied
  return home === away
}

/** The fielding team's first three for the next half (ours from s.slot, theirs from s.oppOrder); [] when that half will not be played. */
export function dueUp(s: RecordState, sc: Score, regulation: number): UpBatter[] {
  if (!nextHalfPlayed(s, sc, regulation)) return []
  return offense(s) === 'us' ? oppFrom(s, s.oppOrder, 3) : ourFrom(s, s.slot, 3)
}

/** '3 棒 王小明' (ours) · '第 5 棒' · '第 5 棒 陳某' */
export function upLabel(b: UpBatter): string {
  if (b.us && b.name) return `${b.order} 棒 ${b.name}`
  return b.name ? `第 ${b.order} 棒 ${b.name}` : `第 ${b.order} 棒`
}
