/** The game page's line score: X for the home half not needed, blank for a half nobody batted. */
import { describe, expect, it } from 'vitest'
import { boardLine, summarizeGame } from './stats'
import type { BattingPA, Dataset, Game, PitchingPA } from './types'

const bat = (inning: number, run = 0): BattingPA => ({ gameId: 'G', inning, batter: '甲', pitches: ['IP'], result: run ? '全壘打' : '內滾', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run, rbi: run })
const pit = (inning: number, scored = false): PitchingPA => ({ gameId: 'G', inning, pitcher: '投', pitches: ['IP'], result: scored ? '全壘打' : '內滾', code: scored ? 'ER' : 'I', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 })
const ds = (game: Game, b: BattingPA[], p: PitchingPA[]) => ({ games: [game], batting: b, pitching: p, fielding: [], roster: [] }) as unknown as Dataset

describe('boardLine', () => {
  it('we are home and ahead after the top of the 7th: X in our 7th', () => {
    const g: Game = { id: 'G', date: '2026-10-19', tournament: '友誼賽', opponent: '對手', homeAway: '主', innings: 7 }
    const s = summarizeGame(ds(g, [1, 2, 3, 4, 5, 6].map((i) => bat(i, i === 1 ? 1 : 0)), [1, 2, 3, 4, 5, 6, 7].map((i) => pit(i))), g, new Set())
    expect(boardLine(s, 'us')).toEqual([1, 0, 0, 0, 0, 0, 'X'])
    expect(boardLine(s, 'opp')).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
  it('a game called after 5: innings 6 and 7 stay blank', () => {
    const g: Game = { id: 'G', date: '2026-10-19', tournament: '友誼賽', opponent: '對手', homeAway: '客', innings: 7 }
    const s = summarizeGame(ds(g, [1, 2, 3, 4, 5].map((i) => bat(i)), [1, 2, 3, 4, 5].map((i) => pit(i, i === 2))), g, new Set())
    expect(boardLine(s, 'us')).toEqual([0, 0, 0, 0, 0, null, null])
    expect(boardLine(s, 'opp')).toEqual([0, 1, 0, 0, 0, null, null])
  })
})
