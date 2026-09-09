import { describe, expect, it } from 'vitest'
import { applyRosterChange, playersWithRecords, validateRosterChange } from './roster'
import { SEED_DATASET } from './seed'

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
})
