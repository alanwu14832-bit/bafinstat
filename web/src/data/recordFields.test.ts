import { describe, expect, it } from 'vitest'
import { END_TIME_UNSUPPORTED, OPP_PITCHER_UNSUPPORTED, recordFieldWarnings } from './recordFields'

const messages = (w: { message: string }[]) => w.map((x) => x.message)

describe('warnings before the 2026-10-14 migration', () => {
  it('says the end time was not stored, only when the game has one', () => {
    expect(messages(recordFieldWarnings({ endTime: false, oppPitcher: true }, { games: [{ endTime: '15:22' }], batting: [] }, 'G1'))).toEqual([END_TIME_UNSUPPORTED])
    expect(recordFieldWarnings({ endTime: false, oppPitcher: true }, { games: [{}], batting: [] })).toEqual([])
  })
  it('says the opponent pitcher was not stored, only when a row has one', () => {
    expect(messages(recordFieldWarnings({ endTime: true, oppPitcher: false }, { games: [], batting: [{ oppHand: 'L' }] }))).toEqual([OPP_PITCHER_UNSUPPORTED])
    expect(recordFieldWarnings({ endTime: true, oppPitcher: false }, { games: [], batting: [{}] })).toEqual([])
  })
  it('says nothing once the columns exist', () => {
    expect(recordFieldWarnings({ endTime: true, oppPitcher: true }, { games: [{ endTime: '15:22' }], batting: [{ oppHand: 'R', oppPitcher: '王' }] })).toEqual([])
  })
})
