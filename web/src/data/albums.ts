/**
 * Photo albums are links, not files: photographers keep the originals in their own Google Drive (or any
 * shared folder) and a recorder pastes the folder link here. Cloud mode stores links in the `albums` table;
 * local mode keeps them in this browser.
 *
 * 比賽影片 are rows of the same table: a game's link whose title is VIDEO_TITLE (game albums never set a title
 * otherwise), or any link on a video site (isVideoUrl), so a video added as an album still shows as a video.
 * The site never embeds a player (the Content-Security-Policy has no frame-src): links open in a new tab.
 */
import { deleteAlbumRow, fetchAlbums, upsertAlbum, type AlbumRow } from './supabase'
import { ALBUMS_MIGRATION, type Game } from './types'

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
export async function saveCloudAlbum(a: AlbumLink, _email?: string | null): Promise<AlbumLink> {
  // created_by is stamped by the database with the recorder's name (this table is public)
  const row = await upsertAlbum({ id: a.id, game_id: a.gameId ?? null, title: a.title ?? null, date: a.date ?? null, url: a.url, photographer: a.photographer ?? null, note: a.note ?? null, created_by: a.createdBy ?? null })
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
    if (h === 'youtu.be' || h.endsWith('youtube.com')) return 'YouTube'
    if (h.endsWith('vimeo.com')) return 'Vimeo'
    if (h === 'fb.watch' || h.endsWith('facebook.com')) return 'Facebook'
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

/** albums.title of a game's video link (the marker that tells a video from a photo album). */
export const VIDEO_TITLE = '比賽影片'
const VIDEO_HOSTS = ['youtube.com', 'm.youtube.com', 'youtu.be', 'vimeo.com', 'fb.watch']
/** A link on a video site (YouTube, Vimeo, fb.watch). */
export function isVideoUrl(url: string): boolean {
  try {
    const h = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '')
    return VIDEO_HOSTS.some((v) => h === v || h.endsWith(`.${v}`))
  } catch { return false }
}
/** A video link: saved as 比賽影片, or pointing at a video site. */
export const isVideoLink = (a: Pick<AlbumLink, 'title' | 'url'>) => a.title === VIDEO_TITLE || isVideoUrl(a.url)
/** One game's photo albums and video links. */
export function gameMedia(albums: AlbumLink[], gameId: string): { photos: AlbumLink[]; videos: AlbumLink[] } {
  const mine = albums.filter((a) => a.gameId === gameId)
  return { photos: mine.filter((a) => !isVideoLink(a)), videos: mine.filter(isVideoLink) }
}

/** Shown to recorders while the albums table is missing (相簿 page and the game page's 照片與影片). */
export const ALBUMS_SETUP_NOTE = `相簿連結還沒開通：請管理員在 Supabase SQL Editor 執行一次 ${ALBUMS_MIGRATION}。`
