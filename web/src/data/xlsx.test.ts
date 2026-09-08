import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { legacyToDataset, parseAnyDate, parseLegacyGame, parseWorkbook } from './xlsx'
import { SEED_DATASET } from './seed'
import { summarizeGame } from './stats'

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
