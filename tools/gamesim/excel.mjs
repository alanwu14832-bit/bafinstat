// Excel 匯出／匯入: after game1.mjs (and edit1.mjs), take the data through every Excel path a recorder uses and check
// nothing changes on the way:
//   X1 匯出備份（總表格式） — every row of the site's data is in the file
//   X2 匯入到另一台電腦（全新的瀏覽器）「以此檔取代全部資料」 — the same data, the same Box Score
//   X3 the file opened and saved by a spreadsheet program (LibreOffice) — still the same data
//   X4 two cells changed in the file and imported again — exactly those two things change
//   X5 合併: the same file again (every game skipped, nothing touched), then a file with one new game
//   X6 單場模板 filled in by hand — warned when the template's example 守備紀錄 is left in; the same Box Score without it
//   X7 the 總表 sheet, recalculated by LibreOffice, against the site's own 打擊／投球／守備 numbers and game list
//   node tools/gamesim/excel.mjs /tmp/out     (reads game1-shown.json + edit1-dataset.json or game1-dataset.json)
//   X7 also runs on game3-dataset.json (延長賽突破僵局、投手犯規) when game3.mjs has run before it
// X3 and X7 need LibreOffice (soffice); they are skipped without it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
// playwright from next to this script, or from the folder it is run in (npm i --no-save playwright there)
const { chromium } = await import('playwright').catch(() => createRequire(`${process.cwd()}/`)('playwright'))
import { fileURLToPath } from 'node:url'
const WEB = fileURLToPath(new URL('../../web/', import.meta.url))
const X = createRequire(`${WEB}package.json`)('xlsx')
const S = process.argv[2] ?? '.'
const SITE = process.env.GAMESIM_URL ?? 'http://localhost:4173'
const { N } = JSON.parse(readFileSync(`${S}/game1-shown.json`, 'utf8'))
const seed = JSON.parse(readFileSync(existsSync(`${S}/edit1-dataset.json`) ? `${S}/edit1-dataset.json` : `${S}/game1-dataset.json`, 'utf8'))
const G = seed.base.games.find((g) => g.opponent === '模擬隊').id
const soffice = (() => { try { execFileSync('soffice', ['--version'], { stdio: 'pipe' }); return true } catch { return false } })()
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const log = (...a) => console.log(...a)
let bad = 0
const problem = (s) => { bad++; log('✗', s) }

async function fresh(withData) {
  // a UTF-8 locale, or Chromium saves a download with a Chinese name as "download"
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 }, acceptDownloads: true })
  const p = await ctx.newPage()
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && p.errs.push(m.text()))
  p.on('dialog', (d) => d.accept())
  await p.goto(`${SITE}/import`, { waitUntil: 'networkidle' })
  await p.evaluate((ds) => { localStorage.setItem('bafin.demo', 'false'); if (ds) localStorage.setItem('bafin.dataset.v1', JSON.stringify(ds)) }, withData)
  await p.reload({ waitUntil: 'networkidle' })
  return p
}
const dataset = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('bafin.dataset.v1') || 'null')?.base ?? null)
async function box(p, id = G) {
  await p.goto(`${SITE}/games?game=${id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(600)
  const dlg = p.getByRole('dialog').last()
  const rows = async (header) => {
    const t = dlg.locator('table', { has: p.locator('th', { hasText: new RegExp(`^${header}$`) }) }).first()
    const heads = (await t.locator('thead th').allTextContents()).map((x) => x.trim())
    const out = []
    for (const tr of await t.locator('tbody tr').all()) out.push((await tr.locator('td').allTextContents()).map((x) => x.trim()))
    return { heads, rows: out }
  }
  const text = await dlg.innerText()
  const line = /SCORE[^\n]*\n([^\n]*)\n([^\n]*)/.exec(text)
  return { head: text.split('\n').slice(0, 2).join(' / '), bat: await rows('打者'), pit: await rows('投手'), line: line ? [line[1], line[2]] : null }
}
async function exportFile(p, path) {
  await p.goto(`${SITE}/import`, { waitUntil: 'networkidle' })
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: '匯出備份（總表格式）' }).click()])
  await dl.saveAs(path); await p.waitForTimeout(300)
  return await p.getByRole('status').first().textContent().catch(() => '')
}
async function importFile(p, path, mode) {
  await p.goto(`${SITE}/import`, { waitUntil: 'networkidle' })
  await p.locator('input[type=file]').setInputFiles(path); await p.waitForTimeout(800)
  const warnings = (await p.locator('main ul li').allTextContents()).filter((w) => !/^G2025/.test(w))
  await p.getByRole('button', { name: mode === 'replace' ? /以此檔取代/ : /合併|加入這場比賽/ }).first().click(); await p.waitForTimeout(800)
  return { warnings, done: await p.locator('main [role=status]').first().textContent().catch(() => '') }
}
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, canon(v[k])])) : v
function sameData(what, a, z) {
  let n = 0
  for (const t of ['roster', 'games', 'batting', 'pitching', 'fielding']) {
    const A = a[t] ?? [], Z = z?.[t] ?? []
    if (A.length !== Z.length) { problem(`${what}：${t} 筆數 ${A.length} → ${Z.length}`); n++ }
    for (let i = 0; i < Math.max(A.length, Z.length) && n < 6; i++) {
      const x = JSON.stringify(canon(A[i])), y = JSON.stringify(canon(Z[i]))
      if (x !== y) { n++; problem(`${what}：${t}[${i}]\n    原本 ${x}\n    之後 ${y}`) }
    }
  }
  if (!n) log(`✓ ${what}：資料完全相同（${a.games.length} 場、${a.batting.length} 打席、${a.pitching.length} 投球打席、${a.fielding.length} 守備列、${a.roster.length} 球員）`)
}
function sameBox(what, a, z) {
  if (JSON.stringify([a.bat, a.pit, a.line]) === JSON.stringify([z.bat, z.pit, z.line])) return log(`✓ ${what}：Box Score 與局分表相同`)
  problem(`${what}：Box Score 不同`)
  for (const k of ['bat', 'pit']) for (const r of z[k].rows) { const o = a[k].rows.find((q) => q[0] === r[0]); if (!o || o.join() !== r.join()) log(`    ${o?.join(' ') ?? '(沒有)'}\n →  ${r.join(' ')}`) }
  if (JSON.stringify(a.line) !== JSON.stringify(z.line)) log('    局分表', a.line, '→', z.line)
}
const recalc = (file, dir) => { mkdirSync(dir, { recursive: true }); execFileSync('soffice', ['--headless', '--calc', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', dir, file], { stdio: 'pipe', timeout: 300000 }); return `${dir}/${file.split('/').pop()}` }
const rowsOf = (w, name, key) => { const ws = w.Sheets[name]; const head = X.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(0, 12); const hdr = Math.max(0, head.findIndex((r) => r.some((c) => String(c).trim() === key))); return X.utils.sheet_to_json(ws, { range: hdr, defval: '' }).filter((r) => String(r[key]).trim()) }
/** Rewrite cells of a sheet: `edit(row)` returns { header: value } for the rows to change. */
function editSheet(w, sheet, key, edit) {
  const ws = w.Sheets[sheet]; const grid = X.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const hr = grid.findIndex((r) => r.some((c) => String(c).trim() === key)); const heads = grid[hr].map((h) => String(h).trim())
  let n = 0
  grid.forEach((row, i) => {
    if (i <= hr) return
    const change = edit(Object.fromEntries(heads.map((h, k) => [h, row[k]])))
    for (const [h, v] of Object.entries(change ?? {})) { n++; ws[X.utils.encode_cell({ r: i, c: heads.indexOf(h) })] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v } }
  })
  return n
}
const serial = (iso) => (Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000

// ================================================================ X1 匯出
const A = await fresh(seed)
const boxA = await box(A), dsA = await dataset(A)
log('X1 匯出：', await exportFile(A, `${S}/export.xlsx`))
const wb = X.readFile(`${S}/export.xlsx`)
const inFile = { games: rowsOf(wb, '比賽清單', '比賽ID').length, batting: rowsOf(wb, '打席紀錄', '打者').length, pitching: rowsOf(wb, '投球紀錄', '投手').length, fielding: rowsOf(wb, '守備紀錄', '球員').length, roster: rowsOf(wb, '球員名單', '姓名').length }
for (const [k, v] of Object.entries(inFile)) if (v !== dsA[k].length) problem(`X1 檔案的${k} ${v} 列，網站 ${dsA[k].length} 筆`)
if (Object.entries(inFile).every(([k, v]) => v === dsA[k].length)) log('✓ X1 檔案列數與網站相同', JSON.stringify(inFile))

// ================================================================ X2 另一台電腦匯入
const B = await fresh(null)
log('X2 匯入：', JSON.stringify(await importFile(B, `${S}/export.xlsx`, 'replace')))
sameData('X2 匯出→匯入', dsA, await dataset(B))
sameBox('X2 匯出→匯入', boxA, await box(B))

// ================================================================ X3 經過試算表軟體存檔
let lo = null
if (soffice) {
  lo = recalc(`${S}/export.xlsx`, `${S}/lo`)
  const C = await fresh(null)
  log('X3 存檔後匯入：', JSON.stringify(await importFile(C, lo, 'replace')))
  sameData('X3 經過 LibreOffice 存檔', dsA, await dataset(C))
} else log('－ X3 略過（沒有 LibreOffice）')

// ================================================================ X4 改兩格再匯入：1 上 S1 的一安其實是二安；對手名稱打錯
const mod = X.readFile(`${S}/export.xlsx`)
const n1 = editSheet(mod, '打席紀錄', '打者', (r) => r['比賽ID'] === G && Number(r['局']) === 1 && r['打者'] === N.S1 ? { 打擊結果: '二安' } : null)
const n2 = editSheet(mod, '比賽清單', '比賽ID', (r) => r['比賽ID'] === G ? { 對手: '模擬大學' } : null)
if (n1 !== 1 || n2 !== 1) problem(`X4 要改的格子找到 ${n1}、${n2} 個（應各 1 個）`)
X.writeFile(mod, `${S}/modified.xlsx`)
const D = await fresh(seed)
log('X4 改過再匯入：', JSON.stringify(await importFile(D, `${S}/modified.xlsx`, 'replace')))
const dsD = await dataset(D)
sameData('X4 只改了兩格', { ...dsA, games: dsA.games.map((g) => g.id === G ? { ...g, opponent: '模擬大學' } : g), batting: dsA.batting.map((p) => p.gameId === G && p.inning === 1 && p.batter === N.S1 ? { ...p, result: '二安' } : p) }, dsD)
const boxD = await box(D)
const s1 = boxD.bat.rows.find((r) => r[0] === N.S1), col = (h) => s1[boxD.bat.heads.indexOf(h)]
if (col('2B') !== '1' || !boxD.head.includes('模擬大學')) problem(`X4 Box Score 沒反映：${N.S1} 2B ${col('2B')}，標題 ${boxD.head}`)
else log(`✓ X4 Box Score：${N.S1} 2B 1、對手 模擬大學`)

// ================================================================ X5 合併
const r5 = await importFile(D, `${S}/export.xlsx`, 'append')
log('X5 同一個檔再合併：', r5.done)
sameData('X5 重複的比賽應略過', dsD, await dataset(D))
const nw = X.readFile(`${S}/export.xlsx`), G2 = `${G}9`
for (const [sheet, key] of [['比賽清單', '比賽ID'], ['打席紀錄', '打者'], ['投球紀錄', '投手'], ['守備紀錄', '球員']]) editSheet(nw, sheet, key, (r) => r['比賽ID'] === G ? { 比賽ID: G2, ...(sheet === '比賽清單' ? { 日期: serial('2026-12-31') } : {}) } : null)
X.writeFile(nw, `${S}/newgame.xlsx`)
log('X5 合併一場新比賽：', (await importFile(D, `${S}/newgame.xlsx`, 'append')).done)
if ((await dataset(D)).games.length !== dsD.games.length + 1) problem('X5 新比賽沒有加進來')
sameBox('X5 新比賽（和原本那場比）', boxA, await box(D, G2))

// ================================================================ X6 單場模板
const tpl = X.readFile(`${WEB}../data/BAFIN_棒球數據總表.xlsx`)
const fillLog = (sheet, rows) => {
  const ws = tpl.Sheets[sheet]; const grid = X.utils.sheet_to_json(ws, { header: 1, defval: '' }); const heads = grid[0].map((h) => String(h).trim())
  for (let r = 1; r < grid.length; r++) heads.forEach((h, c) => { const ref = X.utils.encode_cell({ r, c }); if (ws[ref] && !ws[ref].f) delete ws[ref] })
  rows.forEach((row, i) => heads.forEach((h, c) => { const v = row[h]; if (v !== undefined && v !== '' && h !== '比賽ID') ws[X.utils.encode_cell({ r: i + 1, c })] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v: String(v) } }))
}
fillLog('單場-打擊', rowsOf(wb, '打席紀錄', '打者').filter((r) => r['比賽ID'] === G))
fillLog('單場-投球', rowsOf(wb, '投球紀錄', '投手').filter((r) => r['比賽ID'] === G))
const sm = tpl.Sheets['單場-摘要'], g = seed.base.games.find((x) => x.id === G)
const put = (ref, v) => { sm[ref] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v } }
put('C3', serial('2026-12-30')); put('C5', g.tournament); put('C6', g.opponent); put('C7', g.homeAway); put('F2', g.venue ?? ''); put('I2', g.winningPitcher ?? ''); put('I5', g.dayRoster.bench.join('、'))
const single = { SheetNames: ['單場-摘要', '單場-打擊', '單場-投球'], Sheets: { '單場-摘要': sm, '單場-打擊': tpl.Sheets['單場-打擊'], '單場-投球': tpl.Sheets['單場-投球'] } }
const H = await fresh(seed)
// as copied, the example game's 守備紀錄 still in 單場-摘要
put('C2', `${G}7`); X.writeFile(single, `${S}/single-example-left.xlsx`)
const r6 = await importFile(H, `${S}/single-example-left.xlsx`, 'append')
if (!r6.warnings.some((w) => w.includes('範例列'))) problem('X6 守備紀錄留著範例列，匯入時沒有提醒')
else log('✓ X6 範例列留著：匯入時有提醒')
if (r6.warnings.some((w) => w.startsWith('名單沒有'))) problem(`X6 名單上的人被當成新球員：${r6.warnings.find((w) => w.startsWith('名單沒有'))}`)
// the example rows deleted
for (const ref of Object.keys(sm)) { const m = /^([B-M])(\d+)$/.exec(ref); if (m && +m[2] >= 43 && +m[2] <= 60) delete sm[ref] }
put('C2', `${G}8`); X.writeFile(single, `${S}/single.xlsx`)
log('X6 單場模板：', (await importFile(H, `${S}/single.xlsx`, 'append')).done)
sameBox('X6 單場模板（和原本那場比）', boxA, await box(H, `${G}8`))

// ================================================================ X7 總表（LibreOffice 重算）對網站
function totalsVsSite(label, ds, loFile) {
  writeFileSync(`${S}/export-dataset.json`, JSON.stringify(ds))
  const site = JSON.parse(execFileSync('node', [`${S}/sitestats.mjs`, `${S}/export-dataset.json`], { maxBuffer: 1 << 26 }).toString())
  const lwb = X.readFile(loFile)
  const grid = X.utils.sheet_to_json(lwb.Sheets['總表'], { header: 1, defval: '' })
  const MAP = {
    bat: { G: 'g', PA: 'pa', AB: 'ab', R: 'r', H: 'h', '1B': 'h1', '2B': 'h2', '3B': 'h3', HR: 'hr', TB: 'tb', RBI: 'rbi', BB: 'bb', IBB: 'ibb', HBP: 'hbp', SO: 'so', SH: 'sh', SF: 'sf', GIDP: 'gidp', ROE: 'roe', SB: 'sb', CS: 'cs', 壘死: 'baserunningOuts', 'SB%': 'sbPct', AVG: 'avg', OBP: 'obp', SLG: 'slg', OPS: 'ops', 'OPS+': 'opsPlus', ISO: 'iso', BABIP: 'babip', wOBA: 'woba', 'wRC+': 'wrcPlus', 'K%': 'kPct', 'BB%': 'bbPct', 'RISP AVG': 'rispAvg', 'QAB%': 'qabPct', '兩好球纏鬥': 'twoStrikeBattles', '6球以上': 'longPA', 'P/PA': 'pPerPA', sSeager: 'sSeager' },
    pit: { G: 'g', GS: 'gs', W: 'w', L: 'l', SV: 'sv', HLD: 'hld', 出局數: 'outs', IP: 'ipNumber', BF: 'bf', PC: 'pc', 好球: 'strikes', 壞球: 'balls', 'Strike%': 'strikePct', K: 'k', BB: 'bb', IBB: 'ibb', HBP: 'hbp', H: 'h', '2B': 'h2', '3B': 'h3', HR: 'hr', R: 'r', ER: 'er', WP: 'wp', SBA: 'sba', CS: 'cs', PK: 'pk', ERA: 'era', WHIP: 'whip', 'K/7': 'k7', 'K/9': 'k9', 'BB/9': 'bb9', 'K/BB': 'kbb', 'K%': 'kPct', 'BB%': 'bbPct', OppAVG: 'oppAvg', OppOBP: 'oppObp', BABIP: 'babip', FIP: 'fip', 'GB%': 'gbPct' },
    fld: { G: 'g', Inn: 'innings', PO: 'po', A: 'a', E: 'e', DP: 'dp', TC: 'tc', FPCT: 'fpct', 'RF/G': 'rfg', PB: 'pb', SB: 'sb', CS: 'cs', 'CS%': 'csPct' },
  }
  const more = (l) => ({ ...l, qabPct: l.pa ? l.qab / l.pa : null, pPerPA: l.pa ? l.pitches / l.pa : null, ipNumber: l.ipDisplay !== undefined ? Number(l.ipDisplay) : undefined })
  let cells = 0
  const same = (what, got, want) => {
    cells++
    const none = want === null || want === undefined || Number.isNaN(want)
    if (none && (got === '' || got === null)) return
    if (typeof got !== 'number' || none || Math.abs(got - want) > (Math.abs(want) > 10 ? 0.06 : Number.isInteger(want) ? 0.5 : 0.0015)) problem(`${label} ${what}：總表 ${got === '' ? '(空白)' : got}，網站 ${none ? '(空白)' : +(+want).toFixed(4)}`)
  }
  for (const [kind, title, lines, team] of [['bat', '打擊成績', site.bat, site.tb], ['pit', '投球成績', site.pit, site.tp], ['fld', '守備成績', site.fld, { g: site.team.games }]]) {
    const hr = grid.findIndex((r, i) => String(r[1]).trim() === '姓名' && grid[i - 1]?.some((v) => String(v).startsWith(title)))
    const heads = grid[hr].map((h) => String(h).trim())
    for (let r = hr + 1; r < grid.length; r++) {
      const name = String(grid[r][1]).trim(); if (!name) continue
      const l = name === '球隊合計' ? team : lines.find((x) => x.name === name)
      if (l) heads.forEach((h, c) => { const k = MAP[kind][h]; if (k && k in more(l)) same(`${title} ${name} ${h}`, grid[r][c], more(l)[k]) })
      if (name === '球隊合計') break
    }
  }
  const ov = Object.fromEntries(grid[12].map((h, i) => [String(h).trim(), grid[13][i]]))
  for (const [h, v] of [['場次', site.team.games], ['勝', site.team.w], ['敗', site.team.l], ['得分', site.team.rs], ['失分', site.team.ra], ['團隊AVG', site.tb.avg], ['團隊OBP', site.tb.obp], ['團隊SLG', site.tb.slg], ['團隊ERA', site.tp.era], ['團隊WHIP', site.tp.whip], ['盜壘', site.tb.sb], ['勝率', site.team.winPct]]) same(`球隊總覽 ${h}`, ov[h], v)
  for (let i = 0; i < 9; i++) { same(`逐局 我隊第${i + 1}局`, grid[17][2 + i], site.team.runsByInningUs[i] ?? 0); same(`逐局 對手第${i + 1}局`, grid[18][2 + i], site.team.runsByInningOpp[i] ?? 0) }
  const gl = X.utils.sheet_to_json(lwb.Sheets['比賽清單'], { header: 1, defval: '' }); const gh = gl.find((r) => r.includes('比賽ID')).map(String)
  for (const s of site.sums) {
    const row = gl.find((r) => r[0] === s.game.id); const c = (h) => row[gh.indexOf(h)]
    for (const [h, v] of [['我隊得分', s.runsUs], ['對手得分', s.runsOpp], ['我隊安打', s.hitsUs], ['對手安打', s.hitsOpp], ['我隊失誤', s.errorsUs], ['對手失誤', s.errorsOpp], ['我隊殘壘', s.lobUs]]) same(`比賽清單 ${s.game.id} ${h}`, c(h), v)
  }
  log(`✓ ${label} 總表與網站比對 ${cells} 格`)
}
if (lo) {
  execFileSync(`${WEB}node_modules/.bin/esbuild`, [fileURLToPath(new URL('sitestats.ts', import.meta.url)), '--bundle', '--platform=node', '--format=esm', `--outfile=${S}/sitestats.mjs`, '--define:import.meta.env={"BASE_URL":"/"}', '--log-level=warning'])
  totalsVsSite('X7', dsA, lo)
  // the tie-break game: placed runners are no plate appearances in the 總表 either (打席 helper), their runs count
  if (existsSync(`${S}/game3-dataset.json`)) {
    const T = await fresh(JSON.parse(readFileSync(`${S}/game3-dataset.json`, 'utf8')))
    const ds3 = await dataset(T)
    log('X7 突破僵局那場匯出：', await exportFile(T, `${S}/export3.xlsx`))
    totalsVsSite('X7 突破僵局', ds3, recalc(`${S}/export3.xlsx`, `${S}/lo3`))
    if (T.errs.length) problem(`網頁錯誤：${T.errs.join(' / ')}`)
  } else log('－ X7 突破僵局略過（還沒跑 game3.mjs）')
} else log('－ X7 略過（沒有 LibreOffice）')

for (const p of [A, B, D, H]) if (p.errs.length) problem(`網頁錯誤：${p.errs.join(' / ')}`)
await b.close()
console.log(bad ? `共 ${bad} 個問題` : '全部通過')
