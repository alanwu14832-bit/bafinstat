/**
 * Link previews (LINE, Facebook, Messenger, Discord…): the <meta> tags vite.config.ts writes into index.html at build
 * time. Plain code with no import.meta, so vite.config.ts can import it.
 */
import { assetUrl, type TeamConfig } from './teamDefaults'

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** The live site's base path: an archived copy's base (…/v/<id>/) points back at the live root. */
export function liveBase(base: string): string {
  const b = base.replace(/\/?$/, '/')
  return b.replace(/v\/[^/]+\/$/, '')
}

/** The preview picture's address: siteUrl (the live site's full address, with or without its base path) joined with
 *  the file when that address is this build's site; a build for another place (the GitHub Pages backup under
 *  /bafinstat/ while siteUrl is still the Vercel root) keeps a path on its own host instead of a picture URL that does
 *  not exist. */
export function pictureUrl(siteUrl: string, file: string, base: string): string {
  const local = assetUrl(file, base)
  const m = /^(https?:\/\/[^/]+)(\/.*)?$/i.exec(siteUrl || '')
  if (!m) return local
  const sitePath = (m[2] ?? '').replace(/\/?$/, '/')
  if (sitePath === base) return `${m[1]}${local}`
  if (sitePath !== '/' && base === '/') return `${m[1]}${sitePath}${local.slice(1)}`
  return local
}

/** The description under a preview: the team's own, or a sentence built from its names. */
export const socialDescription = (team: Pick<TeamConfig, 'description' | 'org' | 'name'>) =>
  team.description || `${team.org}（${team.name}）的比賽紀錄、即時比分與球員數據，逐球紀錄、免費公開。`

/** The <meta> tags of a link preview (one per line). hasOgImage = the 1200×630 picture exists; without it the logo
 *  goes in a small 'summary' card. */
export function socialMeta(team: TeamConfig, base: string, { hasOgImage }: { hasOgImage: boolean }): string {
  const title = `${team.short} Stats — ${team.org}數據平台`
  const big = hasOgImage || /^https?:/.test(team.ogImage)
  const file = big ? team.ogImage : team.logo
  const image = /^https?:/.test(file) ? file : pictureUrl(team.siteUrl, file, liveBase(base))
  const tags: Array<[string, string, string]> = [
    ['name', 'description', socialDescription(team)],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', team.org],
    ['property', 'og:title', title],
    ['property', 'og:description', socialDescription(team)],
    ['property', 'og:image', image],
    ...(big ? [['property', 'og:image:width', '1200'], ['property', 'og:image:height', '630']] as Array<[string, string, string]> : []),
    ['property', 'og:image:alt', `${team.org} 隊徽`],
    ['property', 'og:locale', 'zh_TW'],
    ['name', 'twitter:card', big ? 'summary_large_image' : 'summary'],
  ]
  return tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`).join('\n    ')
}
