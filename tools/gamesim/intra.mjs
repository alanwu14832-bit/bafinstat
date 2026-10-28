// 隊內賽: a short intra-squad game through the real 紀錄比賽 screen (local mode): set up both sides from the roster,
// record two half-innings with a change on each side (白隊換投 while 紅隊 bats, a 白隊代打 while it bats), finish, then
// check what the site shows: the game list (隊內賽, both names), the game page (both sides' boxes), and the 打擊 page
// with the 隊內賽 filter (left out by default, counted with 含隊內賽).
import { createRequire } from 'node:module'
const { chromium } = await import('playwright').catch(() => createRequire(`${process.cwd()}/`)('playwright'))
import { answerAsks } from './answer.mjs'
const URL = process.env.GAMESIM_URL ?? 'http://localhost:4173'
// screenshots go to the folder given (none without one)
const S = process.argv[2]
const shot = async (name) => { if (S) await p.screenshot({ path: `${S}/intra-${name}.png`, fullPage: true }) }
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const p = await b.newPage({ viewport: { width: 1400, height: 1100 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
p.on('dialog', (d) => d.accept())
const main = p.locator('main')
const fails = []
const check = (ok, what) => { if (!ok) fails.push(what); console.log(ok ? '✓' : '✗', what) }

// ---------------------------------------------------------------- two sides from the roster
await p.goto(`${URL}/lineup`, { waitUntil: 'networkidle' })
const names = (await p.locator('select[aria-label="DH 指定打擊"] option').allTextContents()).filter((t) => t && !t.includes('不用')).map((t) => t.replace(/（.*$/, ''))
// (the sample roster has 17: 紅隊 bats 8, 白隊 bats 7 and two more come in)
if (names.length < 17) throw new Error(`roster too small: ${names.length}`)
const red = names.slice(0, 8), white = names.slice(8, 15), [whiteRelief, whitePH] = names.slice(15, 17)
const POS = ['SS', 'C', '1B', '2B', '3B', 'LF', 'CF', 'P']
const WPOS = ['SS', 'C', '1B', '2B', 'CF', 'P', '3B']
await p.evaluate(({ L }) => { localStorage.removeItem('bafin.record.draft.v1'); localStorage.removeItem('bafin.registrations.v1'); localStorage.setItem('bafin.lineup.v1', JSON.stringify(L)) },
  { L: { field: Object.fromEntries(POS.map((pos, i) => [pos, red[i]])), dh: '', order: [...red, ''], bench: [], gameId: '', regKey: '', reentry: false, updatedAt: new Date().toISOString() } })
await p.goto(`${URL}/record`, { waitUntil: 'networkidle' })
await main.getByRole('tab', { name: '隊內賽' }).click()
await main.getByLabel('先後攻').selectOption('客')   // 紅隊先攻
await main.getByLabel('白隊打序人數').selectOption('7')
for (let i = 0; i < white.length; i++) {
  await main.getByLabel(`白隊第 ${i + 1} 棒`, { exact: true }).selectOption(white[i])
  await main.getByLabel(`白隊第 ${i + 1} 棒守位`).selectOption(WPOS[i])
}
await main.getByLabel('白隊先發投手').selectOption(white[5])
await shot('setup')
await p.getByRole('button', { name: '開始紀錄' }).click(); await p.waitForTimeout(400)
check(await main.getByText('紅隊打者・第 1 棒').count() > 0, '紀錄畫面寫「紅隊打者」')
await shot('live-top')

// ---------------------------------------------------------------- driving the screen
const PITCH = { B: '壞球', CS: '好球・未揮', SS: '揮空', IP: '擊進場內' }
const pitch = async (c) => { await answerAsks(p, main); await main.getByRole('button', { name: new RegExp('^' + PITCH[c]) }).first().click(); await p.waitForTimeout(60) }
const send = async () => { await main.getByRole('button', { name: /^送出/ }).click(); await p.waitForTimeout(250) }
const strikeout = async () => { for (const c of ['SS', 'SS', 'SS']) await pitch(c); await send() }
const single = async () => {
  await pitch('IP')
  await main.getByRole('button', { name: '一安', exact: true }).first().click(); await p.waitForTimeout(100)
  await main.getByRole('button', { name: /^8 / }).first().click()
  await main.getByRole('button', { name: '平飛 L', exact: true }).click(); await p.waitForTimeout(60)
  await send()
}
const sheetPick = async (button, tab, name, pos) => {
  await main.getByRole('button', { name: button }).click(); await p.waitForTimeout(200)
  const sheet = p.getByRole('dialog', { name: /^白隊/ })
  // (the sheet opens on the right tab; pressing the selected one closes it)
  if (tab && (await sheet.getByRole('tab', { name: tab }).getAttribute('aria-selected')) !== 'true') await sheet.getByRole('tab', { name: tab }).click()
  await sheet.getByRole('button', { name: new RegExp(`^${name}`) }).first().click()
  if (pos) await sheet.getByRole('group', { name: '守位' }).getByRole('button', { name: pos }).click()
  await sheet.getByRole('button', { name: '確定' }).click(); await p.waitForTimeout(250)
}

// top 1: 紅隊 single off 白隊's starter, then 白隊 changes pitcher; three strikeouts
await single()
await sheetPick(/^白隊換投／換人/, '換投', whiteRelief)
check((await main.textContent()).includes(`白隊投手 ${whiteRelief}`), `白隊換投：投手 ${whiteRelief}`)
await strikeout(); await strikeout(); await strikeout()
// bottom 1: 白隊 — strikeout, a pinch hitter who singles, two strikeouts
check(await main.getByText('白隊第 1 棒').count() > 0, '白隊進攻時寫「白隊第 1 棒」')
await shot('live-bottom')
await strikeout()
await sheetPick(/^白隊代打／換人/, null, whitePH, null)
await single()
await strikeout(); await strikeout()

// ---------------------------------------------------------------- finish and read what the site shows
await main.getByRole('button', { name: '結束比賽', exact: true }).click(); await p.waitForTimeout(300)
await p.getByRole('button', { name: '儲存並結束' }).click(); await p.waitForTimeout(1200)
await p.goto(`${URL}/games?view=results`, { waitUntil: 'networkidle' })
const card = main.getByRole('button', { name: /隊內賽 紅隊/ }).first()
check(await card.count() > 0, '比賽列表有這場隊內賽（紅隊 vs 白隊）')
await shot('games')
await card.click(); await p.waitForTimeout(500)
const sheet = p.getByRole('dialog').last()
await sheet.getByRole('tab', { name: '攻守成績' }).click()
await p.waitForTimeout(300)
const text = await sheet.textContent()
await shot('game-box')
check(text.includes('白隊') && text.includes(whitePH), `比賽頁有白隊的打擊表（代打 ${whitePH}）`)
check(text.includes(whiteRelief) && text.includes(white[5]), '比賽頁有白隊的投手（先發與後援）')

// 打擊 page: 不含 by default, 含隊內賽 counts 白隊's batters too
await p.goto(`${URL}/batting`, { waitUntil: 'networkidle' })
const has = async () => (await main.textContent()).includes(whitePH)
const before = await has()
await p.goto(`${URL}/batting?intra=include`, { waitUntil: 'networkidle' })
const after = await has()
check(!before || after, `打擊頁：含隊內賽時 ${whitePH} 出現（預設不含：${before ? '已有其他比賽紀錄' : '沒有'}）`)
check(after, `打擊頁含隊內賽有 ${whitePH}`)

console.log('page errors:', errs)
await b.close()
if (fails.length || errs.length) { console.log('不符：', fails); process.exit(1) }
console.log('隊內賽：全部相符')
