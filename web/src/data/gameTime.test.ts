import { describe, expect, it } from 'vitest'
import { cleanTime, durationMinutes, formatDuration, gameTimeText, isLongGame, toMinutes } from './gameTime'

describe('比賽時間', () => {
  it('reads a clock time written any common way', () => {
    expect(cleanTime('9:05')).toBe('09:05')
    expect(cleanTime('15:22:00')).toBe('15:22')
    expect(cleanTime('15：22')).toBe('15:22')
    expect(cleanTime('15.22')).toBe('15:22')
    expect(cleanTime('1522')).toBe('15:22')
    expect(cleanTime('25:00')).toBeUndefined()
    expect(cleanTime('12:60')).toBeUndefined()
    expect(cleanTime('')).toBeUndefined()
    expect(cleanTime(undefined)).toBeUndefined()
    expect(toMinutes('01:10')).toBe(70)
  })
  it('works out how long the game took, past midnight too', () => {
    expect(durationMinutes('13:05', '15:20')).toBe(135)
    expect(durationMinutes('23:30', '01:10')).toBe(100)
    expect(durationMinutes('13:05', '13:05')).toBeUndefined()
    expect(durationMinutes('13:05', undefined)).toBeUndefined()
    expect(durationMinutes('x', '15:00')).toBeUndefined()
  })
  it('says it in hours and minutes', () => {
    expect(formatDuration(135)).toBe('2 小時 15 分')
    expect(formatDuration(120)).toBe('2 小時')
    expect(formatDuration(45)).toBe('45 分')
  })
  it('one line for the game page', () => {
    expect(gameTimeText({ time: '13:07', endTime: '15:22' })).toBe('13:07–15:22・2 小時 15 分')
    expect(gameTimeText({ time: '13:07' })).toBe('13:07 開賽')
    expect(gameTimeText({})).toBe('')
  })
  it('flags a duration over 6 hours (a start typed after the end) for checking', () => {
    expect(isLongGame(durationMinutes('15:20', '13:05'))).toBe(true)
    expect(isLongGame(durationMinutes('13:07', '19:07'))).toBe(false)
    expect(isLongGame(durationMinutes('13:07', '19:08'))).toBe(true)
    expect(isLongGame(undefined)).toBe(false)
  })
})
