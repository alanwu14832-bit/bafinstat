/**
 * 2026-11-27 audit: a 失誤 result plus the fielder who really erred typed as well counted two errors (the 系隊's 11/13 game
 * read 10). 紀錄比賽 and 修改資料 now pick who the result is charged to (「這次失誤算給」: the 落點 moves to him), a fielder
 * picked again for a 失誤進壘 on that play is the same error, and old rows that read two ways are flagged.
 */
import { describe, expect, it } from 'vitest'
import { errorsOf, fielderLoc, oppErrorsOf, ourDoubledResult, resultErrorPos, theirDoubledResult, withOwnListed } from './errors'
import { auditGame } from './audit'
import type { BattingPA, PitchingPA, PlayEvent } from './types'

const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G', inning: 1, pitcher: '壬', oppOrder: 3, pitches: ['IP'], result: '', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, traj: 'G', code: 'R', ...p })
const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, batter: '甲', pitches: ['IP'], result: '', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, traj: 'G', ...p })
const between: PlayEvent = { at: 1, kind: 'err', from: 1, to: 2 } as PlayEvent
const count = (p: PitchingPA) => { const e = errorsOf(p); return e.positions.length + e.unknown }

describe('who a 失誤 result is charged to', () => {
  it('is its 落點’s fielder; picking someone else moves the 落點 to his number', () => {
    expect(resultErrorPos({ result: '失誤', loc: 6 })).toBe('SS')
    expect(resultErrorPos({ result: '失誤', loc: 56 })).toBeUndefined()
    expect(resultErrorPos({ result: '一安', loc: 6 })).toBeUndefined()
    expect(fielderLoc('1B')).toBe(3)
    expect(fielderLoc('RF')).toBe(9)
    // a grounder to short, the first baseman dropped the throw: charged to him, one error
    expect(errorsOf(pit({ result: '失誤', loc: fielderLoc('1B') }))).toEqual({ positions: ['1B'], unknown: 0 })
  })
})

describe('our list that reads two ways', () => {
  it('落點 SS with 2B typed as well is flagged (counted twice)', () => {
    const p = pit({ result: '失誤', loc: 6, errors: ['2B'] })
    expect(count(p)).toBe(2)
    expect(ourDoubledResult(p)).toEqual({ own: 'SS', others: ['2B'] })
  })
  it('not when the 落點’s fielder is listed too (two on purpose), the list is a 失誤進壘’s, or there is no 失誤 result', () => {
    expect(ourDoubledResult(pit({ result: '失誤', loc: 6, errors: ['2B', 'SS'] }))).toBeNull()
    expect(ourDoubledResult(pit({ result: '失誤', loc: 6, errors: ['2B'], events: [between] }))).toBeNull()
    expect(ourDoubledResult(pit({ result: '一安', loc: 6, errors: ['LF'] }))).toBeNull()
    expect(ourDoubledResult(pit({ result: '失誤', loc: 56, errors: ['SS'] }))).toBeNull()
  })
  it('withOwnListed writes the result’s own out next to the others: the same count, read one way only', () => {
    const before = pit({ result: '失誤', loc: 6, errors: ['C'] })
    const after = pit({ result: '失誤', loc: 6, errors: withOwnListed(['C'], '失誤', 6) })
    expect(after.errors).toEqual(['SS', 'C'])
    expect(count(after)).toBe(count(before))
    expect(ourDoubledResult(after)).toBeNull()
    expect(withOwnListed([], '失誤', 6)).toEqual([])
    expect(withOwnListed(['SS'], '失誤', 6)).toEqual(['SS'])
    expect(withOwnListed(['LF'], '一安', 7)).toEqual(['LF'])
  })
  it('the game page, 修改資料 and an Excel import each say how to fix it there', () => {
    const rows = [pit({ result: '失誤', loc: 6, errors: ['2B'], code: 'L' })]
    const msg = (place: 'page' | 'editor' | 'excel') => auditGame([], rows, place).map((i) => i.message).find((m) => m.includes('共算 2 次'))
    expect(msg('editor')).toContain('在「這次失誤算給」點 2B')
    expect(msg('page')).toContain('到「修改資料」打開這個打席')
    expect(msg('excel')).toContain('「落點」改填 4')
    expect(auditGame([], [pit({ result: '失誤', loc: 6, errors: ['2B', 'SS'], code: 'L' })]).some((i) => i.message.includes('共算'))).toBe(false)
  })
})

describe('their list: the 落點’s fielder listed again', () => {
  it('is a second error by him, so 修改資料 points it out', () => {
    const b = bat({ result: '失誤', loc: 6, errors: ['SS'] })
    expect(oppErrorsOf(b).count).toBe(2)
    expect(theirDoubledResult(b)).toBe('SS')
    expect(theirDoubledResult(bat({ result: '失誤', loc: 6, errors: ['SS'], events: [between] }))).toBeNull()
    expect(theirDoubledResult(bat({ result: '失誤', loc: 6, errors: ['C'] }))).toBeNull()
  })
})
