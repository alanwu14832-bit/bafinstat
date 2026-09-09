import { describe, expect, it } from 'vitest'
import { cleanLoc, normalizeDataset } from './normalize'
import { sprayCounts, sprayDirection } from './stats'
import { EMPTY_DATASET } from './types'

describe('落點 codes', () => {
  it('reads fielder numbers, gap codes and gap names', () => {
    expect(cleanLoc(6)).toBe(6)
    expect(cleanLoc('56')).toBe(56)
    expect(cleanLoc('三游')).toBe(56)
    expect(cleanLoc('右中')).toBe(89)
    expect(cleanLoc('7 LF')).toBe(7)
    expect(cleanLoc('')).toBeUndefined()
    expect(cleanLoc('x')).toBeUndefined()
  })

  it('gap hits count in the spray chart and in pull / oppo', () => {
    const pas = [{ loc: 56, traj: 'G', result: '一安' }, { loc: 89, traj: 'F', result: '二安' }, { loc: 8, traj: 'F', result: '外飛' }]
    const c = sprayCounts(pas)
    expect(c.all[56]).toBe(1); expect(c.hits[89]).toBe(1); expect(c.all[8]).toBe(1)
    expect(sprayDirection(56, 'R')).toBe('pull'); expect(sprayDirection(56, 'L')).toBe('oppo')
    expect(sprayDirection(46, 'R')).toBe('center'); expect(sprayDirection(89, 'R')).toBe('oppo')
  })

  it('a foul fly is an out credited to the fielder; a gap ground-out is left unplaced', () => {
    const game = { id: 'G1', date: '2026-01-01', tournament: 't', opponent: 'o', homeAway: '主' as const, innings: 1 }
    const pit = (result: string, loc: number, code: string) => ({ gameId: 'G1', inning: 1, pitcher: '投', pitches: ['IP'], result, loc, traj: 'F', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, code })
    const bat = { gameId: 'G1', inning: 1, batter: '捕', pos: 'C', pitches: ['IP'], result: '內滾', loc: 3, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, code: 'I' }
    const { dataset } = normalizeDataset({ ...EMPTY_DATASET, games: [game], batting: [bat], pitching: [pit('界外飛', 2, 'I'), pit('界外飛球', 2, 'II'), pit('內滾', 56, 'III')] })
    const c = dataset.fielding.find((f) => f.pos === 'C')!
    expect(c.po).toBe(2)
    expect(dataset.pitching[1].result).toBe('界外飛')
  })
})
