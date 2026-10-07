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

describe('rebuilding an inning whose saved bases do not add up', () => {
  it('lays the runners out from the results and can then be followed', async () => {
    const { rebuildHalf } = await import('./timeline')
    // two runners "on second" (written before that bug was fixed)
    const broken = inning.map((r, i) => (i === 3 ? { ...r, basesBefore: '22' } : r))
    expect(inferHalf(broken, idx, 'bat')).toBeNull()
    const rb = rebuildHalf(broken, idx, 'bat')
    for (const st of rb.steps) expect(stepProblems(st, String)).toEqual([])
    const fixed = deriveHalf(broken, rb, 'bat')
    expect(inferHalf(fixed, idx, 'bat')).not.toBeNull()
    // 甲 (saved as scoring) still scores; the outs stay I, II, III
    expect(fixed[0]).toMatchObject({ run: 1, code: 'R' })
    expect(fixed.slice(3).map((r) => r.code)).toEqual(['I', 'II', 'III'])
  })
})

describe('逐球跑壘: runner plays between pitches', () => {
  it('a wild pitch moves everyone on that pitch, is saved on that plate appearance, and reads back the same', async () => {
    const { addPlay, removePlay, midOf } = await import('./timeline')
    const h0 = inferHalf(inning, idx, 'bat')!
    // 丁 at bat with 乙 on 3B and 丙 on 1B: the first pitch gets away, both move up
    const { half: h, added } = addPlay(h0, 3, 1, 'wp', [1, 2])
    expect(added.map((m) => `${m.from}>${m.to}`)).toEqual(['3>home', '1>2'])
    expect(midOf(h.steps[3]).map((o) => `${o.base}${inning[o.row].batter}`)).toEqual(['2丙'])
    const rows = deriveHalf(inning, h, 'bat')
    expect(rows[1]).toMatchObject({ run: 1, code: 'R' })
    expect(rows[3]).toMatchObject({ basesBefore: '2', outsBefore: 0, events: [{ at: 1, kind: 'wp', from: 3, to: 'home' }, { at: 1, kind: 'wp', from: 1, to: 2 }] })
    // read back from the saved rows: the batter came up with 乙 and 丙 on, the plays happened during his pitches
    const again = inferHalf(rows, idx, 'bat')!
    expect(again.steps[3].before.map((o) => o.base)).toEqual([3, 1])
    expect(deriveHalf(rows, again, 'bat')).toEqual(rows)
    // taking both plays back restores the inning
    const back = removePlay(removePlay(h, 3, 1).half, 3, 0).half
    expect(deriveHalf(inning, back, 'bat').map((r) => r.basesBefore)).toEqual(inning.map((r) => r.basesBefore))
  })
  it('a steal into an occupied base pushes the runner ahead; a caught stealing is the next out', async () => {
    const { addPlay, outsIn } = await import('./timeline')
    const h0 = inferHalf(inning, idx, 'bat')!
    // 丙 steals second on 戊's first pitch (乙 on third stays), then home on the next, then is caught stealing
    let h = addPlay(h0, 4, 1, 'sb', [2]).half
    expect(h.steps[4].moves.map((m) => `${m.kind}${m.from}>${m.to}`)).toEqual(['sb1>2'])
    // and a second steal pushes 乙 on third home on the same steal
    h = addPlay(h, 4, 2, 'sb', [2]).half
    expect(h.steps[4].moves.map((m) => `${m.kind}${m.from}>${m.to}`)).toEqual(['sb1>2', 'sb3>home', 'sb2>3'])
    h = addPlay(h, 4, 3, 'cs', [2]).half
    expect(outsIn(h.steps[4])).toBe(2)
    const rows = deriveHalf(inning, h, 'bat')
    expect(rows[1]).toMatchObject({ run: 1, code: 'R' })
    expect(rows[2]).toMatchObject({ code: 'II', outOnBase: 1 })
    expect(rows[4]).toMatchObject({ outsBefore: 2, basesBefore: '無', code: 'III' })
  })
})

describe('changing an earlier plate appearance is never blocked by a later one', () => {
  it('a walk moved back from 2B to 1B: the next batter reaching first forces him along instead of refusing', () => {
    // 甲 walks and is on 2B when 乙 comes up (he took it at some point); 乙 singles, 甲 stays on 2B
    const rows = [
      pa({ batter: '甲', result: '保送', basesBefore: '無', outsBefore: 0, code: 'L' }),
      pa({ batter: '乙', result: '一安', basesBefore: '2', outsBefore: 0, code: 'L' }),
      pa({ batter: '丙', result: '三振', basesBefore: '12', outsBefore: 0, code: 'I' }),
      pa({ batter: '丁', result: '三振', basesBefore: '12', outsBefore: 1, code: 'II' }),
      pa({ batter: '戊', result: '三振', basesBefore: '12', outsBefore: 2, code: 'III' }),
    ]
    const ix = rows.map((_, i) => i)
    const h = setEnd(inferHalf(rows, ix, 'bat')!, 0, 'batter', 1)
    const name = (r: number) => rows[r].batter
    expect(h.steps.flatMap((s) => stepProblems(s, name))).toEqual([])
    expect(h.steps[1].dest).toEqual({ 0: 2 })
    expect(deriveHalf(rows, h, 'bat').map((r) => r.basesBefore)).toEqual(['無', '1', '12', '12', '12'])
  })
})

describe('taking back a runner play', () => {
  it('a steal taken back before a walk: the walk forces him to second instead of the removal being refused', async () => {
    const { addPlay, removePlay, outsIn } = await import('./timeline')
    const rows = [
      pa({ batter: '甲', result: '一安', basesBefore: '無', outsBefore: 0, code: 'L' }),
      pa({ batter: '乙', result: '保送', basesBefore: '1', outsBefore: 0, code: 'L' }),
      pa({ batter: '丙', result: '三振', basesBefore: '12', outsBefore: 0, code: 'I' }),
      pa({ batter: '丁', result: '三振', basesBefore: '12', outsBefore: 1, code: 'II' }),
      pa({ batter: '戊', result: '三振', basesBefore: '12', outsBefore: 2, code: 'III' }),
    ]
    const ix = rows.map((_, i) => i)
    // 甲 steals second before 乙's first pitch, then 乙 walks (甲 not forced: first is empty)
    const withSteal = deriveHalf(rows, addPlay(inferHalf(rows, ix, 'bat')!, 1, 0, 'sb', [0]).half, 'bat')
    expect(withSteal[1]).toMatchObject({ basesBefore: '2', events: [{ at: 0, kind: 'sb', from: 1, to: 2 }] })
    const h = inferHalf(withSteal, ix, 'bat')!
    const { half: back, removed } = removePlay(h, 1, 0)
    expect(removed).toBeTruthy()
    expect(back.steps.flatMap((s) => stepProblems(s, (r) => rows[r].batter))).toEqual([])
    expect(back.steps[1].dest).toEqual({ 0: 2 })
    expect(outsIn(back.steps[1])).toBe(0)
    expect(deriveHalf(withSteal, back, 'bat')[1]).toMatchObject({ basesBefore: '1' })
    expect(deriveHalf(withSteal, back, 'bat')[1].events).toBeUndefined()
  })
})
