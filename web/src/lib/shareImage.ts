/**
 * Share images drawn on a canvas (no extra library): a game's 戰報圖 and a player's 成績卡, 1080 × 1350 (a phone /
 * Instagram portrait). Each one says what it covers (date or period, sample) so a screenshot passed around keeps
 * its context. Colours: the dark scoreboard surface and the team colour lifted for a dark background.
 */
const W = 1080, H = 1350
const BG = '#141517', INK = '#f3efe7', MUTED = 'rgba(243,239,231,0.6)', LINE = 'rgba(243,239,231,0.16)'
const SANS = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif'
const FIG = '"Barlow Semi Condensed", "SF Pro Display", system-ui, sans-serif'

function accent(): string {
  const a = typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() : ''
  return a || '#e2a03a'
}

/** The team colour mixed toward the board's ink, so a dark navy still reads on the dark background. */
function lifted(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#e2a03a'
  const n = parseInt(m[1], 16), mix = (c: number, t: number) => Math.round(c * 0.62 + t * 0.38)
  return `rgb(${mix(n >> 16, 243)}, ${mix((n >> 8) & 255, 239)}, ${mix(n & 255, 231)})`
}

function canvas(w = W, h = H) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = BG; g.fillRect(0, 0, w, h)
  // LED dots and a glow of the team colour from the top, like the 即時比分 board
  g.fillStyle = 'rgba(255,255,255,0.035)'
  for (let y = 2; y < h; y += 8) for (let x = 2; x < w; x += 8) g.fillRect(x, y, 2, 2)
  const glow = g.createRadialGradient(w / 2, 0, 0, w / 2, 0, 700)
  glow.addColorStop(0, `${lifted(accent()).replace('rgb', 'rgba').replace(')', ', 0.22)')}`); glow.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = glow; g.fillRect(0, 0, w, 700)
  return { c, g }
}

const text = (g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, opts: { font?: string; weight?: number; align?: CanvasTextAlign; max?: number } = {}) => {
  g.font = `${opts.weight ?? 600} ${size}px ${opts.font ?? SANS}`; g.fillStyle = color; g.textAlign = opts.align ?? 'left'; g.textBaseline = 'alphabetic'
  g.fillText(s, x, y, opts.max)
}

/** Wraps a sentence into lines that fit `width`. */
function wrap(g: CanvasRenderingContext2D, s: string, width: number, size: number): string[] {
  g.font = `500 ${size}px ${SANS}`
  const out: string[] = []; let line = ''
  // numbers and Latin words stay whole (「1.75」 never breaks); CJK may break between any two characters
  for (const tok of s.match(/[A-Za-z0-9.+%/:-]+|[\s\S]/g) ?? []) { if (g.measureText(line + tok).width > width && line) { out.push(line); line = tok.trimStart() } else line += tok }
  if (line) out.push(line)
  return out
}

function download(c: HTMLCanvasElement, name: string) {
  c.toBlob((b) => {
    if (!b) return
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }, 'image/png')
}

export interface GameImage {
  teamName: string; opponent: string; date: string; meta: string; result: 'W' | 'L' | 'T'
  runsUs: number; runsOpp: number; lineUs: number[]; lineOpp: number[]; hitsUs: number; hitsOpp: number; errorsUs: number; errorsOpp: number
  weTop: boolean; lines: Array<{ label: string; text: string }>; footer: string
}

/** 戰報圖: score, line score, and the recap sentences. */
export function downloadGameImage(d: GameImage) {
  const { c, g } = canvas()
  const acc = lifted(accent())
  text(g, d.meta, 72, 110, 30, MUTED, { weight: 500 })
  text(g, d.result === 'W' ? '勝' : d.result === 'L' ? '敗' : '和', W - 72, 112, 44, d.result === 'W' ? acc : INK, { align: 'right', weight: 800 })
  const rows = d.weTop ? [{ n: d.teamName, r: d.runsUs, us: true }, { n: d.opponent, r: d.runsOpp, us: false }] : [{ n: d.opponent, r: d.runsOpp, us: false }, { n: d.teamName, r: d.runsUs, us: true }]
  rows.forEach((t, i) => {
    const y = 270 + i * 170
    text(g, t.n, 72, y, 52, t.us ? acc : INK, { weight: 700, max: 700 })
    text(g, String(t.r), W - 72, y + 24, 150, t.us ? INK : MUTED, { align: 'right', font: FIG, weight: 700 })
  })
  // line score
  const n = Math.max(d.lineUs.length, d.lineOpp.length), top = 560, cw = Math.min(64, 640 / Math.max(n, 1))
  g.strokeStyle = LINE; g.lineWidth = 2; g.strokeRect(60, top - 50, W - 120, 210)
  const lines = d.weTop ? [d.lineUs, d.lineOpp] : [d.lineOpp, d.lineUs]
  const rhe = d.weTop ? [[d.runsUs, d.hitsUs, d.errorsUs], [d.runsOpp, d.hitsOpp, d.errorsOpp]] : [[d.runsOpp, d.hitsOpp, d.errorsOpp], [d.runsUs, d.hitsUs, d.errorsUs]]
  for (let i = 0; i < n; i++) text(g, String(i + 1), 100 + i * cw + cw / 2, top, 26, MUTED, { align: 'center', font: FIG })
  ;['R', 'H', 'E'].forEach((h, k) => text(g, h, W - 300 + k * 80, top, 26, k === 0 ? INK : MUTED, { align: 'center', font: FIG }))
  lines.forEach((l, r) => {
    for (let i = 0; i < n; i++) text(g, String(l[i] ?? 0), 100 + i * cw + cw / 2, top + 60 + r * 64, 38, INK, { align: 'center', font: FIG, weight: 600 })
    rhe[r].forEach((v, k) => text(g, String(v), W - 300 + k * 80, top + 60 + r * 64, 40, INK, { align: 'center', font: FIG, weight: k === 0 ? 800 : 600 }))
  })
  // recap
  let y = 860
  for (const l of d.lines.slice(0, 4)) {
    text(g, l.label, 72, y, 28, acc, { weight: 700 }); y += 46
    for (const ln of wrap(g, l.text, W - 144, 32).slice(0, 3)) { text(g, ln, 72, y, 32, INK, { weight: 500 }); y += 46 }
    y += 18
    if (y > H - 120) break
  }
  g.fillStyle = LINE; g.fillRect(72, H - 96, W - 144, 2)
  text(g, d.footer, 72, H - 50, 24, MUTED, { weight: 500, max: W - 144 })
  download(c, `戰報_${d.date}_${d.opponent}.png`)
}

/** The jersey-number shield of the 成績卡 and the 百分位 card. */
function plate(g: CanvasRenderingContext2D, acc: string, label: string) {
  g.fillStyle = acc; g.beginPath(); g.moveTo(72, 90); g.lineTo(252, 90); g.lineTo(252, 200); g.lineTo(162, 270); g.lineTo(72, 200); g.closePath(); g.fill()
  text(g, label, 162, 200, 96, BG, { align: 'center', font: FIG, weight: 800 })
}

export interface PlayerImage { name: string; number?: string; meta: string; period: string; big: Array<{ label: string; value: string }>; lines: string[]; footer: string }

/** 成績卡: jersey number, name, the three headline numbers and a few sample lines. */
export function downloadPlayerImage(d: PlayerImage) {
  const { c, g } = canvas()
  const acc = lifted(accent())
  // home-plate jersey badge
  plate(g, acc, d.number ?? d.name.slice(0, 1))
  text(g, d.name, 300, 170, 88, INK, { weight: 800, max: W - 380 })
  text(g, d.meta, 300, 232, 32, MUTED, { weight: 500, max: W - 380 })
  text(g, d.period, 72, 380, 30, MUTED, { weight: 500, max: W - 144 })
  d.big.slice(0, 3).forEach((b, i) => {
    const x = 72 + i * 320
    text(g, b.label, x, 470, 30, MUTED, { weight: 600 })
    text(g, b.value, x, 600, 128, i === 0 ? acc : INK, { font: FIG, weight: 800 })
  })
  let y = 760
  for (const l of d.lines.slice(0, 8)) { for (const ln of wrap(g, l, W - 144, 34)) { text(g, ln, 72, y, 34, INK, { weight: 500 }); y += 52 } y += 10 }
  g.fillStyle = LINE; g.fillRect(72, H - 96, W - 144, 2)
  text(g, d.footer, 72, H - 50, 24, MUTED, { weight: 500, max: W - 144 })
  download(c, `成績卡_${d.name}.png`)
}

// ---------------------------------------------------------------- 隊內百分位 and 多人比較

/** A PR's colour on the dark image: straight lines in sRGB between blue (0), grey (50) and red (100) — the dark-mode
 *  --pr-cold / --pr-mid / --pr-hot. */
export function prRgb(pr: number): string {
  const COLD = [93, 147, 220], MID = [95, 95, 102], HOT = [232, 97, 95]
  const p = Math.max(0, Math.min(100, pr))
  const [from, to, t] = p >= 50 ? [MID, HOT, (p - 50) / 50] : [MID, COLD, (50 - p) / 50]
  const c = from.map((v, i) => Math.round(v + (to[i] - v) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}
const withAlpha = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `,${a})`)

/** The comparison image's size: a 300px header, 56px per row and a 130px footer. */
export const compareImageSize = (_players: number, rows: number) => ({ w: W, h: 300 + rows * 56 + 130 })

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
}

export interface PercentileImage {
  name: string; number?: string; meta: string; period: string
  rows: Array<{ name: string; label: string; group: string; display: string; pr: number | null; small: boolean }>
  poolNote: string; footer: string
}

/** 百分位圖: the 成績卡 header, then one bar per stat from 0 to the player's PR, grouped like the page. */
export function downloadPercentileImage(d: PercentileImage) {
  const { c, g } = canvas()
  const acc = lifted(accent())
  plate(g, acc, d.number ?? d.name.slice(0, 1))
  text(g, d.name, 300, 170, 88, INK, { weight: 800, max: W - 380 })
  text(g, d.meta, 300, 232, 32, MUTED, { weight: 500, max: W - 380 })
  text(g, `隊內百分位・${d.period}`, 72, 300, 28, MUTED, { weight: 500, max: W - 144 })
  const groups = [...new Set(d.rows.map((r) => r.group))]
  const top = 330, bottom = H - 130, GROUP = 44
  // 58px a row when it fits (13 batting bars), a little less for 14 pitching bars in 4 groups
  const ROW = Math.min(58, (bottom - top - groups.length * GROUP) / Math.max(d.rows.length, 1))
  const LABEL = 200, BAR = 560, x0 = 72 + LABEL + 16
  let y = top
  for (const grp of groups) {
    text(g, grp, 72, y + 30, 26, acc, { weight: 700 }); y += GROUP
    for (const r of d.rows.filter((x) => x.group === grp)) {
      const mid = y + ROW / 2
      text(g, r.name, 72, mid + 2, 28, INK, { weight: 600, max: LABEL })
      text(g, r.label, 72, mid + 26, 18, MUTED, { weight: 500, font: FIG, max: LABEL })
      g.fillStyle = 'rgba(243,239,231,0.10)'; roundRect(g, x0, mid - 7, BAR, 14, 7); g.fill()
      if (r.pr !== null) {
        const col = r.small ? 'rgb(95,95,102)' : prRgb(r.pr)
        const end = x0 + (BAR * r.pr) / 100
        g.globalAlpha = r.small ? 0.6 : 1
        g.fillStyle = col; roundRect(g, x0, mid - 7, Math.max(14, end - x0), 14, 7); g.fill()
        g.beginPath(); g.arc(Math.max(x0 + 20, Math.min(x0 + BAR - 20, end)), mid, 20, 0, Math.PI * 2); g.fill()
        g.globalAlpha = 1
        text(g, String(r.pr), Math.max(x0 + 20, Math.min(x0 + BAR - 20, end)), mid + 8, 22, '#fff', { align: 'center', font: FIG, weight: 800 })
      }
      text(g, r.display, W - 72, mid + 10, 30, r.small ? MUTED : INK, { align: 'right', font: FIG, weight: 700, max: 120 })
      y += ROW
    }
  }
  g.fillStyle = LINE; g.fillRect(72, H - 110, W - 144, 2)
  text(g, d.poolNote, 72, H - 70, 22, MUTED, { weight: 500, max: W - 144 })
  text(g, d.footer, 72, H - 36, 22, MUTED, { weight: 500, max: W - 144 })
  download(c, `百分位_${d.name}.png`)
}

export interface CompareImage {
  title: string; subtitle: string
  players: Array<{ name: string; number?: string; note: string }>
  rows: Array<{ label: string; cells: Array<{ text: string; pr: number | null; best: boolean; more: boolean; small: boolean }> }>
  footer: string
}

/** 比較圖: one column per player (up to 9), one row per stat, cells coloured by PR, the best of each row outlined. */
export function downloadCompareImage(d: CompareImage) {
  const n = Math.max(1, d.players.length)
  const { w, h } = compareImageSize(n, d.rows.length)
  const { c, g } = canvas(w, h)
  const acc = lifted(accent())
  const LABEL = 200, col = (w - 144 - LABEL) / n, x0 = 72 + LABEL
  text(g, d.title, 72, 96, 52, INK, { weight: 800, max: w - 144 })
  text(g, d.subtitle, 72, 148, 26, MUTED, { weight: 500, max: w - 144 })
  d.players.forEach((p, i) => {
    const cx = x0 + col * i + col / 2
    if (p.number) text(g, `#${p.number}`, cx, 214, 26, acc, { align: 'center', font: FIG, weight: 700, max: col - 8 })
    text(g, p.name, cx, 252, 30, i === 0 ? acc : INK, { align: 'center', weight: 700, max: col - 8 })
    text(g, p.note, cx, 282, 20, MUTED, { align: 'center', weight: 500, max: col - 8 })
  })
  d.rows.forEach((r, k) => {
    const y = 300 + k * 56
    text(g, r.label, 72, y + 37, 26, MUTED, { weight: 600, font: /^[\x20-\x7e]+$/.test(r.label) ? FIG : SANS, max: LABEL - 12 })
    r.cells.forEach((cell, i) => {
      const x = x0 + col * i + 4, cw = col - 8
      if (cell.pr !== null && !cell.small) { g.fillStyle = withAlpha(prRgb(cell.pr), 0.85); roundRect(g, x, y + 6, cw, 44, 10); g.fill() }
      if (cell.best) { g.strokeStyle = '#fff'; g.lineWidth = 3; roundRect(g, x + 1.5, y + 7.5, cw - 3, 41, 9); g.stroke() }
      text(g, cell.text, x + cw / 2, y + 38, 28, cell.small ? MUTED : INK, { align: 'center', font: FIG, weight: cell.best || cell.more ? 800 : 600, max: cw - 6 })
    })
  })
  g.fillStyle = LINE; g.fillRect(72, h - 96, w - 144, 2)
  text(g, d.footer, 72, h - 50, 22, MUTED, { weight: 500, max: w - 144 })
  const date = new Date(), ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  download(c, `比較_${(d.title.trim() || ymd).replace(/[\\/:*?"<>|]/g, '_')}.png`)
}
