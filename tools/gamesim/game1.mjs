// 模擬比賽: play a scripted 5-inning game through the real 紀錄比賽 screen (local mode, nothing goes to the cloud),
// then read what the site shows (line score, box score) and compare it with the answer key written below by hand,
// the way a recorder would check the stats against the game video.
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
await p.evaluate(({ L }) => { localStorage.removeItem('bafin.record.draft.v1'); localStorage.removeItem('bafin.registrations.v1'); localStorage.setItem('bafin.lineup.v1', JSON.stringify(L)) },
  { L: { field: { SS: S1, C: S2, '1B': S3, '2B': S4, '3B': S5, LF: S6, CF: S7, RF: S8, P: S9 }, dh: '', order: [S1, S2, S3, S4, S5, S6, S7, S8, S9], bench: [B1, B2, B3, B4], gameId: '', regKey: '', reentry: false, updatedAt: new Date().toISOString() } })
await p.goto(`${URL}/record`, { waitUntil: 'networkidle' })
await main.getByLabel('對手', { exact: true }).last().fill('模擬隊')
await main.getByLabel('主客').selectOption('客')
await p.getByRole('button', { name: '開始紀錄' }).click(); await p.waitForTimeout(300)

// ---------------------------------------------------------------- driving the screen
const PITCH = { B: '壞球', CS: '好球・未揮', SS: '揮空', F: '界外', IP: '擊進場內' }
const pitch = async (c) => { await main.getByRole('button', { name: new RegExp('^' + PITCH[c]) }).first().click(); await p.waitForTimeout(60) }
const planOpen = async () => (await main.getByRole('button', { name: /^送出/ }).count()) > 0
const runnerSheet = async (base, label) => {
  await main.getByRole('button', { name: /^壘上跑者/ }).first().click(); await p.waitForTimeout(200)
  const sheet = p.getByRole('dialog', { name: '壘上跑者' })
  const pick = sheet.getByRole('button', { name: new RegExp(`^${base}B `) })
  if (await pick.count()) { await pick.first().click(); await p.waitForTimeout(80) }
  return sheet
}
const runnerEv = async (base, ev) => { const sheet = await runnerSheet(base); await sheet.getByRole('button', { name: ev, exact: true }).click(); await p.waitForTimeout(250) }
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
    else if (st.run) await runnerEv(st.run, st.ev)
    else if (st.wp) { await main.getByRole('button', { name: /^暴投/ }).first().click(); await p.waitForTimeout(250) }
    else if (st.myerr) { await main.getByRole('button', { name: /^我隊失誤/ }).click(); await main.getByRole('button', { name: st.myerr, exact: true }).first().click(); await p.waitForTimeout(150) }
  }
  if (!(await planOpen())) { await main.getByRole('button', { name: spec.result, exact: true }).first().click(); await p.waitForTimeout(120) }
  const shown = (await main.locator('.text-\\[15px\\].font-semibold').first().textContent().catch(() => ''))?.trim() ?? ''
  if (!shown.startsWith(spec.result)) notes.push(`#${paNo} ${who}: 結果顯示「${shown}」，預期 ${spec.result}`)
  if (spec.loc) { await main.getByRole('button', { name: new RegExp(`^${spec.loc} `) }).first().click(); await p.waitForTimeout(60) }
  for (const [base, d] of Object.entries(spec.runners ?? {})) await setDest(`${base}B `, d)
  if (spec.batter !== undefined) await setDest('打者 ', spec.batter)
  if (side === 'us') {
    // the recorder checks the RBI the screen suggests against the rule book
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
    await p.screenshot({ path: `${S}/game1-stuck-${paNo}.png` })
    throw new Error(`stuck at #${paNo}`)
  }
  await send.click(); await p.waitForTimeout(250)
}
const us = (spec) => pa('us', spec)
const opp = (spec) => pa('opp', spec)
const sub = async (slot, name) => {   // 代打 / 換人: slot is 1-based
  await main.getByRole('button', { name: /^(代打|換人)$/ }).click(); await p.waitForTimeout(250)
  const sheet = p.getByRole('dialog', { name: '換人' })
  await sheet.getByRole('group', { name: '換哪一棒' }).getByRole('button').nth(slot - 1).click()
  if (name) await sheet.getByRole('group', { name: '換成誰' }).getByRole('button', { name: new RegExp('^' + name) }).click()
  return sheet
}
const ph = async (slot, name) => { const sheet = await sub(slot, name); await sheet.getByRole('button', { name: '確定', exact: true }).click(); await p.waitForTimeout(250) }
const setPos = async (slot, pos) => {
  const fix = main.getByRole('button', { name: '設定守位' })
  if (!(await fix.count())) notes.push(`第 ${slot} 棒換人後沒有提醒「設定守位」`)
  const sheet = await sub(slot)
  await sheet.getByRole('group', { name: '守位' }).getByRole('button', { name: pos, exact: true }).click()
  await sheet.getByRole('button', { name: '確定', exact: true }).click(); await p.waitForTimeout(250)
}
const pr = async (base, name) => { const sheet = await runnerSheet(base); await sheet.getByRole('button', { name: new RegExp('^' + name) }).click(); await p.waitForTimeout(250) }
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

// ================================================================ the game (the "video")
// --- 1 上
await us({ steps: ['B', 'CS', 'IP'], result: '一安', loc: 8, batter: 1 })                                  // S1 一安
// 對方投手: the strip asks while we bat; answered after the first batter, so his plate appearance gets it too
{
  const strip = main.getByRole('group', { name: '對方投手' })
  if (!(await strip.count())) notes.push('我隊打擊時沒有出現「對方投手是？」')
  else { await strip.getByRole('button', { name: '右投', exact: true }).click(); await p.waitForTimeout(200) }
  if (await main.getByRole('group', { name: '對方投手' }).count()) notes.push('點了「右投」後「對方投手是？」還在')
  if (!(await main.getByRole('button', { name: '對方 右投', exact: true }).count())) notes.push('點了「右投」後沒有「對方 右投」按鈕')
}
await us({ steps: ['B', 'B', { run: 1, ev: '盜壘' }, 'CS', 'IP'], result: '犧觸', loc: 1, runners: { 2: 3 }, batter: 'out' })  // S1 盜二；S2 犧觸 送上三
await us({ steps: ['IP'], result: '犧飛', loc: 9, runners: { 3: 'home' }, batter: 'out', rbi: 1 })            // S3 犧飛 1 分
await us({ steps: ['B', 'B', 'B', 'B'], result: '保送' })                                                   // S4 保送
await us({ steps: ['SS', 'SS', 'F', 'SS'], result: '三振' })                                                // S5 三振
await check('1上結束', '1下 0出局 1:0')
// --- 1 下（先發 S9）
await opp({ steps: ['B', 'CS', 'IP'], result: '二安', loc: 7, batter: 2 })
await opp({ steps: ['IP'], result: '內滾', loc: 6, runners: { 2: 3 }, batter: 'out' })
await opp({ steps: ['B', { wp: true }, 'B', 'CS', 'IP'], result: '外飛', loc: 8, batter: 'out' })           // 暴投，三壘跑者回來
await opp({ steps: ['SS', 'SS', 'SS'], result: '三振' })
await check('1下結束', '2上 0出局 1:1')
// --- 2 上
await us({ steps: ['IP'], result: '失誤', loc: 6, batter: 1 })                                              // S6 對方游擊失誤上壘
await us({ steps: ['B', 'IP'], result: '雙殺', loc: 4, runners: { 1: 'out' }, batter: 'out' })             // S7 雙殺
await us({ steps: ['IP'], result: '全壘打', loc: 8, batter: 'home', rbi: 1 })                               // S8 全壘打
await us({ steps: ['SS', 'SS', 'SS'], result: '三振' })                                                     // S9 三振
await check('2上結束', '2下 0出局 2:1')
// --- 2 下
await opp({ steps: ['B', 'B', 'B', 'B'], result: '保送' })                                                  // 5 棒 保送
await opp({ steps: ['B', { run: 1, ev: '盜壘' }, 'IP'], result: '一安', loc: 9, runners: { 2: 'home' }, batter: 1 })  // 盜二，6 棒一安回來（自責）
await opp({ steps: ['IP'], result: '野選', loc: 5, runners: { 1: 'out' }, batter: 1 })                       // 7 棒 野選，一壘跑者出局
await opp({ steps: ['CS', 'IP'], result: '內飛', loc: 4, batter: 'out' })                                   // 2 出局
await opp({ steps: ['IP'], result: '失誤', loc: 6, runners: { 1: 2 }, batter: 1 })                          // 9 棒 我隊游擊失誤（本該第 3 個出局）
await opp({ steps: ['IP'], result: '一安', loc: 8, runners: { 2: 'home', 1: 3 }, batter: 1 })               // 1 棒 一安，7 棒回來（非自責）
await opp({ steps: ['IP'], result: '外飛', loc: 7, batter: 'out' })
await check('2下結束', '3上 0出局 2:3')
// --- 3 上
await us({ steps: ['B', 'B', 'CS', 'B', 'B'], result: '保送' })                                             // S1 保送
await us({ steps: [], result: '觸身', runners: { 1: 2 }, batter: 1 })                                       // S2 觸身，S1 被推上二
await us({ steps: [{ run: 2, ev: '盜壘失敗' }, 'IP'], result: '二安', loc: 7, runners: { 1: 'home' }, batter: 2, rbi: 1 })  // S1 盜三失敗；S3 二安 S2 回來
await us({ steps: [], result: '故四', batter: 1 })                                                          // S4 故四
await us({ steps: ['IP'], result: '三安', loc: 9, runners: { 2: 'home', 1: 'home' }, batter: 3, rbi: 2 })   // S5 三安 2 分
await us({ steps: ['IP'], result: '犧飛', loc: 8, runners: { 3: 'home' }, batter: 'out', rbi: 1 })          // S6 犧飛
await ph(7, B1)                                                                                            // 代打 B1 換 S7
await us({ steps: ['IP'], result: '內滾', loc: 6, batter: 'out' })
await check('3上結束', '3下 0出局 6:3')
// --- 3 下：B1 守中外野，換投 B4
await setPos(7, 'CF')
await newPitcher(B4)
await opp({ steps: ['SS', 'IP'], result: '一安', loc: 7, batter: 1 })
await opp({ steps: ['IP'], result: '雙殺', loc: 6, runners: { 1: 'out' }, batter: 'out' })
await opp({ steps: ['B', 'B', 'B', 'CS', 'B'], result: '保送' })
await opp({ steps: ['IP'], result: '全壘打', loc: 7, runners: { 1: 'home' }, batter: 'home' })
await opp({ steps: ['SS', 'SS', 'SS'], result: '三振' })
await check('3下結束', '4上 0出局 6:5')
// --- 4 上
await us({ steps: ['IP'], result: '內安', loc: 5, batter: 1 })                                              // S8 內安
await pr(1, B2)                                                                                            // 代跑 B2
await runnerEv(1, '盜壘')                                                                                  // B2 盜二
await us({ steps: ['IP'], result: '犧觸', loc: 1, runners: { 2: 3 }, batter: 'out' })                       // B4（投手）犧觸
await us({ steps: ['IP'], result: '內滾', loc: 4, runners: { 3: 'home' }, batter: 'out', rbi: 1 })          // S1 內滾 打點 1
await us({ steps: ['IP'], result: '外飛', loc: 9, batter: 'out' })                                          // S2 外飛
await check('4上結束', '4下 0出局 7:5')
// --- 4 下：B2 守右外野
await setPos(8, 'RF')
await opp({ steps: ['B', 'B', 'B', 'B'], result: '保送' })                                                  // 8 棒 保送
await runnerEv(1, '牽制出局')                                                                               // 牽制出局
await opp({ steps: ['IP'], result: '一安', loc: 8, batter: 1 })                                             // 9 棒 一安
await opp({ steps: ['IP'], result: '內滾', loc: 6, runners: { 1: 2 }, batter: 'out' })                       // 1 棒 內滾 推進
await opp({ steps: ['B', { wp: true }, 'IP'], result: '一安', loc: 7, runners: { 3: 'home' }, batter: 1 })  // 暴投上三，2 棒一安回來
await opp({ steps: ['CS', 'CS', 'F', 'SS'], result: '三振' })
await check('4下結束', '5上 0出局 7:6')
// --- 5 上
await us({ steps: ['SS', 'SS', 'SS'], result: '三振' })                                                     // S3
await us({ steps: ['IP'], result: '二安', loc: 8, batter: 2 })                                              // S4 二安
await us({ steps: ['B', 'IP'], result: '一安', loc: 7, runners: { 2: 3 }, batter: 1 })                      // S5 一安
await us({ steps: ['IP'], result: '雙殺', loc: 6, runners: { 1: 'out', 3: 3 }, batter: 'out' })             // S6 雙殺
await check('5上結束', '5下 0出局 7:6')
// --- 5 下
await opp({ steps: ['IP'], result: '一安', loc: 9, batter: 1 })
await opp({ steps: ['IP'], result: '內飛', loc: 6, batter: 'out' })
await opp({ steps: ['IP'], result: '外飛', loc: 8, batter: 'out' })
await opp({ steps: ['SS', 'SS', 'SS'], result: '三振' })
await check('5下結束', '6上 0出局 7:6')
await p.screenshot({ path: `${S}/game1-live.png`, fullPage: true })

// ---------------------------------------------------------------- finish and read what the site shows
await main.getByRole('button', { name: '結束比賽' }).click(); await p.waitForTimeout(300)
// (the only reliever, B4, gets the 中繼 here, so the win goes to the starter: W and HLD both have a value for excel.mjs)
await p.getByLabel('勝投').selectOption(S9)
const holdChip = p.getByRole('group', { name: '中繼' }).getByRole('button', { name: B4 })
if (!(await holdChip.count())) notes.push('結束比賽沒有可選的中繼')
else await holdChip.click()
await p.getByRole('button', { name: '儲存並結束' }).click(); await p.waitForTimeout(1200)
log('url', p.url())
const dlg = p.getByRole('dialog').last()
await p.screenshot({ path: `${S}/game1-game.png`, fullPage: true })
const tableRows = async (header) => {
  const t = dlg.locator('table', { has: p.locator('th', { hasText: new RegExp(`^${header}$`) }) }).first()
  const heads = (await t.locator('thead th').allTextContents()).map((x) => x.trim())
  const rows = []
  for (const tr of await t.locator('tbody tr').all()) rows.push((await tr.locator('td').allTextContents()).map((x) => x.trim()))
  return { heads, rows }
}
const bat = await tableRows('打者'), pit = await tableRows('投手')
const lineText = (await dlg.locator('section, div').filter({ hasText: /^.*R.*H.*E/ }).first().innerText().catch(() => ''))
writeFileSync(`${S}/game1-shown.json`, JSON.stringify({ N, bat, pit, lineText, dialogs, notes, errs }, null, 1))
const ds = await p.evaluate(() => JSON.parse(localStorage.getItem('bafin.dataset.v1') || 'null'))
writeFileSync(`${S}/game1-dataset.json`, JSON.stringify(ds))
// 中繼 on the game page, 對方投手 on every saved plate appearance of ours, and the badge in 逐球・打擊
const fails = []
const header = await dlg.innerText()
if (!header.includes(`中繼 ${B4}`)) fails.push(`比賽頁沒有顯示「中繼 ${B4}」`)
const saved = ds?.base?.games?.find((g) => g.opponent === '模擬隊')
if (!saved) fails.push('找不到存好的比賽')
else {
  if (JSON.stringify(saved.holds) !== JSON.stringify([B4])) fails.push(`存下的中繼是 ${JSON.stringify(saved.holds)}，應為 [${B4}]`)
  const rows = ds.base.batting.filter((x) => x.gameId === saved.id)
  const notR = rows.filter((x) => x.oppHand !== 'R')
  if (!rows.length || notR.length) fails.push(`${notR.length} / ${rows.length} 個我隊打席沒有記成對方右投`)
}
await dlg.getByRole('tab', { name: /逐球・打擊/ }).click(); await p.waitForTimeout(300)
if (!(await dlg.getByText('對方先發・右投', { exact: true }).count())) fails.push('逐球・打擊沒有「對方先發・右投」')
log('對方投手／中繼:', fails.length ? JSON.stringify(fails) : 'ok')
if (fails.length) process.exitCode = 1
log('dialogs:', JSON.stringify(dialogs))
log('notes while recording:', JSON.stringify(notes, null, 1))
log('page errors:', JSON.stringify(errs))
await b.close()
