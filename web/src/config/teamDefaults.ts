/**
 * What makes a deployment one team's site. Each deployment overrides these with VITE_TEAM_* environment
 * variables in its host (Vercel / Cloudflare Pages); anything unset keeps these values, which are BaFiN's.
 * Plain data with no import.meta, so vite.config.ts can read it too (page title, home-screen manifest).
 * See docs/NEW_TEAM.md for setting up another team.
 */
export const TEAM_DEFAULTS = {
  /** VITE_TEAM_NAME: the team's name as written in games and workbooks — how "us" is told from the opponent. */
  name: '喝FIN就好BA',
  /** VITE_TEAM_ORG: the organization, the sidebar title and the home-screen app name. */
  org: '台大工管財金系棒',
  /** VITE_TEAM_SHORT: short name for the sidebar subtitle, the tab title and the home-screen label. */
  short: 'NTU BaFiN',
  /** VITE_TEAM_MONOGRAM: letter shown when there is no mark image. */
  monogram: 'B',
  /** VITE_TEAM_MARK: square mark (sidebar, tab icon, home screen): a file in web/public or a full URL. */
  mark: 'mark.png',
  /** VITE_TEAM_LOGO: full logo on the guide page: a file in web/public or a full URL. */
  logo: 'logo.png',
  /** VITE_TEAM_INNINGS: regulation innings; ERA and new games default to it. */
  innings: 7,
  /** VITE_TEAM_SEED: '0' starts empty instead of with BaFiN's recorded games (every other team). */
  seed: true,
  /** VITE_TEAM_FILE_PREFIX: start of downloaded backup file names. */
  filePrefix: 'BAFIN',
}

export type TeamConfig = typeof TEAM_DEFAULTS

/** Merge VITE_TEAM_* values over the defaults; blank values are ignored. */
export function resolveTeam(env: Record<string, string | boolean | undefined>): TeamConfig {
  const str = (key: string, fallback: string) => {
    const v = env[key]
    return typeof v === 'string' && v.trim() ? v.trim() : fallback
  }
  const innings = Number(env.VITE_TEAM_INNINGS)
  const seed = str('VITE_TEAM_SEED', '')
  return {
    name: str('VITE_TEAM_NAME', TEAM_DEFAULTS.name),
    org: str('VITE_TEAM_ORG', TEAM_DEFAULTS.org),
    short: str('VITE_TEAM_SHORT', TEAM_DEFAULTS.short),
    monogram: str('VITE_TEAM_MONOGRAM', TEAM_DEFAULTS.monogram),
    mark: str('VITE_TEAM_MARK', TEAM_DEFAULTS.mark),
    logo: str('VITE_TEAM_LOGO', TEAM_DEFAULTS.logo),
    innings: Number.isInteger(innings) && innings >= 1 && innings <= 12 ? innings : TEAM_DEFAULTS.innings,
    seed: seed ? !['0', 'false', 'no', 'off'].includes(seed.toLowerCase()) : TEAM_DEFAULTS.seed,
    filePrefix: str('VITE_TEAM_FILE_PREFIX', TEAM_DEFAULTS.filePrefix),
  }
}

/** A file in web/public (resolved against the site's base path) or an absolute URL, as is. */
export function assetUrl(path: string, base = '/'): string {
  return /^(https?:|data:)/.test(path) ? path : `${base.replace(/\/?$/, '/')}${path.replace(/^\//, '')}`
}
