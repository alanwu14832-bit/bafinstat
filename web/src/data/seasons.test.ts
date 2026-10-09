import { describe, expect, it } from 'vitest'
import { currentSeason, SEASON_START, seasonHeader, seasonLabel, seasonNote, seasonOfDate, seasonRange, seasonSpan } from './seasons'

describe('季（seasons.ts）', () => {
  it('defaults to the calendar year', () => {
    expect(SEASON_START).toBe(1)
    expect(seasonOfDate('2026-03-14')).toBe(2026)
    expect(seasonLabel(2026)).toBe('2026 年')
    expect(seasonRange(2026)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(seasonHeader()).toBe('年')
    expect(seasonNote()).toBe('')
  })
  it('puts dates in a 學年 (start 8) at the boundaries', () => {
    expect(seasonOfDate('2025-10-10', 8)).toBe(2025)
    expect(seasonOfDate('2026-03-14', 8)).toBe(2025)
    expect(seasonOfDate('2026-07-31', 8)).toBe(2025)
    expect(seasonOfDate('2026-08-01', 8)).toBe(2026)
    expect(seasonOfDate('2026-03-14', 1)).toBe(2026)
    expect(seasonOfDate('', 8)).toBe(0)
    expect(seasonOfDate('abc', 8)).toBe(0)
    expect(seasonOfDate(undefined, 1)).toBe(0)
  })
  it('gives each season its first and last day', () => {
    expect(seasonRange(2025, 8)).toEqual({ from: '2025-08-01', to: '2026-07-31' })
    expect(seasonRange(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(seasonRange(2024, 3).to).toBe('2025-02-28')
    expect(seasonRange(2023, 3).to).toBe('2024-02-29')
  })
  it('labels seasons and spans', () => {
    expect(seasonLabel(2025, 8)).toBe('114 學年')
    expect(seasonLabel(2026, 1)).toBe('2026 年')
    expect(seasonLabel(0)).toBe('日期不明')
    expect(seasonLabel(0, 8)).toBe('日期不明')
    expect(seasonLabel(2025, 3)).toBe('2025/26 季')
    expect(seasonSpan([2024, 2026], 8)).toBe('113–115 學年')
    expect(seasonSpan([2024, 2025, 2026], 1)).toBe('2024–2026 年')
    expect(seasonSpan([2025, 2025], 8)).toBe('114 學年')
    expect(seasonSpan([])).toBe('')
  })
  it('names the current season and explains non-calendar seasons', () => {
    expect(currentSeason('2026-08-01', 8)).toBe(2026)
    expect(currentSeason('2026-07-31', 8)).toBe(2025)
    expect(seasonHeader(8)).toBe('學年')
    expect(seasonHeader(3)).toBe('季')
    expect(seasonNote(8)).toBe('學年 = 8 月到隔年 7 月')
    expect(seasonNote(3)).toBe('季 = 每年 3 月到隔年 2 月')
  })
})
