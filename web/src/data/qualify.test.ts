import { describe, expect, it } from 'vitest'
import { careerMinOuts, careerMinPA, minOutsPitched, minPlateAppearances } from './qualify'

// wave-2 stand-in: batch 4 owns the base-rule cases (keep batch 4's version of this block at merge)
describe('規定打席／規定局數（基本規則）', () => {
  it('uses integer maths for 2.1 × games', () => {
    expect([0, 1, 3, 7, 10].map((g) => minPlateAppearances('college', g))).toEqual([1, 3, 7, 15, 21])
    expect(minPlateAppearances('team', 10)).toBe(1)
    expect(minOutsPitched('college', 10)).toBe(30)
    expect(minOutsPitched('college', 0)).toBe(3)
    expect(minOutsPitched('team', 10)).toBe(21)
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
