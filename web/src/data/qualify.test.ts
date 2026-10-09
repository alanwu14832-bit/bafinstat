import { describe, expect, it } from 'vitest'
import { careerMinOuts, careerMinPA, minOutsPitched, minPlateAppearances, outsGapText, paGapText } from './qualify'

describe('規定打席／規定投球局', () => {
  it('大專規程: PA ≥ 2.1 × games, rounded up (integer math: 2.1 × 10 is 21, not 22); 隊內: PA ≥ 1', () => {
    expect([0, 1, 3, 7, 10].map((g) => minPlateAppearances('college', g))).toEqual([1, 3, 7, 15, 21])
    expect([0, 1, 3, 7, 10, 30].map((g) => minPlateAppearances('team', g))).toEqual([1, 1, 1, 1, 1, 1])
  })
  it('innings in outs: 大專規程 1 × games, 隊內 0.7 × games rounded up, both at least 1 inning', () => {
    expect(minOutsPitched('college', 10)).toBe(30)
    expect(minOutsPitched('college', 0)).toBe(3)
    expect(minOutsPitched('team', 10)).toBe(21)
    expect(minOutsPitched('team', 3)).toBe(9)
    expect(minOutsPitched('team', 0)).toBe(3)
  })
  it('how far below the minimum', () => {
    expect(paGapText(18, 21)).toBe('3 打席')
    expect(outsGapText(25, 30)).toBe('1.2 局')
  })
})

describe('生涯門檻（紀錄簿）', () => {
  it('needs 2.1 PA per game, at most 100', () => {
    expect(careerMinPA(10)).toBe(21)
    expect(careerMinPA(47)).toBe(99)
    expect(careerMinPA(60)).toBe(100)
  })
  it('needs one inning per game, at most 30 innings', () => {
    expect(careerMinOuts(12)).toBe(36)
    expect(careerMinOuts(50)).toBe(90)
    expect(careerMinOuts(0)).toBe(3)
  })
})
