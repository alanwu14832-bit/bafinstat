import { describe, expect, it } from 'vitest'
import { applyFilters } from './filters'
import { SEED_DATASET } from './seed'
import { battedOutKind, battingLines, pitchingLines, pitchTotals, sprayDirection, summarizeGame, teamBatting, teamSummary, WOBA_SCALE, wrcPlus } from './stats'
import type { BattingPA, PitchingPA } from './types'
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

  it('team summary', () => {
    const fd = applyFilters(ds, { ...DEFAULT_FILTERS, to: '2025-10-31' })
    const t = teamSummary(fd.summaries)
    expect(t.w).toBe(1); expect(t.l).toBe(0); expect(t.rs).toBe(9); expect(t.ra).toBe(5)
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

describe('wRC+, sSeager and K/7', () => {
  const pa = (batter: string, pitches: string[], result: string, extra: Partial<BattingPA> = {}): BattingPA =>
    ({ gameId: game.id, inning: 1, batter, pitches, result, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...extra })
  it('wRC+ turns the wOBA gap into runs per PA against the team (100 = team)', () => {
    expect(wrcPlus({ woba: 0.4 }, { woba: 0.3, r: 10, pa: 100 })).toBe(Math.round((100 * (0.1 / WOBA_SCALE + 0.1)) / 0.1))
    expect(wrcPlus({ woba: 0.3 }, { woba: 0.3, r: 10, pa: 100 })).toBe(100)
    expect(wrcPlus({ woba: 0.3 }, { woba: 0.3, r: 0, pa: 100 })).toBeNull()
    const t = teamBatting(ds, bat1)
    expect(t.wrcPlus).toBe(100)
    expect(battingLines(ds, bat1).every((l) => l.wrcPlus === null || Number.isInteger(l.wrcPlus))).toBe(true)
  })
  it('sSeager: balls taken ÷ (swings + balls taken) − called strikes ÷ all takes; an intentional walk does not count', () => {
    const [l] = battingLines(ds, [pa('甲', ['B', 'CS', 'SS', 'B', 'F', 'IP'], '外飛'), pa('甲', ['B', 'B', 'B', 'B'], '故四')])
    expect(l.sSeager).toBeCloseTo(2 / (3 + 2) - 1 / (1 + 2), 9)
    const [none] = battingLines(ds, [pa('乙', ['SS', 'SS', 'SS'], '三振')])
    expect(none.sSeager).toBeNull()
  })
  it('K/7 is strikeouts per 7 innings', () => {
    const outs: PitchingPA[] = Array.from({ length: 21 }, (_, i) => ({ gameId: game.id, inning: 1 + Math.floor(i / 3), pitcher: '丙', pitches: ['SS', 'SS', 'SS'], result: i % 3 === 0 ? '三振' : '內滾', code: (['I', 'II', 'III'] as const)[i % 3], sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 }))
    const [p] = pitchingLines(outs, [game])
    expect(p.outs).toBe(21); expect(p.k).toBe(7)
    expect(p.k7).toBeCloseTo(7, 9); expect(p.k9).toBeCloseTo(9, 9)
  })
})

describe('內野飛球 (P)', () => {
  it('is a fly ball, and IFFB% is the share of fly balls that stayed in the infield', () => {
    const pa = (traj: string): BattingPA => ({ gameId: game.id, inning: 1, batter: '甲', pitches: ['IP'], result: '內飛', traj, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 })
    const [l] = battingLines(ds, [pa('P'), pa('F'), pa('F'), pa('G')])
    expect(l.bip).toBe(4); expect(l.fb).toBe(3); expect(l.iffb).toBe(1)
    expect(l.fbPct).toBeCloseTo(3 / 4, 9); expect(l.iffbPct).toBeCloseTo(1 / 3, 9)
  })
})

describe('突破僵局 runners and 投手犯規', () => {
  const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G1', inning: 8, batter: '甲', pitches: [], result: '', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
  const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G1', inning: 8, pitcher: '壬', pitches: [], result: '', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })
  const ds = { ...SEED_DATASET, roster: [] }
  it('a placed runner is no plate appearance: only his run and steals count', () => {
    const rows = [bat({ result: '突破僵局', run: 1, sb: 1, code: 'R', basesBefore: '無', outsBefore: 0 }), bat({ inning: 9, result: '一安', pitches: ['IP'], loc: 8, traj: 'L' })]
    expect(battingLines(ds, rows)[0]).toMatchObject({ pa: 1, ab: 1, h: 1, r: 1, sb: 1, g: 1, avg: 1 })
    const ran = [{ ...rows[0], runner: '寅' }, rows[1]]
    const lines = battingLines(ds, ran)
    expect(lines.find((l) => l.name === '寅')).toMatchObject({ r: 1, sb: 1, pa: 0 })
    expect(lines.find((l) => l.name === '甲')).toMatchObject({ r: 0, sb: 0, pa: 1 })
    expect(teamBatting(ds, rows).pa).toBe(1)
  })
  it('a placed runner faced nobody: his run is the pitcher\'s (unearned), his out on the bases too', () => {
    const rows = [
      pit({ result: '突破僵局', code: 'R', basesBefore: '無', outsBefore: 0 }),
      pit({ result: '三振', pitches: ['SS', 'SS', 'SS'], code: 'I', basesBefore: '2', outsBefore: 0 }),
      pit({ result: '內滾', pitches: ['IP'], code: 'II', basesBefore: '2', outsBefore: 1 }),
      pit({ result: '外飛', pitches: ['IP'], code: 'III', basesBefore: '3', outsBefore: 2 }),
    ]
    expect(pitchingLines(rows, [])[0]).toMatchObject({ bf: 3, r: 1, er: 0, outs: 3, pc: 5 })
    const picked = [
      pit({ result: '突破僵局', code: 'I', basesBefore: '無', outsBefore: 0 }),
      pit({ result: '三振', pitches: ['SS', 'SS', 'SS'], code: 'II', basesBefore: '無', outsBefore: 1, events: [{ at: 0, kind: 'pk', from: 2, to: 'out' }] }),
    ]
    expect(pitchingLines(picked, [])[0]).toMatchObject({ bf: 1, outs: 2 })
  })
  it('BK from the plays on our pitcher\'s rows', () => {
    const rows = [pit({ result: '三振', pitches: ['B', 'SS', 'SS', 'SS'], code: 'I', events: [{ at: 1, kind: 'bk', from: 3, to: 'home' }, { at: 1, kind: 'bk', from: 1, to: 2 }] })]
    expect(pitchingLines(rows, [])[0].bk).toBe(1)
  })
})

describe('滾地／飛球出局 (GO/AO) and 保送得分', () => {
  const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G1', inning: 1, pitcher: '壬', pitches: ['IP'], result: '', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })
  it('battedOutKind: balls in play the batter was out on, by 軌跡 or the one the result implies', () => {
    expect(battedOutKind({ result: '內滾' })).toBe('GO')
    expect(battedOutKind({ result: '雙殺', traj: 'L' })).toBe('AO')
    expect(battedOutKind({ result: '外飛' })).toBe('AO')
    expect(battedOutKind({ result: '內飛', traj: 'P' })).toBe('AO')
    expect(battedOutKind({ result: '犧飛' })).toBe('AO')
    expect(battedOutKind({ result: '三振' })).toBeNull()
    expect(battedOutKind({ result: '犧觸', traj: 'G' })).toBeNull()
    expect(battedOutKind({ result: '一安', traj: 'G' })).toBeNull()
    expect(battedOutKind({ result: '野選', traj: 'G' })).toBeNull()
    const rows = [pit({ result: '內滾' }), pit({ result: '雙殺', traj: 'L' }), pit({ result: '外飛' }), pit({ result: '內飛', traj: 'P' }), pit({ result: '犧飛' }), pit({ result: '三振', pitches: ['SS', 'SS', 'SS'] }), pit({ result: '犧觸', traj: 'G' })]
    const [l] = pitchingLines(rows, [])
    expect([l.go, l.ao]).toEqual([1, 4])
    expect(l.goAo).toBeCloseTo(0.25, 9)
  })
  it('保送得分: walks (保送／故四) whose row scored (R / ER); a 觸身 is no walk', () => {
    const rows = [pit({ result: '保送', pitches: ['B', 'B', 'B', 'B'], code: 'ER' }), pit({ result: '故四', pitches: [], code: 'L' }), pit({ result: '觸身', pitches: ['B'], code: 'R' })]
    const [l] = pitchingLines(rows, [])
    expect([l.bbScored, l.bb]).toEqual([1, 2])
    expect(l.bbScoredPct).toBe(0.5)
  })
})

describe('優質打席 (QAB): 兩好球纏鬥 and 6球以上', () => {
  const pa = (pitches: string[], result: string, extra: Partial<BattingPA> = {}): BattingPA =>
    ({ gameId: 'G1', inning: 1, batter: '甲', pitches, result, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...extra })
  const one = (p: BattingPA) => teamBatting({ ...ds, roster: [] }, [p])
  it('3 or more pitches after reaching two strikes (the last one included) is a quality at-bat, even a strikeout', () => {
    const t = one(pa(['CS', 'SS', 'F', 'B', 'CS'], '三振'))
    expect([t.qab, t.twoStrikeBattles, t.twoStrikePA, t.longPA, t.qabPct]).toEqual([1, 1, 1, 0, 1])
  })
  it('two pitches after two strikes is not', () => {
    const t = one(pa(['SS', 'SS', 'F', 'SS'], '三振'))
    expect([t.qab, t.twoStrikeBattles, t.twoStrikePA]).toEqual([0, 0, 1])
  })
  it('6 pitches or more counts as both 6球以上 and (here) a battle', () => {
    const t = one(pa(['B', 'CS', 'B', 'SS', 'F', 'F', 'IP'], '內滾'))
    expect([t.qab, t.longPA, t.twoStrikeBattles]).toEqual([1, 1, 1])
  })
  it('the sample games are recomputed with it (QAB% 51.6% -> 54.7%)', () => {
    const g2 = ds.batting.filter((p) => p.gameId === 'G20251222-01')
    const t2 = teamBatting(ds, g2)
    expect([t2.pa, t2.qab, t2.twoStrikeBattles, t2.longPA, t2.twoStrikePA]).toEqual([36, 17, 4, 3, 16])
    const lines = battingLines(ds, g2)
    expect([lines.find((l) => l.name === '鄭羣燁')!.qab, lines.find((l) => l.name === '鄭羣燁')!.pa]).toEqual([2, 3])
    expect([lines.find((l) => l.name === '蔡奇霖')!.qab, lines.find((l) => l.name === '蔡奇霖')!.pa]).toEqual([3, 4])
    const t1 = teamBatting(ds, bat1)
    expect([t1.pa, t1.qab, t1.twoStrikeBattles, t1.longPA, t1.twoStrikePA]).toEqual([28, 18, 2, 3, 10])
    const all = teamBatting(ds, ds.batting)
    expect(all.qab).toBe(35)
    expect(all.qabPct).toBeCloseTo(35 / 64, 9)
  })
})
