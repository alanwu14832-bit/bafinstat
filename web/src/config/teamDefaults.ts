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
  /** VITE_TEAM_TIEBREAK: 延長賽突破僵局 — the bases the rule puts runners on from the inning after regulation (WBSC:
   *  '12' 一、二壘; '2' 二壘 only; '123' 滿壘; '' = the team does not use it). Each game can still change it on 紀錄比賽. */
  tiebreak: '12' as string,
  /** VITE_TEAM_SEED: '0' starts empty instead of with BaFiN's recorded games (every other team). */
  seed: true,
  /** VITE_TEAM_FILE_PREFIX: start of downloaded backup file names. */
  filePrefix: 'BAFIN',
  /** VITE_TEAM_ACCENT / _DARK: the team colour used for emphasis (titles' stitching, the team's own bars and buttons),
   *  in light and dark mode. Text drawn on it uses VITE_TEAM_ACCENT_INK / _INK_DARK. */
  accent: '#c8811a',
  accentDark: '#e2a03a',
  accentInk: '#1a1207',
  accentInkDark: '#1a1207',
  /** 投手休息表 (no VITE_ variable: edit here, per team). MLB Pitch Smart 19–22 歲建議 — a recommendation, not a league
   *  rule, and the site never blocks a pitching change with it. tiers = [most pitches that day, rest days]; past the last
   *  tier rest `over` days (the 2017 MLB/USA Baseball update; the live table leaves out 106–120). dailyMax = most pitches
   *  in a day; maxConsecutiveDays = no 3rd day in a row; oneGamePerDay = one game a day; warnWithin = warn this many
   *  pitches before a tier / the daily max on 紀錄比賽; windowDays = how far back the rest table looks. */
  pitchRest: {
    source: 'MLB Pitch Smart 19–22 歲建議',
    tiers: [[30, 0], [45, 1], [60, 2], [80, 3], [105, 4]] as Array<[number, number]>,
    over: 5,
    dailyMax: 120,
    maxConsecutiveDays: 2,
    oneGamePerDay: true,
    warnWithin: 5,
    windowDays: 30,
  },
}

export type TeamConfig = typeof TEAM_DEFAULTS

/** Merge VITE_TEAM_* values over the defaults; blank values are ignored. */
export function resolveTeam(env: Record<string, string | boolean | undefined>): TeamConfig {
  const str = (key: string, fallback: string) => {
    const v = env[key]
    return typeof v === 'string' && v.trim() ? v.trim() : fallback
  }
  // only #rgb / #rrggbb: the value is written into a <style> tag
  const color = (key: string, fallback: string) => { const v = str(key, ''); return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : fallback }
  const innings = Number(env.VITE_TEAM_INNINGS)
  const seed = str('VITE_TEAM_SEED', '')
  const tb = str('VITE_TEAM_TIEBREAK', '').toLowerCase()
  const tiebreak = ['2', '12', '123'].includes(tb) ? tb : ['0', 'off', 'false', 'no'].includes(tb) ? '' : TEAM_DEFAULTS.tiebreak
  return {
    name: str('VITE_TEAM_NAME', TEAM_DEFAULTS.name),
    org: str('VITE_TEAM_ORG', TEAM_DEFAULTS.org),
    short: str('VITE_TEAM_SHORT', TEAM_DEFAULTS.short),
    monogram: str('VITE_TEAM_MONOGRAM', TEAM_DEFAULTS.monogram),
    mark: str('VITE_TEAM_MARK', TEAM_DEFAULTS.mark),
    logo: str('VITE_TEAM_LOGO', TEAM_DEFAULTS.logo),
    innings: Number.isInteger(innings) && innings >= 1 && innings <= 12 ? innings : TEAM_DEFAULTS.innings,
    tiebreak,
    seed: seed ? !['0', 'false', 'no', 'off'].includes(seed.toLowerCase()) : TEAM_DEFAULTS.seed,
    filePrefix: str('VITE_TEAM_FILE_PREFIX', TEAM_DEFAULTS.filePrefix),
    accent: color('VITE_TEAM_ACCENT', TEAM_DEFAULTS.accent),
    accentDark: color('VITE_TEAM_ACCENT_DARK', TEAM_DEFAULTS.accentDark),
    accentInk: color('VITE_TEAM_ACCENT_INK', TEAM_DEFAULTS.accentInk),
    accentInkDark: color('VITE_TEAM_ACCENT_INK_DARK', TEAM_DEFAULTS.accentInkDark),
    pitchRest: TEAM_DEFAULTS.pitchRest,
  }
}

/** The team colour as CSS variables: :root for light mode, dark mode the same way tokens.css switches. `html:root` outranks
 *  tokens.css's `:root`, whichever stylesheet loads last. */
export function accentCss(t: TeamConfig): string {
  const vars = (accent: string, ink: string) => `--accent:${accent};--accent-ink:${ink};`
  const dark = vars(t.accentDark, t.accentInkDark)
  // the scoreboard surfaces are dark in either theme: they always take the dark-mode pair
  const board = `--accent-board:${t.accentDark};--accent-board-ink:${t.accentInkDark};`
  return `html:root{${vars(t.accent, t.accentInk)}${board}}@media (prefers-color-scheme: dark){html:root:not([data-theme="light"]){${dark}}}html:root[data-theme="dark"]{${dark}}`
}

/** A file in web/public (resolved against the site's base path) or an absolute URL, as is. */
export function assetUrl(path: string, base = '/'): string {
  return /^(https?:|data:)/.test(path) ? path : `${base.replace(/\/?$/, '/')}${path.replace(/^\//, '')}`
}
