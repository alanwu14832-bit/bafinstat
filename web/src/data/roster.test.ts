import { describe, expect, it } from 'vitest'
import { applyRosterChange, playersWithRecords, validateRosterChange } from './roster'
import { SEED_DATASET } from './seed'
import type { GameDayRoster } from './types'

describe('roster edits', () => {
  it('renames a player across every record', () => {
    const change = { players: [{ original: '蘇柏愷', player: { ...SEED_DATASET.roster.find((p) => p.name === '蘇柏愷')!, name: '蘇柏凱' } }], removed: [] }
    expect(validateRosterChange(SEED_DATASET, change)).toBeNull()
    const next = applyRosterChange(SEED_DATASET, change)
    expect(next.roster.some((p) => p.name === '蘇柏凱')).toBe(true)
    expect(next.roster.some((p) => p.name === '蘇柏愷')).toBe(false)
    expect(next.batting.filter((p) => p.batter === '蘇柏凱').length).toBe(SEED_DATASET.batting.filter((p) => p.batter === '蘇柏愷').length)
    expect(next.batting.some((p) => p.batter === '蘇柏愷')).toBe(false)
  })
  it('adds and refuses to remove players with records', () => {
    const add = { players: [{ original: '', player: { name: '新人', number: '99', status: '現役' } }], removed: [] }
    expect(applyRosterChange(SEED_DATASET, add).roster.some((p) => p.name === '新人')).toBe(true)
    expect(validateRosterChange(SEED_DATASET, { players: [], removed: ['許振謙'] })).toContain('不能刪除')
    expect(playersWithRecords(SEED_DATASET).has('許振謙')).toBe(true)
    const withNew = applyRosterChange(SEED_DATASET, add)
    expect(validateRosterChange(withNew, { players: [], removed: ['新人'] })).toBeNull()
    expect(applyRosterChange(withNew, { players: [], removed: ['新人'] }).roster.some((p) => p.name === '新人')).toBe(false)
  })
  it('renames inside day rosters and protects bench-only players', () => {
    const dayRoster: GameDayRoster = { starters: [{ name: '許振謙', pos: '1B', order: 4 }], bench: ['蘇柏愷', '板凳人'], subs: [{ kind: 'PR', in: '蘇柏愷', out: '許振謙', pos: 'PR', inning: 3, half: 'bottom', slot: 3 }], reentry: false }
    const ds = { ...SEED_DATASET, roster: [...SEED_DATASET.roster, { name: '板凳人', status: '現役' }], games: SEED_DATASET.games.map((g, i) => (i === 0 ? { ...g, dayRoster } : g)) }
    expect(playersWithRecords(ds).has('板凳人')).toBe(true)
    expect(validateRosterChange(ds, { players: [], removed: ['板凳人'] })).toContain('不能刪除')
    const next = applyRosterChange(ds, { players: [{ original: '蘇柏愷', player: { ...ds.roster.find((p) => p.name === '蘇柏愷')!, name: '蘇柏凱' } }, { original: '板凳人', player: { name: '坐板凳', status: '現役' } }], removed: [] })
    expect(next.games[0].dayRoster).toEqual({ ...dayRoster, bench: ['蘇柏凱', '坐板凳'], subs: [{ ...dayRoster.subs![0], in: '蘇柏凱' }] })
    // games whose roster did not change keep the same roster object (the store only rewrites changed ones)
    const same = applyRosterChange(ds, { players: [{ original: '嚴敬翔', player: { name: '嚴敬翔2' } }], removed: [] })
    expect(same.games[0].dayRoster).toBe(dayRoster)
    expect(same.games.slice(1).every((g) => !('dayRoster' in g))).toBe(true)
  })
})
