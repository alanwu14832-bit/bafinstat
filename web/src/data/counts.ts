/**
 * The ball–strike count of a plate appearance, worked out from its pitch codes (S/SS/CS/F/IP/B): which counts it went
 * through, the count the deciding pitch was thrown in, and when it reached two strikes. Used by the 情境拆分 (count
 * splits, 球數格) and by 兩好球纏鬥 (a QAB kind).
 *
 * Counts are written 'b-s' (balls first): '1-2' = 1壞2好. A foul adds a strike only before two strikes; S (好球, not
 * known whether he swung) counts as a strike. Codes it does not know are skipped. A pitch after the one that decided
 * the plate appearance (a data slip) no longer moves the count, but still counts towards twoStrikeAt, the way the
 * workbook's 兩好球纏鬥 formula reads the cells.
 */
export const KNOWN_PITCHES = new Set(['S', 'SS', 'CS', 'F', 'IP', 'B'])
const STRIKEISH = new Set(['S', 'SS', 'CS', 'F'])

export const countKey = (b: number, s: number) => `${b}-${s}`

export interface CountTrail {
  /** known pitches (= the plate appearance's pitch count) */
  n: number
  /** every count the plate appearance was in, in order, once each ('0-0' first) */
  passed: string[]
  /** the count the last pitch was thrown in; null without pitches */
  final: string | null
  /** the pitch (1-based) on which it reached two strikes; null if it never did */
  twoStrikeAt: number | null
}

export function countTrail(pitches: string[]): CountTrail {
  const ps = pitches.filter((p) => KNOWN_PITCHES.has(p))
  const passed: string[] = []
  let b = 0, s = 0, strikeish = 0
  let twoStrikeAt: number | null = null
  let final: string | null = null
  const pass = (k: string) => { if (!passed.includes(k)) passed.push(k) }
  ps.forEach((p, i) => {
    if (STRIKEISH.has(p)) { strikeish++; if (strikeish === 2 && twoStrikeAt === null) twoStrikeAt = i + 1 }
    if (final !== null) return
    const here = countKey(b, s)
    pass(here)
    if (p === 'IP') final = here
    else if (p === 'B') { b++; if (b === 4) final = here }
    else if (p === 'F') { if (s < 2) s++ }
    else { s++; if (s === 3) final = here }
  })
  // the deciding pitch was not written down (觸身, 妨礙, a 故四 with a few balls, an import without IP): the count it stood at
  if (ps.length > 0 && final === null) { final = countKey(b, s); pass(final) }
  return { n: ps.length, passed, final, twoStrikeAt }
}

/** 兩好球纏鬥: after reaching two strikes he saw 3 or more pitches, counting the last one (GameChanger's rule). */
export const isTwoStrikeBattle = (t: CountTrail) => t.twoStrikeAt !== null && t.n - t.twoStrikeAt >= 3
export const twoStrikeBattle = (pitches: string[]) => isTwoStrikeBattle(countTrail(pitches))

/** Balls and strikes of a 'b-s' count. */
export const countParts = (k: string): [number, number] => { const [b, s] = k.split('-').map(Number); return [b, s] }
