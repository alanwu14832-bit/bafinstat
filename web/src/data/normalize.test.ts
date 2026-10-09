import { describe, expect, it } from 'vitest'
import { cleanHand, normalizeDataset } from './normalize'
import type { BattingPA, Dataset, PitchingPA } from './types'

const bat = (extra: Partial<BattingPA> = {}): BattingPA => ({ gameId: 'G1', inning: 1, outsBefore: 0, batter: '甲', pitches: ['IP'], result: '一安', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...extra })
const pit = (extra: Partial<PitchingPA> = {}): PitchingPA => ({ gameId: 'G1', inning: 1, outsBefore: 0, pitcher: '壬', pitches: ['IP'], result: '內滾', code: 'I', loc: 6, sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...extra })
const ds = (over: Partial<Dataset> = {}): Dataset => ({
  roster: [{ name: '甲' }, { name: '壬' }],
  games: [{ id: 'G1', date: '2026-10-09', tournament: '大專盃', opponent: '群風', homeAway: '主' }],
  batting: [], pitching: [], fielding: [], ...over,
})

describe('normalize: 對方投手, 結束時間, 對方打者, 中繼', () => {
  it('reads the opponent pitcher hand written any common way', () => {
    expect(cleanHand('左')).toBe('L')
    expect(cleanHand('左投')).toBe('L')
    expect(cleanHand('LHP')).toBe('L')
    expect(cleanHand('left')).toBe('L')
    expect(cleanHand('r')).toBe('R')
    expect(cleanHand('右投')).toBe('R')
    expect(cleanHand('X')).toBeUndefined()
    expect(cleanHand(undefined)).toBeUndefined()
  })
  it('cleans the batting rows: hand L / R, name trimmed, keys left out when there is nothing', () => {
    const out = normalizeDataset(ds({ batting: [
      bat({ oppHand: '左' as never, oppPitcher: ' 王 ' }),
      bat({ oppHand: 'r' as never, oppPitcher: '' }),
      bat({ oppHand: 'X' as never }),
    ] })).dataset.batting
    expect(out[0]).toMatchObject({ oppHand: 'L', oppPitcher: '王' })
    expect(out[1].oppHand).toBe('R')
    expect('oppPitcher' in out[1]).toBe(false)
    expect('oppHand' in out[2] || 'oppPitcher' in out[2]).toBe(false)
  })
  it('keeps the end time as HH:MM, drops one it cannot read', () => {
    const games = normalizeDataset(ds({ games: [
      { id: 'G1', date: '2026-10-09', tournament: 'A', opponent: 'B', homeAway: '主', time: '13:07', endTime: '15:22:00' },
      { id: 'G2', date: '2026-10-09', tournament: 'A', opponent: 'B', homeAway: '主', endTime: 'abc' },
    ] })).dataset.games
    expect(games[0].endTime).toBe('15:22')
    expect('endTime' in games[1]).toBe(false)
  })
  it('trims the opponent batter, drops a blank one', () => {
    const out = normalizeDataset(ds({ pitching: [pit({ oppBatter: ' 12號 ' }), pit({ oppBatter: '  ' })] })).dataset.pitching
    expect(out[0].oppBatter).toBe('12號')
    expect('oppBatter' in out[1]).toBe(false)
  })
  it('running it twice changes nothing', () => {
    const input = ds({
      games: [{ id: 'G1', date: '2026-10-09', tournament: '大專盃', opponent: '群風', homeAway: '主', time: '13:07', endTime: '1522', holds: ['壬'] }],
      batting: [bat({ oppHand: '右投' as never, oppPitcher: ' 王 ' }), bat({ batter: '甲' })],
      pitching: [pit({ oppBatter: ' A1 ' }), pit({ oppBatter: '' })],
    })
    const once = normalizeDataset(input).dataset
    const twice = normalizeDataset(once).dataset
    expect(twice).toEqual(once)
  })
  it('warns about a 中繼 who did not pitch in that game', () => {
    const w = (holds: string[], pitching: PitchingPA[]) => normalizeDataset(ds({ games: [{ id: 'G1', date: '2026-10-09', tournament: 'A', opponent: 'B', homeAway: '主', holds }], pitching })).warnings.map((x) => x.message)
    expect(w(['子'], [pit()]).some((m) => m.includes('中繼 子'))).toBe(true)
    expect(w(['壬'], [pit()]).some((m) => m.includes('中繼'))).toBe(false)
    // a game without its pitching rows (an old import) is not checked
    expect(w(['子'], []).some((m) => m.includes('中繼'))).toBe(false)
  })
})
