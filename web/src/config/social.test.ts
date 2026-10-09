import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { escapeHtml, liveBase, pictureUrl, socialMeta } from './social'
import { TEAM_DEFAULTS } from './teamDefaults'

const meta = (html: string, key: string) => html.match(new RegExp(`(?:property|name)="${key}" content="([^"]*)"`))?.[1]

describe('link previews', () => {
  const live = { ...TEAM_DEFAULTS, siteUrl: 'https://bafinstat.vercel.app' }
  it('points og:image at the full address of og.png', () => {
    const html = socialMeta(live, '/', { hasOgImage: true })
    expect(meta(html, 'og:image')).toBe('https://bafinstat.vercel.app/og.png')
    expect(meta(html, 'og:title')).toBe('NTU BaFiN Stats — 台大工管財金系棒數據平台')
    expect(meta(html, 'twitter:card')).toBe('summary_large_image')
    expect(meta(html, 'og:image:width')).toBe('1200')
    expect(meta(html, 'og:image:height')).toBe('630')
    expect(meta(html, 'og:locale')).toBe('zh_TW')
  })
  it('uses a root-relative picture without a site address, and the live root from an archived copy', () => {
    expect(meta(socialMeta({ ...live, siteUrl: '' }, '/', { hasOgImage: true }), 'og:image')).toBe('/og.png')
    expect(meta(socialMeta({ ...live, siteUrl: '' }, '/v/20261009-1200-abc1234/', { hasOgImage: true }), 'og:image')).toBe('/og.png')
    expect(liveBase('/v/20261009-1200-abc1234/')).toBe('/')
    expect(liveBase('/bafinstat/v/x/')).toBe('/bafinstat/')
    expect(liveBase('/')).toBe('/')
  })
  it('never joins the site address with another host\'s base path', () => {
    // the GitHub Pages backup builds with base /bafinstat/ while siteUrl is still the Vercel root
    expect(meta(socialMeta(live, '/bafinstat/', { hasOgImage: true }), 'og:image')).toBe('/bafinstat/og.png')
    expect(pictureUrl('https://x.github.io/bafinstat', 'og.png', '/bafinstat/')).toBe('https://x.github.io/bafinstat/og.png')
    expect(pictureUrl('https://x.github.io/bafinstat/', 'og.png', '/bafinstat/')).toBe('https://x.github.io/bafinstat/og.png')
    expect(pictureUrl('https://stats.example.org', 'og.png', '/')).toBe('https://stats.example.org/og.png')
    expect(pictureUrl('https://example.org/stats', 'og.png', '/')).toBe('https://example.org/stats/og.png')
    expect(meta(socialMeta(live, '/v/20261009-1200-abc1234/', { hasOgImage: true }), 'og:image')).toBe('https://bafinstat.vercel.app/og.png')
  })
  it('falls back to the logo and a small card without og.png', () => {
    const html = socialMeta({ ...live, siteUrl: '' }, '/', { hasOgImage: false })
    expect(meta(html, 'og:image')).toBe('/logo.png')
    expect(meta(html, 'twitter:card')).toBe('summary')
    expect(meta(html, 'og:image:width')).toBeUndefined()
  })
  it('escapes every value and builds the description from the names', () => {
    const html = socialMeta({ ...live, org: 'A&B "隊"' }, '/', { hasOgImage: true })
    expect(html).toContain('A&amp;B &quot;隊&quot;')
    expect(html).not.toContain('"隊"')
    expect(meta(socialMeta(live, '/', { hasOgImage: true }), 'description')).toBe('台大工管財金系棒（喝FIN就好BA）的比賽紀錄、即時比分與球員數據，逐球紀錄、免費公開。')
    expect(meta(socialMeta({ ...live, description: '自訂' }, '/', { hasOgImage: true }), 'og:description')).toBe('自訂')
    expect(escapeHtml(`<a href='x'>`)).toBe('&lt;a href=&#39;x&#39;&gt;')
  })
  it('index.html has the placeholder and no inline script', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
    expect(html).toContain('%SOCIAL_META%')
    const scripts = html.match(/<script\b[^>]*>/g) ?? []
    expect(scripts.length).toBeGreaterThan(0)
    for (const s of scripts) expect(s).toMatch(/\ssrc=/)
  })
})
