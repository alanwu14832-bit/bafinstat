/**
 * Team photo albums on Supabase Storage. Photographers upload from the browser; the file is resized here
 * before it leaves the phone (2048px "web" copy + 480px thumbnail) so a season fits the free tier and the
 * gallery loads fast. Everyone can browse and download; nothing here requires a login except uploading.
 */
import { supabase } from './supabase'

export interface Photo {
  id: string
  album: string
  album_key: string
  game_id: string | null
  path: string
  thumb_path: string
  width: number | null
  height: number | null
  size_bytes: number | null
  caption: string | null
  uploaded_by: string | null
  created_at: string
}

export const BUCKET = 'photos'
export const WEB_EDGE = 2048
export const THUMB_EDGE = 480

export function photoUrl(path: string): string { return supabase().storage.from(BUCKET).getPublicUrl(path).data.publicUrl }
/** Public URL that the browser saves instead of opening (Supabase honours ?download=<name>). */
export function downloadUrl(p: Photo): string { return `${photoUrl(p.path)}?download=${encodeURIComponent(fileName(p))}` }
export function fileName(p: Photo): string { return `${p.album_key}_${p.created_at.slice(0, 10)}_${p.id.slice(0, 8)}.jpg` }

/** Album folder name: game id as is, anything else slugged to safe characters. */
export function albumKey(name: string): string {
  const t = name.trim()
  if (/^G\d{8}-\d{2}$/.test(t)) return t
  return t.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'album'
}

export async function listPhotos(): Promise<Photo[] | null> {
  const { data, error } = await supabase().from('photos').select('*').order('created_at', { ascending: false }).limit(3000)
  if (error) { if (error.code === '42P01' || /photos/.test(error.message)) return null; throw new Error(error.message) }
  return (data ?? []) as Photo[]
}

export async function fetchIsPhotographer(email: string | undefined | null): Promise<boolean> {
  if (!email) return false
  const { data, error } = await supabase().from('photographers').select('email').eq('email', email.toLowerCase()).limit(1)
  if (error) return false
  return (data ?? []).length > 0
}

/** Draw an image file onto a canvas no larger than `edge` on its long side; returns a JPEG blob. */
async function resize(file: File, edge: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('讀不了這張圖片')); i.src = url })
    const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight))
    const width = Math.max(1, Math.round(img.naturalWidth * scale)), height = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('瀏覽器不支援縮圖')
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
    if (!blob) throw new Error('轉檔失敗')
    return { blob, width, height }
  } finally { URL.revokeObjectURL(url) }
}

export interface UploadTarget { album: string; gameId: string | null }

/** Resize, upload both copies, then register the row. Throws with a readable message. */
export async function uploadPhoto(file: File, target: UploadTarget, email: string | null | undefined, onStage?: (stage: string) => void): Promise<Photo> {
  onStage?.('縮圖中')
  const [web, thumb] = await Promise.all([resize(file, WEB_EDGE, 0.85), resize(file, THUMB_EDGE, 0.8)])
  const key = albumKey(target.gameId ?? target.album)
  const id = crypto.randomUUID()
  const path = `${key}/${id}.jpg`, thumbPath = `${key}/thumb/${id}.jpg`
  const store = supabase().storage.from(BUCKET)
  onStage?.('上傳中')
  const up1 = await store.upload(path, web.blob, { contentType: 'image/jpeg', upsert: false })
  if (up1.error) throw new Error(up1.error.message.includes('row-level security') ? '你的帳號沒有上傳權限（不在攝影師或紀錄員名單）' : up1.error.message)
  const up2 = await store.upload(thumbPath, thumb.blob, { contentType: 'image/jpeg', upsert: false })
  if (up2.error) { await store.remove([path]); throw new Error(up2.error.message) }
  const row = { album: target.album.trim(), album_key: key, game_id: target.gameId, path, thumb_path: thumbPath, width: web.width, height: web.height, size_bytes: web.blob.size, uploaded_by: email ?? null }
  const { data, error } = await supabase().from('photos').insert(row).select('*').single()
  if (error) { await store.remove([path, thumbPath]); throw new Error(error.message) }
  return data as Photo
}

export async function deletePhoto(p: Photo): Promise<void> {
  const { error } = await supabase().from('photos').delete().eq('id', p.id)
  if (error) throw new Error(error.message)
  await supabase().storage.from(BUCKET).remove([p.path, p.thumb_path])
}

export async function setCaption(id: string, caption: string): Promise<void> {
  const { error } = await supabase().from('photos').update({ caption: caption || null }).eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------- zip (store-only; JPEGs do not compress)
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
function crc32(buf: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function dosTime(d: Date) { return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() } }

/** Bundle already-downloaded files into a .zip Blob without compression. */
export function makeZip(files: Array<{ name: string; data: Uint8Array }>): Blob {
  return new Blob([zipBytes(files) as BlobPart], { type: 'application/zip' })
}
/** The raw zip archive (local headers, central directory, end record). */
export function zipBytes(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const { time, date } = dosTime(new Date())
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true)
    local.setUint16(10, time, true); local.setUint16(12, date, true); local.setUint32(14, crc, true); local.setUint32(18, f.data.length, true); local.setUint32(22, f.data.length, true)
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true)
    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true)
    cd.setUint16(12, time, true); cd.setUint16(14, date, true); cd.setUint32(16, crc, true); cd.setUint32(20, f.data.length, true); cd.setUint32(24, f.data.length, true)
    cd.setUint16(28, name.length, true); cd.setUint16(30, 0, true); cd.setUint16(32, 0, true); cd.setUint16(34, 0, true); cd.setUint16(36, 0, true); cd.setUint32(38, 0, true); cd.setUint32(42, offset, true)
    parts.push(new Uint8Array(local.buffer), name, f.data)
    central.push(new Uint8Array(cd.buffer), name)
    offset += 30 + name.length + f.data.length
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true)
  const chunks = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0))
  let pos = 0
  for (const c of chunks) { out.set(c, pos); pos += c.length }
  return out
}

/** Fetch each photo's web copy and hand the browser one zip. Reports progress 0..1. */
export async function downloadZip(photos: Photo[], zipName: string, onProgress?: (done: number, total: number) => void): Promise<void> {
  const files: Array<{ name: string; data: Uint8Array }> = []
  let done = 0
  for (const p of photos) {
    const res = await fetch(photoUrl(p.path))
    if (!res.ok) throw new Error(`下載失敗：${fileName(p)}`)
    files.push({ name: fileName(p), data: new Uint8Array(await res.arrayBuffer()) })
    onProgress?.(++done, photos.length)
  }
  const blob = makeZip(files)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = zipName; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
