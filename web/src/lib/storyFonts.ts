/**
 * The poster templates' typefaces (限時動態 斜切海報／直排姓名／左欄數據, 先發陣容 IG 貼文), asked for only when such a dialog
 * opens (the site's other pages never load them). From Google Fonts: Knewave (the brush title), Anton (the condensed
 * numbers), Playfair Display (the serif title), Noto Serif TC 900 (the fallback). The brush Chinese is 王漢宗顏楷體 — the face
 * of the team's own posts (the user named it, 2026-11-26) —, a GPL v2 free font kept in the repo's fonts/ (not in web/, so
 * not in every deployment) and read from jsDelivr at one pinned commit (CSP font-src allows cdn.jsdelivr.net for it).
 */
const CSS = 'https://fonts.googleapis.com/css2?family=Knewave&family=Anton&family=Playfair+Display:wght@700;900&family=Noto+Serif+TC:wght@700;900&display=swap'
/** fonts/HanWangYanKai.woff2 (4.5 MB, 13,970 characters) at the commit that added it */
export const YANKAI_URL = 'https://cdn.jsdelivr.net/gh/alanwu14832-bit/bafinstat@aa8ca209fbbf2fabee6c85280ec877b00d009ff0/fonts/HanWangYanKai.woff2'

export const BRUSH_LATIN = '"Knewave"'
export const CONDENSED = '"Anton"'
export const SERIF_LATIN = '"Playfair Display"'
export const BRUSH_CJK = '"HanWang YanKai"'
export const SERIF_CJK = '"Noto Serif TC"'

let linked = false
let yankai: Promise<void> | null = null
/** 王漢宗顏楷體, added to the page once (one download; the browser keeps it). */
function loadYanKai(): Promise<void> {
  if (typeof FontFace === 'undefined') return Promise.resolve()
  return (yankai ??= new FontFace('HanWang YanKai', `url(${YANKAI_URL}) format('woff2')`, { display: 'swap' }).load()
    .then((f) => { (document as Document & { fonts?: FontFaceSet }).fonts?.add(f) })
    .catch(() => { yankai = null }))
}
/** Adds the stylesheet once and loads the faces for `text` (the player's name: CJK fonts come in slices). */
export async function loadStoryFonts(text = ''): Promise<void> {
  if (typeof document === 'undefined') return
  const brush = loadYanKai()
  if (!linked) {
    linked = true
    const l = document.createElement('link')
    l.rel = 'stylesheet'; l.href = CSS
    document.head.appendChild(l)
    await new Promise<void>((done) => { l.onload = () => done(); l.onerror = () => done(); setTimeout(done, 4000) })
  }
  const fs = (document as Document & { fonts?: FontFaceSet }).fonts
  if (!fs?.load) return
  const sample = `PLAYER OF THE GAME 0123456789.-${text}`
  await Promise.all([
    fs.load(`400 100px ${BRUSH_LATIN}`, sample), fs.load(`400 100px ${CONDENSED}`, sample), fs.load(`700 100px ${SERIF_LATIN}`, sample),
    fs.load(`900 100px ${SERIF_CJK}`, text || '林'), brush,
  ].map((p) => Promise.resolve(p).catch(() => [])))
}

/**
 * Whether `family` draws every character of `text` itself. CJK characters all have the same width, so instead each one
 * is drawn twice, with a serif and then a sans-serif fallback behind the family: the same pixels mean the family drew it.
 * (Where the device has one CJK face for both fallbacks this says yes, and the name simply mixes in that face.)
 */
const known = new Map<string, boolean>()
export function drawsAll(family: string, text: string, weight = 400): boolean {
  if (typeof document === 'undefined' || !text) return true
  // a font that has not arrived yet draws as the fallback: only remember the answer once it is there (asked of the page's
  // own list of faces — document.fonts.check() says "nothing to wait for" about a face not added yet, and on Safari a
  // "lacks a character" read before the download was kept for good, leaving the card in the serif)
  const key = `${weight}|${family}|${text}`, hit = known.get(key)
  if (hit !== undefined) return hit
  const r = check(family, text, weight)
  if (familyLoaded(family)) known.set(key, r)
  return r
}
/** Whether a face of the stack's first family has finished loading on this page. */
export function familyLoaded(family: string): boolean {
  const name = family.split(',')[0].trim().replace(/^["']|["']$/g, '')
  const set = (document as Document & { fonts?: FontFaceSet }).fonts
  if (!set?.forEach) return false
  let loaded = false
  set.forEach((f) => { if (f.family.replace(/^["']|["']$/g, '') === name && f.status === 'loaded') loaded = true })
  return loaded
}
function check(family: string, text: string, weight: number): boolean {
  const c = document.createElement('canvas'); c.width = 48; c.height = 48
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) return true
  const shot = (font: string, ch: string) => { g.clearRect(0, 0, 48, 48); g.font = font; g.fillStyle = '#000'; g.textBaseline = 'middle'; g.fillText(ch, 4, 24); return g.getImageData(0, 0, 48, 48).data }
  for (const ch of text) {
    if (!ch.trim()) continue
    const a = shot(`${weight} 40px ${family}, serif`, ch), b = shot(`${weight} 40px ${family}, sans-serif`, ch)
    for (let i = 3; i < a.length; i += 4) if (a[i] !== b[i]) return false
  }
  return true
}
