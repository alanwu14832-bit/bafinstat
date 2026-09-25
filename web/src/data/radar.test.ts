import { describe, expect, it } from 'vitest'
import { median, posGroup, previousSeason, sameGroup } from './radar'

describe('radar helpers', () => {
  it('groups positions', () => {
    expect(posGroup('SS')).toBe('內野')
    expect(posGroup('IF')).toBe('內野')
    expect(posGroup('CF')).toBe('外野')
    expect(posGroup('C')).toBe('捕手')
    expect(posGroup('DH')).toBeNull()
    expect(posGroup(undefined)).toBeNull()
  })
  it('finds teammates in the same group', () => {
    const roster = [{ name: 'A', primaryPos: 'SS' }, { name: 'B', primaryPos: '2B' }, { name: 'C', primaryPos: 'LF' }, { name: 'D' }]
    expect([...sameGroup(roster, 'A')!.names]).toEqual(['A', 'B'])
    expect(sameGroup(roster, 'D')).toBeNull()
  })
  it('takes the median, skipping blanks', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, null, 3, 2])).toBe(2.5)
    expect(median([null, undefined])).toBeNull()
  })
  it('steps back one calendar year', () => {
    expect(previousSeason('2026-02-15')).toEqual({ year: 2025, from: '2025-01-01', to: '2025-12-31' })
    expect(previousSeason(undefined)).toBeNull()
  })
})
