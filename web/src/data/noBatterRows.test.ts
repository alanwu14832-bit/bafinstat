/** A 未完成打席 or 未面對打者 row faced no batter: no plate appearance or at-bat in the opponent's batting, no box on the sheet. */
import { describe, expect, it } from 'vitest'
import { oppBattingLines, oppTotals } from './opponent'
import { buildScoresheet } from './scoresheet'
import { RELIEF, UNFINISHED, type PitchingPA } from './types'

const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G', inning: 1, outsBefore: 0, basesBefore: '無', oppOrder: 1, pitcher: '壬', pitches: ['IP'], result: '內滾', code: 'I', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })

describe('rows with no batter', () => {
  const rows = [pit({}), pit({ oppOrder: 2, result: '一安', code: undefined }), pit({ oppOrder: undefined, result: UNFINISHED, code: undefined, pitches: ['B', 'B'], cs: 1 }), pit({ inning: 2, oppOrder: undefined, result: RELIEF, code: undefined, pitches: [], pk: 1 })]
  it('are no plate appearance of the opponent', () => {
    expect(oppTotals(rows)).toMatchObject({ pa: 2, ab: 2, h: 1 })
    expect(oppBattingLines(rows).map((l) => l.pa)).toEqual([1, 1])
  })
  it('get no box on the score sheet', () => {
    const sheet = buildScoresheet(rows, 'pit', { innings: 2 })
    expect(sheet.totals).toMatchObject({ pa: 2, ab: 2 })
    expect(sheet.lines.some((l) => l.order === null)).toBe(false)
  })
})
