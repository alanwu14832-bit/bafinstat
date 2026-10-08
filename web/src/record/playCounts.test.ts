import { describe, expect, it } from 'vitest'
import { addPlay, applyPlayCounts, inferHalf, setBatterResult } from './timeline'
import type { BattingPA } from '../data/types'

const bat = (x: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, batter: '甲', pitches: ['IP'], result: '一安', loc: 7, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...x })
// 甲 singles; during 乙's plate appearance 甲 steals second; 乙, 丙, 丁 strike out
const rows = [
  bat({ batter: '甲', outsBefore: 0, basesBefore: '無', code: 'L', sb: 1 }),
  bat({ batter: '乙', outsBefore: 0, basesBefore: '2', result: '三振', pitches: ['S', 'S', 'S'], loc: undefined, code: 'I', events: [{ at: 1, kind: 'sb', from: 1, to: 2 }] }),
  bat({ batter: '丙', outsBefore: 1, basesBefore: '2', result: '三振', pitches: ['S', 'S', 'S'], loc: undefined, code: 'II' }),
  bat({ batter: '丁', outsBefore: 2, basesBefore: '2', result: '三振', pitches: ['S', 'S', 'S'], loc: undefined, code: 'III' }),
]

describe('盜壘次數跟著跑壘紀錄（修改資料不再重複計算）', () => {
  it('a steal the timeline drops after an earlier edit comes off the count, so adding it back counts once', () => {
    const half = inferHalf(rows, [0, 1, 2, 3], 'bat')!
    expect(half).not.toBeNull()
    // 甲's hit becomes a double: he is already on second, so the steal of second during 乙's turn is dropped
    const doubled = setBatterResult(half, 0, '二安')
    expect(doubled.steps[1].moves).toHaveLength(0)
    const after1 = applyPlayCounts(rows, half, doubled, 'bat')
    expect(after1[0].sb).toBe(0)
    // the recorder adds the steal again (now of third): one steal, not two
    const { half: readded } = addPlay(doubled, 1, 1, 'sb', [0])
    const after2 = applyPlayCounts(after1, doubled, readded, 'bat')
    expect(after2[0].sb).toBe(1)
  })
  it('a count typed by hand for a play the timeline does not have is left alone', () => {
    const typed = rows.map((r, i) => (i === 2 ? { ...r, sb: 1 } : r))
    const half = inferHalf(typed, [0, 1, 2, 3], 'bat')!
    const { half: h } = addPlay(half, 3, 1, 'sb', [0])
    expect(applyPlayCounts(typed, half, h, 'bat')[2].sb).toBe(1)
  })
})
