/**
 * The arithmetic of 自動去背 (lib/cutout.ts), kept apart so it can be tested without a browser: the model's raw output
 * turned into an alpha mask, and the box round what is left of the photo.
 */

/** The model's output (any range) as alpha 0–255, stretched so the clearest background is 0 and the clearest subject 255. */
export function toAlpha(raw: ArrayLike<number>): Uint8ClampedArray | null {
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < raw.length; i++) { const v = raw[i]; if (v < lo) lo = v; if (v > hi) hi = v }
  if (!(hi - lo > 1e-6)) return null
  const out = new Uint8ClampedArray(raw.length), k = 255 / (hi - lo)
  for (let i = 0; i < raw.length; i++) out[i] = (raw[i] - lo) * k
  return out
}

/** The box round the pixels at least `min` opaque in RGBA data (null when nothing is left), with `pad` pixels round it. */
export function alphaBounds(rgba: ArrayLike<number>, w: number, h: number, min = 24, pad = 0): { x: number; y: number; w: number; h: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3] >= min) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 < 0) return null
  const x = Math.max(0, x0 - pad), y = Math.max(0, y0 - pad)
  return { x, y, w: Math.min(w, x1 + 1 + pad) - x, h: Math.min(h, y1 + 1 + pad) - y }
}

/** A photo's size brought within `max` on its longer side (the cut-out is made at this size). */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const s = Math.min(1, max / Math.max(w, h, 1))
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) }
}

/**
 * The model's mask cleaned up for a person with a bat or glove (the subject, whole, and nothing else):
 * 1. contrast: a faint haze (alpha below ~25 %) goes, the clearly-subject (above ~75 %) becomes solid, the edge between stays soft;
 * 2. leftovers: the solid parts are grouped by touch (4-neighbour); the biggest is the subject, and only parts at least 8 % of
 *    its size stay (a bat held in a hand touches the hand, so it stays with him) — a far-off scrap of background goes, with the
 *    soft edge round it;
 * 3. holes: small enclosed gaps inside the subject (a dark logo read as background) are filled; a real gap that reaches the
 *    edge of the picture, or a large one (between an arm and the body), stays.
 */
export function refineAlpha(alpha: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const n = w * h, out = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i++) { const a = alpha[i]; out[i] = a <= 64 ? 0 : a >= 191 ? 255 : (a - 64) * 2 }
  // 2. the solid parts, grouped
  const label = new Int32Array(n).fill(-1), sizes: number[] = [], stack = new Int32Array(n)
  for (let s = 0; s < n; s++) {
    if (out[s] < 128 || label[s] >= 0) continue
    const id = sizes.length; let top = 0, size = 0
    stack[top++] = s; label[s] = id
    while (top) {
      const p = stack[--top]; size++
      const x = p % w, y = (p - x) / w
      if (x > 0 && label[p - 1] < 0 && out[p - 1] >= 128) { label[p - 1] = id; stack[top++] = p - 1 }
      if (x < w - 1 && label[p + 1] < 0 && out[p + 1] >= 128) { label[p + 1] = id; stack[top++] = p + 1 }
      if (y > 0 && label[p - w] < 0 && out[p - w] >= 128) { label[p - w] = id; stack[top++] = p - w }
      if (y < h - 1 && label[p + w] < 0 && out[p + w] >= 128) { label[p + w] = id; stack[top++] = p + w }
    }
    sizes.push(size)
  }
  if (!sizes.length) return out
  const biggest = Math.max(...sizes), keep = sizes.map((s) => s >= biggest * 0.08)
  // the kept parts, grown by a few pixels: the soft edge next to them stays, the rest of the soft pixels go
  const kept = new Uint8Array(n)
  for (let i = 0; i < n; i++) if (label[i] >= 0 && keep[label[i]]) kept[i] = 1
  const R = Math.max(2, Math.round(Math.max(w, h) / 170))
  const near = dilate(kept, w, h, R)
  for (let i = 0; i < n; i++) if (label[i] >= 0 ? !keep[label[i]] : !near[i]) out[i] = 0
  // 3. small enclosed holes
  const seen = new Uint8Array(n), hole: number[] = []
  for (let s = 0; s < n; s++) {
    if (out[s] >= 128 || seen[s]) continue
    let top = 0, edge = false; hole.length = 0
    stack[top++] = s; seen[s] = 1
    while (top) {
      const p = stack[--top]; hole.push(p)
      const x = p % w, y = (p - x) / w
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true
      if (x > 0 && !seen[p - 1] && out[p - 1] < 128) { seen[p - 1] = 1; stack[top++] = p - 1 }
      if (x < w - 1 && !seen[p + 1] && out[p + 1] < 128) { seen[p + 1] = 1; stack[top++] = p + 1 }
      if (y > 0 && !seen[p - w] && out[p - w] < 128) { seen[p - w] = 1; stack[top++] = p - w }
      if (y < h - 1 && !seen[p + w] && out[p + w] < 128) { seen[p + w] = 1; stack[top++] = p + w }
    }
    if (!edge && hole.length < biggest * 0.004) for (const p of hole) out[p] = 255
  }
  return out
}

/** A 0/1 mask grown by `r` pixels (a square, done as two passes of running maxima). */
function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(m.length), out = new Uint8Array(m.length)
  for (let y = 0; y < h; y++) {
    let last = -Infinity
    for (let x = 0; x < w; x++) { if (m[y * w + x]) last = x; if (x - last <= r) tmp[y * w + x] = 1 }
    last = Infinity
    for (let x = w - 1; x >= 0; x--) { if (m[y * w + x]) last = x; if (last - x <= r) tmp[y * w + x] = 1 }
  }
  for (let x = 0; x < w; x++) {
    let last = -Infinity
    for (let y = 0; y < h; y++) { if (tmp[y * w + x]) last = y; if (y - last <= r) out[y * w + x] = 1 }
    last = Infinity
    for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) last = y; if (last - y <= r) out[y * w + x] = 1 }
  }
  return out
}
