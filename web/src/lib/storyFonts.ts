/**
 * The poster templates' typefaces (限時動態 斜切海報／直排姓名／左欄數據), from Google Fonts, asked for only when the story
 * dialog opens (the site's other pages never load them): Knewave (the brush title), Anton (the condensed numbers),
 * Playfair Display (the serif title), Yuji Boku (the brush name) and Noto Serif TC 900 (the name where Yuji Boku lacks a
 * character, e.g. 堉 or 澔). The CSP already allows fonts.googleapis.com / fonts.gstatic.com.
 */
const CSS = 'https://fonts.googleapis.com/css2?family=Knewave&family=Anton&family=Playfair+Display:wght@700;900&family=Yuji+Boku&family=Noto+Serif+TC:wght@700;900&display=swap'

export const BRUSH_LATIN = '"Knewave"'
export const CONDENSED = '"Anton"'
export const SERIF_LATIN = '"Playfair Display"'
export const BRUSH_CJK = '"Yuji Boku"'
export const SERIF_CJK = '"Noto Serif TC"'

let linked = false
/** Adds the stylesheet once and loads the faces for `text` (the player's name: CJK fonts come in slices). */
export async function loadStoryFonts(text = ''): Promise<void> {
  if (typeof document === 'undefined') return
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
    fs.load(`400 100px ${BRUSH_CJK}`, text || '林'), fs.load(`900 100px ${SERIF_CJK}`, text || '林'),
  ].map((p) => p.catch(() => [])))
}

/**
 * Whether `family` draws every character of `text` itself. CJK characters all have the same width, so instead each one
 * is drawn twice, with a serif and then a sans-serif fallback behind the family: the same pixels mean the family drew it.
 * (Where the device has one CJK face for both fallbacks this says yes, and the name simply mixes in that face.)
 */
export function drawsAll(family: string, text: string, weight = 400): boolean {
  if (typeof document === 'undefined') return true
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
