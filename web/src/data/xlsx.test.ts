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

describe('代跑 column of 打席紀錄', () => {
  it('survives a backup round trip and is blank for everyone else', () => {
    const i = SEED_DATASET.batting.findIndex((p) => p.run === 1)
    const ds = { ...SEED_DATASET, batting: SEED_DATASET.batting.map((p, k) => (k === i ? { ...p, runner: '林凱堉' } : p)) }
    const buf = XLSX.write(datasetToWorkbook(ds), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const { dataset } = parseWorkbook(buf)
    expect(dataset.batting[i].runner).toBe('林凱堉')
    expect(dataset.batting.filter((p) => p.runner).length).toBe(1)
  })
})

describe('守備失誤 column of 投球紀錄', () => {
  it('survives a backup round trip', () => {
    const i = SEED_DATASET.pitching.findIndex((p) => p.result === '一安')
    const ds = { ...SEED_DATASET, pitching: SEED_DATASET.pitching.map((p, k) => (k === i ? { ...p, errors: ['LF', 'SS'] } : p)) }
    const { dataset } = parseWorkbook(XLSX.write(datasetToWorkbook(ds), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
    expect(dataset.pitching[i].errors).toEqual(['LF', 'SS'])
    expect(dataset.pitching.filter((p) => p.errors).length).toBe(1)
  })
})

describe('壘上出局 and 壘死 in Excel', () => {
  it('round-trips both, and reads a sheet that only has 壘死 (the old layout) as 壘上出局', async () => {
    const { SEED_DATASET } = await import('./seed')
    const ds = { ...SEED_DATASET, batting: SEED_DATASET.batting.map((p, i) => (i === 0 ? { ...p, outOnBase: 1, baserunningOuts: 1 } : i === 1 ? { ...p, outOnBase: 1 } : p)) }
    const wb = datasetToWorkbook(ds)
    const back = parseWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, 'b.xlsx').dataset.batting
    expect([back[0].outOnBase, back[0].baserunningOuts, back[1].outOnBase, back[1].baserunningOuts]).toEqual([1, 1, 1, undefined])
    // an old sheet: 壘死 meant any out on the bases
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['打席紀錄']).map((r) => { const { 壘上出局: o, ...rest } = r; return { ...rest, 壘死: o ?? '' } })
    wb.Sheets['打席紀錄'] = XLSX.utils.json_to_sheet(rows)
    const old = parseWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, 'old.xlsx').dataset.batting
    expect([old[0].outOnBase, old[0].baserunningOuts, old[1].outOnBase]).toEqual([1, undefined, 1])
  })
})

describe('結束時間, 中繼 and 對方投手 in Excel', () => {
  const base = SEED_DATASET
  const gid = base.games[0].id
  const ds = {
    ...base,
    games: base.games.map((g, i) => (i === 0 ? { ...g, time: '13:07', endTime: '15:22', holds: ['子', '丑'] } : g)),
    batting: base.batting.map((p, i) => (i === 0 ? { ...p, oppPitcher: '王', oppHand: 'R' as const } : i === 1 ? { ...p, oppHand: 'L' as const } : p)),
  }
  const roundTrip = (d: typeof ds) => parseWorkbook(XLSX.write(datasetToWorkbook(d), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer).dataset
  it('survive a backup round trip', () => {
    const back = roundTrip(ds)
    expect(back.games.find((g) => g.id === gid)).toMatchObject({ time: '13:07', endTime: '15:22', holds: ['子', '丑'] })
    expect(back.batting[0]).toMatchObject({ oppPitcher: '王', oppHand: 'R' })
    expect(back.batting[1].oppHand).toBe('L')
    expect('oppPitcher' in back.batting[1]).toBe(false)
    expect('oppHand' in back.batting[2] || 'oppPitcher' in back.batting[2]).toBe(false)
  })
  it('read 左投 / 右投 written out, and an old workbook without the columns gives no keys', () => {
    const wb = datasetToWorkbook(ds)
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['打席紀錄'])
    rows[0]['對方投手慣用'] = '左投'
    wb.Sheets['打席紀錄'] = XLSX.utils.json_to_sheet(rows)
    expect(parseWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer).dataset.batting[0].oppHand).toBe('L')
    // without the columns (a workbook from before)
    const old = datasetToWorkbook(base)
    const strip = (sheet: string, cols: string[]) => { const r = XLSX.utils.sheet_to_json<Record<string, unknown>>(old.Sheets[sheet]).map((x) => { const o = { ...x }; for (const c of cols) delete o[c]; return o }); old.Sheets[sheet] = XLSX.utils.json_to_sheet(r) }
    strip('打席紀錄', ['對方投手', '對方投手慣用']); strip('比賽清單', ['結束時間'])
    const back = parseWorkbook(XLSX.write(old, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer).dataset
    expect(back.batting.some((p) => 'oppHand' in p || 'oppPitcher' in p)).toBe(false)
    expect(back.games.some((g) => 'endTime' in g)).toBe(false)
  })
  it('the single-game template reads its 結束時間 and 中繼 cells', () => {
    const wb = XLSX.read(new Uint8Array(readFileSync(resolve(process.cwd(), '..', 'data', 'BAFIN_棒球數據總表.xlsx'))), { type: 'array' })
    const ws = wb.Sheets['單場-摘要']
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
    const cellNext = (label: string) => { for (let r = 0; r < 8; r++) { const c = (grid[r] ?? []).findIndex((v) => String(v).trim() === label); if (c >= 0) return XLSX.utils.encode_cell({ r, c: c + 1 }) } throw new Error(label) }
    XLSX.utils.sheet_add_aoa(ws, [[922 / 1440]], { origin: cellNext('結束時間') })
    XLSX.utils.sheet_add_aoa(ws, [['子、丑']], { origin: cellNext('中繼') })
    for (const n of wb.SheetNames.filter((n) => !n.startsWith('單場-'))) { delete wb.Sheets[n] }
    wb.SheetNames = wb.SheetNames.filter((n) => n.startsWith('單場-'))
    const { dataset } = parseWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
    expect(dataset.games[0]).toMatchObject({ endTime: '15:22', holds: ['子', '丑'] })
  })
})
