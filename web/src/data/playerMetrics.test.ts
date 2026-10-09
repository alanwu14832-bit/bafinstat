import { describe, expect, it } from 'vitest'
import { BAT_METRICS, BAT_PCT, compareRows, comparePr, BAT_SAMPLE_LIKE, percentileRows, PIT_METRICS, PIT_PCT, teamPool } from './playerMetrics'
import type { BattingLine, PitchingLine } from './stats'
import { hintFor } from './glossary'

const BAT0 = {
  g: 1, pa: 0, ab: 0, h: 0, hr: 0, rbi: 0, sb: 0, baserunningOuts: 0, swings: 0, called: 0, ballsTaken: 0, bip: 0, fb: 0, rispAB: 0,
  avg: null, obp: null, slg: null, ops: null, opsPlus: null, wrcPlus: null, woba: null, iso: null, kPct: null, bbPct: null, whiffPct: null,
  sSeager: null, iffbPct: null, hardPct: null, rispAvg: null, qabPct: null,
}
const bl = (name: string, x: Partial<BattingLine> = {}) => ({ ...BAT0, name, ...x }) as unknown as BattingLine
const PIT0 = {
  g: 1, outs: 0, ip: 0, bf: 0, ab: 0, pc: 0, swings: 0, bip: 0,
  era: null, fip: null, whip: null, oppAvg: null, pPerIP: null, kPct: null, bbPct: null, whiffPct: null, cswPct: null, strikePct: null, fStrikePct: null, hardPct: null, gbPct: null, k7: null, k9: null, bb9: null, iffbPct: null,
}
const pl = (name: string, x: Partial<PitchingLine> = {}) => ({ ...PIT0, name, ...x }) as unknown as PitchingLine
const row = (rows: ReturnType<typeof percentileRows>, key: string) => rows.find((r) => r.key === key)!

describe('teamPool', () => {
  it('widens to everyone who batted when fewer than 5 reach 10 PA', () => {
    const lines = [30, 25, 12, 10, 4, 1].map((pa, i) => bl(`p${i}`, { pa }))
    const t = teamPool(lines, (l) => l.pa, 10)
    expect(t.relaxed).toBe(true)
    expect(t.pool).toHaveLength(6)
  })
  it('keeps the qualified teammates when there are 5', () => {
    const lines = [30, 25, 12, 10, 10, 1].map((pa, i) => bl(`p${i}`, { pa }))
    const t = teamPool(lines, (l) => l.pa, 10)
    expect(t.relaxed).toBe(false)
    expect(t.pool).toHaveLength(5)
  })
})

describe('percentileRows', () => {
  const pool = [0.1, 0.15, 0.2, 0.25, 0.3].map((k, i) => bl(`p${i}`, { pa: 20, ab: 18, kPct: k, avg: 0.2 + i * 0.02 }))
  it('puts the lowest K% on top (lower is better)', () => {
    const r = row(percentileRows(pool[0], pool, BAT_PCT), 'kPct')
    expect(r).toMatchObject({ pr: 100, rank: 1, of: 5, small: false, display: '10.0%' })
  })
  it('marks a small sample but still computes the PR', () => {
    const me = bl('me', { pa: 20, ab: 8, avg: 0.5, kPct: 0.2 })
    const r = row(percentileRows(me, [...pool.slice(0, 4), me], BAT_PCT), 'avg')
    expect(r.small).toBe(true)
    expect(r.pr).toBe(100)
  })
  it('places a player who is not in the pool among them', () => {
    const me = bl('me', { pa: 4, ab: 4, kPct: 0.22 })
    const r = row(percentileRows(me, pool, BAT_PCT), 'kPct')
    expect(r.of).toBe(6)
    expect(r.rank).toBe(4)
    expect(r.pr).toBe(40)
  })
  it('shows a dash without a value', () => {
    const r = row(percentileRows(bl('me', { pa: 12, swings: 0 }), pool, BAT_PCT), 'whiffPct')
    expect(r.pr).toBeNull()
    expect(r.display).toBe('—')
  })
  it('has 13 batting and 14 pitching bars, unique and explained in the glossary', () => {
    expect(BAT_PCT).toHaveLength(13)
    expect(PIT_PCT).toHaveLength(14)
    expect(new Set(BAT_PCT.map((m) => m.key)).size).toBe(13)
    expect(new Set(PIT_PCT.map((m) => m.key)).size).toBe(14)
    for (const m of [...BAT_PCT, ...PIT_PCT]) expect(hintFor(m.label), m.label).not.toBeNull()
  })
  it('ranks pitchers: the lowest ERA is best, K-BB% = K% − BB%', () => {
    const ps = [1.5, 3, 4.5, 6, 9].map((era, i) => pl(`q${i}`, { outs: 30, bf: 40, era, kPct: 0.25, bbPct: 0.1 }))
    const rows = percentileRows(ps[0], ps, PIT_PCT)
    expect(row(rows, 'era').pr).toBe(100)
    expect(row(rows, 'kbbPct').value).toBeCloseTo(0.15)
  })
})

describe('compareRows', () => {
  const a = bl('A', { pa: 20, ab: 20, avg: 0.3, g: 5 })
  const b = bl('B', { pa: 30, ab: 30, avg: 0.3, g: 6 })
  const c = bl('C', { pa: 12, ab: 12, avg: 0.25, g: 4 })
  const prOf = comparePr([a, b, c], BAT_PCT, BAT_SAMPLE_LIKE)
  const rows = compareRows([a, b, c], BAT_METRICS, prOf)
  const r = (label: string) => rows.find((x) => x.label === label)!
  it('marks every tied best', () => {
    expect(r('AVG').cells.map((x) => x.best)).toEqual([true, true, false])
  })
  it('marks everyone best when all eligible values are equal', () => {
    const rows2 = compareRows([a, b], BAT_METRICS, prOf)
    expect(rows2.find((x) => x.label === 'AVG')!.cells.map((x) => x.best)).toEqual([true, true])
  })
  it('marks only 較多 on volume rows, without a PR', () => {
    expect(r('PA').cells.map((x) => x.more)).toEqual([false, true, false])
    expect(r('PA').cells.some((x) => x.best)).toBe(false)
    expect(r('PA').cells.every((x) => x.pr === null)).toBe(true)
    expect(r('G').cells.every((x) => x.pr === null)).toBe(true)
  })
  it('writes innings the way the site does (27⅔ → 27.2), and the most innings is 較多', () => {
    const rows2 = compareRows([pl('P', { outs: 83, ip: 83 / 3 }), pl('Q', { outs: 30, ip: 10 })], PIT_METRICS)
    const ip = rows2.find((x) => x.label === 'IP')!
    expect(ip.cells.map((x) => x.text)).toEqual(['27.2', '10.0'])
    expect(ip.cells.map((x) => x.more)).toEqual([true, false])
  })
  it('never makes a small sample the best', () => {
    const d = bl('D', { pa: 3, ab: 3, avg: 0.667 })
    const rows2 = compareRows([a, c, d], BAT_METRICS, comparePr([a, b, c, d], BAT_PCT, BAT_SAMPLE_LIKE))
    const avg = rows2.find((x) => x.label === 'AVG')!
    expect(avg.cells[2]).toMatchObject({ best: false, small: true, text: '.667' })
    expect(avg.cells[0].best).toBe(true)
  })
})
