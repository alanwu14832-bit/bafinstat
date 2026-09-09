import { describe, expect, it } from 'vitest'
import { auditGame } from './audit'
import { SEED_DATASET } from './seed'

describe('row-level audit', () => {
  it('is quiet on a clean game and finds the known problems in the other', () => {
    const structural = (id: string) => auditGame(SEED_DATASET.batting.filter((p) => p.gameId === id), SEED_DATASET.pitching.filter((p) => p.gameId === id)).filter((i) => !i.message.includes('落點'))
    expect(structural('G20251010-01')).toEqual([])
    // 12/22: the scorer's sheet really has these (out codes out of order in the 1st, a run coded R with 得分 blank, a 2-out 雙殺)
    const issues = structural('G20251222-01')
    expect(issues.some((i) => i.message.includes('順序倒退'))).toBe(true)
    expect(issues.some((i) => i.message.includes('代碼 R 但「得分」空白'))).toBe(true)
    expect(issues.some((i) => i.message.includes('2 出局後不可能雙殺'))).toBe(true)
  })
  it('flags the suspicious row', () => {
    const bat = SEED_DATASET.batting.filter((p) => p.gameId === 'G20251010-01').map((p) => ({ ...p }))
    bat[1] = { ...bat[1], result: '三振', code: 'III' }         // skips II
    bat[2] = { ...bat[2], pitches: ['B', 'B', 'B', 'B'], result: '一安', loc: 6 }
    bat[3] = { ...bat[3], run: 1, code: 'L' }
    const issues = auditGame(bat, [])
    expect(issues.some((i) => i.index === 1 && i.message.includes('跳到 III'))).toBe(true)
    expect(issues.some((i) => i.index === 2 && i.message.includes('4 個壞球'))).toBe(true)
    expect(issues.some((i) => i.index === 3 && i.message.includes('不是 R'))).toBe(true)
  })
})
