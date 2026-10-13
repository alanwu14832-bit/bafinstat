// 即時比分 check (batch 12): one browser, two tabs. Tab 1 records a short away game on the real 紀錄比賽 screen with
// game1's driving helpers (local mode, nothing goes to the cloud); tab 2 reloads /live after each step and checks the
// board and the 文字轉播 the way a fan would read them: the CPBL-style sentences, the score after each scoring play,
// the half summary against a hand-scored one, row 最新 in the bottom half (bug 1), 投手 N 球 against 紀錄比賽's count
// (bug 2), no 攻守交換後 before two outs (bug 3), the 得分 chip, the phone layout at 360×800, 大螢幕, and the game page's
// 文字轉播 tab after 結束比賽. Batch 13: mid-game the game page and the game list say 比賽進行中 (no 勝／敗) with the
// current score, and once the game is finished they say 勝 again. Exit code 1 when anything does not match.
import { createRequire } from 'node:module'
const { chromium } = await import('playwright').catch(() => createRequire(`${process.cwd()}/`)('playwright'))
import { writeFileSync } from 'node:fs'
const S = process.argv[2] ?? '.'
const URL = process.env.GAMESIM_URL ?? 'http://localhost:4173'
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } })
const p = await ctx.newPage()
const lv = await ctx.newPage()
const errs = []
for (const pg of [p, lv]) { pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text())) }
p.on('dialog', (d) => d.accept())
const log = (...a) => console.log(...a)
const fails = []
const main = p.locator('main')
const draft = () => p.evaluate(() => JSON.parse(localStorage.getItem('bafin.record.draft.v1') || 'null'))

// ---------------------------------------------------------------- the team
await p.goto(`${URL}/lineup`, { waitUntil: 'networkidle' })
const names = (await p.locator('select[aria-label="DH 指定打擊"] option').allTextContents()).filter((t) => t && !t.includes('不用')).map((t) => t.replace(/（.*$/, ''))
const [S1, S2, S3, S4, S5, S6, S7, S8, S9, B1, B2, B3, B4] = names
log('lineup', JSON.stringify({ S1, S2, S3, S4, S5, S6, S7, S8, S9, B1, B2, B4 }))
await p.evaluate(({ L }) => { localStorage.removeItem('bafin.record.draft.v1'); localStorage.removeItem('bafin.registrations.v1'); localStorage.removeItem('bafin.live.feedFilter'); localStorage.setItem('bafin.lineup.v1', JSON.stringify(L)) },
  { L: { field: { SS: S1, C: S2, '1B': S3, '2B': S4, '3B': S5, LF: S6, CF: S7, RF: S8, P: S9 }, dh: '', order: [S1, S2, S3, S4, S5, S6, S7, S8, S9], bench: [B1, B2, B3, B4], gameId: '', regKey: '', reentry: false, updatedAt: new Date().toISOString() } })
await p.goto(`${URL}/record`, { waitUntil: 'networkidle' })
await main.getByLabel('對手', { exact: true }).last().fill('模擬隊')
await main.getByLabel('主客').selectOption('客')
await p.getByRole('button', { name: '開始紀錄' }).click(); await p.waitForTimeout(300)

// ---------------------------------------------------------------- driving the screen (game1's helpers)
const PITCH = { B: '壞球', CS: '好球・未揮', SS: '揮空', F: '界外', IP: '擊進場內' }
const pitch = async (c) => { await main.getByRole('button', { name: new RegExp('^' + PITCH[c]) }).first().click(); await p.waitForTimeout(60) }
const planOpen = async () => (await main.getByRole('button', { name: /^送出/ }).count()) > 0
const runnerSheet = async (base) => {
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
  if (!(await row.count())) { fails.push(`找不到跑者去向「${prefix}」`); return }
  await row.getByRole('button', { name: label, exact: true }).first().click(); await p.waitForTimeout(60)
}
const TRAJ = { G: '滾地 G', F: '飛球 F', L: '平飛 L', P: '內野飛球 P' }
async function pa(side, spec) {
  for (const st of spec.steps ?? []) {
    if (typeof st === 'string') await pitch(st)
    else if (st.run) await runnerEv(st.run, st.ev)
    else if (st.wp) { await main.getByRole('button', { name: /^暴投/ }).first().click(); await p.waitForTimeout(250) }
  }
  if (!(await planOpen())) { await main.getByRole('button', { name: spec.result, exact: true }).first().click(); await p.waitForTimeout(120) }
  if (spec.loc) { await main.getByRole('button', { name: new RegExp(`^${spec.loc} `) }).first().click(); await p.waitForTimeout(60) }
  if (spec.traj) { const t = main.getByRole('button', { name: TRAJ[spec.traj], exact: true }); if ((await t.getAttribute('aria-pressed')) !== 'true') await t.click(); await p.waitForTimeout(60) }
  for (const [base, d] of Object.entries(spec.runners ?? {})) await setDest(`${base}B `, d)
  if (spec.batter !== undefined) await setDest('打者 ', spec.batter)
  if (side === 'us') {
    const shownRbi = Number(await main.locator('span.tnum.font-semibold.w-4').first().textContent())
    const want = spec.rbi ?? 0
    const btn = main.getByRole('button', { name: shownRbi > want ? '−' : '＋', exact: true }).first()
    for (let i = 0; i < Math.abs(shownRbi - want); i++) await btn.click()
  }
  const send = main.getByRole('button', { name: /^送出/ })
  if (await send.isDisabled()) { await p.screenshot({ path: `${S}/live-stuck.png` }); throw new Error(`送出按不下去：${spec.result}`) }
  await send.click(); await p.waitForTimeout(250)
}
const us = (spec) => pa('us', spec)
const opp = (spec) => pa('opp', spec)
const sub = async (slot, name) => {
  await main.getByRole('button', { name: /^(代打|換人)$/ }).click(); await p.waitForTimeout(250)
  const sheet = p.getByRole('dialog', { name: '換人' })
  await sheet.getByRole('group', { name: '換哪一棒' }).getByRole('button').nth(slot - 1).click()
  if (name) await sheet.getByRole('group', { name: '換成誰' }).getByRole('button', { name: new RegExp('^' + name) }).click()
  return sheet
}
const ph = async (slot, name) => { const sheet = await sub(slot, name); await sheet.getByRole('button', { name: '確定', exact: true }).click(); await p.waitForTimeout(250) }
const pr = async (base, name) => { const sheet = await runnerSheet(base); await sheet.getByRole('button', { name: new RegExp('^' + name) }).click(); await p.waitForTimeout(250) }
const newPitcher = async (name) => {
  await main.getByRole('button', { name: '換投' }).click(); await p.waitForTimeout(250)
  const sheet = p.getByRole('dialog', { name: '換投' })
  await sheet.getByRole('button', { name: new RegExp('^' + name) }).click()
  await sheet.getByRole('button', { name: '確定', exact: true }).click(); await p.waitForTimeout(250)
}

// ---------------------------------------------------------------- reading /live
const card = () => lv.locator('section', { has: lv.locator('h3', { hasText: /^文字轉播$/ }) }).first()
const board = () => lv.locator('main').locator('div.\\@container').first()
async function reload() { await lv.goto(`${URL}/live`, { waitUntil: 'networkidle' }); await lv.waitForTimeout(350) }
const rowValue = async (label) => (await board().locator('span', { hasText: new RegExp(`^${label}$`) }).first().locator('xpath=following-sibling::span[1]').innerText().catch(() => '')).trim()
const rowNum = async (label) => (await board().locator('span', { hasText: new RegExp(`^${label}$`) }).first().locator('xpath=following-sibling::span[2]').innerText().catch(() => '')).trim()
const feedText = async () => (await card().innerText().catch(() => '')).replace(/\s+/g, ' ')
let step = 0
const shots = []
async function look(label, want = {}) {
  step++
  await reload()
  const feed = await feedText()
  for (const t of want.feed ?? []) if (!feed.includes(t)) fails.push(`#${step} ${label}：文字轉播沒有「${t}」`)
  for (const t of want.notFeed ?? []) if (feed.includes(t)) fails.push(`#${step} ${label}：文字轉播不該有「${t}」`)
  for (const sc of want.score ?? []) if (!(await card().getByLabel(`比分 客 ${sc[0]} 比 主 ${sc[1]}`).count())) fails.push(`#${step} ${label}：得分的打席沒有比分 ${sc[0]}:${sc[1]}`)
  if (want.latest !== undefined) { const e = await rowValue('最新'); if (!e.includes(want.latest)) fails.push(`#${step} ${label}：最新是「${e}」，應有「${want.latest}」`) }
  const due = (await board().getByText('攻守交換後').count()) > 0
  if (want.due === false && due) fails.push(`#${step} ${label}：${want.outs ?? 0} 出局就出現「攻守交換後」`)
  if (want.due === true && !due) fails.push(`#${step} ${label}：兩出局卻沒有「攻守交換後」`)
  if (want.pitchCount) {
    // 紀錄比賽's own number (我隊投手 X・用球 N) against the board's 投手 row
    const rec = (await main.innerText()).match(/我隊投手 \S+・用球 (\d+)/)?.[1]
    const shown = await rowNum('投手')
    if (!rec || shown !== `${rec} 球`) fails.push(`#${step} ${label}：即時比分投手 ${shown}，紀錄比賽用球 ${rec}`)
  }
  shots.push({ step, label, latest: await rowValue('最新'), feed: feed.slice(0, 600) })
}

// ================================================================ the game
// --- 1 上 (we are away)
await look('開賽前', { latest: '比賽開始', due: false })
await us({ steps: ['B', 'CS', 'IP'], result: '一安', loc: 8, traj: 'L', batter: 1 })
await look('1上 一安', { feed: ['一局上 我隊進攻', `${S1} 擊出中外野平飛球，一壘安打。`], latest: `${S1} 擊出中外野平飛球，一壘安打。`, due: false })
await pitch('B'); await runnerEv(1, '盜壘')
await look('1上 盜壘', { feed: [`${S1}盜壘上二壘`], due: false })
await us({ steps: ['B', 'B', 'B'], result: '保送' })
await us({ steps: ['B', 'IP'], result: '二安', loc: 7, traj: 'F', runners: { 2: 'home', 1: 'home' }, batter: 2, rbi: 2 })
await look('1上 二安 2 分', { feed: ['擊出左外野高飛球，二壘安打，2 分打點；', `${S1}、${S2}回本壘得分`], score: [[2, 0]], due: false })
await us({ steps: ['SS', 'SS', 'SS'], result: '三振' })
await us({ steps: ['CS', 'CS', 'CS'], result: '三振' })
await look('1上 兩出局', { feed: [`${S4} 揮棒落空，三振出局。`, `${S5} 好球沒揮棒，三振出局。`, '2 出局'], due: true, outs: 2 })
await us({ steps: ['IP'], result: '外飛', loc: 9 })
// hand-scored: 2 R (S1, S2), 2 H (一安, 二安), 0 E, 1 LOB (S3 on second)
await look('1上 結束', { feed: ['一局上 我隊進攻', '2 分・2 安打・0 失誤・1 殘壘', '一局下 對方進攻'], due: false })
// --- 1 下
await opp({ steps: ['B', 'CS', 'IP'], result: '一安', loc: 7, batter: 1 })
await look('1下 對方一安（最新是對方，bug 1）', { latest: '對方第 1 棒 擊出左外野方向一壘安打。', pitchCount: true, due: false })
await pitch('B')
await look('1下 投球中（bug 2）', { pitchCount: true, due: false })
await runnerEv(1, '牽制出局')
await look('1下 牽制出局', { feed: ['對方第 1 棒遭牽制出局'], pitchCount: true, due: false })
await opp({ steps: ['IP'], result: '內滾', loc: 6, batter: 'out' })
await opp({ steps: ['IP'], result: '三安', loc: 9, batter: 3 })
await pitch('B'); await main.getByRole('button', { name: /^暴投/ }).first().click(); await p.waitForTimeout(250)
await look('1下 暴投得分', { feed: ['投手暴投，對方第 3 棒回本壘得分'], latest: '投手暴投，對方第 3 棒回本壘得分', pitchCount: true, due: true, outs: 2 })
await opp({ steps: ['SS', 'SS'], result: '三振' })
// --- 2 上: 代打, 代跑, a one-out 犧飛
await ph(7, B1)
await us({ steps: ['IP'], result: '二安', loc: 7, batter: 2 })
await look('2上 代打二安', { feed: [`更換代打：${S7} → ${B1}`, `${B1} 擊出左外野方向二壘安打。`] })
await pr(2, B2)
await us({ steps: ['IP'], result: '一安', loc: 9, runners: { 2: 3 }, batter: 1 })
await look('2上 代跑', { feed: [`更換代跑：${B1} → ${B2}`, `${B2}上三壘`] })
await us({ steps: ['SS', 'SS', 'SS'], result: '三振' })
await us({ steps: ['IP'], result: '犧飛', loc: 8, runners: { 3: 'home' }, batter: 'out', rbi: 1 })
await look('2上 一出局犧飛', { feed: ['擊出中外野高飛球，犧牲飛球，1 分打點；', `${B2}回本壘得分`], score: [[3, 1]], due: true, outs: 2 })
await us({ steps: ['IP'], result: '外飛', loc: 7 })
// --- 2 下: 換投
await newPitcher(B4)
await opp({ steps: ['IP'], result: '內滾', loc: 6, batter: 'out' })
await look('2下 換投', { feed: [`更換投手：${S9} → ${B4}`], pitchCount: true, due: false })
await opp({ steps: ['IP'], result: '外飛', loc: 8, batter: 'out' })
await opp({ steps: ['IP'], result: '內飛', loc: 4, batter: 'out' })

// ---------------------------------------------------------------- the whole feed, the 得分 chip, the phone, 大螢幕
await reload()
// (older half-innings start folded: open them all)
for (let i = 0; i < 30 && (await card().locator('section > button[aria-expanded="false"]').count()); i++) await card().locator('section > button[aria-expanded="false"]').first().click()
await lv.waitForTimeout(300)
const finalFeed = await feedText()
await card().getByRole('button', { name: '得分', exact: true }).click(); await lv.waitForTimeout(600)
const scoring = await feedText()
// (a strikeout during which a run scored on a wild pitch stays: the run is in his plate appearance)
for (const t of [`${S4} 揮棒落空`, `${S5} 好球沒揮棒`, `${S1} 擊出中外野平飛球`]) if (scoring.includes(t)) fails.push(`得分篩選後還有「${t}」`)
for (const t of ['2 分打點', '投手暴投，對方第 3 棒回本壘得分', '犧牲飛球，1 分打點']) if (!scoring.includes(t)) fails.push(`得分篩選後少了「${t}」`)
await card().getByRole('button', { name: '全部', exact: true }).click(); await lv.waitForTimeout(300)
await lv.setViewportSize({ width: 360, height: 800 }); await reload()
const phone = await lv.evaluate(() => {
  const sw = document.documentElement.scrollWidth
  const heads = [...document.querySelectorAll('main th')].filter((th) => ['R', 'H', 'E'].includes(th.textContent?.trim() ?? '')).map((th) => th.getBoundingClientRect().right)
  const nameEls = [...document.querySelectorAll('main div.\\@container span.truncate.font-semibold')].slice(0, 2)
  const nameOk = nameEls.map((el) => { const fs = parseFloat(getComputedStyle(el).fontSize); return { text: el.textContent, ok: el.clientWidth >= 2 * fs } })
  return { sw, heads, nameOk }
})
if (phone.sw > 360) fails.push(`360 寬時頁面可以左右捲動（scrollWidth ${phone.sw}）`)
if (phone.heads.length !== 3 || phone.heads.some((r) => r > 360)) fails.push(`360 寬時 R/H/E 不在畫面內：${JSON.stringify(phone.heads)}`)
if (phone.nameOk.length !== 2 || phone.nameOk.some((x) => !x.ok)) fails.push(`360 寬時隊名被截成一個字：${JSON.stringify(phone.nameOk)}`)
await lv.screenshot({ path: `${S}/live-360.png`, fullPage: true })
await lv.getByRole('button', { name: '大螢幕', exact: true }).click(); await lv.waitForTimeout(500)
const big = lv.getByRole('dialog', { name: '即時比分大螢幕' })
if (!(await big.count()) || !(await big.getByText('最新', { exact: true }).count())) fails.push('大螢幕沒有打開或沒有「最新」')
await lv.screenshot({ path: `${S}/live-360-big.png` })
await lv.keyboard.press('Escape')
await lv.setViewportSize({ width: 1400, height: 1000 })

// ---------------------------------------------------------------- batch 13: mid-game the game says 比賽進行中, not 勝／敗
// (the second tab opens the game page and the game list while tab 1 is still recording; 3:1 after 2 innings)
// (local mode saves the game's rows only on 儲存 — with the cloud every play does — so press it first, as a cloud
// recorder's phone would have by now)
await main.getByRole('button', { name: '儲存', exact: true }).first().click(); await p.waitForTimeout(800)
const gid = (await draft()).game.id
const badges = async (scope) => Object.fromEntries(await Promise.all(['勝', '敗', '和', '比賽進行中'].map(async (t) => [t, await scope.getByText(t, { exact: true }).count()])))
await lv.goto(`${URL}/games/${encodeURIComponent(gid)}`, { waitUntil: 'networkidle' }); await lv.waitForTimeout(500)
const midHead = lv.locator('main h2').first()
const midText = (await midHead.innerText()).replace(/\s+/g, ' ')
const mid = await badges(midHead)
if (!mid['比賽進行中'] || mid['勝'] || mid['敗'] || mid['和']) fails.push(`比賽中的比賽頁標題應寫「比賽進行中」、不寫勝敗：${midText}`)
if (!midText.includes('3:1') && !midText.includes('3 : 1')) fails.push(`比賽中的比賽頁比分不是目前的 3:1：${midText}`)
if (!(await midHead.getByRole('link', { name: '看即時比分' }).count())) fails.push('比賽中的比賽頁沒有「看即時比分」連結')
// the innings not reached yet are blank on the game page's line score (not 0), as on 即時比分
const midRows = lv.locator('main table').first().locator('tbody tr')
for (let r = 0; r < Math.min(2, await midRows.count()); r++) {
  const cells = await midRows.nth(r).locator('td').allInnerTexts()
  const later = cells.slice(3, 7).map((t) => t.trim())   // innings 4–7
  if (later.some((t) => t !== '')) fails.push(`比賽中的比賽頁局分表，還沒打到的局應空白：${cells.join(' ')}`)
}
await lv.screenshot({ path: `${S}/live-gamepage-midgame.png` })
await lv.goto(`${URL}/games?view=results`, { waitUntil: 'networkidle' }); await lv.waitForTimeout(500)
const midCard = lv.locator('main').getByRole('button', { name: /模擬隊，比賽進行中，目前比分，看這場/ })
if ((await midCard.count()) !== 1) fails.push('比賽中的比賽列表卡片沒有寫「比賽進行中」')
else { const c = await badges(midCard); if (c['勝'] || c['敗'] || c['和']) fails.push('比賽中的比賽列表卡片還寫著勝敗') }
// back to the game page in tab 2: it should turn to 勝 by itself once tab 1 finishes the game (same browser)
await lv.goto(`${URL}/games/${encodeURIComponent(gid)}`, { waitUntil: 'networkidle' }); await lv.waitForTimeout(400)

// ---------------------------------------------------------------- 結束比賽: the game page's 文字轉播 tab says the same
await main.getByRole('button', { name: '結束比賽' }).click(); await p.waitForTimeout(300)
await p.getByRole('button', { name: '儲存並結束' }).click(); await p.waitForTimeout(1200)
const dlg = p.getByRole('dialog').last()
// batch 13: finished, the game shows 勝 again (the recorder's game sheet, the other tab without reloading, after a reload)
const endHead = await badges(dlg.locator('h2').first())
if (!endHead['勝'] || endHead['比賽進行中']) fails.push(`結束比賽後的比賽頁應寫「勝」：${JSON.stringify(endHead)}`)
await lv.waitForTimeout(500)
const otherTab = await badges(lv.locator('main h2').first())
if (!otherTab['勝'] || otherTab['比賽進行中']) fails.push(`結束比賽後，另一個分頁的比賽頁沒有自己變回「勝」：${JSON.stringify(otherTab)}`)
await lv.reload({ waitUntil: 'networkidle' }); await lv.waitForTimeout(400)
const reloaded = await badges(lv.locator('main h2').first())
if (!reloaded['勝'] || reloaded['比賽進行中']) fails.push(`結束比賽後重新整理的比賽頁應寫「勝」：${JSON.stringify(reloaded)}`)
await dlg.getByRole('tab', { name: /文字轉播/ }).click(); await p.waitForTimeout(400)
const gameFeed = (await dlg.innerText()).replace(/\s+/g, ' ')
const lines = [`${S1} 擊出中外野平飛球，一壘安打。`, `${S1}盜壘上二壘`, '2 分打點；', `${S4} 揮棒落空，三振出局。`, `${S5} 好球沒揮棒，三振出局。`, '對方第 1 棒遭牽制出局', '投手暴投，對方第 3 棒回本壘得分', `更換代打：${S7} → ${B1}`, `更換代跑：${B1} → ${B2}`, `更換投手：${S9} → ${B4}`, '犧牲飛球，1 分打點', '2 分・2 安打・0 失誤・1 殘壘']
for (const t of lines) {
  if (!finalFeed.includes(t)) fails.push(`即時比分的文字轉播最後沒有「${t}」`)
  if (!gameFeed.includes(t)) fails.push(`比賽頁的文字轉播沒有「${t}」`)
}
await p.screenshot({ path: `${S}/live-gamepage.png`, fullPage: true })
writeFileSync(`${S}/live-steps.json`, JSON.stringify({ shots, finalFeed, gameFeed, errs, draft: await draft() }, null, 1))
if (errs.length) fails.push(`頁面錯誤：${errs.join(' / ')}`)
log(fails.length ? `即時比分：${fails.length} 個問題\n${fails.map((f) => `✗ ${f}`).join('\n')}` : '即時比分：全部相符')
if (fails.length) process.exitCode = 1
await b.close()
