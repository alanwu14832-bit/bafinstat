import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { legacyToDataset, parseWorkbook } from './xlsx'
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
