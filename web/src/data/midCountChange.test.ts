/** A pitching change in the middle of a count: the walk of a batter already ahead (rule 9.16(h)) and the plays before it are the pitcher who left. */
import { describe, expect, it } from 'vitest'
import { pitchingLines } from './stats'
import type { PitchingPA } from './types'

const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G', inning: 1, outsBefore: 0, basesBefore: '無', oppOrder: 1, pitcher: '乙', pitches: [], result: '保送', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })
const lines = (rows: PitchingPA[]) => new Map(pitchingLines(rows, []).map((l) => [l.name, l]))

describe('a change in the middle of a count', () => {
  it('2-1 when 甲 left, 乙 walked him: the walk, the batter and his run are 甲’s; the pitches are split', () => {
    const m = lines([pit({ pitches: ['B', 'B', 'S', 'B', 'B'], priorPitchers: [{ name: '甲', pitches: 3 }], code: 'ER' })])
    expect(m.get('甲')).toMatchObject({ bf: 1, bb: 1, r: 1, er: 1, pc: 3 })
    expect(m.get('乙')).toMatchObject({ bf: 0, bb: 0, r: 0, pc: 2 })
  })
  it('1-1 when he left: the walk is the reliever’s; a wild pitch before the change stays with 甲', () => {
    const m = lines([pit({ pitches: ['B', 'S', 'B', 'B', 'B'], priorPitchers: [{ name: '甲', pitches: 2 }], wp: 1, basesBefore: '1', events: [{ at: 2, kind: 'wp', from: 1, to: 2 }] })])
    expect(m.get('甲')).toMatchObject({ bf: 0, bb: 0, wp: 1 })
    expect(m.get('乙')).toMatchObject({ bf: 1, bb: 1, wp: 0 })
  })
})
