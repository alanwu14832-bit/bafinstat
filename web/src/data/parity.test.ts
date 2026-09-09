/**
 * Every way of getting data into the site must yield the same numbers:
 *   master workbook (總表) · single-game template (單場-*) · legacy single-game sheet · a backup exported by the site
 * All of them are compared against the bundled seed (which itself goes through normalizeDataset).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { datasetToWorkbook, legacyToDataset, parseWorkbook } from './xlsx'
import { normalizeDataset } from './normalize'
import { SEED_DATASET } from './seed'
import { battingLines, fieldingLines, pitchingLines, summarizeGame } from './stats'
import type { Dataset } from './types'

const toBuf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
const loadFile = (...parts: string[]) => toBuf(readFileSync(resolve(process.cwd(), '..', 'data', ...parts)))
const wbToBuf = (wb: XLSX.WorkBook) => toBuf(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)

/** Every numeric stat the site shows for one game, keyed by player, rounded so float noise never matters. */
const numbersOf = (o: object) => Object.fromEntries(Object.entries(o).filter(([k, v]) => k === 'name' || k === 'pos' || typeof v === 'number').map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v]))
const byName = <T extends { name: string; pos?: string }>(lines: T[]) => Object.fromEntries(lines.map((l) => [l.pos ? `${l.name}/${l.pos}` : l.name, numbersOf(l)]))
function fingerprint(ds: Dataset, gameId: string) {
  const game = ds.games.find((g) => g.id === gameId)
  expect(game, `game ${gameId} present`).toBeTruthy()
  const bat = ds.batting.filter((p) => p.gameId === gameId)
  const pit = ds.pitching.filter((p) => p.gameId === gameId)
  const fld = ds.fielding.filter((f) => f.gameId === gameId)
  const s = summarizeGame(ds, game!)
  return {
    summary: { runsUs: s.runsUs, runsOpp: s.runsOpp, hitsUs: s.hitsUs, hitsOpp: s.hitsOpp, errorsUs: s.errorsUs, errorsOpp: s.errorsOpp, lobUs: s.lobUs, lineUs: s.lineUs, lineOpp: s.lineOpp, result: s.result },
    batting: byName(battingLines(ds, bat)),
    pitching: byName(pitchingLines(pit, [game!])),
    fielding: byName(fieldingLines(fld).map((f) => ({ name: f.name, pos: f.positions.join('/'), e: f.e, po: f.po, a: f.a, innings: f.innings }))),
    rows: [bat.length, pit.length, fld.length],
  }
}

const GAMES = ['G20251010-01', 'G20251222-01'] as const
const seedPrint = Object.fromEntries(GAMES.map((id) => [id, fingerprint(SEED_DATASET, id)]))

describe('all import formats agree with the seed', () => {
  it('master workbook (data/BAFIN_棒球數據總表.xlsx)', () => {
    const { dataset, report } = parseWorkbook(loadFile('BAFIN_棒球數據總表.xlsx'))
    expect(report.mode).toBe('master')
    expect(report.games).toBe(GAMES.length)
    for (const id of GAMES) expect(fingerprint(dataset, id)).toEqual(seedPrint[id])
    expect(dataset.roster.map((p) => p.name).sort()).toEqual(SEED_DATASET.roster.map((p) => p.name).sort())
  }, 30_000) // parsing the 3000-row workbook can exceed the 5s default on a busy machine

  it('single-game template sheets (單場-摘要 / 單場-打擊 / 單場-投球 as shipped, pre-filled with 10/10)', () => {
    const master = XLSX.read(new Uint8Array(loadFile('BAFIN_棒球數據總表.xlsx')), { type: 'array' })
    const wb = XLSX.utils.book_new()
    for (const n of ['單場-摘要', '單場-打擊', '單場-投球']) XLSX.utils.book_append_sheet(wb, master.Sheets[n], n)
    const { dataset, report } = parseWorkbook(wbToBuf(wb))
    expect(report.mode).toBe('single')
    expect(dataset.games[0]).toMatchObject({ id: 'G20251010-01', date: '2025-10-10', opponent: '群風', tournament: '友誼賽', homeAway: '主' })
    expect(fingerprint(dataset, 'G20251010-01')).toEqual(seedPrint['G20251010-01'])
  }, 30_000)

  it('legacy single-game sheets (舊格式)', () => {
    for (const [file, id] of [['2025-10-10_vs_群風.xlsx', 'G20251010-01'], ['2025-12-22_vs_工海物治.xlsx', 'G20251222-01']] as const) {
      const { report } = parseWorkbook(loadFile('legacy', file))
      expect(report.mode).toBe('legacy')
      const ds = legacyToDataset(report.legacy!, { id, tournament: '友誼賽' })
      expect(fingerprint(ds, id)).toEqual(seedPrint[id])
    }
  })

  it('a backup exported from the site round-trips', () => {
    const { dataset, report } = parseWorkbook(wbToBuf(datasetToWorkbook(SEED_DATASET)))
    expect(report.mode).toBe('master')
    for (const id of GAMES) expect(fingerprint(dataset, id)).toEqual(seedPrint[id])
    expect(dataset.roster.length).toBe(SEED_DATASET.roster.length)
  })

  it('credits putouts and assists from the pitching log when none were recorded', () => {
    const fld = SEED_DATASET.fielding.filter((f) => f.gameId === 'G20251010-01')
    const pit = SEED_DATASET.pitching.filter((p) => p.gameId === 'G20251010-01')
    const outs = pit.filter((p) => ['I', 'II', 'III'].includes(p.code ?? '')).reduce((n, p) => n + (p.result === '雙殺' && (p.outsBefore ?? 0) <= 1 ? 2 : 1), 0)
    const po = fld.reduce((n, f) => n + f.po, 0)
    const so = pit.filter((p) => p.result === '三振').length
    expect(po).toBeGreaterThan(0)
    expect(po).toBeLessThanOrEqual(outs)
    expect(fld.find((f) => f.pos === 'C')!.po).toBeGreaterThanOrEqual(so)
    // running normalize again does not double-credit
    const again = normalizeDataset(SEED_DATASET).dataset.fielding.filter((f) => f.gameId === 'G20251010-01').reduce((n, f) => n + f.po, 0)
    expect(again).toBe(po)
  })

  it('normalizeDataset is idempotent and tolerant of messy input', () => {
    const once = normalizeDataset(SEED_DATASET)
    const twice = normalizeDataset(once.dataset)
    expect(twice.dataset).toEqual(once.dataset)
    // strip 局 / 出局(前), lower-case codes, use legacy vocab, blank fielding → still the same numbers
    const messy: Dataset = {
      ...SEED_DATASET, fielding: [],
      batting: SEED_DATASET.batting.map((p) => ({ ...p, inning: 0, outsBefore: undefined, code: p.code?.toLowerCase(), result: p.result === '犧觸' ? '犧牲' : p.result, pitches: p.pitches.map((x) => x.toLowerCase()), batter: ` ${p.batter} ` })),
      pitching: SEED_DATASET.pitching.map((p) => ({ ...p, inning: 0, outsBefore: undefined, code: p.code?.toLowerCase(), loc: p.loc ? (`${p.loc}游` as unknown as number) : undefined })),
    }
    const fixed = normalizeDataset(messy)
    for (const id of GAMES) {
      const a = fingerprint(fixed.dataset, id), b = seedPrint[id]
      expect(a.summary).toEqual(b.summary); expect(a.batting).toEqual(b.batting); expect(a.pitching).toEqual(b.pitching)
      // fielding is re-derived from the logs: same players, same error counts
      expect(Object.fromEntries(Object.entries(a.fielding).map(([k, v]) => [k, (v as { e: number }).e]))).toEqual(Object.fromEntries(Object.entries(b.fielding).map(([k, v]) => [k, (v as { e: number }).e])))
    }
    expect(fixed.warnings.some((w) => w.message.includes('補算'))).toBe(true)
  })
})
