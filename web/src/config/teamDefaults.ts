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
  /** VITE_TEAM_SEASON_START: the month a 「季」 starts (1–12). 1 = calendar year (「2026 年」, the default); 8 = 學年度,
   *  August to July (「115 學年」). 紀錄簿, 生涯逐季, 逐季戰績, the filter bar's season button and 上一季 follow it;
   *  報名名單 always use calendar years. */
  seasonStart: 1,
  /** VITE_TEAM_SEED: '0' starts empty instead of with BaFiN's recorded games (every other team). */
  seed: true,
  /** VITE_TEAM_FILE_PREFIX: start of downloaded backup file names. */
  filePrefix: 'BAFIN',
  /** VITE_TEAM_ACCENT / _DARK: the team colour used for emphasis (titles' stitching, the team's own bars and buttons),
   *  in light and dark mode. Text drawn on it uses VITE_TEAM_ACCENT_INK / _INK_DARK. */
  accent: '#c8811a',
  accentDark: '#e2a03a',
  accentInk: '#1a1207',
  /** VITE_TEAM_ACCENT_TEXT: the team colour as small text on the light background (≥ 4.5:1, WCAG AA); the accent itself
   *  when it is dark enough. Dark mode uses VITE_TEAM_ACCENT_DARK. (2026-11-27 audit: the 系隊's amber was 3.2:1 as text.) */
  accentText: '#9a5f0c',
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
  /** VITE_TEAM_SITE_URL: the site's full address (http(s), no trailing /; include the path when the site lives under
   *  one, e.g. https://x.github.io/bafinstat), so link previews (LINE, Facebook…) get an absolute picture URL. A build
   *  whose base path differs from it keeps a relative picture. Set it after moving to your own domain. */
  siteUrl: 'https://bafinstat.vercel.app',
  /** VITE_TEAM_OPEN_STATS (1 / 0): the 球員 pages (打擊, 投球, 守備, 球員, 相簿, the full 總覽) are open to everyone, no
   *  account needed; only 紀錄員 and 管理者 sign in. 系隊 chose this on 2026-11-17; with 0 those pages need a 球員 account. */
  openStats: true,
  /** VITE_TEAM_QUAL_RULE (team / college): the 排行門檻 a leaderboard opens with — 隊內 (PA ≥ 1) or 規定打席 (大專規程: PA ≥
   *  2.1 × 球隊場數, IP ≥ 1 × 場數; data/qualify.ts). The viewer can still switch. 規定打席 since 2026-11-27 (the user's call:
   *  總覽, 打擊, 投球 and 球員 had named different leaders — one with 3 at bats). */
  qualRule: 'college' as 'team' | 'college',
  /** VITE_TEAM_OG_IMAGE: the 1200×630 link-preview picture: a file in web/public or a full URL. Without the file the
   *  build uses the logo and a small preview card. */
  ogImage: 'og.png',
  /** VITE_TEAM_DESCRIPTION: the text under link previews; '' = 「{org}（{name}）的比賽紀錄、即時比分與球員數據…」. */
  description: '',
  /** VITE_TEAM_HERO_PHOTO: the team photo behind 總覽's opening (開場形象區): a file in web/public or a full URL. A wide
   *  picture, about 2000 × 1100, under 400 KB. While the file is not there the opening uses the drawn backdrop
   *  (components/ui/HeroArt.tsx), so the site works before anyone uploads a photo. */
  heroPhoto: 'hero.jpg',
  /** VITE_TEAM_HERO_PHOTO_MOBILE: an upright crop of it for phones (about 1100 × 1300); missing = the wide one, cropped. */
  heroPhotoMobile: 'hero-m.jpg',
  /** VITE_TEAM_HERO_FOCUS: the part of the photo to keep in view when it is cropped (CSS object-position, 「左右% 上下%」). */
  heroFocus: '50% 22%',
}

export type TeamConfig = typeof TEAM_DEFAULTS

/** The file (in this repo) that creates the albums table — photo albums and 比賽影片 links. The 相簿 page and a game's
 *  照片與影片 card name it when the table is missing. Each site's repo has its own (the 校隊's is supabase/schema.sql). */
export const ALBUMS_MIGRATION = 'supabase/migrations/2026-09-12_albums_schedule.sql'

/** Merge VITE_TEAM_* values over the defaults; blank values are ignored. */
export function resolveTeam(env: Record<string, string | boolean | undefined>): TeamConfig {
  const str = (key: string, fallback: string) => {
    const v = env[key]
    return typeof v === 'string' && v.trim() ? v.trim() : fallback
  }
  // only #rgb / #rrggbb: the value is written into a <style> tag
  const color = (key: string, fallback: string) => { const v = str(key, ''); return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : fallback }
  const innings = Number(env.VITE_TEAM_INNINGS)
  const accent = color('VITE_TEAM_ACCENT', TEAM_DEFAULTS.accent)
  const seed = str('VITE_TEAM_SEED', '')
  const tb = str('VITE_TEAM_TIEBREAK', '').toLowerCase()
  const tiebreak = ['2', '12', '123'].includes(tb) ? tb : ['0', 'off', 'false', 'no'].includes(tb) ? '' : TEAM_DEFAULTS.tiebreak
  const seasonStart = Number(str('VITE_TEAM_SEASON_START', ''))
  const qual = str('VITE_TEAM_QUAL_RULE', '')
  const open = str('VITE_TEAM_OPEN_STATS', '')
  return {
    name: str('VITE_TEAM_NAME', TEAM_DEFAULTS.name),
    org: str('VITE_TEAM_ORG', TEAM_DEFAULTS.org),
    short: str('VITE_TEAM_SHORT', TEAM_DEFAULTS.short),
    monogram: str('VITE_TEAM_MONOGRAM', TEAM_DEFAULTS.monogram),
    mark: str('VITE_TEAM_MARK', TEAM_DEFAULTS.mark),
    logo: str('VITE_TEAM_LOGO', TEAM_DEFAULTS.logo),
    innings: Number.isInteger(innings) && innings >= 1 && innings <= 12 ? innings : TEAM_DEFAULTS.innings,
    tiebreak,
    seasonStart: Number.isInteger(seasonStart) && seasonStart >= 1 && seasonStart <= 12 ? seasonStart : TEAM_DEFAULTS.seasonStart,
    seed: seed ? !['0', 'false', 'no', 'off'].includes(seed.toLowerCase()) : TEAM_DEFAULTS.seed,
    filePrefix: str('VITE_TEAM_FILE_PREFIX', TEAM_DEFAULTS.filePrefix),
    accent,
    // (a team that sets its own accent but no text colour gets the accent as text)
    accentText: color('VITE_TEAM_ACCENT_TEXT', accent === TEAM_DEFAULTS.accent ? TEAM_DEFAULTS.accentText : accent),
    accentDark: color('VITE_TEAM_ACCENT_DARK', TEAM_DEFAULTS.accentDark),
    accentInk: color('VITE_TEAM_ACCENT_INK', TEAM_DEFAULTS.accentInk),
    accentInkDark: color('VITE_TEAM_ACCENT_INK_DARK', TEAM_DEFAULTS.accentInkDark),
    pitchRest: TEAM_DEFAULTS.pitchRest,
    siteUrl: siteUrl(str('VITE_TEAM_SITE_URL', '')) ?? TEAM_DEFAULTS.siteUrl,
    openStats: open ? !['0', 'false', 'no', 'off'].includes(open.toLowerCase()) : TEAM_DEFAULTS.openStats,
    qualRule: qual === 'college' || qual === 'team' ? qual : TEAM_DEFAULTS.qualRule,
    ogImage: str('VITE_TEAM_OG_IMAGE', TEAM_DEFAULTS.ogImage),
    description: str('VITE_TEAM_DESCRIPTION', TEAM_DEFAULTS.description),
    heroPhoto: str('VITE_TEAM_HERO_PHOTO', TEAM_DEFAULTS.heroPhoto),
    heroPhotoMobile: str('VITE_TEAM_HERO_PHOTO_MOBILE', TEAM_DEFAULTS.heroPhotoMobile),
    // only 「50% 35%」-style values: it is written into a style attribute
    heroFocus: /^\d{1,3}% \d{1,3}%$/.test(str('VITE_TEAM_HERO_FOCUS', '')) ? str('VITE_TEAM_HERO_FOCUS', '') : TEAM_DEFAULTS.heroFocus,
  }
}

/** An http(s) address without its trailing slash, or null for anything else (javascript:, a bare host…). */
function siteUrl(v: string): string | null {
  return /^https?:\/\/[^\s"'<>]+$/i.test(v) ? v.replace(/\/+$/, '') : null
}

/** The team colour as CSS variables: :root for light mode, dark mode the same way tokens.css switches. `html:root` outranks
 *  tokens.css's `:root`, whichever stylesheet loads last. */
export function accentCss(t: TeamConfig): string {
  const vars = (accent: string, ink: string, text: string) => `--accent:${accent};--accent-ink:${ink};--accent-text:${text};`
  const dark = vars(t.accentDark, t.accentInkDark, t.accentDark)
  // the scoreboard surfaces are dark in either theme: they always take the dark-mode pair
  const board = `--accent-board:${t.accentDark};--accent-board-ink:${t.accentInkDark};`
  return `html:root{${vars(t.accent, t.accentInk, t.accentText)}${board}}@media (prefers-color-scheme: dark){html:root:not([data-theme="light"]){${dark}}}html:root[data-theme="dark"]{${dark}}`
}

/** A file in web/public (resolved against the site's base path) or an absolute URL, as is. */
export function assetUrl(path: string, base = '/'): string {
  return /^(https?:|data:)/.test(path) ? path : `${base.replace(/\/?$/, '/')}${path.replace(/^\//, '')}`
}
