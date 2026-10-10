// 連結預覽圖：把下面內建的 HTML 版型截成 1200×630 的 web/public/og.png（LINE、FB 貼網址時顯示的那張圖）。
// 只給開發用，不在 package.json 裡。換了隊徽或隊名之後重新跑一次，再 commit web/public/og.png。
//
//   NODE_PATH=/opt/node-tools/node_modules CHROMIUM=/opt/pw-browsers/chromium node tools/og/make-og.mjs \
//     --mark web/public/mark.png --org 台大工管財金系棒 --short 'NTU BaFiN' --accent '#e2a03a' \
//     --host bafinstat.vercel.app --out web/public/og.png
//
// playwright：從這個資料夾、執行的資料夾或 NODE_PATH 找（沒有就先在暫存資料夾 npm i --no-save playwright）。
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []))
const need = (k, d) => args[k] ?? d
const mark = need('mark', 'web/public/mark.png')
const org = need('org', '台大工管財金系棒')
const short = need('short', 'NTU BaFiN')
const accent = need('accent', '#e2a03a')
const host = need('host', 'bafinstat.vercel.app')
const out = need('out', 'web/public/og.png')
const tagline = need('tagline', '比賽紀錄・即時比分・球員數據')
if (!/^#[0-9a-f]{3,6}$/i.test(accent)) throw new Error('--accent 要是 #rrggbb')

const load = async () => {
  try { return await import('playwright') } catch { /* next place */ }
  for (const dir of [process.cwd(), ...(process.env.NODE_PATH ?? '').split(':').filter(Boolean)]) {
    try { return createRequire(`${resolve(dir)}/`)('playwright') } catch { /* next place */ }
  }
  throw new Error('找不到 playwright：先在暫存資料夾 npm i --no-save playwright，或設 NODE_PATH')
}
const { chromium } = await load()

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[extname(mark).toLowerCase()] ?? 'image/png'
const markUri = `data:${type};base64,${readFileSync(mark).toString('base64')}`

// 深色記分板：隊色光暈、隊徽、隊名、標語和網址（字型用系統的黑體）
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px}
body{font-family:"Noto Sans TC","WenQuanYi Zen Hei","PingFang TC","Microsoft JhengHei",sans-serif;color:#f5f5f7;overflow:hidden;
  background:radial-gradient(ellipse 70% 90% at 22% 50%, ${accent}38, transparent 70%),
    linear-gradient(160deg,#17171a,#0b0b0d 60%,#050506)}
.frame{position:absolute;inset:28px;border:2px solid rgba(255,255,255,.08);border-radius:28px}
.stitch{position:absolute;left:64px;right:64px;bottom:150px;height:0;border-top:3px dashed ${accent}aa}
.tile{position:absolute;left:84px;top:110px;width:300px;height:300px;border-radius:44px;background:#f5f5f7;
  box-shadow:0 0 0 6px ${accent}55,0 24px 50px rgba(0,0,0,.6);display:grid;place-items:center}
.mark{width:250px;height:250px;object-fit:contain}
.text{position:absolute;left:430px;right:72px;top:118px}
.short{font-family:"Barlow Semi Condensed","Arial Narrow",sans-serif;font-weight:700;letter-spacing:.04em;font-size:44px;color:${accent}}
.org{font-weight:700;font-size:76px;line-height:1.12;margin-top:10px}
.tag{font-size:38px;color:#c7c7cc;margin-top:26px;letter-spacing:.06em}
.host{position:absolute;left:84px;bottom:76px;font-size:30px;color:#a1a1a6;letter-spacing:.04em;font-family:"Barlow Semi Condensed","Arial Narrow",sans-serif}
.board{position:absolute;right:72px;bottom:66px;display:flex;gap:10px}
.board span{width:46px;height:46px;border-radius:10px;background:#000;border:2px solid rgba(255,255,255,.1);display:grid;place-items:center;
  font:700 30px "Barlow Semi Condensed",sans-serif;color:${accent}}
</style></head><body>
<div class="frame"></div><div class="stitch"></div>
<div class="tile"><img class="mark" src="${markUri}" alt=""></div>
<div class="text"><div class="short">${esc(short)} Stats</div><div class="org">${esc(org)}</div><div class="tag">${esc(tagline)}</div></div>
<div class="host">${esc(host)}</div>
<div class="board"><span>R</span><span>H</span><span>E</span></div>
</body></html>`

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)
const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } })
await browser.close()
writeFileSync(out, png)
// 縮成 256 色（約 150 KB，網站部署空間有限）；沒有 Python 的 PIL 就留原圖
const QUANT = 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGB")\nim.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(sys.argv[1], optimize=True)'
for (const py of ['python3.13', 'python3']) {
  if (spawnSync(py, ['-I', '-c', QUANT, out], { stdio: 'ignore' }).status === 0) break
}
console.log(`寫好 ${out}（${Math.round(readFileSync(out).length / 1024)} KB）`)
