/**
 * 規定打席／規定投球局: who qualifies for a rate leaderboard (打擊率, 防禦率…), by the rule the viewer picked.
 * - 隊內 (team, the default): PA ≥ 1; IP ≥ 0.7 × games (rounded up, at least 1).
 * - 大專規程 (college): PA ≥ 2.1 × games; IP ≥ 1 × games (rounded up).
 * `games` = the team's games in the current filter. Integer math throughout: Math.ceil(2.1 * 10) is 22.
 * Counting awards (全壘打, 打點) need no minimum; under 大專規程 ties are broken in a fixed order (COLLEGE_TIES).
 */
import { ipDisplay } from './stats'

export type QualRule = 'team' | 'college'
export const QUAL_RULES: QualRule[] = ['team', 'college']

/** Plate appearances needed to rank on rates. */
export function minPlateAppearances(rule: QualRule, games: number): number {
  return rule === 'college' ? Math.max(1, Math.floor((21 * games + 9) / 10)) : 1
}

/** Outs (IP × 3) needed to rank on rates. */
export function minOutsPitched(rule: QualRule, games: number): number {
  return rule === 'college' ? 3 * Math.max(1, games) : 3 * Math.max(1, Math.floor((7 * games + 9) / 10))
}

/** How far below the minimum: 「3 打席」. */
export const paGapText = (pa: number, min: number) => `${Math.max(0, min - pa)} 打席`
/** How far below the minimum in innings: 「1.2 局」. */
export const outsGapText = (outs: number, min: number) => `${ipDisplay(Math.max(0, min - outs))} 局`

/** The tie-break orders used under 大專規程 (the rules say nothing, so the site picks these; also in the 數據字典). */
export const COLLEGE_TIES = {
  avg: ['長打率', '上壘率'],
  era: ['投球局數', '被安打少'],
  rbi: ['打數少', '壘打數'],
  hr: ['打數少', '打點'],
} as const

export const QUAL_RULE_LABEL: Record<QualRule, string> = { team: '隊內', college: '大專規程' }

// ---------------------------------------------------------------- batch 5: career minimums (紀錄簿, 生涯)
/** 生涯 rate lists: 2.1 打席 per game over every game, capped at 100 打席. */
export function careerMinPA(totalGames: number): number {
  return Math.min(100, minPlateAppearances('college', totalGames))
}

/** 生涯 rate lists: 1 局 per game over every game, capped at 30 局 (90 outs). */
export function careerMinOuts(totalGames: number): number {
  return Math.min(90, 3 * Math.max(1, totalGames))
}
