/**
 * 自動去背 for the 限時動態 front photo: the photo is drawn at 1024 × 1024, a worker (lib/cutout.worker.ts) works out a
 * mask on this device, and the mask cuts the photo (made at most 2048 px on its longer side), cropped to what is left.
 * Nothing is uploaded. The first run downloads the runtime (~11 MB) and the model (~44 MB); later runs use the cache.
 */
import { alphaBounds, fitWithin, refineAlpha, toAlpha } from './cutoutMath'
import type { CutoutReply } from './cutout.worker'

const SIZE = 1024
type Photo = CanvasImageSource & { width: number; height: number }
export type CutoutProgress = { stage: 'download'; loaded: number; total: number } | { stage: 'prepare' } | { stage: 'run' }

let worker: Worker | null = null
let next = 1
const getWorker = () => (worker ??= new Worker(new URL('./cutout.worker.ts', import.meta.url), { type: 'module' }))

/** Whether this browser can run it at all (a module worker and WebAssembly). */
export function canCutout(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')
  if (!g) throw new Error('這台裝置畫不出圖片')
  return { c, g }
}

/** A cut-out: the photo with its background removed, cropped to what is left, and the mask it was cut with (the photo's
 *  size within 2048 px, white where the subject is) — the 手動修邊 brush paints on that mask and cuts again (cutWith). */
export interface Cutout { cut: HTMLCanvasElement; mask: HTMLCanvasElement }

/** The photo cut by a mask (stretched over it), cropped to what is left; null when nothing is left. */
export function cutWith(img: Photo, mask: HTMLCanvasElement): HTMLCanvasElement | null {
  const w = mask.width, h = mask.height
  const cut = canvas(w, h)
  cut.g.drawImage(img, 0, 0, w, h)
  cut.g.globalCompositeOperation = 'destination-in'
  cut.g.drawImage(mask, 0, 0)
  // crop to what is left, so the front photo's frame hugs the subject
  const b = alphaBounds(cut.g.getImageData(0, 0, w, h).data, w, h, 24, 8)
  if (!b) return null
  const out = canvas(b.w, b.h)
  out.g.drawImage(cut.c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h)
  return out.c
}

/** The photo with its background removed (and its mask), or an error with a reason to show. */
export async function removeBackground(img: Photo, onProgress?: (p: CutoutProgress) => void): Promise<Cutout> {
  const small = canvas(SIZE, SIZE)
  small.g.drawImage(img, 0, 0, SIZE, SIZE)
  const rgba = small.g.getImageData(0, 0, SIZE, SIZE).data
  const id = next++
  const w = getWorker()
  const raw = await new Promise<Float32Array>((done, fail) => {
    const on = (e: MessageEvent<CutoutReply>) => {
      const m = e.data
      if (m.id !== id) return
      if (m.type === 'progress') onProgress?.(m.stage === 'download' ? { stage: 'download', loaded: m.loaded ?? 0, total: m.total ?? 0 } : { stage: m.stage })
      else { w.removeEventListener('message', on); w.removeEventListener('error', err); if (m.type === 'done') done(m.mask); else fail(new Error(m.message)) }
    }
    const err = (e: ErrorEvent) => { w.removeEventListener('message', on); w.removeEventListener('error', err); worker = null; fail(new Error(e.message || '去背工具載入失敗')) }
    w.addEventListener('message', on); w.addEventListener('error', err)
    w.postMessage({ id, rgba }, [rgba.buffer])
  })
  const stretched = toAlpha(raw)
  if (!stretched) throw new Error('這張照片找不到可以留下的主體')
  // the haze, the scraps of background and the small holes cleaned up (cutoutMath refineAlpha)
  const alpha = refineAlpha(stretched, SIZE, SIZE)
  // the mask as a picture, stretched back over the photo
  const m = canvas(SIZE, SIZE), md = m.g.createImageData(SIZE, SIZE)
  for (let i = 0; i < alpha.length; i++) { md.data[i * 4] = 255; md.data[i * 4 + 1] = 255; md.data[i * 4 + 2] = 255; md.data[i * 4 + 3] = alpha[i] }
  m.g.putImageData(md, 0, 0)
  const size = fitWithin(img.width, img.height, 2048)
  const mask = canvas(size.w, size.h)
  mask.g.imageSmoothingQuality = 'high'
  mask.g.drawImage(m.c, 0, 0, size.w, size.h)
  const cut = cutWith(img, mask.c)
  if (!cut) throw new Error('這張照片找不到可以留下的主體')
  return { cut, mask: mask.c }
}
