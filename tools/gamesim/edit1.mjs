// 修改資料: after game1.mjs, fix five things in the 比賽頁「修改資料」editor the way a recorder would after watching
// the video, save, and compare the box score with the answer key below (check1.mjs's key plus these fixes).
//   node tools/gamesim/edit1.mjs /tmp/out        (reads game1-shown.json + game1-dataset.json from there)
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
// playwright from next to this script, or from the folder it is run in (npm i --no-save playwright there)
const { chromium } = await import('playwright').catch(() => createRequire(`${process.cwd()}/`)('playwright'))
const S = process.argv[2] ?? '.'
const URL = process.env.GAMESIM_URL ?? 'http://localhost:4173'
const { N } = JSON.parse(readFileSync(`${S}/game1-shown.json`, 'utf8'))
const ds = JSON.parse(readFileSync(`${S}/game1-dataset.json`, 'utf8'))
const G = ds.base.games.find((g) => g.opponent === '模擬隊').id
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const p = await b.newPage({ viewport: { width: 1400, height: 1100 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
const dialogs = []; p.on('dialog', (d) => { dialogs.push(d.message()); d.accept() })
await p.goto(`${URL}/import`, { waitUntil: 'networkidle' })
await p.evaluate((d) => { localStorage.setItem('bafin.demo', 'false'); localStorage.setItem('bafin.dataset.v1', JSON.stringify(d)) }, ds)
await p.goto(`${URL}/games?game=${G}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500)

const ed = p.getByRole('dialog').last()
await ed.getByRole('button', { name: '修改資料' }).click(); await p.waitForTimeout(500)
const openPa = async (n) => { await ed.getByRole('button', { name: new RegExp(`^修改第 ${n} 個打席`) }).click(); await p.waitForTimeout(300) }
const backToList = async () => { await ed.getByRole('button', { name: '回到清單' }).click(); await p.waitForTimeout(250) }
// E1 (我隊打擊・逐打席): 2 上 S6 不是對方失誤上壘，是游擊方向的內野安打
await ed.getByRole('tab', { name: /我隊打擊/ }).click(); await p.waitForTimeout(200)
await openPa(6)
await ed.getByRole('button', { name: '內安', exact: true }).first().click(); await p.waitForTimeout(250)
await backToList()
// E2 (我隊打擊・表格): 2 上 S9 三振前其實先有一個壞球（SS SS SS → B SS SS SS）
await ed.getByRole('tab', { name: '表格' }).click(); await p.waitForTimeout(250)
const table = ed.locator('table').first()
const heads = (await table.locator('thead th').allTextContents()).map((x) => x.trim())
const pcol = heads.findIndex((h) => h.startsWith('逐球')), bcol = heads.findIndex((h) => h === '打者')
let target = -1
for (let i = 0; i < await table.locator('tbody tr').count(); i++) {
  const row = table.locator('tbody tr').nth(i)
  if (await row.locator('td').nth(bcol).locator('select').inputValue() === N.S9 && (await row.locator('td').nth(pcol).locator('input').inputValue()).trim() === 'SS SS SS') target = i
}
if (target < 0) throw new Error('表格裡找不到 S9 的三振（SS SS SS）')
await table.locator('tbody tr').nth(target).locator('td').nth(pcol).locator('input').fill('B SS SS SS'); await p.waitForTimeout(150)
await ed.getByRole('tab', { name: '逐打席' }).click(); await p.waitForTimeout(250)
// E3 (我隊投球・逐打席): 5 下對方 4 棒的一安前還有一壞一界外（IP → B F IP）
await ed.getByRole('tab', { name: /我隊投球/ }).click(); await p.waitForTimeout(250)
await openPa(22)
await ed.getByRole('button', { name: '全部清除', exact: true }).first().click(); await p.waitForTimeout(150)
for (const label of ['壞球', '界外', '擊進場內']) { await ed.getByRole('button', { name: new RegExp('^' + label) }).first().click(); await p.waitForTimeout(80) }
await backToList()
// E4 (我隊投球): 2 下對方 9 棒不是我隊失誤，是安打 → 我隊失誤、游擊手的失誤、那半局的自責分都要跟著改
await openPa(9)
await ed.getByRole('button', { name: '一安', exact: true }).first().click(); await p.waitForTimeout(200)
await backToList()
// E5 (比賽資訊): 場地寫錯了
await ed.getByRole('button', { name: /比賽資訊/ }).click(); await p.waitForTimeout(200)
await ed.getByLabel('場地').fill('新生棒球場')
await ed.getByRole('button', { name: '儲存修改' }).click(); await p.waitForTimeout(1500)

// ---------------------------------------------------------------- what the site shows now
const dlg = p.getByRole('dialog').last()
const tableRows = async (header) => {
  const t = dlg.locator('table', { has: p.locator('th', { hasText: new RegExp(`^${header}$`) }) }).first()
  const hs = (await t.locator('thead th').allTextContents()).map((x) => x.trim())
  const rows = []
  for (const tr of await t.locator('tbody tr').all()) rows.push((await tr.locator('td').allTextContents()).map((x) => x.trim()))
  return { heads: hs, rows }
}
const bat = await tableRows('打者'), pit = await tableRows('投手')
const text = await dlg.innerText()
const after = JSON.parse(await p.evaluate(() => localStorage.getItem('bafin.dataset.v1')))
writeFileSync(`${S}/edit1-dataset.json`, JSON.stringify(after))
await b.close()

// ---------------------------------------------------------------- answer key (check1.mjs's, with the five fixes)
// 打者: PA AB R H 2B HR RBI BB SO SB 用球
const BAT = {
  S1: [3, 2, 1, 1, 0, 0, 1, 1, 0, 1, 9], S2: [3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 5], S3: [3, 2, 1, 1, 1, 0, 2, 0, 1, 0, 5], S4: [3, 1, 1, 1, 1, 0, 0, 2, 0, 0, 5],
  S5: [3, 3, 1, 2, 0, 0, 2, 0, 1, 0, 7], S6: [3, 2, 0, 1, 0, 0, 1, 0, 0, 0, 3], S7: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2], B1: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  S8: [2, 2, 1, 2, 0, 1, 1, 0, 0, 0, 2], B2: [0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0], S9: [1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 4], B4: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
}
// 投手: IP BF PC 好球 K BB HBP H R ER ERA(7 局制)
const PIT = { S9: ['2.0', 11, 23, 15, 1, 1, 0, 4, 3, 3, '10.50'], B4: ['3.0', 14, 32, 22, 3, 2, 0, 5, 3, 3, '7.00'] }
const LINE = { us: '1 1 4 1 0 7 8 0', opp: '1 2 2 1 0 6 9 0' }
let bad = 0
const cmp = (what, got, want) => { if (String(got) !== String(want)) { bad++; console.log(`✗ ${what}: 網站 ${got}，正確 ${want}`) } }
const batCols = ['PA', 'AB', 'R', 'H', '2B', 'HR', 'RBI', 'BB', 'SO', 'SB', '用球']
for (const [k, want] of Object.entries(BAT)) {
  const r = bat.rows.find((x) => x[0] === N[k]); if (!r) { bad++; console.log(`✗ 打者 ${N[k]} 沒出現`); continue }
  batCols.forEach((c, i) => cmp(`${N[k]} ${c}`, r[bat.heads.indexOf(c)], want[i]))
}
const pitCols = ['IP', 'BF', 'PC', '好球', 'K', 'BB', 'HBP', 'H', 'R', 'ER', 'ERA']
for (const [k, want] of Object.entries(PIT)) {
  const r = pit.rows.find((x) => x[0] === N[k]); if (!r) { bad++; console.log(`✗ 投手 ${N[k]} 沒出現`); continue }
  pitCols.forEach((c, i) => cmp(`${N[k]} ${c}`, r[pit.heads.indexOf(c)], want[i]))
}
const line = /SCORE[^\n]*\n[^\t]*\t([\d\t]+)\n[^\t]*\t([\d\t]+)/.exec(text)
cmp('局分表 我隊', line?.[1].trim().split('\t').join(' '), LINE.us)
cmp('局分表 對手', line?.[2].trim().split('\t').join(' '), LINE.opp)
cmp('場地', /新生棒球場/.test(text.split('\n')[0]), true)
const fe = after.base.fielding.filter((f) => f.gameId === G && f.e)
cmp('守備紀錄的失誤', fe.map((f) => `${f.player} ${f.e}`).join('、') || '沒有', '沒有')
cmp('錯誤訊息', errs.length, 0)
console.log(bad ? `共 ${bad} 處不符` : `全部相符：5 項修改後，打者 ${Object.keys(BAT).length} 人 × ${batCols.length} 項、投手 2 人 × ${pitCols.length} 項、局分表、場地、守備失誤`)
