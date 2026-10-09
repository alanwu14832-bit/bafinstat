import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, hhmm, localDate, mdw, weekday } from './dates'

describe('dates', () => {
  it('adds days across a month and a year', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('counts whole days between two dates', () => {
    expect(daysBetween('2026-10-07', '2026-10-12')).toBe(5)
    expect(daysBetween('2026-10-12', '2026-10-07')).toBe(-5)
  })
  it('gives the local date, never the UTC one (a Taiwan morning before 08:00 stays today)', () => {
    expect(localDate(new Date(2026, 9, 9, 7, 0))).toBe('2026-10-09')
    expect(localDate(new Date(2026, 9, 9, 23, 59))).toBe('2026-10-09')
  })
  it('writes month/day with the weekday', () => {
    expect(weekday('2026-10-12')).toBe('一')
    expect(weekday('2026-10-11')).toBe('日')
    expect(mdw('2026-10-12')).toBe('10/12（一）')
  })
  it('gives the local clock time', () => {
    expect(hhmm(new Date(2026, 9, 9, 13, 7))).toBe('13:07')
    expect(hhmm(new Date(2026, 9, 9, 9, 5).toISOString())).toBe('09:05')
  })
})
