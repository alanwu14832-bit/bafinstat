/**
 * 匯出備份 in the 總表 layout: the backup's rows are written into the master workbook the site hands out
 * (data/BAFIN_棒球數據總表.xlsx, built by tools/build_workbook.py), so the file keeps the template's colours, column
 * widths, dropdowns and every formula — 總表, the per-row calculated columns, 單場 sheets — and Excel works the
 * numbers out when it is opened.
 *
 * The template is edited as XML, cell by cell: only the input cells of the data sheets (and the 杯賽／對手 lists in 設定)
 * change; a cell keeps its style, a formula cell is never touched. The template's own example rows are cleared first.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import type { BackupTable } from './xlsx'

/** Where each data sheet's column headers are (the rows below them are data). */
const HEADER_ROW: Record<string, number> = { 比賽清單: 3, 球員名單: 3, 報名名單: 3, 打席紀錄: 1, 投球紀錄: 1, 守備紀錄: 1 }
/** 設定 lists that grow with the data (the 總表 filters and the dropdowns read them). */
const LISTS: Record<string, { sheet: string; column: string }> = { 杯賽清單: { sheet: '比賽清單', column: '杯賽' }, 對手清單: { sheet: '比賽清單', column: '對手' } }
const LIST_ROWS = { first: 4, last: 40 }

export interface TemplateExport { file: Uint8Array; warnings: string[] }

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const unesc = (v: string) => v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const colNum = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
const colName = (n: number) => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }

const CELL = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
const ROW = /<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g
const styleOf = (attrs: string) => / s="(\d+)"/.exec(attrs)?.[1]
const textOf = (inner: string | undefined) => unesc([...(inner ?? '').matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]).join(''))

/** Excel's serial day for 2026-10-07 (a date column), its fraction of a day for 08:30 (a time column). */
const DATE_COLUMNS = new Set(['日期'])
const TIME_COLUMNS = new Set(['時間'])
function serial(header: string, v: string | number): string | number {
  if (typeof v !== 'string') return v
  if (DATE_COLUMNS.has(header)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
    if (m) return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000
  }
  if (TIME_COLUMNS.has(header)) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v)
    if (m) return (+m[1] * 60 + +m[2]) / 1440
  }
  return v
}
function cellXml(ref: string, style: string | undefined, v: string | number | undefined): string {
  const s = style ? ` s="${style}"` : ''
  if (v === undefined || v === '') return `<c r="${ref}"${s} t="n" />`
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${s} t="n"><v>${v}</v></c>` : `<c r="${ref}"${s} t="n" />`
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
}

interface Sheet { xml: string }
/** The header row's columns, by header text. */
function headers(sheet: Sheet, row: number): Map<string, number> {
  const out = new Map<string, number>()
  const r = [...sheet.xml.matchAll(ROW)].find((m) => +m[1] === row)
  if (!r) return out
  for (const c of r[0].matchAll(CELL)) { const t = textOf(c[4]).trim(); if (t && !out.has(t)) out.set(t, colNum(c[1])) }
  return out
}

/**
 * Write `rows` from `first` down, into the columns named in `cols` (column number by header). Every row of the
 * template's data area gets those input cells rewritten (emptied where there is no data), rows past the template's
 * last one are added in the same style. Formula cells stay as they are.
 */
function fill(sheet: Sheet, first: number, cols: Map<string, number>, rows: Array<Record<string, string | number>>): number {
  const byCol = new Map([...cols].map(([h, c]) => [c, h]))
  const value = (row: number, col: number) => { const d = rows[row - first]; const h = byCol.get(col); return d && h !== undefined && h in d ? serial(h, d[h]) : undefined }
  const start = sheet.xml.indexOf('<sheetData>'), end = sheet.xml.indexOf('</sheetData>')
  if (start < 0 || end < 0) return 0
  const data = sheet.xml.slice(start + '<sheetData>'.length, end)
  let lastRow = 0
  let lastStyles = new Map<number, string | undefined>()
  const rebuilt = data.replace(ROW, (whole, rText: string) => {
    const r = +rText
    if (r < first) return whole
    lastRow = Math.max(lastRow, r)
    const styles = new Map<number, string | undefined>()
    const out = whole.replace(CELL, (cell, c: string, _rn: string, attrs: string, inner: string | undefined) => {
      const col = colNum(c)
      styles.set(col, styleOf(attrs))
      if (!byCol.has(col) || (inner ?? '').includes('<f>')) return cell
      return cellXml(`${c}${r}`, styleOf(attrs), value(r, col))
    })
    lastStyles = styles
    // a column with data but no cell in this row yet (the template leaves none there)
    const missing = [...byCol.keys()].filter((col) => !styles.has(col) && value(r, col) !== undefined)
    if (!missing.length) return out
    const cells = [...out.matchAll(CELL)].map((m) => ({ col: colNum(m[1]), xml: m[0] }))
    for (const col of missing) cells.push({ col, xml: cellXml(`${colName(col)}${r}`, undefined, value(r, col)) })
    cells.sort((a, z) => a.col - z.col)
    return out.replace(/>[\s\S]*<\/row>$|\/>$/, `>${cells.map((x) => x.xml).join('')}</row>`)
  })
  // more rows than the template has room for: add them below, styled like its last row (no formulas there)
  const extra: string[] = []
  const lastData = first + rows.length - 1
  for (let r = Math.max(lastRow + 1, first); r <= lastData; r++) {
    const cols2 = [...byCol.keys()].sort((a, z) => a - z)
    extra.push(`<row r="${r}">${cols2.map((col) => cellXml(`${colName(col)}${r}`, lastStyles.get(col), value(r, col))).join('')}</row>`)
  }
  sheet.xml = sheet.xml.slice(0, start) + '<sheetData>' + rebuilt + extra.join('') + sheet.xml.slice(end)
  if (extra.length) sheet.xml = sheet.xml.replace(/<dimension ref="([A-Z]+\d+):([A-Z]+)\d+"/, (_m, a: string, b: string) => `<dimension ref="${a}:${b}${lastData}"`)
  return Math.max(0, lastData - Math.max(lastRow, first - 1))
}

/** Add the values the data uses to a 設定 list (rows 4–40 of its column), after the ones already there. */
function extendList(sheet: Sheet, col: number, values: string[]): string[] {
  const have: string[] = []
  const free: number[] = []
  const rows = [...sheet.xml.matchAll(ROW)]
  for (let r = LIST_ROWS.first; r <= LIST_ROWS.last; r++) {
    const row = rows.find((m) => +m[1] === r)
    const cell = row && [...row[0].matchAll(CELL)].find((c) => colNum(c[1]) === col)
    const t = cell ? textOf(cell[4]).trim() : ''
    if (t) have.push(t); else free.push(r)
  }
  const add = [...new Set(values.map((v) => v.trim()).filter((v) => v && !have.includes(v)))]
  const put = add.slice(0, free.length)
  if (!put.length) return add
  const at = new Map(put.map((v, k) => [free[k], v]))
  sheet.xml = sheet.xml.replace(ROW, (whole, rText: string) => {
    const v = at.get(+rText)
    if (v === undefined) return whole
    let done = false
    const out = whole.replace(CELL, (cell, c: string, rn: string, attrs: string) => { if (colNum(c) !== col) return cell; done = true; return cellXml(`${c}${rn}`, styleOf(attrs), v) })
    return done ? out : out.replace(/<\/row>$/, `${cellXml(`${colName(col)}${rText}`, undefined, v)}</row>`)
  })
  return add.slice(put.length)
}

/** Fill the master workbook `template` (the .xlsx bytes) with the backup tables. */
export function fillTemplate(template: Uint8Array, tables: BackupTable[]): TemplateExport {
  const files = unzipSync(template)
  const wbXml = strFromU8(files['xl/workbook.xml'])
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels'])
  const target = (rid: string) => { const m = new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${rid}"|<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels); const t = m?.[1] ?? m?.[2]; return t ? t.replace(/^\//, '').replace(/^(?!xl\/)/, 'xl/') : undefined }
  const pathOf = new Map([...wbXml.matchAll(/<sheet name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => [unesc(m[1]), target(m[2])]))
  const sheets = new Map<string, Sheet>()
  const sheet = (name: string) => {
    if (sheets.has(name)) return sheets.get(name)!
    const p = pathOf.get(name)
    if (!p || !files[p]) return null
    const s = { xml: strFromU8(files[p]) }
    sheets.set(name, s)
    return s
  }
  const warnings: string[] = []
  for (const t of tables) {
    const ws = sheet(t.sheet)
    if (!ws) { warnings.push(`範本沒有「${t.sheet}」工作表，這部分沒有匯出`); continue }
    const hr = HEADER_ROW[t.sheet] ?? 1
    const cols = headers(ws, hr)
    const keys = new Set(t.rows.flatMap((r) => Object.keys(r)))
    const missing = [...keys].filter((k) => !cols.has(k))
    if (missing.length) warnings.push(`「${t.sheet}」範本沒有這些欄：${missing.join('、')}`)
    // every cell under the headers that is not a formula is an input: rewritten from the backup (the template's own
    // example rows are cleared)
    const over = fill(ws, hr + 1, cols, t.rows)
    if (over > 0) warnings.push(`「${t.sheet}」有 ${t.rows.length} 列，超過範本預留的列數；多出的 ${over} 列沒有自動計算欄`)
  }
  // 設定: the tournaments and opponents the games use, so the 總表 filters list them
  const settings = sheet('設定')
  if (settings) {
    const cols = headers(settings, 3)
    for (const [list, from] of Object.entries(LISTS)) {
      const col = cols.get(list)
      const rows = tables.find((t) => t.sheet === from.sheet)?.rows ?? []
      if (!col) continue
      const left = extendList(settings, col, rows.map((r) => String(r[from.column] ?? '')))
      if (left.length) warnings.push(`設定的「${list}」放不下：${left.join('、')}`)
    }
  }
  const out: Zippable = {}
  for (const [p, bytes] of Object.entries(files)) out[p] = bytes
  for (const [name, s] of sheets) out[pathOf.get(name)!] = strToU8(s.xml)
  // the formulas have no saved results: have Excel (and Numbers, LibreOffice) work them out on opening
  out['xl/workbook.xml'] = strToU8(/<calcPr\b/.test(wbXml) ? wbXml.replace(/<calcPr\b(?![^>]*fullCalcOnLoad)/, '<calcPr fullCalcOnLoad="1"') : wbXml.replace('</workbook>', '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'))
  return { file: zipSync(out, { level: 6 }), warnings }
}
