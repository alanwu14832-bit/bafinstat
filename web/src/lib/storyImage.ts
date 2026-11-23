/**
 * 限時動態 card on a canvas, 1080 × 1920 (an Instagram story). Instagram covers the top ~250 px (the account row) and
 * the bottom ~340 px (the reply bar), so everything that must be read sits between them; the photo and the background
 * run under both. The photo never leaves the device: it is only drawn here.
 */
import type { StoryCard } from '../data/storyCard'
import { BG, FIG, INK, LINE, MUTED, SANS, text, wrap } from './shareImage'
import { TEAM } from '../config/team'

export const STORY_W = 1080, STORY_H = 1920
/** what Instagram's own interface covers */
export const SAFE_TOP = 250, SAFE_BOTTOM = 340
/** the photo's frame (the top of the card; it fades into the board below) */
const PHOTO_H = 1040
const PAD = 72

/** Where the reader put the photo: fx / fy = which part shows (0 = left / top edge, 1 = right / bottom), zoom ≥ 1. */
export interface PhotoView { fx: number; fy: number; zoom: number }
export const DEFAULT_VIEW: PhotoView = { fx: 0.5, fy: 0.3, zoom: 1 }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The photo's rectangle on the card: it always covers the frame (STORY_W × PHOTO_H). */
export function photoRect(pw: number, ph: number, view: PhotoView): { x: number; y: number; w: number; h: number } {
  const s = Math.max(STORY_W / pw, PHOTO_H / ph) * clamp(view.zoom, 1, 4)
  const w = pw * s, h = ph * s
  return { x: (STORY_W - w) * clamp(view.fx, 0, 1), y: (PHOTO_H - h) * clamp(view.fy, 0, 1), w, h }
}
/** The view after dragging the photo by (dx, dy) card pixels: it follows the finger and stops at its edges. */
export function panView(view: PhotoView, dx: number, dy: number, pw: number, ph: number): PhotoView {
  const r = photoRect(pw, ph, view)
  const sx = r.w - STORY_W, sy = r.h - PHOTO_H
  return { ...view, fx: sx > 0.5 ? clamp(view.fx - dx / sx, 0, 1) : view.fx, fy: sy > 0.5 ? clamp(view.fy - dy / sy, 0, 1) : view.fy }
}

type Photo = CanvasImageSource & { width: number; height: number }
export interface StoryDraw { photo?: Photo | null; view?: PhotoView; mark?: Photo | null }
/** A #rrggbb colour at an opacity (anything else is returned as it is). */
const alpha = (hex: string, a: number) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; const n = parseInt(m[1], 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})` }

function chip(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  if (typeof g.roundRect === 'function') g.roundRect(x, y, w, h, r)
  else g.rect(x, y, w, h)
}

/** Draws `card` on `c` (sized to 1080 × 1920 here). Returns false where there is no canvas to draw on. */
export function drawStory(c: HTMLCanvasElement, card: StoryCard, opts: StoryDraw = {}): boolean {
  c.width = STORY_W; c.height = STORY_H
  const g = c.getContext('2d')
  if (!g) return false
  // the card is a dark surface whatever the reader's theme: the team's colour for dark mode
  const acc = TEAM.accentDark, W = STORY_W, H = STORY_H
  g.fillStyle = BG; g.fillRect(0, 0, W, H)
  const dotsFrom = (top: number) => { g.fillStyle = 'rgba(255,255,255,0.035)'; for (let y = top + 2; y < H; y += 8) for (let x = 2; x < W; x += 8) g.fillRect(x, y, 2, 2) }

  if (opts.photo) {
    const r = photoRect(opts.photo.width, opts.photo.height, opts.view ?? DEFAULT_VIEW)
    g.save(); g.beginPath(); g.rect(0, 0, W, PHOTO_H); g.clip()
    g.drawImage(opts.photo, r.x, r.y, r.w, r.h)
    g.restore()
    // the header reads over the photo; the photo fades into the board
    const top = g.createLinearGradient(0, 0, 0, 500); top.addColorStop(0, alpha(BG, 0.74)); top.addColorStop(0.55, alpha(BG, 0.42)); top.addColorStop(1, alpha(BG, 0))
    g.fillStyle = top; g.fillRect(0, 0, W, 500)
    const fade = g.createLinearGradient(0, 660, 0, PHOTO_H); fade.addColorStop(0, alpha(BG, 0)); fade.addColorStop(0.62, alpha(BG, 0.82)); fade.addColorStop(1, BG)
    g.fillStyle = fade; g.fillRect(0, 660, W, PHOTO_H - 660 + 2)
    dotsFrom(PHOTO_H)
  } else {
    dotsFrom(0)
    const glow = g.createRadialGradient(W / 2, 520, 0, W / 2, 520, 760)
    glow.addColorStop(0, alpha(acc, 0.26)); glow.addColorStop(1, alpha(acc, 0))
    g.fillStyle = glow; g.fillRect(0, 0, W, 1300)
    // no photo: the jersey number (or the family name) fills the frame
    const big = card.number ?? card.name.slice(0, 1)
    g.save(); g.globalAlpha = 0.2
    text(g, big, W / 2, 860, card.number ? 620 : 480, acc, { align: 'center', font: card.number ? FIG : SANS, weight: 800, max: W - 120 })
    g.restore()
  }

  // ---- header (below Instagram's account row)
  g.save(); if (opts.photo) { g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 14 }
  let tx = PAD
  if (opts.mark) {
    g.save(); g.shadowColor = 'transparent'; g.fillStyle = '#ffffff'; chip(g, PAD, SAFE_TOP + 6, 52, 52, 12); g.fill()
    g.drawImage(opts.mark, PAD + 4, SAFE_TOP + 10, 44, 44); g.restore()
    tx = PAD + 68
  }
  text(g, card.team, tx, SAFE_TOP + 44, 30, acc, { weight: 700, max: 520 })
  if (card.result) {
    g.font = `800 34px ${SANS}`
    const w = g.measureText(card.result.text).width + 44
    g.save(); g.shadowColor = 'transparent'
    chip(g, W - PAD - w, SAFE_TOP + 4, w, 56, 28)
    if (card.result.win) { g.fillStyle = acc; g.fill() } else { g.fillStyle = alpha(BG, 0.55); g.fill(); g.strokeStyle = alpha(INK, 0.5); g.lineWidth = 2; g.stroke() }
    text(g, card.result.text, W - PAD - w / 2, SAFE_TOP + 44, 34, card.result.win ? BG : INK, { align: 'center', weight: 800 })
    g.restore()
  }
  text(g, card.title, PAD, SAFE_TOP + 138, 68, INK, { weight: 800, max: W - PAD * 2 })
  text(g, card.sub, PAD, SAFE_TOP + 190, 30, opts.photo ? INK : MUTED, { weight: 500, max: W - PAD * 2 })

  // ---- who
  let nx = PAD
  if (card.number) {
    g.font = `800 150px ${FIG}`
    const w = g.measureText(card.number).width
    text(g, card.number, PAD, 1012, 150, acc, { font: FIG, weight: 800 })
    nx = PAD + w + 30
  }
  text(g, card.name, nx, 974, 88, INK, { weight: 800, max: W - PAD - nx })
  text(g, card.role, nx + 4, 1024, 30, opts.photo ? INK : MUTED, { weight: 500, max: W - PAD - nx })
  g.restore()

  // ---- the numbers
  g.fillStyle = acc; g.fillRect(PAD, 1068, 96, 6)
  const col = (W - PAD * 2) / 3
  card.big.slice(0, 3).forEach((b, i) => {
    const x = PAD + i * col
    text(g, b.label, x, 1132, 28, MUTED, { weight: 600 })
    text(g, b.value, x, 1262, 136, i === 0 ? acc : INK, { font: FIG, weight: 800, max: col - 28 })
  })
  let y = 1262
  const small = card.small.slice(0, 4)
  if (small.length) {
    y = 1336
    const sw = (W - PAD * 2) / 4
    small.forEach((b, i) => {
      const x = PAD + i * sw
      g.font = `700 44px ${FIG}`
      const vw = Math.min(g.measureText(b.value).width, sw - 90)
      text(g, b.value, x, y, 44, INK, { font: FIG, weight: 700, max: sw - 90 })
      text(g, b.label, x + vw + 10, y - 3, 24, MUTED, { weight: 500, max: sw - vw - 22 })
    })
  }
  if (card.bar) {
    const total = card.bar.strikes + card.bar.balls, share = total ? card.bar.strikes / total : 0
    y += 30
    g.fillStyle = alpha(INK, 0.2); chip(g, PAD, y, W - PAD * 2, 12, 6); g.fill()
    g.fillStyle = acc; chip(g, PAD, y, (W - PAD * 2) * share, 12, 6); g.fill()
    y += 46
    text(g, `好球率 ${Math.round(share * 100)}%`, PAD, y, 26, INK, { weight: 600 })
    text(g, `${card.bar.strikes} 好球・${card.bar.balls} 壞球`, W - PAD, y, 24, MUTED, { align: 'right', weight: 500 })
  }

  // ---- the sentence (two lines at most), then the season line above Instagram's reply bar
  const bottom = H - SAFE_BOTTOM
  const lines = wrap(g, card.headline.trim(), W - PAD * 2 - 26, 38).slice(0, 2)
  if (lines.length) {
    const top = Math.min(y + 34, bottom - 62 - lines.length * 50)
    g.fillStyle = acc; g.fillRect(PAD, top, 6, lines.length * 50 - 8)
    lines.forEach((ln, i) => text(g, ln, PAD + 26, top + 36 + i * 50, 38, INK, { weight: 600, max: W - PAD * 2 - 26 }))
  }
  g.fillStyle = LINE; g.fillRect(PAD, bottom - 50, W - PAD * 2, 2)
  g.font = `500 24px ${SANS}`
  const siteW = g.measureText(card.site).width
  text(g, card.site, W - PAD, bottom - 12, 24, MUTED, { align: 'right', weight: 500 })
  if (card.footer) text(g, card.footer, PAD, bottom - 12, 26, MUTED, { weight: 500, max: W - PAD * 2 - siteW - 30 })
  return true
}

export const canvasBlob = (c: HTMLCanvasElement): Promise<Blob | null> => new Promise((done) => { try { c.toBlob((b) => done(b), 'image/png') } catch { done(null) } })

/** Whether this device's share sheet takes an image file (phones: yes; most desktop browsers: no). */
export function canShareFile(): boolean {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function' || typeof File === 'undefined') return false
    return navigator.canShare({ files: [new File([new Uint8Array([0])], 'x.png', { type: 'image/png' })] })
  } catch { return false }
}

/** Opens the share sheet with the image (Instagram → 限時動態 is in it). 'cancelled' when the reader closed it. */
export async function shareBlob(blob: Blob, name: string): Promise<'shared' | 'cancelled' | 'failed'> {
  try { await navigator.share({ files: [new File([blob], name, { type: 'image/png' })] }); return 'shared' }
  catch (e) { return (e as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'failed' }
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

/** A picked photo as something the canvas can draw (turned the way the camera held it). */
export async function loadPhoto(file: Blob): Promise<Photo> {
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* fall through to <img> */ } }
  return await loadImage(URL.createObjectURL(file), true)
}
export function loadImage(src: string, revoke = false): Promise<HTMLImageElement> {
  return new Promise((done, fail) => {
    const img = new Image()
    img.onload = () => { if (revoke) URL.revokeObjectURL(src); done(img) }
    img.onerror = () => { if (revoke) URL.revokeObjectURL(src); fail(new Error('這張照片讀不出來')) }
    img.src = src
  })
}
