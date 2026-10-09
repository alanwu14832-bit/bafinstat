// wave-2 stand-in: batch 6 owns this (countBefore / countBeforeText; batch 3 creates the file with WHERE + resultPhrase)
import { count, impliedResult } from '../record/model'

/**
 * The count before the pitch that ended the plate appearance: none without pitches; the ball in play is not counted;
 * a 4th ball / 3rd strike (or a workbook HBP pitch written as B) is not counted either; a live 觸身／故四／妨礙 adds
 * no pitch, so the whole list is the count.
 */
export function countBefore(pitches: string[], _result?: string): { balls: number; strikes: number } | null {
  if (!pitches.length) return null
  const head = pitches.slice(0, -1)
  if (pitches[pitches.length - 1] === 'IP') return count(head)
  if (impliedResult(pitches) && !impliedResult(head)) return count(head)
  return count(pitches)
}

/** 「1-1 後」 (balls first, like the B-S lights) or ''. */
export function countBeforeText(pa: { pitches: string[]; result: string }): string {
  const c = countBefore(pa.pitches, pa.result)
  return c ? `${c.balls}-${c.strikes} 後` : ''
}
