// wave-2 stand-in: batch 4 owns this (the rule-based base API below); batch 5 adds careerMinPA / careerMinOuts at the end
/**
 * 規定打席／規定局數. 'team' = the site's own 隊內 minimum, 'college' = 大專規程 (2.1 打席 and 1 局 per team game,
 * fractions rounded up). Integer maths throughout: Math.ceil(2.1 * 10) is 22, not 21.
 */
export type QualRule = 'team' | 'college'

/** Plate appearances a batter needs over `g` team games. */
export function minPlateAppearances(rule: QualRule, g: number): number {
  return rule === 'college' ? Math.max(1, Math.floor((21 * g + 9) / 10)) : 1
}

/** Outs a pitcher needs over `g` team games (隊內: 0.7 局 per game, rounded up to whole innings). */
export function minOutsPitched(rule: QualRule, g: number): number {
  return rule === 'college' ? 3 * Math.max(1, g) : 3 * Math.max(1, Math.floor((7 * g + 9) / 10))
}

// ---------------------------------------------------------------- batch 5: career minimums (紀錄簿, 生涯)
/** 生涯 rate lists: 2.1 打席 per game over every game, capped at 100 打席. */
export function careerMinPA(totalGames: number): number {
  return Math.min(100, minPlateAppearances('college', totalGames))
}

/** 生涯 rate lists: 1 局 per game over every game, capped at 30 局 (90 outs). */
export function careerMinOuts(totalGames: number): number {
  return Math.min(90, 3 * Math.max(1, totalGames))
}
