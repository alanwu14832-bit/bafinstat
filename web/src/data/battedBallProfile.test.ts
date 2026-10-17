/** 投手擊球剖面: GB/LD/FB, Pull/Center/Oppo (the batter's side + 落點), Soft/Med/Hard, GB/FB, HR/FB, BABIP by 軌跡. */
import { describe, expect, it } from 'vitest'
import { pitchingLines } from './stats'
import type { PitchingPA } from './types'

const row = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G', inning: 1, pitcher: 'A', pitches: ['IP'], result: '內滾', loc: 6, traj: 'G', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, oppBats: 'R', ...p })

describe('擊球剖面 of a pitcher', () => {
  const rows = [
    row({ result: '一安', loc: 7, traj: 'G', quality: '強', code: undefined, outsBefore: 0 }),                  // right-handed batter, LF: pull
    row({ result: '內滾', loc: 6, traj: 'G', quality: '弱', outsBefore: 0, code: 'I' }),                       // SS: a pull ball for a righty
    row({ result: '二安', loc: 9, traj: 'L', quality: '強', outsBefore: 1 }),                                   // RF: oppo for a righty
    row({ result: '外飛', loc: 8, traj: 'F', quality: '中', outsBefore: 1, code: 'II' }),                      // CF: center
    row({ result: '全壘打', loc: 7, traj: 'F', quality: '強', outsBefore: 2 }),                                 // a fly ball home run
    row({ result: '一安', loc: 7, traj: 'G', oppBats: 'L', quality: '中', outsBefore: 2 }),                    // left-handed batter, LF: oppo
    row({ result: '內飛', loc: 5, traj: 'P', quality: '弱', outsBefore: 2, code: 'III' }),                     // pop-up: a fly ball and an IFFB
    row({ result: '三振', pitches: ['SS', 'SS', 'SS'], loc: undefined, traj: undefined, outsBefore: 0 }),       // no batted ball
    row({ result: '內滾', loc: 4, traj: undefined, oppBats: undefined, outsBefore: 0 }),                       // no 軌跡 (a ground out implies G), no side
  ]
  const l = pitchingLines(rows, [])[0]
  it('counts every batted ball, the rates only over the ones with that detail', () => {
    expect(l.bip).toBe(8)
    expect(l.bipTraj).toBe(7)                       // the unmarked 內滾 has no 軌跡: it is not taken for a grounder by its result
    expect([l.gb, l.ld, l.fb, l.iffb]).toEqual([3, 1, 3, 1])
    expect(l.gbPct).toBeCloseTo(3 / 7, 12)
    expect(l.gbFb).toBeCloseTo(3 / 3, 12)
  })
  it('Pull / Center / Oppo use the batter\'s own side and need the 落點 and the side', () => {
    expect(l.bipSpray).toBe(7)                      // the last ball has no side
    expect([l.pull, l.center, l.oppo]).toEqual([4, 1, 2])       // right-handed: 7, 6, 7 (HR), 5 pull · 8 center · 9 oppo; left-handed 7 oppo
    expect(l.pullPct).toBeCloseTo(4 / 7, 12)
  })
  it('Soft / Med / Hard over the balls with a 強度', () => {
    expect(l.bipQuality).toBe(7)
    expect([l.soft, l.med, l.hard]).toEqual([2, 2, 3])
    expect(l.softPct! + l.medPct! + l.hardPct!).toBeCloseTo(1, 12)
  })
  it('HR/FB: home runs that were fly balls over the fly balls; BABIP by 軌跡 leaves out home runs', () => {
    expect(l.hrFb).toBe(1)
    expect(l.hrFbPct).toBeCloseTo(1 / 3, 12)
    expect([l.gbH, l.gbN]).toEqual([2, 3])          // G: 一安, 內滾, 一安 (the unmarked 內滾 has no 軌跡)
    expect([l.ldH, l.ldN]).toEqual([1, 1])
    expect([l.fbH, l.fbN]).toEqual([0, 2])          // the home run is out of BABIP
    expect(l.babipLd).toBe(1)
  })
})
