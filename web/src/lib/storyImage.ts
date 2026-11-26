/**
 * 限時動態 card on a canvas, 1080 × 1920 (an Instagram story). Instagram covers the top ~250 px (the account row) and
 * the bottom ~340 px (the reply bar), so everything that must be read sits between them; the photos and the background
 * run under both. The photos never leave the device: they are only drawn here.
 *
 * The reader styles the card like a small design desk (`StoryStyle`): a layout (滿版照片／上照片下數據／純數據), a
 * background photo (moved, zoomed, darkened, blurred), a front photo (a cut-out player, moved and sized), the colours,
 * and every block of text (shown or not, its size, colour, typeface and place). drawStory returns where each block
 * landed, so the dialog can pick one up under the finger.
 */
import type { StoryCard } from '../data/storyCard'
import { BG, FIG, INK, SANS, text, wrap } from './shareImage'
import { TEAM } from '../config/team'

export const STORY_W = 1080, STORY_H = 1920
/** what Instagram's own interface covers */
export const SAFE_TOP = 250, SAFE_BOTTOM = 340
/** the photo's frame in 上照片下數據 (the top of the card; it fades into the board below) */
const PHOTO_H = 1040
const PAD = 72
const SERIF = '"Noto Serif TC", "Source Serif 4", "Songti TC", "PMingLiU", serif'

/** Where the reader put the photo: fx / fy = which part shows (0 = left / top edge, 1 = right / bottom), zoom ≥ 1. */
export interface PhotoView { fx: number; fy: number; zoom: number }
export const DEFAULT_VIEW: PhotoView = { fx: 0.5, fy: 0.3, zoom: 1 }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d)

/** The photo's rectangle on the card: it always covers the frame (STORY_W × frameH). */
export function photoRect(pw: number, ph: number, view: PhotoView, frameH = PHOTO_H): { x: number; y: number; w: number; h: number } {
  const s = Math.max(STORY_W / pw, frameH / ph) * clamp(view.zoom, 1, 4)
  const w = pw * s, h = ph * s
  return { x: (STORY_W - w) * clamp(view.fx, 0, 1), y: (frameH - h) * clamp(view.fy, 0, 1), w, h }
}
/** The view after dragging the photo by (dx, dy) card pixels: it follows the finger and stops at its edges. */
export function panView(view: PhotoView, dx: number, dy: number, pw: number, ph: number, frameH = PHOTO_H): PhotoView {
  const r = photoRect(pw, ph, view, frameH)
  const sx = r.w - STORY_W, sy = r.h - frameH
  return { ...view, fx: sx > 0.5 ? clamp(view.fx - dx / sx, 0, 1) : view.fx, fy: sy > 0.5 ? clamp(view.fy - dy / sy, 0, 1) : view.fy }
}

// ---------------------------------------------------------------- the reader's style

export type StoryLayout = 'full' | 'split' | 'plain'
export const LAYOUT_LABEL: Record<StoryLayout, string> = { full: '滿版照片', split: '上照片下數據', plain: '純數據' }
/** the background photo's frame height in each layout (純數據 draws no background photo) */
export const frameHeight = (layout: StoryLayout) => (layout === 'split' ? PHOTO_H : STORY_H)

export type LayerKey = 'header' | 'title' | 'name' | 'big' | 'small' | 'headline' | 'footer'
export const LAYERS: Array<{ key: LayerKey; label: string }> = [
  { key: 'header', label: '隊名與比分' }, { key: 'title', label: '對手與日期' }, { key: 'name', label: '球員' },
  { key: 'big', label: '大數字' }, { key: 'small', label: '小數字' }, { key: 'headline', label: '亮點文字' }, { key: 'footer', label: '底部資訊' },
]
export type FontKey = '' | 'sans' | 'serif' | 'figure'
export const FONT_LABEL: Record<FontKey, string> = { '': '預設', sans: '黑體', serif: '明體', figure: '運動數字' }
const FONTS: Record<Exclude<FontKey, ''>, string> = { sans: SANS, serif: SERIF, figure: FIG }

/** One block of text: shown or not, its size (× the designed size), colour ('' = the card's text colour), typeface ('' = its own), and how far it was moved. */
export interface TextStyle { show: boolean; scale: number; color: string; font: FontKey; dx: number; dy: number }
/** The front photo: its centre on the card, its size (1 = a little over half the card's height), a white frame, a shadow. */
export interface FgStyle { cx: number; cy: number; scale: number; frame: boolean; shadow: boolean }
export interface StoryStyle {
  layout: StoryLayout
  /** the highlight colour, the text colour and the board / fade colour */
  accent: string; ink: string; shade: string
  /** the background photo darkened (0 … 0.8) and blurred (0 … 20) */
  dim: number; blur: number
  fg: FgStyle
  text: Record<LayerKey, TextStyle>
}
export const SCALE_MIN = 0.6, SCALE_MAX = 1.8
export const FG_SCALE_MIN = 0.3, FG_SCALE_MAX = 2.2
const HEX = /^#[0-9a-f]{6}$/i
const teamAccent = () => (HEX.test(TEAM.accentDark) ? TEAM.accentDark : '#e2a03a')
const plainText = (): TextStyle => ({ show: true, scale: 1, color: '', font: '', dx: 0, dy: 0 })
export const DEFAULT_FG: FgStyle = { cx: 700, cy: 860, scale: 1, frame: false, shadow: true }

export function defaultStyle(): StoryStyle {
  return {
    layout: 'full', accent: teamAccent(), ink: INK, shade: BG, dim: 0, blur: 0, fg: { ...DEFAULT_FG },
    text: Object.fromEntries(LAYERS.map((l) => [l.key, plainText()])) as Record<LayerKey, TextStyle>,
  }
}

/** Ready-made colour sets (the first is the team's own). */
export function palettes(): Array<{ name: string; accent: string; ink: string; shade: string }> {
  return [
    { name: '隊色', accent: teamAccent(), ink: INK, shade: BG },
    { name: '黑金', accent: '#f2c14e', ink: '#ffffff', shade: '#0e0e10' },
    { name: '海軍', accent: '#7fb2ff', ink: '#f5f7fb', shade: '#0b1a33' },
    { name: '紅白', accent: '#ff5a4e', ink: '#ffffff', shade: '#1c1011' },
    { name: '森林', accent: '#9be07a', ink: '#f4f7ef', shade: '#10201a' },
    { name: '淺色', accent: '#c8811a', ink: '#1d1d1f', shade: '#f4f1ea' },
  ]
}

/** A style read back from storage: anything missing or out of range takes the default. */
export function readStyle(raw: unknown): StoryStyle {
  const d = defaultStyle()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Partial<Record<keyof StoryStyle, unknown>>
  const col = (v: unknown, def: string) => (typeof v === 'string' && HEX.test(v) ? v : def)
  const fg = (r.fg ?? {}) as Partial<Record<keyof FgStyle, unknown>>
  const tx = (r.text ?? {}) as Partial<Record<LayerKey, Partial<Record<keyof TextStyle, unknown>>>>
  return {
    layout: r.layout === 'split' || r.layout === 'plain' || r.layout === 'full' ? r.layout : d.layout,
    accent: col(r.accent, d.accent), ink: col(r.ink, d.ink), shade: col(r.shade, d.shade),
    dim: num(r.dim, 0, 0.8, 0), blur: num(r.blur, 0, 20, 0),
    fg: {
      cx: num(fg.cx, -STORY_W, STORY_W * 2, DEFAULT_FG.cx), cy: num(fg.cy, -STORY_H, STORY_H * 2, DEFAULT_FG.cy),
      scale: num(fg.scale, FG_SCALE_MIN, FG_SCALE_MAX, 1), frame: fg.frame === true, shadow: fg.shadow !== false,
    },
    text: Object.fromEntries(LAYERS.map(({ key }) => {
      const t = tx[key] ?? {}
      const font = t.font === 'sans' || t.font === 'serif' || t.font === 'figure' ? t.font : ''
      return [key, { show: t.show !== false, scale: num(t.scale, SCALE_MIN, SCALE_MAX, 1), color: typeof t.color === 'string' && HEX.test(t.color) ? t.color : '', font, dx: num(t.dx, -STORY_W, STORY_W, 0), dy: num(t.dy, -STORY_H, STORY_H, 0) }]
    })) as Record<LayerKey, TextStyle>,
  }
}

// ---------------------------------------------------------------- where things are

export interface Box { x: number; y: number; w: number; h: number }
export type StoryTarget = LayerKey | 'fg'
export type StoryBoxes = Partial<Record<StoryTarget, Box>>

/** A block's box once the reader sized it (from its top-left corner) and moved it. */
export function placeBox(natural: Box, t: TextStyle): Box {
  const s = clamp(t.scale, SCALE_MIN, SCALE_MAX)
  return { x: natural.x + t.dx, y: natural.y + t.dy, w: natural.w * s, h: natural.h * s }
}
/** The front photo's rectangle: its height follows the size, its width the photo's own shape. */
export function fgRect(pw: number, ph: number, fg: FgStyle): Box {
  const h = STORY_H * 0.56 * clamp(fg.scale, FG_SCALE_MIN, FG_SCALE_MAX), w = (h * pw) / Math.max(1, ph)
  return { x: fg.cx - w / 2, y: fg.cy - h / 2, w, h }
}
const inside = (b: Box | undefined, x: number, y: number, pad = 12) => !!b && x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad
/** What is under a point of the card: the topmost block of text, else the front photo, else nothing (the background). */
export function hitTest(boxes: StoryBoxes, x: number, y: number): StoryTarget | null {
  for (const { key } of [...LAYERS].reverse()) if (inside(boxes[key], x, y)) return key
  return inside(boxes.fg, x, y, 0) ? 'fg' : null
}

// ---------------------------------------------------------------- drawing

type Photo = CanvasImageSource & { width: number; height: number }
export interface StoryDraw {
  /** the background photo and where it was moved to */
  photo?: Photo | null; view?: PhotoView
  /** the front photo (often a cut-out) */
  fg?: Photo | null
  mark?: Photo | null
  style?: StoryStyle
  /** editing only: Instagram's covered bands and a frame round the picked block (never in the shared image) */
  guides?: boolean; selected?: StoryTarget | null
}
/** A #rrggbb colour at an opacity (anything else is returned as it is). */
const alpha = (hex: string, a: number) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; const n = parseInt(m[1], 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})` }
/** Whether a colour is light (the 淺色 board): its dots and shadows turn dark. */
const isLight = (hex: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return false; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150 }

function chip(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  if (typeof g.roundRect === 'function') g.roundRect(x, y, w, h, r)
  else g.rect(x, y, w, h)
}

/** Draws a photo into a rectangle, softened by `blur` (drawn small, then stretched: works where canvas filters do not). */
function drawSoft(g: CanvasRenderingContext2D, img: Photo, r: Box, blur: number) {
  if (blur <= 0.5) { g.drawImage(img, r.x, r.y, r.w, r.h); return }
  const k = 1 + blur / 1.6
  const off = document.createElement('canvas')
  off.width = Math.max(8, Math.round(r.w / k / 4)); off.height = Math.max(8, Math.round(r.h / k / 4))
  const o = off.getContext('2d')
  if (!o) { g.drawImage(img, r.x, r.y, r.w, r.h); return }
  o.imageSmoothingQuality = 'high'; o.drawImage(img, 0, 0, off.width, off.height)
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(off, r.x, r.y, r.w, r.h); g.restore()
}

/** Draws `card` on `c` (sized to 1080 × 1920 here). Returns where each block landed, or null where there is no canvas. */
export function drawStory(c: HTMLCanvasElement, card: StoryCard, opts: StoryDraw = {}): StoryBoxes | null {
  c.width = STORY_W; c.height = STORY_H
  const g = c.getContext('2d')
  if (!g) return null
  const st = opts.style ?? defaultStyle()
  const W = STORY_W, H = STORY_H, acc = st.accent, shade = st.shade, light = isLight(shade)
  const layout: StoryLayout = opts.photo && st.layout !== 'plain' ? st.layout : 'plain'
  const overPhoto = layout !== 'plain'
  const boxes: StoryBoxes = {}
  g.fillStyle = shade; g.fillRect(0, 0, W, H)
  const dotsFrom = (top: number) => { g.fillStyle = light ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.035)'; for (let y = top + 2; y < H; y += 8) for (let x = 2; x < W; x += 8) g.fillRect(x, y, 2, 2) }

  // ---- the background
  if (layout !== 'plain' && opts.photo) {
    const fh = frameHeight(layout)
    const r = photoRect(opts.photo.width, opts.photo.height, opts.view ?? DEFAULT_VIEW, fh)
    g.save(); g.beginPath(); g.rect(0, 0, W, fh); g.clip()
    drawSoft(g, opts.photo, r, st.blur)
    if (st.dim > 0) { g.fillStyle = alpha(shade, st.dim); g.fillRect(0, 0, W, fh) }
    g.restore()
    const top = g.createLinearGradient(0, 0, 0, 520); top.addColorStop(0, alpha(shade, 0.72)); top.addColorStop(0.55, alpha(shade, 0.4)); top.addColorStop(1, alpha(shade, 0))
    g.fillStyle = top; g.fillRect(0, 0, W, 520)
    if (layout === 'split') {
      const fade = g.createLinearGradient(0, 660, 0, PHOTO_H); fade.addColorStop(0, alpha(shade, 0)); fade.addColorStop(0.62, alpha(shade, 0.82)); fade.addColorStop(1, shade)
      g.fillStyle = fade; g.fillRect(0, 660, W, PHOTO_H - 660 + 2)
      dotsFrom(PHOTO_H)
    } else {
      // 滿版: the photo runs to the bottom and darkens under the numbers
      const fade = g.createLinearGradient(0, 640, 0, H); fade.addColorStop(0, alpha(shade, 0)); fade.addColorStop(0.3, alpha(shade, 0.6)); fade.addColorStop(0.55, alpha(shade, 0.86)); fade.addColorStop(1, alpha(shade, 0.94))
      g.fillStyle = fade; g.fillRect(0, 640, W, H - 640)
    }
  } else {
    dotsFrom(0)
    const glow = g.createRadialGradient(W / 2, 520, 0, W / 2, 520, 760)
    glow.addColorStop(0, alpha(acc, 0.26)); glow.addColorStop(1, alpha(acc, 0))
    g.fillStyle = glow; g.fillRect(0, 0, W, 1300)
    if (!opts.fg) {
      // no photo at all: the jersey number (or the family name) fills the frame
      const big = card.number ?? card.name.slice(0, 1)
      g.save(); g.globalAlpha = 0.2
      text(g, big, W / 2, 860, card.number ? 620 : 480, acc, { align: 'center', font: card.number ? FIG : SANS, weight: 800, max: W - 120 })
      g.restore()
    }
  }

  // ---- the front photo (over the background and its fades, under the text)
  if (opts.fg) {
    const r = fgRect(opts.fg.width, opts.fg.height, st.fg)
    boxes.fg = r
    g.save()
    if (st.fg.shadow) { g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 48; g.shadowOffsetY = 18 }
    if (st.fg.frame) {
      const b = Math.max(10, Math.round(r.w * 0.025))
      g.fillStyle = '#ffffff'; chip(g, r.x - b, r.y - b, r.w + b * 2, r.h + b * 2, 22); g.fill()
      g.shadowColor = 'transparent'
      g.save(); chip(g, r.x, r.y, r.w, r.h, 14); g.clip(); g.drawImage(opts.fg, r.x, r.y, r.w, r.h); g.restore()
    } else g.drawImage(opts.fg, r.x, r.y, r.w, r.h)
    g.restore()
  }

  // ---- the blocks of text: each drawn at its designed place, then sized from its top-left corner and moved
  const shadowed = overPhoto || !!opts.fg
  const block = (key: LayerKey, natural: Box, draw: (ink: string, muted: string, font: (own: string) => string) => void) => {
    const t = st.text[key]
    if (!t.show) return
    const s = clamp(t.scale, SCALE_MIN, SCALE_MAX)
    const ink = t.color || st.ink
    g.save()
    g.translate(natural.x + t.dx, natural.y + t.dy); g.scale(s, s); g.translate(-natural.x, -natural.y)
    if (shadowed && isLight(ink)) { g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 14 }
    draw(ink, alpha(ink, 0.62), (own) => (t.font ? FONTS[t.font] : own))
    g.restore()
    boxes[key] = placeBox(natural, t)
  }

  block('header', { x: PAD, y: SAFE_TOP, w: W - PAD * 2, h: 64 }, (ink, _m, font) => {
    let tx = PAD
    if (opts.mark) {
      g.save(); g.shadowColor = 'transparent'; g.fillStyle = '#ffffff'; chip(g, PAD, SAFE_TOP + 6, 52, 52, 12); g.fill()
      g.drawImage(opts.mark, PAD + 4, SAFE_TOP + 10, 44, 44); g.restore()
      tx = PAD + 68
    }
    text(g, card.team, tx, SAFE_TOP + 44, 30, acc, { weight: 700, max: 520, font: font(SANS) })
    if (card.result) {
      g.font = `800 34px ${font(SANS)}`
      const w = g.measureText(card.result.text).width + 44
      g.save(); g.shadowColor = 'transparent'
      chip(g, W - PAD - w, SAFE_TOP + 4, w, 56, 28)
      if (card.result.win) { g.fillStyle = acc; g.fill() } else { g.fillStyle = alpha(shade, 0.55); g.fill(); g.strokeStyle = alpha(ink, 0.5); g.lineWidth = 2; g.stroke() }
      text(g, card.result.text, W - PAD - w / 2, SAFE_TOP + 44, 34, card.result.win ? shade : ink, { align: 'center', weight: 800, font: font(SANS) })
      g.restore()
    }
  })
  block('title', { x: PAD, y: SAFE_TOP + 76, w: W - PAD * 2, h: 128 }, (ink, muted, font) => {
    text(g, card.title, PAD, SAFE_TOP + 138, 68, ink, { weight: 800, max: W - PAD * 2, font: font(SANS) })
    text(g, card.sub, PAD, SAFE_TOP + 190, 30, overPhoto ? ink : muted, { weight: 500, max: W - PAD * 2, font: font(SANS) })
  })
  block('name', { x: PAD, y: 870, w: W - PAD * 2, h: 166 }, (ink, muted, font) => {
    let nx = PAD
    if (card.number) {
      g.font = `800 150px ${font(FIG)}`
      const w = g.measureText(card.number).width
      text(g, card.number, PAD, 1012, 150, acc, { font: font(FIG), weight: 800 })
      nx = PAD + w + 30
    }
    text(g, card.name, nx, 974, 88, ink, { weight: 800, max: W - PAD - nx, font: font(SANS) })
    text(g, card.role, nx + 4, 1024, 30, overPhoto ? ink : muted, { weight: 500, max: W - PAD - nx, font: font(SANS) })
  })
  block('big', { x: PAD, y: 1064, w: W - PAD * 2, h: 214 }, (ink, muted, font) => {
    g.save(); g.shadowColor = 'transparent'; g.fillStyle = acc; g.fillRect(PAD, 1068, 96, 6); g.restore()
    const col = (W - PAD * 2) / 3
    card.big.slice(0, 3).forEach((b, i) => {
      const x = PAD + i * col
      text(g, b.label, x, 1132, 28, muted, { weight: 600, font: font(SANS) })
      text(g, b.value, x, 1262, 136, i === 0 ? acc : ink, { font: font(FIG), weight: 800, max: col - 28 })
    })
  })
  // the smaller numbers and the 好球率 bar
  const small = card.small.slice(0, 4)
  let end = 1262
  if (small.length || card.bar) {
    const top = 1290
    const smallEnd = small.length ? 1336 : 1262
    const h = (card.bar ? smallEnd + 30 + 46 : smallEnd) - top + 14
    end = top + h - 14
    block('small', { x: PAD, y: top, w: W - PAD * 2, h }, (ink, muted, font) => {
      let y = 1262
      if (small.length) {
        y = 1336
        const sw = (W - PAD * 2) / 4
        small.forEach((b, i) => {
          const x = PAD + i * sw
          g.font = `700 44px ${font(FIG)}`
          const vw = Math.min(g.measureText(b.value).width, sw - 90)
          text(g, b.value, x, y, 44, ink, { font: font(FIG), weight: 700, max: sw - 90 })
          text(g, b.label, x + vw + 10, y - 3, 24, muted, { weight: 500, max: sw - vw - 22, font: font(SANS) })
        })
      }
      if (card.bar) {
        const total = card.bar.strikes + card.bar.balls, share = total ? card.bar.strikes / total : 0
        y += 30
        g.save(); g.shadowColor = 'transparent'
        g.fillStyle = alpha(ink, 0.2); chip(g, PAD, y, W - PAD * 2, 12, 6); g.fill()
        g.fillStyle = acc; chip(g, PAD, y, (W - PAD * 2) * share, 12, 6); g.fill()
        g.restore()
        y += 46
        text(g, `好球率 ${Math.round(share * 100)}%`, PAD, y, 26, ink, { weight: 600, font: font(SANS) })
        text(g, `${card.bar.strikes} 好球・${card.bar.balls} 壞球`, W - PAD, y, 24, muted, { align: 'right', weight: 500, font: font(SANS) })
      }
    })
  }

  // ---- the sentence (wrapped to the room it has at its size), then the season line above Instagram's reply bar
  const bottom = H - SAFE_BOTTOM
  const hs = clamp(st.text.headline.scale, SCALE_MIN, SCALE_MAX)
  const lines = wrap(g, card.headline.trim(), (W - PAD * 2 - 26) / Math.max(1, hs), 38).slice(0, 3)
  if (lines.length) {
    const top = Math.min(end + 34, bottom - 62 - lines.length * 50)
    block('headline', { x: PAD, y: top, w: W - PAD * 2, h: lines.length * 50 }, (ink, _m, font) => {
      g.save(); g.shadowColor = 'transparent'; g.fillStyle = acc; g.fillRect(PAD, top, 6, lines.length * 50 - 8); g.restore()
      lines.forEach((ln, i) => text(g, ln, PAD + 26, top + 36 + i * 50, 38, ink, { weight: 600, font: font(SANS) }))
    })
  }
  block('footer', { x: PAD, y: bottom - 52, w: W - PAD * 2, h: 52 }, (ink, muted, font) => {
    g.save(); g.shadowColor = 'transparent'; g.fillStyle = alpha(ink, 0.16); g.fillRect(PAD, bottom - 50, W - PAD * 2, 2); g.restore()
    g.font = `500 24px ${font(SANS)}`
    const siteW = g.measureText(card.site).width
    text(g, card.site, W - PAD, bottom - 12, 24, muted, { align: 'right', weight: 500, font: font(SANS) })
    if (card.footer) text(g, card.footer, PAD, bottom - 12, 26, muted, { weight: 500, max: W - PAD * 2 - siteW - 30, font: font(SANS) })
  })

  // ---- editing aids (the shared image is drawn without them)
  if (opts.guides) {
    g.save()
    g.setLineDash([14, 12]); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.beginPath(); g.moveTo(0, SAFE_TOP); g.lineTo(W, SAFE_TOP); g.moveTo(0, bottom); g.lineTo(W, bottom); g.stroke()
    g.setLineDash([])
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, SAFE_TOP); g.fillRect(0, bottom, W, SAFE_BOTTOM)
    text(g, 'IG 頭像列會蓋住這裡', W / 2, SAFE_TOP - 24, 30, 'rgba(255,255,255,0.75)', { align: 'center', weight: 500 })
    text(g, 'IG 回覆列會蓋住這裡', W / 2, bottom + 54, 30, 'rgba(255,255,255,0.75)', { align: 'center', weight: 500 })
    const sel = opts.selected ? boxes[opts.selected] : undefined
    if (sel) {
      g.setLineDash([18, 10]); g.lineWidth = 5; g.strokeStyle = acc
      g.strokeRect(sel.x - 12, sel.y - 12, sel.w + 24, sel.h + 24)
    }
    g.restore()
  }
  return boxes
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
