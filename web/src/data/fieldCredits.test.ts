/**
 * 刺殺／助殺 on a 野選 or a 雙殺 come from the base the recorder said the runner was put out at (紀錄比賽 asks it), not a
 * fixed 6-4-3 shape: the fielder who handled the ball gets the assist, whoever covers that base the putout; a 野選 with
 * nobody out credits nobody; a caught line drive is the catcher's putout, then the runner doubled off.
 */
import { describe, expect, it } from 'vitest'
import { creditPlays } from './normalize'
import type { FieldingLine, PitchingPA, PlayEvent } from './types'

const POS = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P']
const lines = (): FieldingLine[] => POS.map((pos) => ({ gameId: 'G', player: pos === 'P' ? '投' : pos, pos, innings: 1, po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0 }))
const row = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G', inning: 1, outsBefore: 0, pitcher: '投', pitches: ['IP'], result: '內滾', loc: 6, traj: 'G', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })
const out = (from: 1 | 2 | 3, outAt: PlayEvent['outAt']): PlayEvent => ({ at: 1, kind: 'tag', from, to: 'out', play: true, outAt })
const credit = (p: PitchingPA) => { const l = lines(); creditPlays(l, [p]); return Object.fromEntries(l.filter((x) => x.po || x.a || x.dp).map((x) => [x.pos, [x.po, x.a, x.dp]])) }

describe('野選', () => {
  it('the third baseman steps on third himself: his putout, no assist', () => {
    expect(credit(row({ result: '野選', loc: 5, code: 'I', basesBefore: '12', events: [out(2, 3)] }))).toEqual({ '3B': [1, 0, 0] })
  })
  it('5-2 at the plate: the assist to 3B, the putout to the catcher', () => {
    expect(credit(row({ result: '野選', loc: 5, code: 'I', basesBefore: '123', events: [out(3, 'home')] }))).toEqual({ '3B': [0, 1, 0], C: [1, 0, 0] })
  })
  it('nobody out (everyone safe): nobody credited', () => {
    expect(credit(row({ result: '野選', loc: 5, basesBefore: '3', code: 'R' }))).toEqual({})
  })
  it('a row saved before the base was asked keeps the old guess (6 → 2B)', () => {
    expect(credit(row({ result: '野選', loc: 6, code: 'I', basesBefore: '1' }))).toEqual({ SS: [0, 1, 0], '2B': [1, 0, 0] })
  })
})

describe('雙殺', () => {
  it('1-3-5 (the lead runner forced at 3B): 1 → 3B, then 3B relays to 1B', () => {
    expect(credit(row({ result: '雙殺', loc: 1, code: 'II', basesBefore: '12', events: [out(2, 3)] }))).toEqual({ P: [0, 1, 1], '3B': [1, 1, 1], '1B': [1, 0, 1] })
  })
  it('6-4-3 said as 死在 2B: the same as before', () => {
    expect(credit(row({ result: '雙殺', loc: 6, code: 'II', basesBefore: '1', events: [out(1, 2)] }))).toEqual({ SS: [0, 1, 1], '2B': [1, 1, 1], '1B': [1, 0, 1] })
  })
  it('a line drive caught by the first baseman, who steps on first: his two putouts, one double play, no assist', () => {
    expect(credit(row({ result: '雙殺', loc: 3, traj: 'L', code: 'II', basesBefore: '1', events: [out(1, 1)] }))).toEqual({ '1B': [2, 0, 1] })
  })
  it('a fly to left, the runner from third thrown out at the plate: LF putout + assist, catcher putout', () => {
    expect(credit(row({ result: '雙殺', loc: 7, traj: 'F', code: 'II', basesBefore: '3', events: [out(3, 'home')] }))).toEqual({ LF: [1, 1, 1], C: [1, 0, 1] })
  })
})
