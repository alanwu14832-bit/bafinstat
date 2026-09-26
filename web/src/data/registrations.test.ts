import { afterEach, describe, expect, it } from 'vitest'
import {
  eligibleNames, parseRegistration, registrationByKey, unscheduledRegistrations, readLocalRegistrations, registrationFor, registrationKey, removeFromRegistrations, renameInRegistrations, REGISTRATIONS_KEY,
  seasonOf, sortRegistrations, withoutRegistration, withRegistration, writeLocalRegistrations,
} from './registrations'
import type { Registration } from './types'

const regs: Registration[] = [
  { season: 2025, tournament: '大專盃', players: ['甲', '乙'] },
  { season: 2026, tournament: '大專盃', players: ['甲', '丙'] },
  { season: 2026, tournament: '系際盃', players: [] },
]

describe('registration lists', () => {
  it('are keyed by the game year + trimmed tournament', () => {
    expect(seasonOf('2026-09-26')).toBe(2026)
    expect(seasonOf('')).toBe(0)
    expect(registrationKey(2026, ' 大專盃 ')).toBe(registrationKey(2026, '大專盃'))
    expect(registrationFor(regs, { date: '2026-03-01', tournament: '大專盃 ' })).toBe(regs[1])
    expect(registrationFor(regs, { date: '2025-11-01', tournament: '大專盃' })).toBe(regs[0])
    expect(registrationFor(regs, { date: '2027-03-01', tournament: '大專盃' })).toBeUndefined()
    expect(registrationFor(regs, { date: '2026-03-01', tournament: '友誼賽' })).toBeUndefined()
    expect(registrationFor(regs, undefined)).toBeUndefined()
  })
  it('narrow the candidates only when the list has players', () => {
    const all = ['甲', '乙', '丙', '丁']
    expect(eligibleNames(all, regs[1])).toEqual(['甲', '丙'])
    expect(eligibleNames(all, regs[2])).toBe(all) // empty list = everyone
    expect(eligibleNames(all, undefined)).toBe(all) // no list (friendly game) = whole roster
  })
  it('sort, insert, replace and delete', () => {
    expect(sortRegistrations([regs[0], regs[2], regs[1]]).map((r) => registrationKey(r.season, r.tournament))).toEqual(['2026|大專盃', '2026|系際盃', '2025|大專盃'])
    const next = withRegistration(regs, { season: 2026, tournament: '大專盃', players: ['丁'] })
    expect(next).toHaveLength(3)
    expect(registrationFor(next, { date: '2026-01-01', tournament: '大專盃' })!.players).toEqual(['丁'])
    expect(withoutRegistration(next, 2026, ' 大專盃')).toHaveLength(2)
  })
  it('follow renames and removals, keeping unchanged lists as they are', () => {
    const renamed = renameInRegistrations(regs, [['乙', '乙乙'], ['丙', '甲']])
    expect(renamed[0].players).toEqual(['甲', '乙乙'])
    expect(renamed[1].players).toEqual(['甲']) // renamed onto a listed name: no duplicate
    expect(renamed[2]).toBe(regs[2])
    const removed = removeFromRegistrations(regs, ['乙'])
    expect(removed[0].players).toEqual(['甲'])
    expect(removed[1]).toBe(regs[1])
    expect(renameInRegistrations(regs, [])).toBe(regs)
  })
  it('clean what they read', () => {
    expect(parseRegistration({ season: '2026', tournament: ' 大專盃 ', players: [' 甲', '甲', '', 3, '乙'] })).toEqual({ season: 2026, tournament: '大專盃', players: ['甲', '乙'] })
    for (const v of [null, 'x', { season: 2026, tournament: ' ' }, { season: 'abc', tournament: '大專盃' }, { tournament: '大專盃', players: [] }]) expect(parseRegistration(v)).toBeNull()
  })
})

describe('local persistence', () => {
  afterEach(() => localStorage.removeItem(REGISTRATIONS_KEY))
  it('round-trips and tolerates garbage', () => {
    writeLocalRegistrations(regs)
    expect(readLocalRegistrations()).toEqual(sortRegistrations(regs))
    localStorage.setItem(REGISTRATIONS_KEY, '{not json')
    expect(readLocalRegistrations()).toEqual([])
    localStorage.setItem(REGISTRATIONS_KEY, JSON.stringify([{ season: 2026 }, null, { season: 2026, tournament: '大專盃', players: 'x' }]))
    expect(readLocalRegistrations()).toEqual([{ season: 2026, tournament: '大專盃', players: [] }])
  })
})

describe('lists whose games are not on the schedule yet', () => {
  const regs = [{ season: 2026, tournament: '大專盃', players: ['甲'] }, { season: 2026, tournament: '新生盃', players: ['乙', '丙'] }, { season: 2025, tournament: '新生盃', players: [] }]
  it('are offered on their own until a game of that year + tournament is scheduled', () => {
    expect(unscheduledRegistrations(regs, []).length).toBe(3)
    expect(unscheduledRegistrations(regs, [{ date: '2026-10-03', tournament: '大專盃' }]).map((r) => `${r.season}${r.tournament}`)).toEqual(['2026新生盃', '2025新生盃'])
    expect(unscheduledRegistrations(regs, [{ date: '2026-10-03', tournament: ' 新生盃 ' }]).map((r) => `${r.season}${r.tournament}`)).toEqual(['2026大專盃', '2025新生盃'])
  })
  it('are found again by their key', () => {
    expect(registrationByKey(regs, registrationKey(2026, '新生盃'))?.players).toEqual(['乙', '丙'])
    expect(registrationByKey(regs, '2024|新生盃')).toBeUndefined()
    expect(registrationByKey(regs, '')).toBeUndefined()
  })
})
