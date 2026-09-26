// Windows smoke test, run by .github/workflows/windows-check.yml on a real Windows machine with the Edge that ships
// with it (classic space-taking scrollbars, Windows fonts). Opens every page of the built site at common Windows
// laptop sizes and fails on page errors or sideways overflow. Screenshots go to web/smoke/ (uploaded by the workflow).
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PORT = 4173
const BASE = `http://localhost:${PORT}`
const PAGES = ['/', '/batting', '/pitching', '/fielding', '/players', '/games', '/games?view=schedule', '/live', '/photos', '/lineup', '/record', '/import', '/dictionary', '/guide']
const SIZES = [{ width: 1366, height: 768, scale: 1 }, { width: 1536, height: 864, scale: 1.25 }, { width: 1920, height: 1080, scale: 1 }]

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' })
const stop = () => { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F']); else server.kill() }
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE)).ok) break } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500))
}

mkdirSync('smoke', { recursive: true })
const failures = []
// Playwright hides scrollbars by default; keep them, since Windows' space-taking scrollbars are part of what is checked
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, ignoreDefaultArgs: ['--hide-scrollbars'] })
try {
  for (const s of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.scale })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    for (const path of PAGES) {
      await page.goto(BASE + path, { waitUntil: 'networkidle' })
      await page.waitForTimeout(600)
      const m = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        scrollbar: window.innerWidth - document.documentElement.clientWidth,
        cjkFont: document.fonts.check('16px "Noto Sans TC"', '總覽'),
        shortcut: document.querySelector('aside kbd')?.textContent ?? '',
      }))
      const tag = `${s.width}x${s.height}@${s.scale} ${path}`
      console.log(`${tag}: overflow ${m.overflow}px, scrollbar ${m.scrollbar}px, Noto Sans TC ${m.cjkFont ? 'loaded' : 'fallback'}, shortcut "${m.shortcut}"`)
      if (m.overflow > 0) failures.push(`${tag}: page scrolls sideways by ${m.overflow}px`)
      if (path === '/' && m.shortcut && m.shortcut.includes('⌘')) failures.push(`${tag}: shows the Mac shortcut ${m.shortcut}`)
      if (path === '/' || path === '/batting' || path === '/players') await page.screenshot({ path: `smoke/${s.width}${path.replace(/\W+/g, '_') || '_home'}.png` })
    }
    failures.push(...errors.map((e) => `${s.width}x${s.height}: page error ${e}`))
    await ctx.close()
  }
} finally {
  await browser.close()
  stop()
}
if (failures.length) { console.error('FAILED\n' + failures.join('\n')); process.exit(1) }
console.log('All pages OK on', process.platform)
