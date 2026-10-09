import { describe, expect, it } from 'vitest'
import { auditGame } from './audit'
import { SEED_DATASET } from './seed'
import type { BattingPA } from './types'

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

describe('落點 gap codes', () => {
  it('a hit through the hole is fine, an out recorded in a gap is flagged', () => {
    const row = { gameId: 'G', inning: 1, batter: '甲', pitches: ['IP'], sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, traj: 'G' }
    const ok = auditGame([{ ...row, result: '一安', loc: 56 }], [])
    expect(ok).toEqual([])
    const bad = auditGame([{ ...row, result: '內滾', loc: 56, code: 'I' }], [])
    expect(bad.map((i) => i.message).join()).toContain('三游')
  })
})

describe('突破僵局 runners', () => {
  const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 8, batter: '甲', pitches: [], result: '', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
  const clean = [
    bat({ batter: '戊', result: '突破僵局', basesBefore: '無', outsBefore: 0, run: 1, code: 'R' }),
    bat({ batter: '己', result: '突破僵局', basesBefore: '2', outsBefore: 0, code: 'L' }),
    bat({ batter: '庚', result: '二安', pitches: ['IP'], loc: 8, traj: 'F', basesBefore: '12', outsBefore: 0, rbi: 1, code: 'L' }),
    bat({ batter: '辛', result: '三振', pitches: ['SS', 'SS', 'SS'], basesBefore: '23', outsBefore: 0, code: 'I' }),
    bat({ batter: '壬', result: '外飛', pitches: ['IP'], loc: 8, traj: 'F', basesBefore: '23', outsBefore: 1, code: 'II' }),
    bat({ batter: '甲', result: '內滾', pitches: ['IP'], loc: 6, traj: 'G', basesBefore: '23', outsBefore: 2, code: 'III' }),
  ]
  it('a clean tie-break inning has nothing to flag', () => {
    expect(auditGame(clean, [])).toEqual([])
  })
  it('flags pitches, a placed runner after a plate appearance, and an RBI', () => {
    const rows = clean.map((r) => ({ ...r }))
    rows[0] = { ...rows[0], pitches: ['B'] }
    rows[1] = { ...rows[1], rbi: 1 }
    const msgs = auditGame([...rows, bat({ inning: 8, batter: '乙', result: '突破僵局', code: 'L' })], []).map((i) => i.message)
    expect(msgs).toContain('第 8 局・戊：突破僵局跑者不是打席，不應該有逐球')
    expect(msgs).toContain('第 8 局・己：突破僵局跑者不會有打點')
    expect(msgs).toContain('第 8 局・乙：突破僵局跑者要排在這局最前面')
  })
})
