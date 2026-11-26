/**
 * 先發陣容 IG 貼文 on a canvas, 1080 × 1350 (an Instagram portrait post), after the team's own STARTING LINEUP posts:
 * a pale concrete wall, the title in blue brush capitals with the team under it, a cut-out player on the left, the lineup
 * on the right (positions in blue, names in black — the player in the photo in red), and at the bottom the two teams'
 * badges, the date and the field. One face per script (the user's rule): Knewave for letters and figures, 王漢宗顏楷體
 * (the team's own posts' face) for the names — or Noto Serif TC for every name when it lacks a character of one of them. The photo never leaves
 * the device.
 */
import type { LineupPostRow } from '../data/lineupPost'
import { BRUSH_CJK, BRUSH_LATIN, drawsAll, SERIF_CJK } from './storyFonts'
import { wall } from './storyImage'

export const POST_W = 1080, POST_H = 1350
type Photo = CanvasImageSource & { width: number; height: number }

/** Where the player photo sits: its centre and its height (in card pixels). */
export interface PostPhoto { cx: number; cy: number; h: number }
export const DEFAULT_POST_PHOTO: PostPhoto = { cx: 300, cy: 760, h: 760 }

export interface LineupPostLook {
  title: string
  /** the line under the title: 「NTU BAFIN BASEBALL」 */
  team: string
  /** 「SUN, 10/18/2026 | 3:00 PM」 and 「@NTU BASEBALL FIELD」 (either may be '') */
  date: string
  venue: string
  /** the blue of the title, positions and date; the red of the player in the photo; the black of the rest */
  accent: string
  highlight: string
  ink: string
}
export function defaultLook(teamShort: string): LineupPostLook {
  return { title: 'STARTING LINEUP', team: `${teamShort} BASEBALL`.toUpperCase(), date: '', venue: '', accent: '#2a4a9e', highlight: '#d0323a', ink: '#141414' }
}

export interface LineupPostDraw {
  rows: LineupPostRow[]
  /** the name drawn in the highlight colour (the player in the photo); '' = nobody */
  highlight: string
  look: LineupPostLook
  photo?: Photo | null
  place?: PostPhoto
  /** our badge and theirs (theirs: a picked picture, else a white disc with their name) */
  mark?: Photo | null
  oppLogo?: Photo | null
  opponent?: string
}

const CJK = /[㐀-鿿豈-﫿]/
/** The names' face: the brush where it has every character of every name, else the serif for all of them. */
export function nameFace(rows: LineupPostRow[]): { font: string; weight: number; brush: boolean } {
  const han = [...new Set(rows.map((r) => r.name).join('').split('').filter((c) => CJK.test(c)))].join('')
  const brush = drawsAll(BRUSH_CJK, han)
  return brush ? { font: `${BRUSH_LATIN}, ${BRUSH_CJK}, serif`, weight: 400, brush } : { font: `${BRUSH_LATIN}, ${SERIF_CJK}, serif`, weight: 700, brush }
}

/** The photo's rectangle (its own shape, the height asked). */
export function postPhotoRect(p: Photo, place: PostPhoto) {
  const h = place.h, w = (h * p.width) / Math.max(1, p.height)
  return { x: place.cx - w / 2, y: place.cy - h / 2, w, h }
}

function say(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, font: string, o: { align?: CanvasTextAlign; max?: number; weight?: number; spacing?: number } = {}) {
  g.font = `${o.weight ?? 400} ${size}px ${font}`; g.fillStyle = color; g.textAlign = o.align ?? 'left'; g.textBaseline = 'alphabetic'
  if (o.spacing && 'letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing}px`
  g.fillText(s, x, y, o.max)
  if (o.spacing && 'letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'
}

/** Draws the post on `c` (sized to 1080 × 1350 here). Returns the photo's rectangle (for dragging), or null without a canvas. */
export function drawLineupPost(c: HTMLCanvasElement, d: LineupPostDraw): { photo?: { x: number; y: number; w: number; h: number } } | null {
  c.width = POST_W; c.height = POST_H
  const g = c.getContext('2d')
  if (!g) return null
  const W = POST_W, H = POST_H, L = d.look, LAT = `${BRUSH_LATIN}, sans-serif`
  g.fillStyle = '#dedad3'; g.fillRect(0, 0, W, H)
  const t = wall(W, H, '#dedad3'); if (t) g.drawImage(t, 0, 0)
  // a soft light from the top left, like the photographed wall
  const light = g.createRadialGradient(W * 0.3, H * 0.15, 0, W * 0.3, H * 0.15, W)
  light.addColorStop(0, 'rgba(255,255,255,0.35)'); light.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = light; g.fillRect(0, 0, W, H)

  // ---- the title and the team
  say(g, L.title, W / 2, 205, 128, L.accent, LAT, { align: 'center', max: W - 120 })
  say(g, L.team, W / 2, 268, 48, L.ink, LAT, { align: 'center', max: W - 200 })

  // ---- the player in the photo (under the lineup, so a long name is never hidden)
  let photo: { x: number; y: number; w: number; h: number } | undefined
  if (d.photo) {
    photo = postPhotoRect(d.photo, d.place ?? DEFAULT_POST_PHOTO)
    g.save(); g.shadowColor = 'rgba(0,0,0,0.22)'; g.shadowBlur = 26; g.shadowOffsetY = 10
    g.drawImage(d.photo, photo.x, photo.y, photo.w, photo.h)
    g.restore()
  }

  // ---- the lineup: positions in the accent, names in ink, the player in the photo in the highlight colour
  const rows = d.rows.slice(0, 11)
  // one CJK face for every Chinese word on the post: the names, their team, the field
  const nf = nameFace([...rows, { pos: '', name: d.oppLogo ? '' : d.opponent ?? '' }, { pos: '', name: L.venue }])
  if (rows.length) {
    const top = 352, room = 1060 - top
    const step = Math.min(84, room / rows.length)
    const size = Math.min(66, step * 0.82)
    const px = 628, nx = 760
    rows.forEach((r, i) => {
      const y = top + step * (i + 0.8)
      const on = !!d.highlight && r.name === d.highlight
      say(g, r.pos, px, y, size, on ? L.highlight : L.accent, LAT, { max: nx - px - 16 })
      say(g, r.name, nx, y, size * 0.92, on ? L.highlight : L.ink, nf.font, { weight: nf.weight, max: W - nx - 50, spacing: Math.round(size * 0.12) })
    })
  }

  // ---- the two badges, the date and the field
  const by = 1212
  const disc = (cx: number, cy: number, r: number) => { g.save(); g.shadowColor = 'rgba(0,0,0,0.18)'; g.shadowBlur = 16; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); g.restore() }
  if (d.oppLogo) {
    disc(160, by, 84)
    g.save(); g.beginPath(); g.arc(160, by, 80, 0, Math.PI * 2); g.clip()
    const s = Math.max(160 / d.oppLogo.width, 160 / d.oppLogo.height)
    g.drawImage(d.oppLogo, 160 - (d.oppLogo.width * s) / 2, by - (d.oppLogo.height * s) / 2, d.oppLogo.width * s, d.oppLogo.height * s)
    g.restore()
  } else if (d.opponent) {
    disc(160, by, 84)
    say(g, d.opponent, 160, by + 16, Math.min(46, 130 / Math.max(1, [...d.opponent].length) * 1.2), L.ink, nf.font, { align: 'center', weight: nf.weight, max: 140 })
  }
  say(g, 'VS', 318, by + 18, 52, L.ink, LAT, { align: 'center' })
  if (d.mark) {
    const s = 150 / Math.max(d.mark.width, d.mark.height)
    g.drawImage(d.mark, 460 - (d.mark.width * s) / 2, by - (d.mark.height * s) / 2, d.mark.width * s, d.mark.height * s)
  }
  if (L.date) say(g, L.date, W - 60, by - 6, 46, L.accent, LAT, { align: 'right', max: W - 620 })
  if (L.venue) say(g, L.venue, W - 60, by + 58, 46, L.ink, nf.font, { align: 'right', max: W - 620, weight: nf.weight })
  return { photo }
}
