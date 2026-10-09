// wave-2 stand-in: batch 5 owns this (only nextMilestone, which the live page needs; the merge keeps batch 5's version)
/** Career milestones: the round numbers worth a sentence, and how close a player is to the next one. */

export type MilestoneKey = 'h' | 'hr' | 'rbi' | 'r' | 'sb' | 'g' | 'k' | 'outs' | 'w'

/** ladder of targets and how close (in the same unit) counts as 「快到了」 */
const LADDERS: Record<MilestoneKey, { at: number[]; window: number }> = {
  h: { at: [10, 25, 50, 75, 100, 150, 200, 250, 300], window: 3 },
  hr: { at: [1, 5, 10, 15, 20, 30, 40, 50], window: 1 },
  rbi: { at: [10, 25, 50, 75, 100, 150, 200], window: 3 },
  r: { at: [10, 25, 50, 75, 100, 150, 200], window: 3 },
  sb: { at: [10, 25, 50, 75, 100], window: 2 },
  g: { at: [25, 50, 75, 100, 150, 200], window: 1 },
  k: { at: [25, 50, 100, 150, 200, 300], window: 5 },
  outs: { at: [25, 50, 100, 150, 200].map((ip) => ip * 3), window: 9 },
  w: { at: [1, 5, 10, 15, 20, 30], window: 1 },
}

/** The next target within reach: value > 0 and 0 < target − value <= the ladder's window; otherwise null. */
export function nextMilestone(key: MilestoneKey, value: number): { target: number; left: number } | null {
  const l = LADDERS[key]
  if (!l || !(value > 0)) return null
  const target = l.at.find((t) => t > value)
  if (target === undefined) return null
  const left = target - value
  return left > 0 && left <= l.window ? { target, left } : null
}
