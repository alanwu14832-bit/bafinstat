// 友誼賽 with players short: 8 batters each side. Setup refuses a gap in the first six slots and shows 7–9 as 選填;
// then every batter strikes out for three innings on the real 紀錄比賽 screen, and both orders turn over after the 8th.
import { createRequire } from 'node:module'
const { chromium } = await import('playwright').catch(() => createRequire(`${process.cwd()}/`)('playwright'))
const URL = process.env.GAMESIM_URL ?? 'http://localhost:4173'
const OUT = process.argv[2]
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const p = await b.newPage({ viewport: { width: 1400, height: 1100 } })
const errs = []; p.on('pageerror', (e) => errs.push(e.message))
p.on('dialog', (d) => d.accept())
const main = p.locator('main')
const draft = () => p.evaluate(() => JSON.parse(localStorage.getItem('bafin.record.draft.v1') || 'null'))
const fails = []
const check = (ok, what) => { if (!ok) fails.push(what); console.log(ok ? '✓' : '✗', what) }

await p.goto(`${URL}/lineup`, { waitUntil: 'networkidle' })
const names = (await p.locator('select[aria-label="DH 指定打擊"] option').allTextContents()).filter((t) => t && !t.includes('不用')).map((t) => t.replace(/（.*$/, ''))
const POS = ['SS', 'C', '1B', '2B', '3B', 'LF', 'CF', 'P']
// a lineup of 8: the 9th slot empty
await p.evaluate(({ L }) => { localStorage.removeItem('bafin.record.draft.v1'); localStorage.setItem('bafin.lineup.v1', JSON.stringify(L)) },
  { L: { field: Object.fromEntries(POS.map((pos, i) => [pos, names[i]])), dh: '', order: [...names.slice(0, 8), ''], bench: [], gameId: '', regKey: '', reentry: false, updatedAt: new Date().toISOString() } })
await p.goto(`${URL}/record`, { waitUntil: 'networkidle' })
await main.getByLabel('對手', { exact: true }).last().fill('友誼隊')
await main.getByLabel('主客').selectOption('客')
await main.getByLabel('對方打序').selectOption('8')
// a gap in the order is refused
await main.getByRole('button', { name: '修改打序' }).click().catch(() => {})
await main.getByLabel('第 5 棒', { exact: true }).selectOption('')
await p.getByRole('button', { name: '開始紀錄' }).click(); await p.waitForTimeout(200)
check((await main.textContent()).includes('第 5 棒還沒填'), '前六棒有空著：擋下並說明')
check(await main.getByLabel('第 9 棒', { exact: true }).locator('option:checked').textContent() === '選填', '第 9 棒顯示「選填」')
if (OUT) await p.screenshot({ path: `${OUT}/short8-setup.png`, fullPage: true })
await main.getByLabel('第 5 棒', { exact: true }).selectOption(names[4])
await p.getByRole('button', { name: '開始紀錄' }).click(); await p.waitForTimeout(400)
const d0 = await draft()
check(d0?.lineup?.length === 8 && d0?.oppSlots === 8, `開賽：我方 ${d0?.lineup?.length} 棒、對方 ${d0?.oppSlots} 棒`)

// strike everyone out: 3 innings = 9 of ours and 9 of theirs
const answer = async () => {
  for (const [g, btn] of [['對方投手左右投', '不知道'], ['對方打者左打或右打', '右打']]) {
    const grp = main.getByRole('group', { name: g })
    if (await grp.count() && !(await grp.locator('[aria-pressed="true"]').count())) { await grp.getByRole('button', { name: btn, exact: true }).click(); await p.waitForTimeout(120) }
  }
}
const k = async () => { for (let i = 0; i < 3; i++) { await answer(); await main.getByRole('button', { name: /^揮空/ }).first().click(); await p.waitForTimeout(50) } await main.getByRole('button', { name: /^送出/ }).click(); await p.waitForTimeout(200) }
for (let i = 0; i < 18; i++) await k()
const d = await draft()
check(JSON.stringify(d.batting.map((x) => x.order)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 1]), `我方棒次 ${d.batting.map((x) => x.order).join(',')}`)
check(JSON.stringify(d.pitching.map((x) => x.oppOrder)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 1]), `對方棒次 ${d.pitching.map((x) => x.oppOrder).join(',')}`)
if (OUT) await p.screenshot({ path: `${OUT}/short8-live.png` })
console.log('page errors:', errs)
await b.close()
if (fails.length || errs.length) { console.log('不符：', fails); process.exit(1) }
console.log('八棒友誼賽：全部相符')
