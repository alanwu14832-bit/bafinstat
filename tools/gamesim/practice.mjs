// 練習紀錄: three plate appearances on /record?practice=1 (local mode), then 結束練習. Nothing may be saved: the real
// progress on this device ('bafin.record.draft.v1') stays as it was, the dataset is unchanged and 比賽 has no PRACTICE- game.
import { createRequire } from 'node:module'
const { chromium } = await import('playwright').catch(() => createRequire(`${process.cwd()}/`)('playwright'))
const URL = process.env.GAMESIM_URL ?? 'http://localhost:4173'
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
p.on('dialog', (d) => d.accept())
const fails = []
const main = p.locator('main')
const SENTINEL = JSON.stringify({ game: { id: 'G20261001-01', date: '2026-10-01', opponent: '哨兵隊' }, batting: [], pitching: [] })

await p.goto(`${URL}/lineup`, { waitUntil: 'networkidle' })
const names = (await p.locator('select[aria-label="DH 指定打擊"] option').allTextContents()).filter((t) => t && !t.includes('不用')).map((t) => t.replace(/（.*$/, ''))
const pos = ['SS', 'C', '1B', '2B', '3B', 'LF', 'CF', 'RF', 'P']
await p.evaluate(({ L, S }) => { localStorage.setItem('bafin.record.draft.v1', S); localStorage.removeItem('bafin.record.practice.v1'); localStorage.setItem('bafin.lineup.v1', JSON.stringify(L)) },
  { S: SENTINEL, L: { field: Object.fromEntries(pos.map((x, i) => [x, names[i]])), dh: '', order: names.slice(0, 9), bench: [], gameId: '', regKey: '', reentry: false, updatedAt: new Date().toISOString() } })
const dataBefore = await p.evaluate(() => localStorage.getItem('bafin.dataset.v1'))

await p.goto(`${URL}/record?practice=1`, { waitUntil: 'networkidle' })
if (!(await main.getByText('這台裝置還有一場正式比賽的進度（10/01 vs 哨兵隊），練習不會動到它。').count())) fails.push('練習設定頁沒有提醒正式進度')
if ((await main.getByLabel('對手', { exact: true }).last().inputValue()) !== '練習對手') fails.push('對手沒有預填「練習對手」')
await p.getByRole('button', { name: '開始練習', exact: true }).click(); await p.waitForTimeout(300)
if (!(await main.getByText(/^練習模式：/).count())) fails.push('練習中沒有「練習模式」說明條')
if (!(await main.getByText('練習中：不會存檔').count())) fails.push('狀態列不是「練習中：不會存檔」')
if (await main.getByRole('button', { name: /放棄這場/ }).count()) fails.push('練習中不該有「放棄這場」')
// three strikeouts (主場: they bat first)
for (let i = 0; i < 3; i++) {
  for (let k = 0; k < 3; k++) { await main.getByRole('button', { name: /^揮空/ }).first().click(); await p.waitForTimeout(60) }
  await main.getByRole('button', { name: /^送出/ }).click(); await p.waitForTimeout(250)
}
const prac = await p.evaluate(() => JSON.parse(localStorage.getItem('bafin.record.practice.v1') || 'null'))
if (!prac?.game.id.startsWith('PRACTICE-') || prac.pitching.length !== 3) fails.push(`練習進度不對：${prac?.game.id} ${prac?.pitching.length} 個打席`)
await main.getByRole('button', { name: '結束練習' }).click(); await p.waitForTimeout(300)
await p.getByRole('dialog', { name: '結束練習' }).getByRole('button', { name: '結束（不存檔）' }).click(); await p.waitForTimeout(300)
if (!(await main.getByText(/練習結束，沒有存檔：.* 0：0 練習對手，共記了 3 個打席。/).count())) fails.push('結束後沒有「練習結束，沒有存檔」')
if (await p.evaluate(() => localStorage.getItem('bafin.record.practice.v1'))) fails.push('結束練習後練習進度還在')
if ((await p.evaluate(() => localStorage.getItem('bafin.record.draft.v1'))) !== SENTINEL) fails.push('正式進度被動到了')
if ((await p.evaluate(() => localStorage.getItem('bafin.dataset.v1'))) !== dataBefore) fails.push('資料集被改了')
await p.goto(`${URL}/games`, { waitUntil: 'networkidle' })
if ((await main.innerText()).includes('PRACTICE-') || (await main.getByText('練習對手').count())) fails.push('比賽頁出現練習比賽')
await p.evaluate(() => localStorage.removeItem('bafin.record.draft.v1'))
if (errs.length) fails.push(`頁面錯誤：${errs.join(' / ')}`)
await b.close()
if (fails.length) { console.log('FAIL\n' + fails.map((f) => `・${f}`).join('\n')); process.exit(1) }
console.log('practice OK: 3 個打席、沒有存檔、正式進度與資料集沒變')
