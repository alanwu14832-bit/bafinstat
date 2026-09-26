import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { datasetToWorkbook, dayRosterCells, dayRosterFromCells, legacyToDataset, parseAnyDate, parseLegacyGame, parseWorkbook } from './xlsx'
import { SEED_DATASET } from './seed'
import { summarizeGame } from './stats'
import type { GameDayRoster } from './types'

const load = (f: string) => { const b = readFileSync(resolve(process.cwd(), '..', 'data', 'legacy', f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }

describe('legacy single-game sheet import (in browser)', () => {
  for (const [file, id] of [['2025-10-10_vs_群風.xlsx', 'G20251010-01'], ['2025-12-22_vs_工海物治.xlsx', 'G20251222-01']] as const) {
    it(`matches the Python converter for ${file}`, () => {
      const { report } = parseWorkbook(load(file))
      expect(report.mode).toBe('legacy')
      const raw = report.legacy!
      const ds = legacyToDataset(raw, { id, tournament: '友誼賽' })
      const seedBat = SEED_DATASET.batting.filter((p) => p.gameId === id)
      const seedPit = SEED_DATASET.pitching.filter((p) => p.gameId === id)
      expect(ds.batting.map((p) => [p.inning, p.batter, p.result, p.pitches.join(''), p.run, p.rbi, p.code])).toEqual(seedBat.map((p) => [p.inning, p.batter, p.result, p.pitches.join(''), p.run, p.rbi, p.code]))
      expect(ds.pitching.map((p) => [p.inning, p.pitcher, p.result, p.code, p.outsBefore])).toEqual(seedPit.map((p) => [p.inning, p.pitcher, p.result, p.code, p.outsBefore]))
      const a = summarizeGame(ds, ds.games[0]); const b = summarizeGame(SEED_DATASET, SEED_DATASET.games.find((g) => g.id === id)!)
      expect([a.runsUs, a.runsOpp, a.hitsUs, a.hitsOpp, a.errorsUs, a.lineUs, a.lineOpp]).toEqual([b.runsUs, b.runsOpp, b.hitsUs, b.hitsOpp, b.errorsUs, b.lineUs, b.lineOpp])
      expect(ds.games[0]).toMatchObject({ id, tournament: '友誼賽', homeAway: '主' })
      expect(ds.roster.length).toBeGreaterThan(9)
    })
  }
})

describe('parseAnyDate accepts whatever a scorer types', () => {
  it('parses common Taiwanese date spellings', () => {
    for (const [v, want] of [['2025-12-22', '2025-12-22'], ['2025/12/22', '2025-12-22'], ['2025.12.22', '2025-12-22'], ['20251222', '2025-12-22'], ['114/12/22', '2025-12-22'], ['114年12月22日', '2025-12-22'],
      ['2025年12月22日（一）', '2025-12-22'], ['2025/12/22 (一) 08:30', '2025-12-22'], [45940, '2025-10-10'], ['12/22', '2025-12-22'], ['12月22日', '2025-12-22'], ['2025-13-40', undefined], ['abc', undefined], ['', undefined]] as const) {
      expect(parseAnyDate(v, 2025), String(v)).toBe(want)
    }
  })
  it('a legacy sheet without a readable date still parses; the date can be supplied on import', () => {
    const wb = XLSX.read(new Uint8Array(load('2025-12-22_vs_工海物治.xlsx')), { type: 'array' })
    const sm = wb.Sheets['當日比賽統計']
    delete sm['S2']
    const raw = parseLegacyGame(wb)
    expect(raw.date).toBe(''); expect(raw.game_id).toBe('')
    expect(raw.warnings?.some((w) => w.includes('日期無法辨識'))).toBe(true)
    expect(() => legacyToDataset(raw, { id: '', tournament: '友誼賽' })).toThrow()
    const ds = legacyToDataset(raw, { id: '', tournament: '友誼賽', date: '2025-12-22' })
    expect(ds.games[0]).toMatchObject({ id: 'G20251222-01', date: '2025-12-22' })
    // and with the file name as a hint the date comes from the name
    const raw2 = parseLegacyGame(wb, '2025-12-22_vs_工海物治.xlsx')
    expect(raw2.date).toBe('2025-12-22'); expect(raw2.warnings?.some((w) => w.includes('檔名'))).toBe(true)
  })
})

describe('當日登錄名單 columns of 比賽清單', () => {
  const dayRoster: GameDayRoster = {
    starters: [{ name: '嚴敬翔', pos: 'SS', order: 1 }, { name: '蔡奇霖', pos: '2B', order: 2 }, { name: '黃襄璟', pos: 'DH', order: 9 }, { name: '林昱丞', pos: 'P' }],
    bench: ['蘇柏愷', '鄭羣燁', '曾亭維'],
    subs: [
      { kind: 'PR', in: '蘇柏愷', out: '許振謙', pos: 'PR', inning: 3, half: 'bottom', slot: 3 },
      { kind: 'PH', in: '鄭羣燁', out: '黃襄璟', pos: 'PH', inning: 4, half: 'bottom', slot: 8 },
      { kind: 'P', in: '曾亭維', out: '林昱丞', pos: 'P', inning: 5, half: 'top' },
      { kind: 'DEF', in: '劉哲宏', out: '', pos: 'P', inning: 6, half: 'top', slot: 4 },
    ],
    reentry: true,
  }
  it('survive a backup round trip (DH pitcher without order, bench, substitutions, re-entry)', () => {
    const ds = { ...SEED_DATASET, games: SEED_DATASET.games.map((g) => (g.id === 'G20251222-01' ? { ...g, dayRoster } : g)) }
    const buf = XLSX.write(datasetToWorkbook(ds), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const { dataset } = parseWorkbook(buf)
    expect(dataset.games.find((g) => g.id === 'G20251222-01')!.dayRoster).toEqual(dayRoster)
    expect(dataset.games.find((g) => g.id === 'G20251010-01')!.dayRoster).toBeUndefined()
    expect(dataset.games.find((g) => g.id === 'G20251010-01')).not.toHaveProperty('dayRoster')
  })
  it('are readable and tolerate hand-typed variants', () => {
    const cells = dayRosterCells(dayRoster)
    expect(cells.先發名單).toBe('1.嚴敬翔(SS)、2.蔡奇霖(2B)、9.黃襄璟(DH)、P.林昱丞(P)')
    expect(cells.板凳).toBe('蘇柏愷、鄭羣燁、曾亭維')
    expect(cells.替補紀錄.split('；')[1]).toBe('4下 第9棒 代打 鄭羣燁 替 黃襄璟(PH)')
    expect(cells.允許再上場).toBe('是')
    expect(dayRosterCells(undefined)).toEqual({ 先發名單: '', 板凳: '', 替補紀錄: '', 允許再上場: '' })
    const typed = dayRosterFromCells({ 先發名單: '１．甲（cf），2.乙(SS); P．壬（P）', 板凳: '丙,丁；甲', 替補紀錄: '５上 代打 戊 替 甲（PH）;6下換投己替壬(P)、7局上 守備 第2棒 庚(LF)', 允許再上場: '' })
    expect(typed).toEqual({
      starters: [{ name: '甲', pos: 'CF', order: 1 }, { name: '乙', pos: 'SS', order: 2 }, { name: '壬', pos: 'P' }],
      bench: ['丙', '丁'],
      subs: [
        { kind: 'PH', in: '戊', out: '甲', pos: 'PH', inning: 5, half: 'top' },
        { kind: 'P', in: '己', out: '壬', pos: 'P', inning: 6, half: 'bottom' },
        { kind: 'DEF', in: '庚', out: '', pos: 'LF', inning: 7, half: 'top', slot: 1 },
      ],
      reentry: false,
    })
  })
  it('keep names containing 替 or full-width digits intact', () => {
    const r = { starters: [{ name: '陳１', pos: 'CF', order: 1 }], bench: ['張替'], subs: [{ kind: 'PH' as const, in: '代替者', out: '陳１', pos: 'PH', inning: 5, half: 'top' as const, slot: 0 }], reentry: false }
    expect(dayRosterFromCells(dayRosterCells(r))).toEqual(r)
  })
  it('old workbooks (no such columns) yield no day roster', () => {
    expect(dayRosterFromCells({ 比賽ID: 'G1', 先發名單: '', 板凳: ' ' })).toBeUndefined()
    const buf = readFileSync(resolve(process.cwd(), '..', 'data', 'BAFIN_棒球數據總表.xlsx'))
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array', sheets: '比賽清單' })
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['比賽清單'], { header: 1, defval: '' })
    const hdr = grid.findIndex((row) => row.some((c) => String(c).trim() === '比賽ID'))
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['比賽清單'], { range: hdr, defval: '' })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.map(dayRosterFromCells).every((r) => r === undefined)).toBe(true)
  })
})
