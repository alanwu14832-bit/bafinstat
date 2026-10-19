/** 雙殺打 (GIDP) is a ground ball's: a line drive or fly caught with a runner doubled off is a double play, no GIDP. */
import { describe, expect, it } from 'vitest'
import { battingLines } from './stats'
import { RESULT_TEXT } from './broadcast'
import type { BattingPA } from './types'

const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, outsBefore: 0, basesBefore: '1', order: 1, batter: '甲', pitches: ['IP'], result: '雙殺', code: 'II', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })

describe('雙殺打', () => {
  it('counts only ground-ball double plays', () => {
    const rows = [bat({ traj: 'G', loc: 6 }), bat({ traj: 'L', loc: 6 }), bat({ traj: 'F', loc: 8 }), bat({})]
    const ds = { roster: [], games: [{ id: 'G', date: '2026-10-19', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const }], batting: rows, pitching: [], fielding: [] }
    const line = battingLines(ds, rows).find((l) => l.name === '甲')!
    expect(line.gidp).toBe(2)
  })
  it('the broadcast says so', () => {
    expect(RESULT_TEXT.雙殺({ result: '雙殺', traj: 'L', loc: 6, pitches: ['IP'] } as never)).toContain('跑者回不去形成雙殺')
    expect(RESULT_TEXT.雙殺({ result: '雙殺', traj: 'G', loc: 6, pitches: ['IP'] } as never)).toContain('雙殺打')
  })
})

describe('innings in the 守備 table', () => {
  it('read and written the baseball way', async () => {
    const { ipText, parseIp } = await import('../components/ui/GameEditor')
    expect(ipText(25 / 3)).toBe('8.1')
    expect(ipText(11 / 3)).toBe('3.2')
    expect(ipText(7)).toBe('7.0')
    expect(parseIp('8.1')).toBeCloseTo(25 / 3)
    expect(parseIp('5.2')).toBeCloseTo(17 / 3)
    expect(parseIp('7')).toBe(7)
    expect(parseIp('')).toBeUndefined()
  })
})
