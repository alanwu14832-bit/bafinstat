import { describe, expect, it } from 'vitest'
import { ipDisplay, outsCredited, pitchingLines } from './stats'
import type { PitchingPA } from './types'

// one row per opposing batter: result, code (his fate), outs before his plate appearance, pitcher
const row = (pitcher: string, result: string, code: string | undefined, outsBefore: number | undefined, inning = 3): PitchingPA =>
  ({ gameId: 'G1', inning, pitcher, pitches: ['IP'], result, sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...(code ? { code } : {}), ...(outsBefore !== undefined ? { outsBefore } : {}) })
const ip = (pas: PitchingPA[]) => Object.fromEntries(pitchingLines(pas, []).map((l) => [l.name, ipDisplay(l.outs)]))

describe('IP: every out once, to the pitcher on the mound', () => {
  it('a double play recorded live (the runner coded on his own row) is 2 outs, not 3 (模擬比賽 2026-10-08)', () => {
    const pas = [row('乙', '一安', 'I', 0), row('乙', '雙殺', 'II', 0), row('乙', '保送', 'ER', 2), row('乙', '全壘打', 'ER', 2), row('乙', '三振', 'III', 2)]
    expect(ip(pas)).toEqual({ 乙: '1.0' })
    const c = outsCredited(pas)
    expect([c.get(pas[0]) ?? 0, c.get(pas[1])]).toEqual([0, 2])
  })
  it('a workbook double play (code on the batter only) is still 2 outs', () => {
    expect(ip([row('乙', '一安', undefined, 0), row('乙', '雙殺', 'II', 0), row('乙', '三振', 'III', 2)])).toEqual({ 乙: '1.0' })
  })
  it('the reliever gets the double play that erases a runner his predecessor walked', () => {
    const pas = [row('甲', '內滾', 'I', 0), row('甲', '保送', 'II', 1), row('乙', '雙殺', 'III', 1)]
    // 甲: one out (the ground ball); 乙: the double play's two outs, although the runner's row is 甲's
    expect(ip(pas)).toEqual({ 甲: '0.1', 乙: '0.2' })
  })
  it('a pickoff before the next batter counts once', () => {
    expect(ip([row('乙', '保送', 'I', 0), row('乙', '一安', 'ER', 1), row('乙', '內滾', 'II', 1), row('乙', '三振', 'III', 2)])).toEqual({ 乙: '1.0' })
  })
  it('without outs-before the out stays on the row that carries it', () => {
    const pas = [row('甲', '內滾', 'I', undefined), row('甲', '保送', 'II', undefined), row('乙', '雙殺', 'III', undefined)]
    expect(ip(pas)).toEqual({ 甲: '0.2', 乙: '0.1' })
  })
  it('the same out number twice in an inning (bad inning numbers) falls back to counting row by row', () => {
    const pas = ['I', 'II', 'III', 'I', 'II', 'III'].map((c) => row('丁', '三振', c, undefined, 1))
    expect(ip(pas)).toEqual({ 丁: '2.0' })
  })
})
