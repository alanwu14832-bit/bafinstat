import { describe, expect, it } from 'vitest'
import { auditGame } from './audit'
import type { BattingPA } from './types'

const bat = (x: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, batter: '甲', pitches: ['X'], result: '一安', loc: 7, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...x })
const msgs = (b: BattingPA[]) => auditGame(b, []).map((i) => i.message)

describe('打點與盜壘的檢查 (D01 / D03)', () => {
  it('flags an inning whose RBI are more than its runs (9 runs driven in, 6 scored)', () => {
    const rows = [bat({ basesBefore: '123', rbi: 4, result: '全壘打', code: 'R', run: 1 }), bat({ basesBefore: '12', rbi: 2, code: 'R', run: 1 }), bat({ basesBefore: '123', rbi: 3, result: '二安' })]
    expect(msgs(rows).some((m) => m.includes('打點合計 9') && m.includes('只得 2 分'))).toBe(true)
  })
  it('flags a play that drove in more runs than there were runners', () => {
    expect(msgs([bat({ basesBefore: '13', result: '內滾', rbi: 3, code: 'I', loc: 6 }), bat({ run: 1, code: 'R' }), bat({ run: 1, code: 'R' }), bat({ run: 1, code: 'R' })]).some((m) => m.includes('壘上 2 人，最多 2 分打點，卻記了 3'))).toBe(true)
  })
  it('flags more than 3 steals on one time on base', () => {
    expect(msgs([bat({ sb: 4 })]).some((m) => m.includes('盜壘 4'))).toBe(true)
  })
  it('flags steals that the runner events of a pitch-by-pitch game do not show', () => {
    const rows = [
      bat({ inning: 1, sb: 2, events: [{ at: 0, kind: 'sb', from: 1, to: 2 }] }), bat({ inning: 1, result: '三振', pitches: ['S', 'S', 'S'], loc: undefined, code: 'I', outsBefore: 0 }), bat({ inning: 1, result: '三振', pitches: ['S', 'S', 'S'], loc: undefined, code: 'II', outsBefore: 1 }), bat({ inning: 1, result: '三振', pitches: ['S', 'S', 'S'], loc: undefined, code: 'III', outsBefore: 2 }),
      bat({ inning: 2 }),
    ]
    expect(msgs(rows).some((m) => m.includes('我隊盜壘 2 次，但跑壘紀錄裡只有 1 次'))).toBe(true)
  })
  it('a consistent game passes', () => {
    const rows = [bat({ basesBefore: '', rbi: 0, code: 'R', run: 1, sb: 1, events: [] }), bat({ basesBefore: '2', rbi: 1, events: [{ at: 0, kind: 'sb', from: 1, to: 2 }] })]
    expect(msgs(rows).filter((m) => m.includes('打點') || m.includes('盜壘'))).toEqual([])
  })
})
