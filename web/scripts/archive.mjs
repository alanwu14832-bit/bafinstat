// 網站版本: put the saved copies of earlier versions (the site-archive branch, kept by the 保存這一版 step of
// .github/workflows/auto-deploy.yml) into dist/v/, so they are served next to the live site at /v/<id>/.
// Runs after every build (npm "postbuild"). Never fails the build: without the copies the site works the same,
// the 網站版本 page just lists nothing.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const REPO = process.env.ARCHIVE_REPO || 'alanwu14832-bit/bafinstat'
// a private repo: a read-only GitHub token (Contents: Read) in the host's environment variables as ARCHIVE_TOKEN
const TOKEN = process.env.ARCHIVE_TOKEN
const skip =
  process.env.VITE_ARCHIVE_ID ? 'this build is itself a saved copy'
  : process.env.GITHUB_ACTIONS ? 'GitHub Actions build (tests / GitHub Pages)'
  : process.env.SKIP_ARCHIVE ? 'SKIP_ARCHIVE is set'
  : process.platform === 'win32' ? 'Windows'
  : null
const dist = resolve(process.cwd(), 'dist')
if (skip) console.log(`[archive] skipped: ${skip}`)
else if (!existsSync(dist)) console.log('[archive] no dist/; skipped')
else {
  const tgz = resolve(tmpdir(), `site-archive-${process.pid}.tar.gz`)
  try {
    const res = TOKEN
      ? await fetch(`https://api.github.com/repos/${REPO}/tarball/site-archive`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' } })
      : await fetch(`https://codeload.github.com/${REPO}/tar.gz/refs/heads/site-archive`)
    if (res.status === 404 && !TOKEN) throw new Error('HTTP 404 (a private repo needs ARCHIVE_TOKEN)')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    writeFileSync(tgz, Buffer.from(await res.arrayBuffer()))
    const out = resolve(dist, 'v')
    rmSync(out, { recursive: true, force: true })
    mkdirSync(out, { recursive: true })
    // the tarball is <repo>-site-archive/v/...: keep what is under v/
    execFileSync('tar', ['-xzf', tgz, '-C', out, '--strip-components=2', '--wildcards', '*/v/*'])
    console.log(`[archive] saved versions copied into dist/v/`)
  } catch (e) {
    console.log(`[archive] no saved versions copied (${e instanceof Error ? e.message : String(e)}); the site works without them`)
  } finally {
    rmSync(tgz, { force: true })
  }
}
