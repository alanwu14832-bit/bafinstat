import { describe, expect, it } from 'vitest'
import { END_TIME_UNSUPPORTED, OPP_PITCHER_UNSUPPORTED, OPP_RUNNER_UNSUPPORTED, recordFieldWarnings } from './recordFields'

const messages = (w: { message: string }[]) => w.map((x) => x.message)

describe('warnings before the 2026-10-14 migration', () => {
  it('says the end time was not stored, only when the game has one', () => {
    expect(messages(recordFieldWarnings({ endTime: false, oppPitcher: true, oppRunner: true }, { games: [{ endTime: '15:22' }], batting: [] }, 'G1'))).toEqual([END_TIME_UNSUPPORTED])
    expect(recordFieldWarnings({ endTime: false, oppPitcher: true, oppRunner: true }, { games: [{}], batting: [] })).toEqual([])
  })
  it('says the opponent pitcher was not stored, only when a row has one', () => {
    expect(messages(recordFieldWarnings({ endTime: true, oppPitcher: false, oppRunner: true }, { games: [], batting: [{ oppHand: 'L' }] }))).toEqual([OPP_PITCHER_UNSUPPORTED])
    expect(recordFieldWarnings({ endTime: true, oppPitcher: false, oppRunner: true }, { games: [], batting: [{}] })).toEqual([])
  })
  it('says nothing once the columns exist', () => {
    expect(recordFieldWarnings({ endTime: true, oppPitcher: true, oppRunner: true }, { games: [{ endTime: '15:22' }], batting: [{ oppHand: 'R', oppPitcher: '王' }] })).toEqual([])
  })
  it('says the opponent pinch runner was not stored (2026-10-15), only when a pitching row has one', () => {
    const off = { endTime: true, oppPitcher: true, oppRunner: false }
    expect(messages(recordFieldWarnings(off, { games: [], batting: [], pitching: [{ runner: '12號' }] }, 'G1'))).toEqual([OPP_RUNNER_UNSUPPORTED])
    expect(OPP_RUNNER_UNSUPPORTED).toBe('對方代跑沒有存進雲端（其他紀錄照常儲存）：請管理員在 Supabase 執行 supabase/migrations/2026-10-15_opp_runner.sql')
    expect(recordFieldWarnings(off, { games: [], batting: [], pitching: [{}] })).toEqual([])
    expect(recordFieldWarnings(off, { games: [], batting: [] })).toEqual([])
  })
})
