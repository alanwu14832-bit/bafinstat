/**
 * 限時動態 card on a canvas, 1080 × 1920 (an Instagram story). Instagram covers the top ~250 px (the account row) and
 * the bottom ~340 px (the reply bar), so everything that must be read sits between them; the photos and the background
 * run under both. The photos never leave the device: they are only drawn here.
 *
 * The reader styles the card like a small design desk (`StoryStyle`): a layout — three 數據卡 (滿版照片／上照片下數據／
 * 純數據) and three poster templates drawn from the team's own PLAYER OF THE GAME posts (斜切海報／直排姓名／左欄數據) —,
 * a background photo (moved, zoomed, darkened, blurred), up to three front photos (cut-out players, moved and sized),
 * the colours, and every block of text (shown or not, its size, colour, typeface and place). drawStory returns where each
 * block landed, so the dialog can pick one up under the finger.
 */
import type { StoryCard } from '../data/storyCard'
import { BG, FIG, INK, SANS, text, wrap } from './shareImage'
import { TEAM } from '../config/team'
import { BRUSH_CJK, BRUSH_LATIN, CONDENSED, drawsAll, SERIF_CJK, SERIF_LATIN } from './storyFonts'

export const STORY_W = 1080, STORY_H = 1920
/** what Instagram's own interface covers */
export const SAFE_TOP = 250, SAFE_BOTTOM = 340
/** the photo's frame in 上照片下數據 (the top of the card; it fades into the board below) */
const PHOTO_H = 1040
const PAD = 72
/** 左欄數據: the coloured column's width */
const COL_W = 400
const SERIF = '"Noto Serif TC", "Source Serif 4", "Songti TC", "PMingLiU", serif'

/** Where the reader put the photo: fx / fy = which part shows (0 = left / top edge, 1 = right / bottom), zoom ≥ 1. */
export interface PhotoView { fx: number; fy: number; zoom: number }
export const DEFAULT_VIEW: PhotoView = { fx: 0.5, fy: 0.3, zoom: 1 }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d)

/** The photo's rectangle within its frame (frameW × frameH, from the frame's corner): it always covers the frame. */
export function photoRect(pw: number, ph: number, view: PhotoView, frameH = PHOTO_H, frameW = STORY_W): { x: number; y: number; w: number; h: number } {
  const s = Math.max(frameW / pw, frameH / ph) * clamp(view.zoom, 1, 4)
  const w = pw * s, h = ph * s
  return { x: (frameW - w) * clamp(view.fx, 0, 1), y: (frameH - h) * clamp(view.fy, 0, 1), w, h }
}
/** The view after dragging the photo by (dx, dy) card pixels: it follows the finger and stops at its edges. */
export function panView(view: PhotoView, dx: number, dy: number, pw: number, ph: number, frameH = PHOTO_H, frameW = STORY_W): PhotoView {
  const r = photoRect(pw, ph, view, frameH, frameW)
  const sx = r.w - frameW, sy = r.h - frameH
  return { ...view, fx: sx > 0.5 ? clamp(view.fx - dx / sx, 0, 1) : view.fx, fy: sy > 0.5 ? clamp(view.fy - dy / sy, 0, 1) : view.fy }
}

// ---------------------------------------------------------------- the reader's style

export type StoryLayout = 'full' | 'split' | 'plain' | 'poster' | 'vertical' | 'column'
export const LAYOUT_LABEL: Record<StoryLayout, string> = { full: '滿版照片', split: '上照片下數據', plain: '純數據', poster: '斜切海報', vertical: '直排姓名', column: '左欄數據' }
export const DATA_LAYOUTS: StoryLayout[] = ['full', 'split', 'plain']
export const TEMPLATE_LAYOUTS: StoryLayout[] = ['poster', 'vertical', 'column']
export const isTemplate = (l: StoryLayout) => TEMPLATE_LAYOUTS.includes(l)
export interface Box { x: number; y: number; w: number; h: number }
/** Where the background photo goes in each layout (純數據 has none; 左欄數據 frames it on the right). */
export function photoFrame(layout: StoryLayout): Box | null {
  if (layout === 'plain') return null
  if (layout === 'split') return { x: 0, y: 0, w: STORY_W, h: PHOTO_H }
  if (layout === 'column') return { x: COL_W + 28, y: SAFE_TOP + 24, w: STORY_W - COL_W - 28 - 40, h: 1000 }
  return { x: 0, y: 0, w: STORY_W, h: STORY_H }
}
/** How a layout treats the background photo when it is picked (the reader can change both afterwards). */
export function layoutLook(l: StoryLayout): { dim: number; blur: number } {
  return l === 'poster' ? { dim: 0.32, blur: 3 } : l === 'vertical' ? { dim: 0, blur: 14 } : { dim: 0, blur: 0 }
}

export type LayerKey = 'header' | 'title' | 'name' | 'big' | 'small' | 'headline' | 'footer' | 'potg' | 'pname' | 'stats' | 'logo'
export const LAYERS: Array<{ key: LayerKey; label: string; group: 'data' | 'template' }> = [
  { key: 'header', label: '隊名與比分', group: 'data' }, { key: 'title', label: '對手與日期', group: 'data' }, { key: 'name', label: '球員', group: 'data' },
  { key: 'big', label: '大數字', group: 'data' }, { key: 'small', label: '小數字', group: 'data' }, { key: 'headline', label: '亮點文字', group: 'data' }, { key: 'footer', label: '底部資訊', group: 'data' },
  { key: 'potg', label: '標題', group: 'template' }, { key: 'pname', label: '姓名', group: 'template' }, { key: 'stats', label: '數據', group: 'template' }, { key: 'logo', label: '隊徽', group: 'template' },
]
export const layersFor = (l: StoryLayout) => LAYERS.filter((x) => x.group === (isTemplate(l) ? 'template' : 'data'))
export type FontKey = '' | 'sans' | 'serif' | 'figure' | 'brush' | 'condensed'
export const FONT_LABEL: Record<FontKey, string> = { '': '預設', sans: '黑體', serif: '明體', figure: '運動數字', brush: '毛筆', condensed: '窄體' }
const FONTS: Record<Exclude<FontKey, ''>, string> = {
  sans: SANS, serif: `${SERIF_LATIN}, ${SERIF}`, figure: FIG,
  brush: `${BRUSH_LATIN}, ${BRUSH_CJK}, ${SERIF_CJK}, serif`, condensed: `${CONDENSED}, ${SANS}`,
}

/** One block of text: shown or not, its size (× the designed size), colour ('' = the layout's own), typeface ('' = its own), and how far it was moved. */
export interface TextStyle { show: boolean; scale: number; color: string; font: FontKey; dx: number; dy: number }
/** A front photo: its centre on the card, its size (1 = a little over half the card's height), a white frame, a shadow. */
export interface FgStyle { cx: number; cy: number; scale: number; frame: boolean; shadow: boolean }
export const FG_COUNT = 3
export interface StoryStyle {
  layout: StoryLayout
  /** the highlight colour, the text colour and the board / fade colour */
  accent: string; ink: string; shade: string
  /** the background photo darkened (0 … 0.8) and blurred (0 … 20) */
  dim: number; blur: number
  /** the front photos' places (one per slot, used when that slot has a photo) */
  fgs: FgStyle[]
  /** the poster templates' title; 「/」 breaks the line */
  title: string
  text: Record<LayerKey, TextStyle>
}
export const SCALE_MIN = 0.6, SCALE_MAX = 1.8
export const FG_SCALE_MIN = 0.3, FG_SCALE_MAX = 2.2
export const DEFAULT_TITLE = 'PLAYER OF THE GAME'
export const TITLE_MAX = 30
const HEX = /^#[0-9a-f]{6}$/i
const teamAccent = () => (HEX.test(TEAM.accentDark) ? TEAM.accentDark : '#e2a03a')
const plainText = (): TextStyle => ({ show: true, scale: 1, color: '', font: '', dx: 0, dy: 0 })

/** Where a layout puts its front photos (the first is the main one; the others make a 連續動作 sequence). */
export function defaultFg(layout: StoryLayout, i: number): FgStyle {
  const at: Record<'poster' | 'vertical' | 'column' | 'data', Array<[number, number, number]>> = {
    // (each ends above the name, as the team's posters do: the feet never cover it)
    poster: [[720, 700, 1.1], [300, 820, 0.8], [520, 760, 0.9]],
    vertical: [[430, 1250, 1.15], [210, 1300, 0.8], [680, 1300, 0.8]],
    column: [[740, 780, 0.9], [560, 840, 0.65], [900, 840, 0.65]],
    data: [[700, 860, 1], [320, 1000, 0.7], [520, 900, 0.8]],
  }
  const [cx, cy, scale] = at[isTemplate(layout) ? (layout as 'poster' | 'vertical' | 'column') : 'data'][clamp(i, 0, FG_COUNT - 1)]
  return { cx, cy, scale, frame: false, shadow: true }
}

export function defaultStyle(): StoryStyle {
  return {
    layout: 'full', accent: teamAccent(), ink: INK, shade: BG, dim: 0, blur: 0,
    fgs: Array.from({ length: FG_COUNT }, (_, i) => defaultFg('full', i)), title: DEFAULT_TITLE,
    text: Object.fromEntries(LAYERS.map((l) => [l.key, plainText()])) as Record<LayerKey, TextStyle>,
  }
}

/** Ready-made colour sets (the first is the team's own). */
export function palettes(): Array<{ name: string; accent: string; ink: string; shade: string }> {
  return [
    { name: '隊色', accent: teamAccent(), ink: INK, shade: BG },
    { name: '黑金', accent: '#f2c14e', ink: '#ffffff', shade: '#0e0e10' },
    { name: '海軍', accent: '#7fb2ff', ink: '#f5f7fb', shade: '#0b1a33' },
    { name: '紅白', accent: '#c94f6d', ink: '#ffffff', shade: '#3a4f9c' },
    { name: '森林', accent: '#9be07a', ink: '#f4f7ef', shade: '#10201a' },
    { name: '淺色', accent: '#c8811a', ink: '#1d1d1f', shade: '#f4f1ea' },
  ]
}

const LAYOUTS: StoryLayout[] = [...DATA_LAYOUTS, ...TEMPLATE_LAYOUTS]
const FONT_KEYS: FontKey[] = ['', 'sans', 'serif', 'figure', 'brush', 'condensed']
/** A style read back from storage: anything missing or out of range takes the default (an older single `fg` becomes the first slot). */
export function readStyle(raw: unknown): StoryStyle {
  const d = defaultStyle()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Partial<Record<keyof StoryStyle | 'fg', unknown>>
  const col = (v: unknown, def: string) => (typeof v === 'string' && HEX.test(v) ? v : def)
  const layout = LAYOUTS.includes(r.layout as StoryLayout) ? (r.layout as StoryLayout) : d.layout
  const rawFgs = Array.isArray(r.fgs) ? r.fgs : r.fg && typeof r.fg === 'object' ? [r.fg] : []
  const tx = (r.text ?? {}) as Partial<Record<LayerKey, Partial<Record<keyof TextStyle, unknown>>>>
  return {
    layout, accent: col(r.accent, d.accent), ink: col(r.ink, d.ink), shade: col(r.shade, d.shade),
    dim: num(r.dim, 0, 0.8, 0), blur: num(r.blur, 0, 20, 0),
    fgs: Array.from({ length: FG_COUNT }, (_, i) => {
      const def = defaultFg(layout, i), f = (rawFgs[i] ?? {}) as Partial<Record<keyof FgStyle, unknown>>
      return { cx: num(f.cx, -STORY_W, STORY_W * 2, def.cx), cy: num(f.cy, -STORY_H, STORY_H * 2, def.cy), scale: num(f.scale, FG_SCALE_MIN, FG_SCALE_MAX, def.scale), frame: f.frame === true, shadow: f.shadow !== false }
    }),
    title: typeof r.title === 'string' ? r.title.slice(0, TITLE_MAX) : d.title,
    text: Object.fromEntries(LAYERS.map(({ key }) => {
      const t = tx[key] ?? {}
      const font = FONT_KEYS.includes(t.font as FontKey) ? (t.font as FontKey) : ''
      return [key, { show: t.show !== false, scale: num(t.scale, SCALE_MIN, SCALE_MAX, 1), color: typeof t.color === 'string' && HEX.test(t.color) ? t.color : '', font, dx: num(t.dx, -STORY_W, STORY_W, 0), dy: num(t.dy, -STORY_H, STORY_H, 0) }]
    })) as Record<LayerKey, TextStyle>,
  }
}

/** The poster title as lines: PLAYER OF THE GAME reads as the team's posts (PLAYER large, OF THE small, GAME between); otherwise 「/」 breaks the line. */
export function titleLines(title: string): Array<{ text: string; size: number }> {
  const t = title.trim()
  if (!t) return []
  if (/^player\s+of\s+the\s+game$/i.test(t)) return [{ text: 'PLAYER', size: 1 }, { text: 'OF THE', size: 0.52 }, { text: 'GAME', size: 0.76 }]
  return t.split('/').map((s) => s.trim()).filter(Boolean).slice(0, 3).map((s, i) => ({ text: s, size: i === 0 ? 1 : 0.7 }))
}

// ---------------------------------------------------------------- where things are

export type FgTarget = 'fg0' | 'fg1' | 'fg2'
export type StoryTarget = LayerKey | FgTarget
export type StoryBoxes = Partial<Record<StoryTarget, Box>>
export const fgTarget = (i: number) => `fg${i}` as FgTarget
export const fgIndex = (t: StoryTarget | null): number => (t && /^fg[0-2]$/.test(t) ? Number(t[2]) : -1)

/** A block's box once the reader sized it (from its top-left corner) and moved it. */
export function placeBox(natural: Box, t: TextStyle): Box {
  const s = clamp(t.scale, SCALE_MIN, SCALE_MAX)
  return { x: natural.x + t.dx, y: natural.y + t.dy, w: natural.w * s, h: natural.h * s }
}
/** A front photo's rectangle: its height follows the size, its width the photo's own shape. */
export function fgRect(pw: number, ph: number, fg: FgStyle): Box {
  const h = STORY_H * 0.56 * clamp(fg.scale, FG_SCALE_MIN, FG_SCALE_MAX), w = (h * pw) / Math.max(1, ph)
  return { x: fg.cx - w / 2, y: fg.cy - h / 2, w, h }
}
const inside = (b: Box | undefined, x: number, y: number, pad = 12) => !!b && x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad
/** What is under a point of the card: the topmost block of text, else the topmost front photo, else nothing (the background). */
export function hitTest(boxes: StoryBoxes, x: number, y: number): StoryTarget | null {
  for (const { key } of [...LAYERS].reverse()) if (inside(boxes[key], x, y)) return key
  for (let i = FG_COUNT - 1; i >= 0; i--) if (inside(boxes[fgTarget(i)], x, y, 0)) return fgTarget(i)
  return null
}

// ---------------------------------------------------------------- drawing

type Photo = CanvasImageSource & { width: number; height: number }
export interface StoryDraw {
  /** the background photo and where it was moved to */
  photo?: Photo | null; view?: PhotoView
  /** the front photos by slot (often cut-outs; null = an empty slot) */
  fgs?: Array<Photo | null>
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

/** Text with an italic option (Anton's slanted numbers) on top of shareImage's `text`. */
function say(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, o: { font: string; weight?: number; align?: CanvasTextAlign; max?: number; italic?: boolean }) {
  g.font = `${o.italic ? 'italic ' : ''}${o.weight ?? 400} ${size}px ${o.font}`; g.fillStyle = color; g.textAlign = o.align ?? 'left'; g.textBaseline = 'alphabetic'
  g.fillText(s, x, y, o.max)
}
/** How wide a line would be. */
function measure(g: CanvasRenderingContext2D, s: string, size: number, font: string, weight = 400, italic = false) {
  g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`
  return g.measureText(s).width
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

/** A concrete / paper wall (斜切海報's light panel): speckles, a few scuffs, soft blotches; the same every time. */
const walls = new Map<string, HTMLCanvasElement>()
function wall(w: number, h: number, base: string): HTMLCanvasElement | null {
  const key = `${w}x${h}${base}`
  const hit = walls.get(key)
  if (hit) return hit
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')
  if (!g) return null
  let seed = 20261126
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  g.fillStyle = base; g.fillRect(0, 0, w, h)
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w, y = rnd() * h, r = 120 + rnd() * 420
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    const dark = rnd() < 0.5
    gr.addColorStop(0, dark ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 14000; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.09})`; const s = 1 + rnd() * 2.4; g.fillRect(rnd() * w, rnd() * h, s, s) }
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.3})`; g.fillRect(rnd() * w, rnd() * h, 1.6, 1.6) }
  g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 1.4
  for (let i = 0; i < 40; i++) { const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI, l = 30 + rnd() * 160; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke() }
  walls.set(key, c)
  return c
}

/** Draws `card` on `c` (sized to 1080 × 1920 here). Returns where each block landed, or null where there is no canvas. */
export function drawStory(c: HTMLCanvasElement, card: StoryCard, opts: StoryDraw = {}): StoryBoxes | null {
  c.width = STORY_W; c.height = STORY_H
  const g = c.getContext('2d')
  if (!g) return null
  const st = opts.style ?? defaultStyle()
  const W = STORY_W, H = STORY_H, acc = st.accent, shade = st.shade, light = isLight(shade)
  const template = isTemplate(st.layout)
  // the 數據卡 photo layouts need a photo; the templates draw their own ground without one
  const layout: StoryLayout = template || (opts.photo && st.layout !== 'plain') ? st.layout : 'plain'
  const boxes: StoryBoxes = {}
  const fgs = (opts.fgs ?? []).slice(0, FG_COUNT)
  g.fillStyle = shade; g.fillRect(0, 0, W, H)
  const dotsFrom = (top: number) => { g.fillStyle = light ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.035)'; for (let y = top + 2; y < H; y += 8) for (let x = 2; x < W; x += 8) g.fillRect(x, y, 2, 2) }
  /** the background photo into its frame, softened and darkened as the reader set */
  const background = (f: Box) => {
    if (!opts.photo) return false
    const r = photoRect(opts.photo.width, opts.photo.height, opts.view ?? DEFAULT_VIEW, f.h, f.w)
    g.save(); g.beginPath(); g.rect(f.x, f.y, f.w, f.h); g.clip()
    drawSoft(g, opts.photo, { x: f.x + r.x, y: f.y + r.y, w: r.w, h: r.h }, st.blur)
    if (st.dim > 0) { g.fillStyle = alpha(template ? '#000000' : shade, st.dim); g.fillRect(f.x, f.y, f.w, f.h) }
    g.restore()
    return true
  }
  /** the front photos, in slot order (the last on top) */
  const fronts = () => fgs.forEach((p, i) => {
    if (!p) return
    const f = st.fgs[i] ?? defaultFg(layout, i)
    const r = fgRect(p.width, p.height, f)
    boxes[fgTarget(i)] = r
    g.save()
    if (f.shadow) { g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 48; g.shadowOffsetY = 18 }
    if (f.frame) {
      const b = Math.max(10, Math.round(r.w * 0.025))
      g.fillStyle = '#ffffff'; chip(g, r.x - b, r.y - b, r.w + b * 2, r.h + b * 2, 22); g.fill()
      g.shadowColor = 'transparent'
      g.save(); chip(g, r.x, r.y, r.w, r.h, 14); g.clip(); g.drawImage(p, r.x, r.y, r.w, r.h); g.restore()
    } else g.drawImage(p, r.x, r.y, r.w, r.h)
    g.restore()
  })
  /** a block of text: drawn at its designed place, then sized from its top-left corner and moved */
  const block = (key: LayerKey, natural: Box, own: string, shadowed: boolean, draw: (ink: string, muted: string, font: (own: string) => string) => void) => {
    const t = st.text[key]
    if (!t.show) return
    const s = clamp(t.scale, SCALE_MIN, SCALE_MAX)
    const ink = t.color || own
    g.save()
    g.translate(natural.x + t.dx, natural.y + t.dy); g.scale(s, s); g.translate(-natural.x, -natural.y)
    if (shadowed && isLight(ink)) { g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 14 }
    draw(ink, alpha(ink, 0.62), (f) => (t.font ? FONTS[t.font] : f))
    g.restore()
    boxes[key] = placeBox(natural, t)
  }
  /** a template title, stacked from (x, y) */
  const titleBlock = (x: number, y: number, base: number, maxW: number, own: string, font: string, weight: number, italic: boolean, shadowed: boolean) => {
    const lines = titleLines(st.title)
    if (!lines.length) return
    const tf = st.text.potg.font ? FONTS[st.text.potg.font] : font
    const sizes = lines.map((l) => Math.min(base * l.size, base * l.size * maxW / Math.max(1, measure(g, l.text, base * l.size, tf, weight, italic))))
    const h = sizes.reduce((a, s) => a + s * 0.94, 0)
    const w = Math.max(...lines.map((l, i) => measure(g, l.text, sizes[i], tf, weight, italic)))
    block('potg', { x, y, w, h }, own, shadowed, (ink) => {
      let at = y
      lines.forEach((l, i) => { at += sizes[i] * 0.94; say(g, l.text, x, at - sizes[i] * 0.12, sizes[i], ink, { font: tf, weight, italic }) })
    })
  }
  /** the player's name in the template's own face: the brush where it has every character, else heavy serif */
  const nameFace = (brush: boolean): { font: string; weight: number } => {
    const t = st.text.pname
    if (t.font) return { font: FONTS[t.font], weight: t.font === 'sans' ? 900 : t.font === 'serif' ? 900 : 400 }
    if (brush && drawsAll(BRUSH_CJK, card.name)) return { font: `${BRUSH_CJK}, ${SERIF_CJK}, serif`, weight: 400 }
    return { font: `${SERIF_CJK}, ${SERIF}`, weight: 900 }
  }
  const logo = (cx: number, cy: number, size: number, disc: boolean) => {
    if (!opts.mark) return
    const r = disc ? size * 0.72 : size / 2
    block('logo', { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, '#ffffff', false, () => {
      if (disc) { g.save(); g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 18; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); g.restore() }
      g.drawImage(opts.mark!, cx - size / 2, cy - size / 2, size, size)
    })
  }
  const statsOn = st.text.stats.show && !!card.statLine.trim()
  const bottom = H - SAFE_BOTTOM

  if (layout === 'poster') {
    // ---- 斜切海報: the darkened photo, a slanted concrete wall on the right, the cut-out across the edge
    if (!background({ x: 0, y: 0, w: W, h: H })) {
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, alpha(shade, 1)); gr.addColorStop(1, '#2a2a2a'); g.fillStyle = gr; g.fillRect(0, 0, W, H)
    }
    const top = W * 0.83, foot = W * 0.4
    g.save(); g.beginPath(); g.moveTo(top, 0); g.lineTo(W, 0); g.lineTo(W, H); g.lineTo(foot, H); g.closePath()
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 40; g.fillStyle = '#e6e2da'; g.fill()
    g.shadowColor = 'transparent'; g.clip(); const t = wall(W, H, '#e6e2da'); if (t) g.drawImage(t, 0, 0)
    g.restore()
    fronts()
    titleBlock(PAD - 8, SAFE_TOP + 4, 236, W * 0.72, '#f6f1e6', BRUSH_LATIN, 400, false, true)
    const nf = nameFace(true)
    const nameBase = bottom - (statsOn ? 104 : 30)
    const size = Math.min(236, (W * 0.62) / Math.max(1, [...card.name].length) * 1.02)
    const nw = measure(g, card.name, size, nf.font, nf.weight)
    block('pname', { x: W - PAD - nw, y: nameBase - size * 0.92, w: nw, h: size * 1.02 }, '#151515', false, (ink) => say(g, card.name, W - PAD, nameBase, size, ink, { font: nf.font, weight: nf.weight, align: 'right' }))
    if (statsOn) {
      const sf = st.text.stats.font ? FONTS[st.text.stats.font] : CONDENSED
      const sw = Math.min(W * 0.58, measure(g, card.statLine, 60, sf))
      block('stats', { x: W - PAD - sw, y: bottom - 82, w: sw, h: 66 }, '#151515', false, (ink) => say(g, card.statLine, W - PAD, bottom - 24, 60, ink, { font: sf, align: 'right', max: W * 0.58 }))
    }
    logo(PAD + 96, bottom - 108, 138, true)
  } else if (layout === 'vertical') {
    // ---- 直排姓名: a blurred photo, a pale slanted panel, the serif title, the name down the panel
    if (background({ x: 0, y: 0, w: W, h: H })) { g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(0, 0, W, H) }
    else { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#cfccc5'); gr.addColorStop(1, '#a9a59d'); g.fillStyle = gr; g.fillRect(0, 0, W, H) }
    const top = W * 0.8, foot = W * 0.57
    g.save(); g.beginPath(); g.moveTo(top, 0); g.lineTo(W, 0); g.lineTo(W, H); g.lineTo(foot, H); g.closePath()
    g.fillStyle = '#f2f0eb'; g.fill(); g.clip(); const t = wall(W, H, '#f2f0eb'); if (t) { g.globalAlpha = 0.55; g.drawImage(t, 0, 0) }
    g.restore()
    fronts()
    titleBlock(PAD - 10, SAFE_TOP + 4, 200, W * 0.66, '#2b2b2b', `${SERIF_LATIN}, ${SERIF}`, 700, false, false)
    logo(W - PAD - 80, SAFE_TOP + 90, 160, false)
    const nf = nameFace(false)
    const chars = [...card.name]
    const room = (statsOn ? bottom - 120 : bottom - 40) - 640
    const size = Math.min(210, room / Math.max(1, chars.length) / 1.1)
    const cx = W - PAD - size / 2 - 6
    block('pname', { x: cx - size / 2, y: 640, w: size, h: chars.length * size * 1.1 }, '#2b2b2b', false, (ink) => {
      chars.forEach((ch, i) => say(g, ch, cx, 640 + (i + 1) * size * 1.1 - size * 0.18, size, ink, { font: nf.font, weight: nf.weight, align: 'center' }))
    })
    if (statsOn) {
      const sf = st.text.stats.font ? FONTS[st.text.stats.font] : `${SERIF_LATIN}, ${SERIF}`
      const sw = Math.min(W - PAD * 2, measure(g, card.statLine, 56, sf, 700))
      block('stats', { x: W - PAD - sw, y: bottom - 78, w: sw, h: 64 }, '#2b2b2b', false, (ink) => say(g, card.statLine, W - PAD, bottom - 24, 56, ink, { font: sf, weight: 700, align: 'right', max: W - PAD * 2 }))
    }
  } else if (layout === 'column') {
    // ---- 左欄數據: a coloured column with the title and the numbers stacked, the photo framed on the right, a name plate
    g.fillStyle = shade; g.fillRect(COL_W, 0, W - COL_W, H)
    const f = photoFrame('column')!
    if (!background(f)) { g.fillStyle = alpha(INK, 0.08); g.fillRect(f.x, f.y, f.w, f.h) }
    g.save(); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3
    const k = 34, x0 = f.x + 18, y0 = f.y + 18, x1 = f.x + f.w - 18, y1 = f.y + f.h - 18
    g.beginPath(); g.moveTo(x0 + k, y0); g.lineTo(x1, y0); g.lineTo(x1, y1 - k); g.lineTo(x1 - k, y1); g.lineTo(x0, y1); g.lineTo(x0, y0 + k); g.closePath(); g.stroke(); g.restore()
    g.fillStyle = '#fbf6ea'; g.fillRect(COL_W, 1300, W - COL_W, H - 1300)
    g.fillStyle = acc; g.fillRect(0, 0, COL_W, H)
    if (opts.photo) {
      const r = photoRect(opts.photo.width, opts.photo.height, opts.view ?? DEFAULT_VIEW, H, COL_W)
      g.save(); g.beginPath(); g.rect(0, 0, COL_W, H); g.clip(); g.globalAlpha = 0.2; g.drawImage(opts.photo, r.x, r.y, r.w, r.h); g.restore()
      g.fillStyle = alpha(acc, 0.35); g.fillRect(0, 0, COL_W, H)
    }
    const glow = g.createRadialGradient(COL_W + 40, SAFE_TOP - 60, 0, COL_W + 40, SAFE_TOP - 60, 420)
    glow.addColorStop(0, 'rgba(255,236,170,0.7)'); glow.addColorStop(0.35, 'rgba(255,214,120,0.22)'); glow.addColorStop(1, 'rgba(255,214,120,0)')
    g.fillStyle = glow; g.fillRect(0, 0, W, SAFE_TOP + 400)
    fronts()
    titleBlock(36, SAFE_TOP + 4, 132, COL_W - 64, '#ffffff', CONDENSED, 400, true, true)
    const stats = card.stats.slice(0, 4)
    if (stats.length) {
      const top = 780, room = bottom - 20 - top, per = room / stats.length
      const vs = Math.min(150, per * 0.6), ls = vs * 0.44
      const sf = st.text.stats.font ? FONTS[st.text.stats.font] : CONDENSED
      block('stats', { x: 24, y: top, w: COL_W - 48, h: room }, '#ffffff', true, (ink) => {
        stats.forEach((s, i) => {
          const y = top + i * per + vs
          say(g, s.value, COL_W / 2, y, vs, ink, { font: sf, italic: true, align: 'center', max: COL_W - 60 })
          say(g, s.label, COL_W / 2, y + ls * 1.08, ls, ink, { font: sf, italic: true, align: 'center', max: COL_W - 60 })
        })
      })
    }
    const nf = st.text.pname.font ? { font: FONTS[st.text.pname.font], weight: 900 } : { font: SANS, weight: 900 }
    const midX = COL_W + (W - COL_W) / 2
    const size = Math.min(132, (W - COL_W - 120) / Math.max(1, [...card.name].length))
    const nw = measure(g, card.name, size, nf.font, nf.weight)
    block('pname', { x: midX - nw / 2, y: 1452 - size, w: nw, h: size + 70 }, '#1d1d1f', false, (ink, muted) => {
      say(g, card.name, midX, 1452, size, ink, { font: nf.font, weight: nf.weight, align: 'center' })
      say(g, card.role, midX, 1512, 38, muted, { font: SANS, weight: 600, align: 'center', max: W - COL_W - 80 })
    })
    logo(COL_W + 86, 1386, 96, false)
  } else {
    // ---- the 數據卡: the background as the reader chose
    if (layout !== 'plain') {
      const f = photoFrame(layout)!
      background(f)
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
      if (!fgs.some(Boolean)) {
        // no photo at all: the jersey number (or the family name) fills the frame
        const big = card.number ?? card.name.slice(0, 1)
        g.save(); g.globalAlpha = 0.2
        text(g, big, W / 2, 860, card.number ? 620 : 480, acc, { align: 'center', font: card.number ? FIG : SANS, weight: 800, max: W - 120 })
        g.restore()
      }
    }
    fronts()
    const overPhoto = layout !== 'plain'
    const sh = overPhoto || fgs.some(Boolean)
    const ink0 = st.ink

    block('header', { x: PAD, y: SAFE_TOP, w: W - PAD * 2, h: 64 }, ink0, sh, (ink, _m, font) => {
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
    block('title', { x: PAD, y: SAFE_TOP + 76, w: W - PAD * 2, h: 128 }, ink0, sh, (ink, muted, font) => {
      text(g, card.title, PAD, SAFE_TOP + 138, 68, ink, { weight: 800, max: W - PAD * 2, font: font(SANS) })
      text(g, card.sub, PAD, SAFE_TOP + 190, 30, overPhoto ? ink : muted, { weight: 500, max: W - PAD * 2, font: font(SANS) })
    })
    block('name', { x: PAD, y: 870, w: W - PAD * 2, h: 166 }, ink0, sh, (ink, muted, font) => {
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
    block('big', { x: PAD, y: 1064, w: W - PAD * 2, h: 214 }, ink0, sh, (ink, muted, font) => {
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
      block('small', { x: PAD, y: top, w: W - PAD * 2, h }, ink0, sh, (ink, muted, font) => {
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

    // the sentence (wrapped to the room it has at its size), then the season line above Instagram's reply bar
    const hs = clamp(st.text.headline.scale, SCALE_MIN, SCALE_MAX)
    const lines = wrap(g, card.headline.trim(), (W - PAD * 2 - 26) / Math.max(1, hs), 38).slice(0, 3)
    if (lines.length) {
      const top = Math.min(end + 34, bottom - 62 - lines.length * 50)
      block('headline', { x: PAD, y: top, w: W - PAD * 2, h: lines.length * 50 }, ink0, sh, (ink, _m, font) => {
        g.save(); g.shadowColor = 'transparent'; g.fillStyle = acc; g.fillRect(PAD, top, 6, lines.length * 50 - 8); g.restore()
        lines.forEach((ln, i) => text(g, ln, PAD + 26, top + 36 + i * 50, 38, ink, { weight: 600, font: font(SANS) }))
      })
    }
    block('footer', { x: PAD, y: bottom - 52, w: W - PAD * 2, h: 52 }, ink0, sh, (ink, muted, font) => {
      g.save(); g.shadowColor = 'transparent'; g.fillStyle = alpha(ink, 0.16); g.fillRect(PAD, bottom - 50, W - PAD * 2, 2); g.restore()
      g.font = `500 24px ${font(SANS)}`
      const siteW = g.measureText(card.site).width
      text(g, card.site, W - PAD, bottom - 12, 24, muted, { align: 'right', weight: 500, font: font(SANS) })
      if (card.footer) text(g, card.footer, PAD, bottom - 12, 26, muted, { weight: 500, max: W - PAD * 2 - siteW - 30, font: font(SANS) })
    })
  }

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
