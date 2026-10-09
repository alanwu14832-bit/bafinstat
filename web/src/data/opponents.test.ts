import { describe, expect, it } from 'vitest'
import { lastOppLineup, oppBatterNames, oppPitcherOptions } from './opponents'
import type { BattingPA, Dataset, Game, PitchingPA } from './types'

const game = (id: string, date: string, opponent: string, extra: Partial<Game> = {}): Game => ({ id, date, tournament: '大專盃', opponent, homeAway: '主', ...extra })
const pit = (gameId: string, oppOrder: number, oppBatter?: string): PitchingPA => ({ gameId, inning: 1, oppOrder, pitcher: '壬', ...(oppBatter ? { oppBatter } : {}), pitches: [], result: '三振', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 })
const bat = (gameId: string, oppPitcher?: string, oppHand?: 'L' | 'R'): BattingPA => ({ gameId, inning: 1, batter: '甲', pitches: [], result: '三振', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...(oppPitcher ? { oppPitcher } : {}), ...(oppHand ? { oppHand } : {}) })

const ds: Dataset = {
  roster: [],
  games: [game('G0901', '2026-09-01', '群風'), game('G1001', '2026-10-01', ' 群風 '), game('G1005', '2026-10-05', '政大'), game('G1020', '2026-10-20', '群風', { status: 'scheduled' })],
  pitching: [
    ...Array.from({ length: 9 }, (_, i) => pit('G0901', i + 1, `a${i + 1}`)),
    pit('G1001', 1, 'b1'), pit('G1001', 2, 'b2'), pit('G1001', 3, 'b3'), pit('G1001', 4), pit('G1001', 1, 'b1'), pit('G1001', 2, '代打x'),
    pit('G1005', 1, '政1'),
  ],
  batting: [bat('G0901', '王', 'L'), bat('G1001', '王', 'R'), bat('G1001', '林'), bat('G1005', '政投', 'R')],
  fielding: [],
}

describe('earlier games against an opponent', () => {
  it('their last batting order with names: the starters of the newest game', () => {
    expect(lastOppLineup(ds, '群風')).toEqual({ gameId: 'G1001', date: '2026-10-01', names: ['b1', 'b2', 'b3', '', '', '', '', '', ''] })
    expect(lastOppLineup(ds, '台大')).toBeNull()
  })
  it('every batter name seen against them, newest game first, each once', () => {
    const names = oppBatterNames(ds, '群風')
    expect(names.slice(0, 4)).toEqual(['b1', 'b2', 'b3', '代打x'])
    expect(names).toContain('a9')
    expect(new Set(names).size).toBe(names.length)
    expect(names).not.toContain('政1')
  })
  it('the pitchers we faced, this game first, with the latest hand', () => {
    expect(oppPitcherOptions(ds, '群風')).toEqual([{ name: '林' }, { name: '王', hand: 'R' }])
    expect(oppPitcherOptions(ds, '群風', [bat('G2', '陳', 'L')])).toEqual([{ name: '陳', hand: 'L' }, { name: '林' }, { name: '王', hand: 'R' }])
  })
})
