// 模擬比賽 4 (see README.md, batch 17): 代打之後改守位 — a 2-inning game, we are 主 (we field the top halves).
//   1上: S1 (游擊) 失誤 on a strikeout plate appearance (點「我隊失誤 → 6 SS S1」), two more strikeouts
//   1下: S1 全壘打; S2 三振; 代打 B1 for S3 (一壘) → 三振; S4 三振
//   2上: 換人 只改守位: B1 stays in at 游擊, S1 moves to 一壘 (守備調動); then 我隊失誤 6 SS → B1's,
//        我隊失誤 3 1B → S1's, three strikeouts. Final 1–0.
// The pickers must say who stands there (「6 SS B1」), the saved game must log both changes, and the errors must go to
// S1 (SS, 1st inning), B1 (SS, 2nd) and S1 (1B, 2nd): check4.mjs reads the 比賽附註 and the saved fielding lines.
import { createRequire } from 'node:module'
// playwright from next to this script, or from the folder it is run in (npm i --no-save playwright there)
const { chromium } = await import('playwright').catch(() => createRequire(`${process.cwd()}/`)('playwright'))
import { writeFileSync } from 'node:fs'
import { answerAsks } from './answer.mjs'
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
await main.getByLabel('對手', { exact: true }).last().fill('模擬隊四')
await main.getByLabel('主客').selectOption('主')
await main.getByLabel('預定局數').fill('2')
await p.getByRole('button', { name: '開始紀錄' }).click(); await p.waitForTimeout(300)

// ---------------------------------------------------------------- driving the screen (as in game1/game2)
const PITCH = { B: '壞球', CS: '好球・未揮', SS: '揮空', F: '界外', IP: '擊進場內' }
// (batch 18: the questions the pitch pad waits for are answered first, 不知道 unless the script says otherwise)
const pitch = async (c) => { await answerAsks(p, main); await main.getByRole('button', { name: new RegExp('^' + PITCH[c]) }).first().click(); await p.waitForTimeout(60) }
const planOpen = async () => (await main.getByRole('button', { name: /^送出/ }).count()) > 0
const POSNUM = { P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9 }
const posLabel = (pos) => (POSNUM[pos] ? `${POSNUM[pos]} ${pos}` : pos)
/** 我隊失誤 → the position chip, which must name who stands there now (「6 SS 王鼎鈞」) */
const myErr = async (pos, who) => {
  await main.getByRole('button', { name: /^我隊失誤/ }).click(); await p.waitForTimeout(100)
  const chip = main.getByRole('button', { name: `${posLabel(pos)} ${who}`, exact: true })
  if (!(await chip.count())) {
    const shown = (await main.getByRole('button', { name: new RegExp(`^${posLabel(pos)}( |$)`) }).first().textContent().catch(() => '')) ?? ''
    notes.push(`我隊失誤的 ${posLabel(pos)} 沒有寫 ${who}（畫面：「${shown.trim()}」）`)
    await main.getByRole('button', { name: new RegExp(`^${posLabel(pos)}( |$)`) }).first().click()
  } else await chip.first().click()
  await p.waitForTimeout(150)
  await main.getByRole('button', { name: /^我隊失誤/ }).click(); await p.waitForTimeout(100)
}
let paNo = 0
const TRAJ = { G: '滾地 G', F: '飛球 F', L: '平飛 L', P: '內野飛球 P' }
// 軌跡 is picked on every batted ball now (nothing is filled in from the result): the scripts pick what the result implies
const IMPLIED_TRAJ = { 內滾: 'G', 雙殺: 'G', 犧觸: 'G', 野選: 'G', 內飛: 'P', 外飛: 'F', 界外飛: 'F', 犧飛: 'F' }
const destRow = (prefix) => main.locator('span[class*="w-[132px]"]', { hasText: new RegExp('^' + prefix) }).first().locator('xpath=..')
async function pa(side, spec) {
  paNo++
  await answerAsks(p, main, { ...(spec.hand ? { hand: spec.hand } : {}), ...(spec.bats ? { bats: spec.bats } : {}) })
  const d0 = await draft()
  const who = side === 'us' ? d0.lineup[d0.slot]?.name : `對方第 ${d0.oppOrder} 棒`
  for (const st of spec.steps ?? []) {
    if (typeof st === 'string') await pitch(st)
    else if (st.myerr) await myErr(st.myerr, st.who)
  }
  if (!(await planOpen())) { await main.getByRole('button', { name: spec.result, exact: true }).first().click(); await p.waitForTimeout(120) }
  if (spec.loc) { await main.getByRole('button', { name: new RegExp(`^${spec.loc} `) }).first().click(); await p.waitForTimeout(60) }
  { const want = spec.traj ?? IMPLIED_TRAJ[spec.result]; if (want) { const t = main.getByRole('button', { name: TRAJ[want], exact: true }); if ((await t.getAttribute('aria-pressed')) !== 'true') await t.click(); await p.waitForTimeout(60) } }
  if (spec.batter !== undefined) {
    const row = destRow('打者 ')
    if (await row.count()) await row.getByRole('button', { name: spec.batter === 'home' ? '得分' : `${spec.batter}B`, exact: true }).first().click()
  }
  const send = main.getByRole('button', { name: /^送出/ })
  if (await send.isDisabled()) {
    const why = (await main.locator('[role=alert], .text-critical').allTextContents()).join(' / ')
    notes.push(`#${paNo} ${who} ${spec.result}: 送出按不下去（${why}）`)
    await p.screenshot({ path: `${S}/game4-stuck-${paNo}.png` })
    throw new Error(`stuck at #${paNo}`)
  }
  await send.click(); await p.waitForTimeout(250)
}
const us = (spec) => pa('us', spec)
const opp = (spec) => pa('opp', spec)
const K = ['SS', 'SS', 'SS']
const sub = async (slot, name) => {
  await main.getByRole('button', { name: /^(代打|換人)/ }).first().click(); await p.waitForTimeout(250)
  const sheet = p.getByRole('dialog', { name: '換人' })
  await sheet.getByRole('group', { name: '換哪一棒' }).getByRole('button').nth(slot - 1).click()
  if (name) await sheet.getByRole('group', { name: '換成誰' }).getByRole('button', { name: new RegExp('^' + name) }).click()
  return sheet
}
const ph = async (slot, name) => { const sheet = await sub(slot, name); await sheet.getByRole('button', { name: '確定', exact: true }).click(); await p.waitForTimeout(250) }
/** 換人 → 第 N 棒 → (nobody) → the position: 只改守位 */
const setPos = async (slot, pos) => {
  const sheet = await sub(slot)
  await sheet.getByRole('group', { name: '守位' }).getByRole('button', { name: posLabel(pos), exact: true }).click()
  const summary = (await sheet.innerText()).replace(/\s+/g, ' ')
  if (!summary.includes(`改守 ${pos}`)) notes.push(`換人只改守位時沒有寫「改守 ${pos}」`)
  await sheet.getByRole('button', { name: '確定', exact: true }).click(); await p.waitForTimeout(250)
}
const lineupText = async () => (await main.locator('section', { hasText: '點棒次可跳到該打者' }).last().innerText()).replace(/\s+/g, ' ')

// ================================================================ game 4: we are 主
{
  const strip = main.getByRole('group', { name: '對方投手' })
  // (batch 18: 不記 is gone; the hand is required, 不知道 counts)
  if (await strip.count()) { await strip.getByRole('button', { name: '不知道', exact: true }).click(); await p.waitForTimeout(200) }
}
// --- 1 上（先發 S9；S1 守游擊）
await opp({ steps: ['B', { myerr: 'SS', who: S1 }, ...K], result: '三振' })
await opp({ steps: K, result: '三振' })
await opp({ steps: K, result: '三振' })
// --- 1 下
await us({ steps: ['IP'], result: '全壘打', loc: 8, traj: 'F', batter: 'home' })   // S1
await us({ steps: K, result: '三振' })                                              // S2
await ph(3, B1)                                                                      // 代打 B1 換 S3（一壘）
await us({ steps: K, result: '三振' })                                              // B1
await us({ steps: K, result: '三振' })                                              // S4
// --- 2 上：B1 留下來守游擊，S1 改守一壘（換人・只改守位）
{
  const t = await lineupText()
  if (!t.includes('代打・沒守位')) notes.push(`守備時打線沒有標出代打 B1 還沒有守位（打線：${t}）`)
}
await setPos(3, 'SS')
await setPos(1, '1B')
{
  const t = await lineupText()
  if (!t.includes(`${B1} 守 6 SS`) || !t.includes(`${S1} 守 3 1B`)) notes.push(`改守位後打線沒有顯示新的守位（打線：${t}）`)
  const d = await draft()
  const moves = (d.subs ?? []).filter((x) => x.in === x.out).map((x) => `${x.in}:${x.pos}:${x.inning}${x.half}`)
  if (moves.join() !== [`${B1}:SS:2top`, `${S1}:1B:2top`].join()) notes.push(`只改守位沒有記下來（subs：${JSON.stringify(d.subs)}）`)
}
await opp({ steps: ['B', { myerr: 'SS', who: B1 }, ...K], result: '三振' })
await opp({ steps: [{ myerr: '1B', who: S1 }, ...K], result: '三振' })
await opp({ steps: K, result: '三振' })
await p.screenshot({ path: `${S}/game4-live.png`, fullPage: true })

// ---------------------------------------------------------------- finish and read what the site shows
await main.getByRole('button', { name: '結束比賽' }).click(); await p.waitForTimeout(300)
await p.getByLabel('勝投').selectOption(S9)
await p.getByRole('button', { name: '儲存並結束' }).click(); await p.waitForTimeout(1200)
log('url', p.url())
const dlg = p.getByRole('dialog').last()
await dlg.getByRole('tab', { name: /^攻守成績/ }).click(); await p.waitForTimeout(400)
const boxText = (await dlg.innerText()).replace(/\s+/g, ' ')
await p.screenshot({ path: `${S}/game4-game.png`, fullPage: true })
// 逐局表 (the scoresheet) shows 代打-SS for B1
await dlg.getByRole('tab', { name: '逐局表' }).first().click(); await p.waitForTimeout(400)
const gridText = (await dlg.innerText()).replace(/\s+/g, ' ')
await dlg.getByRole('tab', { name: /^登錄名單/ }).click(); await p.waitForTimeout(400)
const rosterText = (await dlg.innerText()).replace(/\s+/g, ' ')
await dlg.getByRole('tab', { name: /^文字轉播/ }).click(); await p.waitForTimeout(400)
const feedText = (await dlg.innerText()).replace(/\s+/g, ' ')
const ds = await p.evaluate(() => JSON.parse(localStorage.getItem('bafin.dataset.v1') || 'null'))
writeFileSync(`${S}/game4-dataset.json`, JSON.stringify(ds))
const game = ds.base.games.find((g) => g.opponent === '模擬隊四')
const fielding = ds.base.fielding.filter((f) => f.gameId === game?.id)
writeFileSync(`${S}/game4-shown.json`, JSON.stringify({ N, game, fielding, boxText, gridText, rosterText, feedText, dialogs, notes, errs }, null, 1))
log('dialogs:', JSON.stringify(dialogs))
log('notes while recording:', JSON.stringify(notes, null, 1))
log('page errors:', JSON.stringify(errs))
await b.close()
