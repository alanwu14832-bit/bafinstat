/**
 * Full addresses of pages on the live site, for text people paste elsewhere (the 分享 text of a game).
 * An archived copy (/v/<id>/) links to the live site, not to itself; the single-file build uses hash routes.
 */
import { LIVE_BASE } from '../config/archive'

/** `path` without a leading slash ('games/G1'); `base` the live site's base path ('/'). */
export function buildSiteUrl(loc: { origin: string; pathname: string }, base: string, hash: boolean, path: string): string {
  const p = path.replace(/^\/+/, '')
  if (hash) return `${loc.origin}${loc.pathname}#/${p}`
  return `${loc.origin}${base.endsWith('/') ? base : `${base}/`}${p}`
}

/** This site's address of `path` (see buildSiteUrl). */
export function siteUrl(path: string): string {
  const loc = typeof window !== 'undefined' ? window.location : { origin: '', pathname: '/' }
  return buildSiteUrl(loc, LIVE_BASE, import.meta.env.VITE_ROUTER === 'hash', path)
}
