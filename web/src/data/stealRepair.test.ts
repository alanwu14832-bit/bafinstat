import { describe, expect, it } from 'vitest'
import { applyStealRepairs, stealRepairs } from './stealRepair'
import { batterOutMark } from '../record/timeline'
import { auditGame } from './audit'
import type { BattingPA } from './types'

const bat = (x: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, batter: '甲', pitches: ['IP'], result: '一安', loc: 7, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...x })
// 甲 singles and steals second once during 乙's turn, but his count says 2 (the old editor counted it twice)
const rows = [
  bat({ batter: '甲', outsBefore: 0, basesBefore: '無', code: 'L', sb: 2 }),
  bat({ batter: '乙', outsBefore: 0, basesBefore: '2', result: '三振', pitches: ['S', 'S', 'S'], loc: undefined, code: 'I', events: [{ at: 1, kind: 'sb', from: 1, to: 2 }] }),
  bat({ batter: '丙', outsBefore: 1, basesBefore: '2', result: '三振', pitches: ['S', 'S', 'S'], loc: undefined, code: 'II', sb: 0 }),
  bat({ batter: '丁', outsBefore: 2, basesBefore: '2', result: '三振', pitches: ['S', 'S', 'S'], loc: undefined, code: 'III' }),
]

describe('依跑壘紀錄修正盜壘次數', () => {
  it('lowers a count above the recorded plays to what they show', () => {
    const fixes = stealRepairs(rows, [])
    expect(fixes).toEqual([{ side: 'bat', index: 0, inning: 1, name: '甲', from: 2, to: 1 }])
    expect(applyStealRepairs(rows, [], fixes).batting.map((r) => r.sb)).toEqual([1, 0, 0, 0])
  })
  it('never raises a count, and leaves games without runner plays alone', () => {
    expect(stealRepairs(rows.map((r) => ({ ...r, sb: 0 })), [])).toEqual([])
    expect(stealRepairs(rows.map((r) => ({ ...r, events: undefined })), [])).toEqual([])
  })
  it('an old game typed as counts stays alone after 「設成壘上出局」 adds the batter out mark', () => {
    // 1st: 甲 singles and steals (a count only), three outs; 2nd: 苗 triples and is thrown out at home on the play
    const legacy = [
      bat({ batter: '甲', code: 'L', sb: 1 }),
      bat({ batter: '乙', result: '三振', pitches: ['S', 'S', 'S'], loc: undefined, code: 'I' }),
      bat({ batter: '丙', result: '三振', pitches: ['S', 'S', 'S'], loc: undefined, code: 'II' }),
      bat({ batter: '丁', result: '三振', pitches: ['S', 'S', 'S'], loc: undefined, code: 'III' }),
      bat({ inning: 2, batter: '苗', result: '三安', code: 'I', outOnBase: 1, events: [batterOutMark('三安', 1)] }),
      bat({ inning: 3, batter: '戊' }),
    ]
    expect(stealRepairs(legacy, [])).toEqual([])
    expect(auditGame(legacy, []).filter((i) => i.message.includes('盜壘'))).toEqual([])
  })
})
