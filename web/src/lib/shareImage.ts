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

function canvas() {
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = BG; g.fillRect(0, 0, W, H)
  // LED dots and a glow of the team colour from the top, like the 即時比分 board
  g.fillStyle = 'rgba(255,255,255,0.035)'
  for (let y = 2; y < H; y += 8) for (let x = 2; x < W; x += 8) g.fillRect(x, y, 2, 2)
  const glow = g.createRadialGradient(W / 2, 0, 0, W / 2, 0, 700)
  glow.addColorStop(0, `${lifted(accent()).replace('rgb', 'rgba').replace(')', ', 0.22)')}`); glow.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = glow; g.fillRect(0, 0, W, 700)
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

export interface PlayerImage { name: string; number?: string; meta: string; period: string; big: Array<{ label: string; value: string }>; lines: string[]; footer: string }

/** 成績卡: jersey number, name, the three headline numbers and a few sample lines. */
export function downloadPlayerImage(d: PlayerImage) {
  const { c, g } = canvas()
  const acc = lifted(accent())
  // home-plate jersey badge
  g.fillStyle = acc; g.beginPath(); g.moveTo(72, 90); g.lineTo(252, 90); g.lineTo(252, 200); g.lineTo(162, 270); g.lineTo(72, 200); g.closePath(); g.fill()
  text(g, d.number ?? d.name.slice(0, 1), 162, 200, 96, BG, { align: 'center', font: FIG, weight: 800 })
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
