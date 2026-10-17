import { describe, expect, it } from 'vitest'
import { END_TIME_UNSUPPORTED, OPP_BATS_UNSUPPORTED, OPP_ERRORS_UNSUPPORTED, OPP_PITCHER_UNSUPPORTED, OPP_RBI_UNSUPPORTED, OPP_RUNNER_UNSUPPORTED, recordFieldWarnings } from './recordFields'

const messages = (w: { message: string }[]) => w.map((x) => x.message)

describe('warnings before the 2026-10-14 migration', () => {
  it('says the end time was not stored, only when the game has one', () => {
    expect(messages(recordFieldWarnings({ endTime: false, oppPitcher: true, oppRunner: true, oppErrors: true, oppRbi: true, oppBats: true, priorPitchers: true }, { games: [{ endTime: '15:22' }], batting: [] }, 'G1'))).toEqual([END_TIME_UNSUPPORTED])
    expect(recordFieldWarnings({ endTime: false, oppPitcher: true, oppRunner: true, oppErrors: true, oppRbi: true, oppBats: true, priorPitchers: true }, { games: [{}], batting: [] })).toEqual([])
  })
  it('says the opponent pitcher was not stored, only when a row has one', () => {
    expect(messages(recordFieldWarnings({ endTime: true, oppPitcher: false, oppRunner: true, oppErrors: true, oppRbi: true, oppBats: true, priorPitchers: true }, { games: [], batting: [{ oppHand: 'L' }] }))).toEqual([OPP_PITCHER_UNSUPPORTED])
    expect(recordFieldWarnings({ endTime: true, oppPitcher: false, oppRunner: true, oppErrors: true, oppRbi: true, oppBats: true, priorPitchers: true }, { games: [], batting: [{}] })).toEqual([])
  })
  it('says nothing once the columns exist', () => {
    expect(recordFieldWarnings({ endTime: true, oppPitcher: true, oppRunner: true, oppErrors: true, oppRbi: true, oppBats: true, priorPitchers: true }, { games: [{ endTime: '15:22' }], batting: [{ oppHand: 'R', oppPitcher: '王' }] })).toEqual([])
  })
  it('says the opponent pinch runner was not stored (2026-10-15), only when a pitching row has one', () => {
    const off = { endTime: true, oppPitcher: true, oppRunner: false, oppErrors: true, oppRbi: true, oppBats: true, priorPitchers: true }
    expect(messages(recordFieldWarnings(off, { games: [], batting: [], pitching: [{ runner: '12號' }] }, 'G1'))).toEqual([OPP_RUNNER_UNSUPPORTED])
    expect(OPP_RUNNER_UNSUPPORTED).toBe('對方代跑沒有存進雲端（其他紀錄照常儲存）：請管理員在 Supabase 執行 supabase/migrations/2026-10-15_opp_runner.sql')
    expect(recordFieldWarnings(off, { games: [], batting: [], pitching: [{}] })).toEqual([])
    expect(recordFieldWarnings(off, { games: [], batting: [] })).toEqual([])
  })
  it('says 對方失誤 / 對方打點 were not stored (2026-10-15), only when the game has them', () => {
    const off = { endTime: true, oppPitcher: true, oppRunner: true, oppErrors: false, oppRbi: false, oppBats: true, priorPitchers: true }
    expect(messages(recordFieldWarnings(off, { games: [], batting: [{ errors: ['C'] }], pitching: [{ rbi: 2 }] }, 'G1'))).toEqual([OPP_ERRORS_UNSUPPORTED, OPP_RBI_UNSUPPORTED])
    expect(OPP_RBI_UNSUPPORTED).toContain('supabase/migrations/2026-10-15_opp_runner.sql')
    expect(recordFieldWarnings(off, { games: [], batting: [{}], pitching: [{ rbi: 0 }] })).toEqual([])
  })
})

describe('warnings before the 2026-10-16 migration (對方打者左右打)', () => {
  it('says the side was not stored, only when a pitching row has one', () => {
    const off = { endTime: true, oppPitcher: true, oppRunner: true, oppErrors: true, oppRbi: true, oppBats: false, priorPitchers: true }
    expect(messages(recordFieldWarnings(off, { games: [], batting: [], pitching: [{ oppBats: 'L' }] }, 'G1'))).toEqual([OPP_BATS_UNSUPPORTED])
    expect(OPP_BATS_UNSUPPORTED).toContain('supabase/migrations/2026-10-16_opp_bats.sql')
    expect(recordFieldWarnings(off, { games: [], batting: [], pitching: [{}] })).toEqual([])
    expect(recordFieldWarnings({ ...off, oppBats: true, priorPitchers: true }, { games: [], batting: [], pitching: [{ oppBats: 'R' }] })).toEqual([])
  })
})
