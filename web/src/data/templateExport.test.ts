import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { backupTables, parseWorkbook } from './xlsx'
import { fillTemplate } from './templateExport'
import { SEED_DATASET } from './seed'
import type { Dataset, Registration } from './types'

// unzipping, filling and re-zipping the 3 MB template (then reading it back) takes several seconds on a CI runner
const SLOW = 60_000

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
  }, SLOW)

  it('clears the template\'s example rows that the data does not have', () => {
    const one: Dataset = { ...SEED_DATASET, games: SEED_DATASET.games.slice(0, 1), batting: SEED_DATASET.batting.filter((p) => p.gameId === SEED_DATASET.games[0].id), pitching: SEED_DATASET.pitching.filter((p) => p.gameId === SEED_DATASET.games[0].id), fielding: SEED_DATASET.fielding.filter((f) => f.gameId === SEED_DATASET.games[0].id) }
    const { file } = fillTemplate(template, backupTables(one))
    const { dataset } = parseWorkbook(toBuf(file), 'backup.xlsx')
    expect(dataset.games).toHaveLength(1)
    expect(dataset.batting).toHaveLength(one.batting.length)
    expect(dataset.fielding).toHaveLength(one.fielding.length)
  }, SLOW)

  // the template rebuilt by openpyxl with lxml writes <sheet xmlns:r="…" name="…">: the sheets must still be found
  const withWorkbookXml = (edit: (xml: string) => string) => {
    const files = unzipSync(template)
    files['xl/workbook.xml'] = strToU8(edit(strFromU8(files['xl/workbook.xml'])))
    return zipSync(files)
  }
  it('finds the sheets whatever the order of their attributes', () => {
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    const lxml = withWorkbookXml((x) => x.replace(` xmlns:r="${R}"`, '').replace(/<sheet name=/g, `<sheet xmlns:r="${R}" name=`))
    expect(strFromU8(unzipSync(lxml)['xl/workbook.xml'])).toContain(`<sheet xmlns:r="${R}" name="打席紀錄"`)
    const { file, warnings } = fillTemplate(lxml, backupTables(SEED_DATASET))
    expect(warnings).toEqual([])
    const { dataset } = parseWorkbook(toBuf(file), 'backup.xlsx')
    expect(dataset.batting).toHaveLength(SEED_DATASET.batting.length)
  }, SLOW)

  it('refuses a template without one of the data sheets (the site then hands out the plain workbook)', () => {
    const broken = withWorkbookXml((x) => x.replace(/<sheet name="打席紀錄"[^>]*\/>/, ''))
    expect(() => fillTemplate(broken, backupTables(SEED_DATASET))).toThrow(/打席紀錄/)
  }, SLOW)

  it('adds new tournaments and opponents to the 設定 lists', () => {
    const ds: Dataset = { ...SEED_DATASET, games: SEED_DATASET.games.map((g, i) => (i === 0 ? { ...g, tournament: '測試盃', opponent: '新對手' } : g)) }
    const { file } = fillTemplate(template, backupTables(ds))
    const settings = sheetXml(file, 12)
    expect(settings).toContain('測試盃'); expect(settings).toContain('新對手')
  }, SLOW)

  it('writes 結束時間 as a time of day and reads it back', () => {
    const ds: Dataset = { ...SEED_DATASET, games: SEED_DATASET.games.map((g, i) => (i === 0 ? { ...g, time: '13:07', endTime: '15:22' } : g)) }
    const { file, warnings } = fillTemplate(template, backupTables(ds))
    expect(warnings).toEqual([])
    // 比賽清單 is sheet3: the end time cell holds the fraction of a day
    expect(sheetXml(file, 3)).toContain(`<v>${922 / 1440}</v>`)
    const { dataset } = parseWorkbook(toBuf(file), 'backup.xlsx')
    expect(dataset.games[0]).toMatchObject({ time: '13:07', endTime: '15:22' })
  }, SLOW)
})
