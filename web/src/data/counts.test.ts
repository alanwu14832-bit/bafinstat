import { describe, expect, it } from 'vitest'
import { countTrail, twoStrikeBattle } from './counts'
import { count } from '../record/model'
import { rng } from '../test/simGame'

const CODES = ['B', 'S', 'SS', 'CS', 'F', 'IP']
/** The workbook's 兩好球纏鬥 formula, in JS: n ≥ 5 and the first n−3 pitches hold ≥ 2 of S/SS/CS/F. */
const excelBattle = (ps: string[]) => ps.length >= 5 && ps.slice(0, ps.length - 3).filter((p) => p === 'S' || p === 'SS' || p === 'CS' || p === 'F').length >= 2
/** The pitch (1-based) that decided the plate appearance (IP, ball four, strike three), or null. */
function decidedAt(ps: string[]): number | null {
  let b = 0, s = 0
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]
    if (p === 'IP') return i + 1
    if (p === 'B' && ++b === 4) return i + 1
    if ((p === 'S' || p === 'SS' || p === 'CS') && ++s === 3) return i + 1
    if (p === 'F' && s < 2) s++
  }
  return null
}
const key = (c: { balls: number; strikes: number }) => `${c.balls}-${c.strikes}`

describe('countTrail', () => {
  it('follows the count pitch by pitch (a foul with two strikes adds nothing)', () => {
    const t = countTrail(['B', 'CS', 'F', 'F', 'B', 'IP'])
    expect(t).toEqual({ n: 6, passed: ['0-0', '1-0', '1-1', '1-2', '2-2'], final: '2-2', twoStrikeAt: 3 })
    expect(twoStrikeBattle(['B', 'CS', 'F', 'F', 'B', 'IP'])).toBe(true)
  })
  it('兩好球纏鬥 counts the last pitch: 3 after two strikes is one, 2 is not', () => {
    expect(countTrail(['CS', 'SS', 'F', 'B', 'CS'])).toMatchObject({ final: '1-2', twoStrikeAt: 2 })
    expect(twoStrikeBattle(['CS', 'SS', 'F', 'B', 'CS'])).toBe(true)
    expect(countTrail(['SS', 'SS', 'F', 'SS']).final).toBe('0-2')
    expect(twoStrikeBattle(['SS', 'SS', 'F', 'SS'])).toBe(false)
  })
  it('walks, no pitches, a deciding pitch not written down, pitches after the decision, S, unknown codes', () => {
    expect(countTrail(['B', 'B', 'B', 'B'])).toEqual({ n: 4, passed: ['0-0', '1-0', '2-0', '3-0'], final: '3-0', twoStrikeAt: null })
    expect(countTrail([])).toEqual({ n: 0, passed: [], final: null, twoStrikeAt: null })
    const hbp = countTrail(['B', 'CS'])                   // 觸身: that pitch was not entered
    expect(hbp.final).toBe('1-1'); expect(hbp.passed).toContain('1-1')
    expect(countTrail(['CS', 'CS', 'CS', 'B']).final).toBe('0-2')
    expect(twoStrikeBattle(['CS', 'CS', 'CS', 'B'])).toBe(false)
    expect(countTrail(['S', 'B', 'IP']).final).toBe('1-1')
    expect(countTrail(['CS', 'X', 'SS', 'F', 'B', 'CS'])).toEqual(countTrail(['CS', 'SS', 'F', 'B', 'CS']))
  })
  it('agrees with the recording count and the workbook formula on every sequence of 1–6 pitches', () => {
    let seqs: string[][] = [[]]
    let checked = 0
    for (let len = 1; len <= 6; len++) {
      seqs = seqs.flatMap((s) => CODES.map((c) => [...s, c]))
      for (const ps of seqs) {
        const t = countTrail(ps)
        const at = decidedAt(ps)
        if (at === null) expect(t.final, ps.join(',')).toBe(key(count(ps)))
        else if (at === ps.length) expect(t.final, ps.join(',')).toBe(key(count(ps.slice(0, -1))))
        expect(twoStrikeBattle(ps), ps.join(',')).toBe(excelBattle(ps))
        expect(t.passed[0]).toBe('0-0')
        expect(t.passed).toContain(t.final)
        checked++
      }
    }
    expect(checked).toBe(55986)
    const r = rng(20261009)
    for (let i = 0; i < 200; i++) {
      const ps = Array.from({ length: 7 + Math.floor(r() * 6) }, () => CODES[Math.floor(r() * CODES.length)])
      expect(twoStrikeBattle(ps), ps.join(',')).toBe(excelBattle(ps))
      const at = decidedAt(ps)
      if (at === null) expect(countTrail(ps).final).toBe(key(count(ps)))
      else if (at === ps.length) expect(countTrail(ps).final).toBe(key(count(ps.slice(0, -1))))
    }
  }, 60000)
})
