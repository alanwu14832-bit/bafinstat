// 模擬比賽 2 (see README.md): we are the home team — 安打＋失誤, 趁傳, 場地二安, 妨礙, 不死三振, 捕逸後的犧飛, 代守, 半局在打席中結束, 再見安打
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
await main.getByLabel('對手', { exact: true }).last().fill('模擬隊二')
await main.getByLabel('主客').selectOption('主')
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
    else if (st.pb) { await main.getByRole('button', { name: /^捕逸/ }).first().click(); await p.waitForTimeout(250) }
    else if (st.myerr) { await main.getByRole('button', { name: /^我隊失誤/ }).click(); await main.getByRole('button', { name: st.myerr, exact: true }).first().click(); await p.waitForTimeout(150) }
  }
  if (!(await planOpen())) { await main.getByRole('button', { name: spec.result, exact: true }).first().click(); await p.waitForTimeout(120) }
  const shown = (await main.locator('.text-\\[15px\\].font-semibold').first().textContent().catch(() => ''))?.trim() ?? ''
  if (!shown.startsWith(spec.result)) notes.push(`#${paNo} ${who}: 結果顯示「${shown}」，預期 ${spec.result}`)
  if (spec.loc) { await main.getByRole('button', { name: new RegExp(`^${spec.loc} `) }).first().click(); await p.waitForTimeout(60) }
  for (const [base, d] of Object.entries(spec.runners ?? {})) await setDest(`${base}B `, d)
  if (spec.batter !== undefined) await setDest('打者 ', spec.batter)
  for (const [who, kind] of Object.entries(spec.adv ?? {})) {
    const row = destRow(who === 'batter' ? '打者 ' : `${who}B `)
    const btn = row.getByRole('button', { name: new RegExp(kind + '$') })
    if (!(await btn.count())) { notes.push(`#${paNo} ${spec.result}: 沒有出現「${kind}」可以點`); continue }
    await btn.first().click(); await p.waitForTimeout(60)
  }
  if (spec.errBy) for (const pos of spec.errBy) { await main.getByRole('group', { name: '誰失誤' }).getByRole('button', { name: pos, exact: true }).click(); await p.waitForTimeout(60) }
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
    await p.screenshot({ path: `${S}/game2-stuck-${paNo}.png` })
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

// ================================================================ game 2 (the "video"): we are the home team
// --- 1 上（先發 S9）
await opp({ steps: ['B', 'CS', 'IP'], result: '一安', loc: 7, batter: 2, adv: { batter: '失誤進壘' }, errBy: ['LF'] })   // 一安＋左外野失誤上二
await opp({ steps: [{ run: 2, ev: '盜壘失敗' }, 'B', 'IP'], result: '界外飛', loc: 3, batter: 'out' })       // 盜三失敗；界外飛
await opp({ steps: ['SS', 'SS', 'SS'], result: '三振' })
await check('1上結束', '1下 0出局 0:0')
// --- 1 下
await us({ steps: ['B', 'B', 'B', 'CS', 'B'], result: '保送' })                                                // S1 保送
await us({ steps: ['IP'], result: '一安', loc: 9, runners: { 1: 3 }, batter: 1, adv: { 1: '趁傳進壘' } })      // S2 一安，S1 趁傳上三
await us({ steps: ['CS', 'SS', 'SS'], result: '三振', runners: { 3: 3, 1: 2 }, batter: 1 })                   // S3 三振但暴投上一壘（滿壘）
await us({ steps: ['IP'], result: '場地二安', loc: 8, runners: { 3: 'home', 2: 'home', 1: 3 }, batter: 2, rbi: 2 })  // S4 場地二安 2 分
await us({ steps: ['B'], result: '妨礙', batter: 1 })                                                         // S5 捕手妨礙
await us({ steps: ['IP'], result: '內滾', loc: 6, runners: { 3: 'home', 2: 3, 1: 2 }, batter: 'out', rbi: 1 })  // S6 內滾 打點 1
await us({ steps: ['IP'], result: '外飛', loc: 8, batter: 'out' })                                            // S7
await us({ steps: ['IP'], result: '一安', loc: 7, runners: { 3: 'home', 2: 'home' }, batter: 1, rbi: 2 })     // S8 一安 2 分
await runnerEv(1, '牽制出局')                                                                                 // S8 被牽制，S9 下局再打
await check('1下結束', '2上 0出局 5:0')
// --- 2 上：代守 B3 換 S6（左外野）
await ph(6, B3)
await opp({ steps: ['B', 'B', 'IP'], result: '二安', loc: 7, batter: 2 })
await opp({ steps: ['B', { pb: true }, 'IP'], result: '犧飛', loc: 8, runners: { 3: 'home' }, batter: 'out' })  // 捕逸上三，犧飛回來
await opp({ steps: ['SS', 'SS', 'F', 'SS'], result: '三振' })
await opp({ steps: ['IP'], result: '內滾', loc: 4, batter: 'out' })
await check('2上結束', '2下 0出局 5:1')
// --- 2 下：S9 繼續打
await us({ steps: ['B', 'IP'], result: '一安', loc: 8, batter: 1 })                                           // S9
await us({ steps: [{ run: 1, ev: '盜壘' }, 'IP'], result: '一安', loc: 7, runners: { 2: 3 }, batter: 1 })   // S9 盜二；S1 一安
await us({ steps: ['IP'], result: '外飛', loc: 9, batter: 'out' })                                            // S2
await us({ steps: ['IP'], result: '野選', loc: 5, runners: { 3: 'out', 1: 2 }, batter: 1 })                    // S3 野選，S9 本壘出局
await us({ steps: ['IP'], result: '內飛', loc: 6, batter: 'out' })                                            // S4
await check('2下結束', '3上 0出局 5:1')
// --- 3 上
await opp({ steps: ['B', 'B', 'B', 'B'], result: '保送' })
await opp({ steps: [{ run: 1, ev: '盜壘失敗' }, 'IP'], result: '一安', loc: 9, batter: 1 })                    // 盜二失敗；一安
await opp({ steps: ['IP'], result: '雙殺', loc: 6, runners: { 1: 'out' }, batter: 'out' })
await check('3上結束', '3下 0出局 5:1')
// --- 3 下
await us({ steps: ['SS', 'SS', 'SS'], result: '三振' })                                                      // S5
await us({ steps: ['IP'], result: '三安', loc: 9, batter: 3 })                                               // B3 三安
await us({ steps: ['IP'], result: '內滾', loc: 6, runners: { 3: 3 }, batter: 'out' })                         // S7
await us({ steps: ['B', 'B', { wp: true }, 'B', 'B'], result: '保送' })                                       // 暴投 B3 回來；S8 保送
await us({ steps: ['IP'], result: '外飛', loc: 7, batter: 'out' })                                           // S9
await check('3下結束', '4上 0出局 6:1')
// --- 4 上：對手大局，換投 B4
await opp({ steps: ['B', 'IP'], result: '全壘打', loc: 8, batter: 'home' })
await opp({ steps: ['IP'], result: '一安', loc: 7, batter: 1 })
await newPitcher(B4)
await opp({ steps: ['B', 'B', 'IP'], result: '二安', loc: 9, runners: { 1: 3 }, batter: 2 })
await opp({ steps: ['IP'], result: '一安', loc: 8, runners: { 3: 'home', 2: 'home' }, batter: 2, adv: { batter: '趁傳進壘' } })
await opp({ steps: ['IP'], result: '全壘打', loc: 7, runners: { 2: 'home' }, batter: 'home' })
await opp({ steps: ['SS', 'SS', 'SS'], result: '三振' })
await opp({ steps: ['IP'], result: '三安', loc: 9, batter: 3 })
await opp({ steps: ['IP'], result: '犧飛', loc: 8, runners: { 3: 'home' }, batter: 'out' })
await opp({ steps: ['IP'], result: '內飛', loc: 4, batter: 'out' })
await check('4上結束', '4下 0出局 6:7')
// --- 4 下：再見
await us({ steps: ['IP'], result: '二安', loc: 7, batter: 2 })                                               // S1 二安
await us({ steps: ['IP'], result: '犧觸', loc: 1, runners: { 2: 3 }, batter: 'out' })                         // S2 犧觸
await us({ steps: ['B', 'B', 'B', 'B'], result: '保送' })                                                    // S3 保送
await us({ steps: ['IP'], result: '二安', loc: 7, runners: { 3: 'home', 1: 'home' }, batter: 2, rbi: 2 })     // S4 再見二安
await check('再見後', '4下 1出局 8:7')
await p.screenshot({ path: `${S}/game2-live.png`, fullPage: true })

// ---------------------------------------------------------------- finish and read what the site shows
await main.getByRole('button', { name: '結束比賽' }).click(); await p.waitForTimeout(300)
await p.getByLabel('勝投').selectOption(B4)
await p.getByRole('button', { name: '儲存並結束' }).click(); await p.waitForTimeout(1200)
log('url', p.url())
const dlg = p.getByRole('dialog').last()
await p.screenshot({ path: `${S}/game2-game.png`, fullPage: true })
const tableRows = async (header) => {
  const t = dlg.locator('table', { has: p.locator('th', { hasText: new RegExp(`^${header}$`) }) }).first()
  const heads = (await t.locator('thead th').allTextContents()).map((x) => x.trim())
  const rows = []
  for (const tr of await t.locator('tbody tr').all()) rows.push((await tr.locator('td').allTextContents()).map((x) => x.trim()))
  return { heads, rows }
}
const bat = await tableRows('打者'), pit = await tableRows('投手')
const lineText = (await dlg.locator('section, div').filter({ hasText: /^.*R.*H.*E/ }).first().innerText().catch(() => ''))
writeFileSync(`${S}/game2-shown.json`, JSON.stringify({ N, bat, pit, lineText, dialogs, notes, errs }, null, 1))
const ds = await p.evaluate(() => JSON.parse(localStorage.getItem('bafin.dataset.v1') || 'null'))
writeFileSync(`${S}/game2-dataset.json`, JSON.stringify(ds))
log('dialogs:', JSON.stringify(dialogs))
log('notes while recording:', JSON.stringify(notes, null, 1))
log('page errors:', JSON.stringify(errs))
await b.close()
