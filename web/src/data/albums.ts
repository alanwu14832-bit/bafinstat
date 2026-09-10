/**
 * Photo albums are links, not files: photographers keep the originals in their own Google Drive (or any
 * shared folder) and a recorder pastes the folder link here. Cloud mode stores links in the `albums` table;
 * local mode keeps them in this browser.
 */
import { deleteAlbumRow, fetchAlbums, upsertAlbum, type AlbumRow } from './supabase'
import type { Game } from './types'

export interface AlbumLink {
  id: string
  gameId?: string
  title?: string
  /** ISO date; for game albums the game's date is used when blank */
  date?: string
  url: string
  photographer?: string
  note?: string
  createdBy?: string
  updatedAt: string
}

const LOCAL_KEY = 'bafin.albums.v1'
export const readLocalAlbums = (): AlbumLink[] => { try { const v = localStorage.getItem(LOCAL_KEY); return v ? (JSON.parse(v) as AlbumLink[]) : [] } catch { return [] } }
export const writeLocalAlbums = (list: AlbumLink[]) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)) } catch { /* ignore */ } }

const fromRow = (r: AlbumRow): AlbumLink => ({ id: r.id, gameId: r.game_id ?? undefined, title: r.title ?? undefined, date: r.date ?? undefined, url: r.url, photographer: r.photographer ?? undefined, note: r.note ?? undefined, createdBy: r.created_by ?? undefined, updatedAt: r.updated_at })

/** null when the table is missing (migration not run yet). */
export async function loadCloudAlbums(): Promise<AlbumLink[] | null> { const rows = await fetchAlbums(); return rows === null ? null : rows.map(fromRow) }
export async function saveCloudAlbum(a: AlbumLink, email?: string | null): Promise<AlbumLink> {
  const row = await upsertAlbum({ id: a.id, game_id: a.gameId ?? null, title: a.title ?? null, date: a.date ?? null, url: a.url, photographer: a.photographer ?? null, note: a.note ?? null, created_by: a.createdBy ?? email ?? null })
  return fromRow(row)
}
export const deleteCloudAlbum = (id: string) => deleteAlbumRow(id)

/** What the link points at, for the small label on the card. */
export function albumProvider(url: string): string {
  try {
    const h = new URL(url).hostname
    if (h.includes('drive.google')) return 'Google Drive'
    if (h.includes('photos.google') || h.includes('photos.app.goo.gl')) return 'Google 相簿'
    if (h.includes('icloud')) return 'iCloud'
    if (h.includes('dropbox')) return 'Dropbox'
    if (h.includes('onedrive') || h.includes('1drv')) return 'OneDrive'
    if (h.includes('flickr')) return 'Flickr'
    return h.replace(/^www\./, '')
  } catch { return '連結' }
}

export const isValidAlbumUrl = (url: string) => /^https?:\/\/\S+$/i.test(url.trim())

/** Display title: the game's date and opponent, or the custom title. */
export function albumTitle(a: AlbumLink, games: Game[]): string {
  const g = a.gameId ? games.find((x) => x.id === a.gameId) : undefined
  if (g) return `${g.date} vs ${g.opponent}`
  return a.title?.trim() || '未命名相簿'
}
export function albumDate(a: AlbumLink, games: Game[]): string {
  const g = a.gameId ? games.find((x) => x.id === a.gameId) : undefined
  return g?.date ?? a.date ?? a.updatedAt.slice(0, 10)
}
