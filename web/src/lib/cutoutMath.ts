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
