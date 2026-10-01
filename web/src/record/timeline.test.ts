import { describe, expect, it } from 'vitest'
import { deriveHalf, inferHalf, setEnd, stepAfter, stepProblems } from './timeline'
import type { BattingPA } from '../data/types'

const pa = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, batter: '甲', pitches: [], result: '', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
// 1st inning: 甲 single, 乙 double (甲 to 3B), 丙 single (甲 scores, 乙 to 3B), 丁 strikeout, 戊 fly, 己 ground out
const inning = [
  pa({ batter: '甲', result: '一安', basesBefore: '無', outsBefore: 0, run: 1, code: 'R' }),
  pa({ batter: '乙', result: '二安', basesBefore: '1', outsBefore: 0, code: 'L' }),
  pa({ batter: '丙', result: '一安', basesBefore: '23', outsBefore: 0, code: 'L', rbi: 1 }),
  pa({ batter: '丁', result: '三振', basesBefore: '13', outsBefore: 0, code: 'I' }),
  pa({ batter: '戊', result: '外飛', basesBefore: '13', outsBefore: 1, code: 'II' }),
  pa({ batter: '己', result: '內滾', basesBefore: '13', outsBefore: 2, code: 'III' }),
]
const idx = inning.map((_, i) => i)

describe('runner timeline', () => {
  it('knows who was on base each plate appearance; the runner who scored is gone afterwards', () => {
    const h = inferHalf(inning, idx, 'bat')!
    expect(h.steps.map((s) => s.before.map((o) => `${o.base}${inning[o.row].batter}`).join(' '))).toEqual(['', '1甲', '3甲 2乙', '3乙 1丙', '3乙 1丙', '3乙 1丙'])
    expect(h.steps[2].dest).toEqual({ 0: 'home', 1: 3 })
    expect(stepAfter(h.steps[5])).toEqual([{ row: 1, base: 3 }, { row: 2, base: 1 }])
  })
  it('a runner sent home later in the inning disappears from the plate appearances after it', () => {
    let h = inferHalf(inning, idx, 'bat')!
    h = setEnd(h, 3, 1, 'home') // 乙 scores on 丁's plate appearance (a wild pitch, say)
    expect(h.steps[4].before.map((o) => inning[o.row].batter)).toEqual(['丙'])
    const rows = deriveHalf(inning, h, 'bat')
    expect(rows[1]).toMatchObject({ run: 1, code: 'R' })
    expect(rows.map((r) => r.basesBefore)).toEqual(['無', '1', '23', '13', '1', '1'])
    // and back: he stays, and is on base again for the rest of the inning, left there at the end
    h = setEnd(h, 3, 1, 3)
    expect(deriveHalf(inning, h, 'bat')).toEqual(deriveHalf(inning, inferHalf(inning, idx, 'bat')!, 'bat'))
  })
  it('an out on the bases gets the right out code and moves the others', () => {
    let h = inferHalf(inning, idx, 'bat')!
    h = setEnd(h, 3, 2, 'out') // 丙 picked off during 丁's at bat, before 丁 struck out
    const rows = deriveHalf(inning, h, 'bat')
    expect(rows[2]).toMatchObject({ code: 'I', outOnBase: 1 })
    expect(rows[3].code).toBe('II')
    expect(rows[4]).toMatchObject({ outsBefore: 2, basesBefore: '3', code: 'III' })
  })
  it('flags two runners on one base and passing', () => {
    const h = inferHalf(inning, idx, 'bat')!
    const name = (r: number) => inning[r].batter
    expect(stepProblems({ ...h.steps[2], batter: 3 }, name).join()).toContain('都在 3B')
    expect(stepProblems({ ...h.steps[2], dest: { 0: 'home', 1: 'home' }, batter: 'home' }, name)).toEqual([])
    expect(stepProblems({ ...h.steps[3], dest: { 1: 3, 2: 'home' } }, name).join()).toContain('超過前面的')
  })
  it('cannot follow innings without 壘上(前)', () => {
    expect(inferHalf(inning.map((r) => ({ ...r, basesBefore: undefined })), idx, 'bat')).toBeNull()
  })
})

describe('a new result for the batter moves him (and forces runners), never his later running', () => {
  it('walk with the bases loaded forces a run; a home run clears the bases; an out leaves runners alone', async () => {
    const { setBatterResult, homesIn } = await import('./timeline')
    // 丁 walks instead of striking out: 1B 丙 → 2B, 3B 乙 stays (not forced)
    let h = setBatterResult(inferHalf(inning, idx, 'bat')!, 3, '保送')
    expect(h.steps[3].dest).toEqual({ 1: 3, 2: 2 })
    expect(h.steps[3].batter).toBe(1)
    expect(h.steps[4].before.map((o) => o.base)).toEqual([3, 2, 1])
    // and then 戊 walks too: bases loaded → 乙 forced home
    h = setBatterResult(h, 4, '保送')
    expect(h.steps[4].dest).toMatchObject({ 1: 'home', 2: 3, 3: 2 })
    expect(homesIn(h.steps[4])).toBe(1)
    // a home run by 己: everyone scores
    h = setBatterResult(h, 5, '全壘打')
    expect(homesIn(h.steps[5])).toBe(4)
    expect(stepProblems(h.steps[5], (r) => inning[r].batter)).toEqual([])
  })
})
