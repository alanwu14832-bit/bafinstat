/**
 * 網站版本: every version that goes live is also built as a read-only copy at /v/<id>/ (see web/scripts/archive.mjs
 * and the 保存這一版 step of .github/workflows/auto-deploy.yml). In such a copy ARCHIVE says which version it is:
 * nobody signs in there and nothing can be recorded or uploaded — it is for looking at an older site.
 */
const id = import.meta.env.VITE_ARCHIVE_ID as string | undefined

export const ARCHIVE: { id: string; date: string; note: string } | null = id
  ? { id, date: (import.meta.env.VITE_ARCHIVE_DATE as string | undefined) ?? '', note: (import.meta.env.VITE_ARCHIVE_NOTE as string | undefined) ?? '' }
  : null

/** The live site, from inside a copy at <base>v/<id>/ (or this site's own base when it is the live one). */
export const LIVE_BASE = import.meta.env.BASE_URL.replace(/v\/[^/]+\/$/, '')

/** One saved version, as listed in <base>v/versions.json. */
export interface SiteVersion { id: string; date: string; sha: string; note: string }
