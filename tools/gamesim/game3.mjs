// 模擬比賽 3 (see README.md): 延長賽突破僵局與投手犯規 — a 2-inning game, we are 客 (we bat first), 0–0 after 2.
//   3上: 「放上跑者」 → 投手犯規 from the runner sheet (runners to 3B and 2B) → 二安 scores both → three outs
//   3下: 換投 before the first pitch (the placed runners become the new pitcher's) → 「放上跑者」 → our pitcher balks
//        → 犧飛 scores the runner from third (unearned: a placed runner) → two strikeouts. Final 2–1.
// Then reads the box score, the 逐球 tabs and the 投球 page's 進階 BK, for check3.mjs.
import { createRequire } from 'node:module'
// playwright from next to this script, or from the folder it is run in (npm i --no-save playwright there)
const { chromium } = await import('playwright').catch(() => createRequire(`${process.cwd()}/`)('playwright'))
import { writeFileSync } from 'node:fs'
const S = process.argv[2] ?? '.'
const URL = process.env.GAMESIM_URL ?? 'http://localhost:4173'
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const p = await b.newPage({ viewport: { width: 1400, height: 1100 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
const dialogs = []; p.on('dialog', (d) => { dialogs.push(d.message()); d.accept() })
const log = (...a) => console.log(...a)
const notes = []   // what looked wrong while recording
const main = p.locator('main')
const draft = () => p.evaluate(() => JSON.parse(localStorage.getItem('bafin.record.draft.v1') || 'null'))

// ---------------------------------------------------------------- the team
await p.goto(`${URL}/lineup`, { waitUntil: 'networkidle' })
const names = (await p.locator('select[aria-label="DH 指定打擊"] option').allTextContents()).filter((t) => t && !t.includes('不用')).map((t) => t.replace(/（.*$/, ''))
const [S1, S2, S3, S4, S5, S6, S7, S8, S9, B1, B2, B3, B4] = names
const N = { S1, S2, S3, S4, S5, S6, S7, S8, S9, B1, B2, B3, B4 }
log('lineup', JSON.stringify(N))
await p.evaluate(({ L }) => { localStorage.removeItem('bafin.record.draft.v1'); localStorage.removeItem('bafin.registrations.v1'); localStorage.removeItem('bafin.tiebreak.v1'); localStorage.setItem('bafin.lineup.v1', JSON.stringify(L)) },
  { L: { field: { SS: S1, C: S2, '1B': S3, '2B': S4, '3B': S5, LF: S6, CF: S7, RF: S8, P: S9 }, dh: '', order: [S1, S2, S3, S4, S5, S6, S7, S8, S9], bench: [B1, B2, B3, B4], gameId: '', regKey: '', reentry: false, updatedAt: new Date().toISOString() } })
await p.goto(`${URL}/record`, { waitUntil: 'networkidle' })
await main.getByLabel('對手', { exact: true }).last().fill('模擬隊三')
await main.getByLabel('主客').selectOption('客')
await main.getByLabel('預定局數').fill('2')
// the tie-break follows 預定局數: from the 3rd, on first and second
{
  const from = await main.locator('#setup-tb-from').inputValue()
  const bases = await main.locator('#setup-tb-bases').inputValue()
  if (from !== '3' || bases !== '12') notes.push(`開賽設定的突破僵局是 ${from}／${bases}，預期第 3 局起・一、二壘`)
}
await p.getByRole('button', { name: '開始紀錄' }).click(); await p.waitForTimeout(300)

// ---------------------------------------------------------------- driving the screen (as in game1/game2)
const PITCH = { B: '壞球', CS: '好球・未揮', SS: '揮空', F: '界外', IP: '擊進場內' }
const pitch = async (c) => { await main.getByRole('button', { name: new RegExp('^' + PITCH[c]) }).first().click(); await p.waitForTimeout(60) }
const planOpen = async () => (await main.getByRole('button', { name: /^送出/ }).count()) > 0
const runnerSheet = async () => {
  await main.getByRole('button', { name: /^壘上跑者/ }).first().click(); await p.waitForTimeout(200)
  return p.getByRole('dialog', { name: '壘上跑者' })
}
const balk = async () => {
  const sheet = await runnerSheet()
  const btn = sheet.getByRole('button', { name: '投手犯規・全部進壘', exact: true })
  if (!(await btn.count())) { notes.push('跑者面板沒有「投手犯規・全部進壘」'); return }
  await btn.click(); await p.waitForTimeout(250)
}
const destRow = (prefix) => main.locator('span[class*="w-[132px]"]', { hasText: new RegExp('^' + prefix) }).first().locator('xpath=..')
const setDest = async (prefix, d) => {
  const label = d === 'out' ? '出局' : d === 'home' ? '得分' : `${d}B`
  const row = destRow(prefix)
  if (!(await row.count())) { notes.push(`找不到跑者去向「${prefix}」`); return }
  await row.getByRole('button', { name: label, exact: true }).first().click(); await p.waitForTimeout(60)
}
let paNo = 0
async function pa(side, spec) {
  paNo++
  const d0 = await draft()
  const who = side === 'us' ? d0.lineup[d0.slot]?.name : `對方第 ${d0.oppOrder} 棒`
  for (const st of spec.steps ?? []) {
    if (typeof st === 'string') await pitch(st)
    else if (st.balk) await balk()
  }
  if (!(await planOpen())) { await main.getByRole('button', { name: spec.result, exact: true }).first().click(); await p.waitForTimeout(120) }
  const shown = (await main.locator('.text-\\[15px\\].font-semibold').first().textContent().catch(() => ''))?.trim() ?? ''
  if (!shown.startsWith(spec.result)) notes.push(`#${paNo} ${who}: 結果顯示「${shown}」，預期 ${spec.result}`)
  if (spec.loc) { await main.getByRole('button', { name: new RegExp(`^${spec.loc} `) }).first().click(); await p.waitForTimeout(60) }
  for (const [base, d] of Object.entries(spec.runners ?? {})) await setDest(`${base}B `, d)
  if (spec.batter !== undefined) await setDest('打者 ', spec.batter)
  if (side === 'us') {
    const shownRbi = Number(await main.locator('span.tnum.font-semibold.w-4').first().textContent())
    const want = spec.rbi ?? 0
    if (shownRbi !== want) {
      notes.push(`#${paNo} ${who} ${spec.result}: 畫面建議打點 ${shownRbi}，規則應為 ${want}（手動改）`)
      const btn = main.getByRole('button', { name: shownRbi > want ? '−' : '＋', exact: true }).first()
      for (let i = 0; i < Math.abs(shownRbi - want); i++) await btn.click()
    }
  }
  const send = main.getByRole('button', { name: /^送出/ })
  if (await send.isDisabled()) {
    const why = (await main.locator('[role=alert], .text-critical').allTextContents()).join(' / ')
    notes.push(`#${paNo} ${who} ${spec.result}: 送出按不下去（${why}）`)
    await p.screenshot({ path: `${S}/game3-stuck-${paNo}.png` })
    throw new Error(`stuck at #${paNo}`)
  }
  await send.click(); await p.waitForTimeout(250)
}
const us = (spec) => pa('us', spec)
const opp = (spec) => pa('opp', spec)
const newPitcher = async (name) => {
  await main.getByRole('button', { name: '換投' }).click(); await p.waitForTimeout(250)
  const sheet = p.getByRole('dialog', { name: '換投' })
  await sheet.getByRole('button', { name: new RegExp('^' + name) }).click()
  await sheet.getByRole('button', { name: '確定', exact: true }).click(); await p.waitForTimeout(250)
}
const check = async (label, want) => {
  const d = await draft()
  const score = { us: d.batting.reduce((s, x) => s + x.run, 0), opp: d.pitching.filter((x) => x.code === 'R' || x.code === 'ER').length }
  const got = `${d.inning}${d.half === 'top' ? '上' : '下'} ${d.outs}出局 ${score.us}:${score.opp}`
  if (got !== want) notes.push(`${label}：畫面狀態 ${got}，預期 ${want}`)
  log(label.padEnd(8), got)
}
const card = () => main.getByRole('region', { name: '延長賽突破僵局' })
/** The tie-break card: it lists who goes where, the pitch pad waits, then 放上跑者. */
async function place(want) {
  if (!(await card().count())) { notes.push('延長局開始時沒有出現「延長賽突破僵局」卡片'); return }
  const text = (await card().innerText()).replace(/\s+/g, ' ')
  for (const w of want) if (!text.includes(w)) notes.push(`突破僵局卡片沒有「${w}」（卡片：${text}）`)
  if (!(await main.getByRole('button', { name: /^壞球/ }).first().isDisabled())) notes.push('突破僵局卡片出現時，投球按鈕沒有停用')
  await card().getByRole('button', { name: '放上跑者', exact: true }).click(); await p.waitForTimeout(250)
  if (await card().count()) notes.push('按了「放上跑者」後卡片還在')
}

// ================================================================ game 3: we are 客
// --- 1 上
{
  const strip = main.getByRole('group', { name: '對方投手' })
  if (await strip.count()) { await strip.getByRole('button', { name: '不記', exact: true }).click(); await p.waitForTimeout(200) }
}
if (await card().count()) notes.push('第 1 局就出現突破僵局卡片')
await us({ steps: ['SS', 'SS', 'SS'], result: '三振' })                       // S1
await us({ steps: ['IP'], result: '內滾', loc: 6, batter: 'out' })            // S2
await us({ steps: ['IP'], result: '外飛', loc: 8, batter: 'out' })            // S3
// --- 1 下（先發 S9）
await opp({ steps: ['SS', 'SS', 'SS'], result: '三振' })
await opp({ steps: ['IP'], result: '內滾', loc: 4, batter: 'out' })
await opp({ steps: ['IP'], result: '外飛', loc: 7, batter: 'out' })
// --- 2 上
await us({ steps: ['SS', 'SS', 'SS'], result: '三振' })                       // S4
await us({ steps: ['IP'], result: '內飛', loc: 6, batter: 'out' })            // S5
await us({ steps: ['IP'], result: '外飛', loc: 9, batter: 'out' })            // S6
// --- 2 下
await opp({ steps: ['SS', 'SS', 'SS'], result: '三振' })
await opp({ steps: ['SS', 'SS', 'SS'], result: '三振' })
await opp({ steps: ['IP'], result: '內滾', loc: 5, batter: 'out' })
await check('2下結束', '3上 0出局 0:0')
// --- 3 上：突破僵局（S5 二壘、S6 一壘，S7 打擊）→ 投手犯規 → 二安 2 分
await place(['二壘', `第 5 棒 ${S5}`, '一壘', `第 6 棒 ${S6}`, '打者', `第 7 棒 ${S7}`])
{
  const d = await draft()
  const placed = d.batting.filter((x) => x.result === '突破僵局')
  if (placed.map((x) => x.batter).join() !== [S5, S6].join()) notes.push(`3 上放上的是 ${placed.map((x) => x.batter).join('、')}，應為 ${S5}、${S6}`)
}
await us({ steps: [{ balk: true }, 'B', 'IP'], result: '二安', loc: 8, runners: { 3: 'home', 2: 'home' }, batter: 2, rbi: 2 })   // S7
await us({ steps: ['SS', 'SS', 'SS'], result: '三振' })                       // S8
await us({ steps: ['IP'], result: '內滾', loc: 6, batter: 'out' })            // S9
await us({ steps: ['IP'], result: '外飛', loc: 8, batter: 'out' })            // S1
await check('3上結束', '3下 0出局 2:0')
// --- 3 下：換投 B4（卡片還在時也能換投），突破僵局（對方第 5、6 棒），我隊投手犯規，犧飛回來 1 分（非自責），兩個三振
await newPitcher(B4)
await place(['二壘', '對方第 5 棒', '一壘', '對方第 6 棒', '對方第 7 棒'])
{
  const d = await draft()
  const placed = d.pitching.filter((x) => x.result === '突破僵局')
  if (placed.some((x) => x.pitcher !== B4)) notes.push(`3 下的突破僵局跑者記在 ${placed.map((x) => x.pitcher).join('、')}，應為換上來的 ${B4}`)
}
await opp({ steps: [{ balk: true }, 'IP'], result: '犧飛', loc: 8, runners: { 3: 'home' }, batter: 'out' })
await opp({ steps: ['SS', 'SS', 'SS'], result: '三振' })
await opp({ steps: ['SS', 'SS', 'SS'], result: '三振' })
await check('3下結束', '4上 0出局 2:1')
await p.screenshot({ path: `${S}/game3-live.png`, fullPage: true })

// ---------------------------------------------------------------- finish and read what the site shows
await main.getByRole('button', { name: '結束比賽' }).click(); await p.waitForTimeout(300)
await p.getByLabel('勝投').selectOption(B4)
await p.getByRole('button', { name: '儲存並結束' }).click(); await p.waitForTimeout(1200)
log('url', p.url())
const dlg = p.getByRole('dialog').last()
await p.screenshot({ path: `${S}/game3-game.png`, fullPage: true })
const tableRows = async (scope, header) => {
  const t = scope.locator('table', { has: p.locator('th', { hasText: new RegExp(`^${header}$`) }) }).first()
  const heads = (await t.locator('thead th').allTextContents()).map((x) => x.trim())
  const rows = []
  for (const tr of await t.locator('tbody tr').all()) rows.push((await tr.locator('td').allTextContents()).map((x) => x.trim()))
  return { heads, rows }
}
const bat = await tableRows(dlg, '打者'), pit = await tableRows(dlg, '投手')
const lineText = (await dlg.locator('section, div').filter({ hasText: /^.*R.*H.*E/ }).first().innerText().catch(() => ''))
// 逐球 tabs
const pbp = {}
for (const tab of ['逐球・打擊', '逐球・投球']) {
  await dlg.getByRole('tab', { name: new RegExp('^' + tab) }).click(); await p.waitForTimeout(400)
  pbp[tab] = (await dlg.innerText()).replace(/\s+/g, ' ')
}
const ds = await p.evaluate(() => JSON.parse(localStorage.getItem('bafin.dataset.v1') || 'null'))
writeFileSync(`${S}/game3-dataset.json`, JSON.stringify(ds))
// 投球 page, 進階: BK
await p.goto(`${URL}/pitching?view=advanced`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500)
const tab = main.getByRole('tab', { name: '進階', exact: true })
if (await tab.count()) { await tab.first().click(); await p.waitForTimeout(300) }
const adv = await tableRows(main, 'BK')
await p.screenshot({ path: `${S}/game3-pitching.png`, fullPage: true })
writeFileSync(`${S}/game3-shown.json`, JSON.stringify({ N, bat, pit, lineText, pbp, adv, dialogs, notes, errs }, null, 1))
log('dialogs:', JSON.stringify(dialogs))
log('notes while recording:', JSON.stringify(notes, null, 1))
log('page errors:', JSON.stringify(errs))
await b.close()
