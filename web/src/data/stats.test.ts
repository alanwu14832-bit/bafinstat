import { describe, expect, it } from 'vitest'
import { applyFilters } from './filters'
import { SEED_DATASET } from './seed'
import { battingLines, pitchingLines, pitchTotals, sprayDirection, summarizeGame, teamBatting, teamSummary } from './stats'
import { DEFAULT_FILTERS } from './types'
import { generateDemo, mergeDatasets } from './demo'

const ds = SEED_DATASET
const game = ds.games.find((g) => g.id === 'G20251010-01')!
const bat1 = ds.batting.filter((p) => p.gameId === game.id)
const pit1 = ds.pitching.filter((p) => p.gameId === game.id)

describe('2025-10-10 vs 群風 (from the original score sheet)', () => {
  it('reproduces the line score and box totals', () => {
    const s = summarizeGame(ds, game)
    expect(s.lineUs.slice(0, 4)).toEqual([0, 1, 4, 4])
    expect(s.lineOpp.slice(0, 5)).toEqual([0, 1, 3, 1, 0])
    expect(s.runsUs).toBe(9); expect(s.runsOpp).toBe(5); expect(s.result).toBe('W')
    expect(s.hitsUs).toBe(11); expect(s.hitsOpp).toBe(4); expect(s.lobUs).toBe(7); expect(s.errorsOpp).toBe(1)
  })

  it('computes team batting like the workbook 總表', () => {
    const t = teamBatting(ds, bat1)
    expect(t.pa).toBe(28); expect(t.ab).toBe(21); expect(t.h).toBe(11); expect(t.h2).toBe(3); expect(t.bb).toBe(5); expect(t.hbp).toBe(2); expect(t.so).toBe(7)
    expect(t.avg).toBeCloseTo(11 / 21, 6); expect(t.obp).toBeCloseTo(18 / 28, 6); expect(t.slg).toBeCloseTo(14 / 21, 6)
  })

  it('computes individual batting lines (HBP no longer counted as an AB)', () => {
    const lines = battingLines(ds, bat1)
    const su = lines.find((l) => l.name === '蘇柏愷')!
    expect(su.pa).toBe(4); expect(su.ab).toBe(3); expect(su.h).toBe(2); expect(su.hbp).toBe(1); expect(su.so).toBe(1)
    expect(su.avg).toBeCloseTo(2 / 3, 6); expect(su.obp).toBeCloseTo(3 / 4, 6); expect(su.whiffPct).toBeCloseTo(1 / 3, 6)
    const tsai = lines.find((l) => l.name === '蔡奇霖')!
    expect(tsai.rbi).toBe(3); expect(tsai.sb).toBe(2); expect(tsai.roe).toBe(1); expect(tsai.r).toBe(2)
  })

  it('computes pitching lines with IP from outcome codes', () => {
    const lines = pitchingLines(pit1, [game])
    const hsu = lines.find((l) => l.name === '許振謙')!
    expect(hsu.outs).toBe(6); expect(hsu.ipDisplay).toBe('2.0'); expect(hsu.bf).toBe(9); expect(hsu.pc).toBe(24); expect(hsu.strikes).toBe(17)
    expect(hsu.k).toBe(2); expect(hsu.h).toBe(2); expect(hsu.r).toBe(1); expect(hsu.er).toBe(0); expect(hsu.w).toBe(1); expect(hsu.gs).toBe(1)
    const tsai = lines.find((l) => l.name === '蔡奇霖')!
    expect(tsai.er).toBe(2); expect(tsai.r).toBe(3); expect(tsai.era).toBeCloseTo(14, 6) // 2 ER in 1 IP, 7-inning scale
    const lin = lines.find((l) => l.name === '林昱丞')!
    expect(lin.k).toBe(5); expect(lin.bf).toBe(11); expect(lin.cswPct).toBeCloseTo(16 / 35, 6)
  })

  it('team summary and pythagorean expectation', () => {
    const fd = applyFilters(ds, { ...DEFAULT_FILTERS, to: '2025-10-31' })
    const t = teamSummary(fd.summaries)
    expect(t.w).toBe(1); expect(t.l).toBe(0); expect(t.rs).toBe(9); expect(t.ra).toBe(5)
    expect(t.pythag).toBeCloseTo(Math.pow(9, 1.83) / (Math.pow(9, 1.83) + Math.pow(5, 1.83)), 6)
  })

  it('2025-12-22 vs 工海物治: walk-off win reconstructed from the second sheet', () => {
    const g2 = ds.games.find((g) => g.id === 'G20251222-01')!
    const s = summarizeGame(ds, g2)
    expect(s.runsUs).toBe(8); expect(s.runsOpp).toBe(7); expect(s.result).toBe('W'); expect(s.lineUs).toHaveLength(7)
    expect(s.lineOpp).toEqual([1, 0, 0, 0, 1, 5, 0]); expect(s.lineUs[6]).toBe(4)
    const lines = pitchingLines(ds.pitching.filter((p) => p.gameId === g2.id), [g2])
    const lin = lines.find((l) => l.name === '林昱丞')!
    expect(lin.gs).toBe(1); expect(lin.ipDisplay).toBe('4.2'); expect(lin.er).toBe(2)
    const liu = lines.find((l) => l.name === '劉哲宏')!
    expect(liu.outs).toBe(4) // the sheet marks a 雙殺 at 2 outs; only 1 out is credited for it
    expect(ds.roster.some((p) => p.name === '鄭羣燁')).toBe(true)
  })
})

describe('helpers', () => {
  it('pitch totals follow the sheet definitions', () => {
    expect(pitchTotals(['CS', 'SS', 'B', 'B', 'B', 'F', 'B'])).toMatchObject({ pitches: 7, strikes: 3, balls: 4, whiffs: 1, swings: 2, called: 1 })
  })
  it('spray direction respects handedness', () => {
    expect(sprayDirection(7, 'R')).toBe('pull'); expect(sprayDirection(7, 'L')).toBe('oppo'); expect(sprayDirection(8, 'L')).toBe('center'); expect(sprayDirection(undefined, 'R')).toBeNull()
  })
  it('filters by position and date', () => {
    const only1B = applyFilters(ds, { ...DEFAULT_FILTERS, position: '1B' })
    expect(only1B.batting.every((p) => p.pos === '1B')).toBe(true)
    expect(applyFilters(ds, { ...DEFAULT_FILTERS, from: '2026-01-01' }).games).toHaveLength(0)
  })
  it('demo games are deterministic, labelled, and internally consistent', () => {
    const a = generateDemo(ds.roster, { games: 3 }); const b = generateDemo(ds.roster, { games: 3 })
    expect(a.games.map((g) => g.id)).toEqual(b.games.map((g) => g.id))
    expect(a.games.every((g) => g.isDemo)).toBe(true)
    const merged = mergeDatasets(ds, a)
    expect(merged.games).toHaveLength(ds.games.length + 3)
    for (const g of a.games) {
      const s = summarizeGame(merged, g)
      expect(s.lineUs).toHaveLength(7)
      const outs = merged.pitching.filter((p) => p.gameId === g.id && ['I', 'II', 'III'].includes(p.code ?? '')).reduce((a, p) => a + (p.result === '雙殺' && (p.outsBefore ?? 0) <= 1 ? 2 : 1), 0)
      expect(outs).toBe(21)
    }
  })
})
