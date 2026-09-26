/**
 * The 公版 (data/BAFIN_棒球數據總表.xlsx, built by tools/build_workbook.py) must keep up with the website: every column the
 * backup export writes has to exist in the template too. When this fails, add the column in tools/build_workbook.py and
 * run `python3 tools/build_workbook.py` (the build copies the file into web/public). CI blocks the deploy until then.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { datasetToWorkbook, parseWorkbook } from './xlsx'
import { SEED_DATASET } from './seed'
import type { Registration } from './types'

const templateBuf = () => readFileSync(resolve(process.cwd(), '..', 'data', 'BAFIN_棒球數據總表.xlsx'))
const arrayBuf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
const template = XLSX.read(new Uint8Array(templateBuf()), { type: 'array' })
const headerRow = (ws: XLSX.WorkSheet, key: string) =>
  (XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }).slice(0, 12).find((r) => r.some((c) => String(c).trim() === key)) ?? []).map((c) => String(c).trim())
const KEY: Record<string, string> = { 比賽清單: '比賽ID', 球員名單: '姓名', 報名名單: '球員', 打席紀錄: '打者', 投球紀錄: '投手', 守備紀錄: '球員' }
const regs: Registration[] = [{ season: 2026, tournament: '大專盃', players: ['蘇柏愷', '許振謙'] }, { season: 2025, tournament: '友誼賽', players: ['王廷宇'] }]

describe('公版 Excel keeps up with the website', () => {
  it('has every sheet and column the backup export writes', () => {
    const exported = datasetToWorkbook(SEED_DATASET, regs)
    for (const name of exported.SheetNames) {
      expect(template.SheetNames, `公版缺少工作表「${name}」`).toContain(name)
      const want = headerRow(exported.Sheets[name], KEY[name])
      const have = headerRow(template.Sheets[name], KEY[name])
      for (const col of want) expect(have, `公版「${name}」缺少欄位「${col}」`).toContain(col)
    }
  })
  it('has the 當日登錄名單 cells in the single-game template', () => {
    const labels = XLSX.utils.sheet_to_json<unknown[]>(template.Sheets['單場-摘要'], { header: 1, defval: '' }).slice(0, 8).flat().map((c) => String(c).trim())
    expect(labels).toContain('板凳')
    expect(labels).toContain('允許再上場')
  })
  it('an empty 報名名單 sheet imports as no lists', () => {
    expect(parseWorkbook(arrayBuf(templateBuf())).registrations).toEqual([])
  })
})

describe('報名名單 in Excel', () => {
  it('survive a backup round trip', () => {
    const buf = XLSX.write(datasetToWorkbook(SEED_DATASET, regs), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const { registrations, report } = parseWorkbook(buf)
    expect(registrations).toEqual([{ season: 2026, tournament: '大專盃', players: ['蘇柏愷', '許振謙'] }, { season: 2025, tournament: '友誼賽', players: ['王廷宇'] }])
    expect(report.registrations).toBe(2)
  })
  it('the single-game template brings its 板凳 in as the game-day roster', () => {
    const wb = XLSX.read(new Uint8Array(templateBuf()), { type: 'array' })
    const ws = wb.Sheets['單場-摘要']
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
    const cellNext = (label: string) => { for (let r = 0; r < 8; r++) { const c = (grid[r] ?? []).findIndex((v) => String(v).trim() === label); if (c >= 0) return XLSX.utils.encode_cell({ r, c: c + 1 }) } throw new Error(label) }
    XLSX.utils.sheet_add_aoa(ws, [['丙、丁']], { origin: cellNext('板凳') })
    XLSX.utils.sheet_add_aoa(ws, [['是']], { origin: cellNext('允許再上場') })
    // keep only the single-game sheets so the file is read as a 單場 template
    for (const n of wb.SheetNames.filter((n) => !n.startsWith('單場-'))) { delete wb.Sheets[n] }
    wb.SheetNames = wb.SheetNames.filter((n) => n.startsWith('單場-'))
    const { dataset } = parseWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
    expect(dataset.games[0].dayRoster).toMatchObject({ bench: ['丙', '丁'], reentry: true })
  })
})
