import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { backupTables, parseWorkbook } from './xlsx'
import { fillTemplate } from './templateExport'
import { SEED_DATASET } from './seed'
import type { Dataset, Registration } from './types'

const template = new Uint8Array(readFileSync(resolve(process.cwd(), '..', 'data', 'BAFIN_棒球數據總表.xlsx')))
const regs: Registration[] = [{ season: 2026, tournament: '大專盃', players: ['蘇柏愷', '許振謙'] }]
const sheetXml = (file: Uint8Array, n: number) => strFromU8(unzipSync(file)[`xl/worksheets/sheet${n}.xml`])
const toBuf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

describe('匯出備份 in the 總表 layout', () => {
  it('reads back as the same data, with the template\'s formulas and styles kept', () => {
    const { file, warnings } = fillTemplate(template, backupTables(SEED_DATASET, regs))
    expect(warnings).toEqual([])
    if (process.env.TEMPLATE_EXPORT_OUT) writeFileSync(process.env.TEMPLATE_EXPORT_OUT, file)
    const { dataset } = parseWorkbook(toBuf(file), 'backup.xlsx')
    expect(dataset.games.map((g) => g.id)).toEqual(SEED_DATASET.games.map((g) => g.id))
    expect(dataset.batting).toHaveLength(SEED_DATASET.batting.length)
    expect(dataset.pitching).toHaveLength(SEED_DATASET.pitching.length)
    expect(dataset.batting.map((p) => [p.batter, p.result, p.pitches.join('')])).toEqual(SEED_DATASET.batting.map((p) => [p.batter, p.result, p.pitches.join('')]))
    expect(dataset.games[0].date).toBe(SEED_DATASET.games[0].date)
    // 打席紀錄 (sheet6): the calculated columns and the cell styles are the template's
    const before = sheetXml(template, 6), after = sheetXml(file, 6)
    expect((after.match(/<f>/g) ?? []).length).toBe((before.match(/<f>/g) ?? []).length)
    expect(/<c r="A2" s="(\d+)"/.exec(after)?.[1]).toBe(/<c r="A2" s="(\d+)"/.exec(before)?.[1])
    expect(strFromU8(unzipSync(file)['xl/workbook.xml'])).toContain('fullCalcOnLoad="1"')
  })

  it('clears the template\'s example rows that the data does not have', () => {
    const one: Dataset = { ...SEED_DATASET, games: SEED_DATASET.games.slice(0, 1), batting: SEED_DATASET.batting.filter((p) => p.gameId === SEED_DATASET.games[0].id), pitching: SEED_DATASET.pitching.filter((p) => p.gameId === SEED_DATASET.games[0].id), fielding: SEED_DATASET.fielding.filter((f) => f.gameId === SEED_DATASET.games[0].id) }
    const { file } = fillTemplate(template, backupTables(one))
    const { dataset } = parseWorkbook(toBuf(file), 'backup.xlsx')
    expect(dataset.games).toHaveLength(1)
    expect(dataset.batting).toHaveLength(one.batting.length)
    expect(dataset.fielding).toHaveLength(one.fielding.length)
  })

  it('adds new tournaments and opponents to the 設定 lists', () => {
    const ds: Dataset = { ...SEED_DATASET, games: SEED_DATASET.games.map((g, i) => (i === 0 ? { ...g, tournament: '測試盃', opponent: '新對手' } : g)) }
    const { file } = fillTemplate(template, backupTables(ds))
    const settings = sheetXml(file, 12)
    expect(settings).toContain('測試盃'); expect(settings).toContain('新對手')
  })
})
