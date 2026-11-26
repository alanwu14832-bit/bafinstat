import { alphaBounds, fitWithin, refineAlpha, toAlpha } from './cutoutMath'

describe('自動去背的計算', () => {
  it('stretches the model output to 0–255, and gives up on a flat one', () => {
    expect([...toAlpha([-2, 0, 2])!]).toEqual([0, 128, 255])
    expect([...toAlpha([0.1, 0.3, 0.9])!]).toEqual([0, 64, 255])
    expect(toAlpha([0.5, 0.5, 0.5])).toBeNull()
    expect(toAlpha([])).toBeNull()
  })
  it('finds the box round what is left, with padding kept inside the picture', () => {
    const w = 6, h = 5, px = new Uint8ClampedArray(w * h * 4)
    const set = (x: number, y: number, a: number) => { px[(y * w + x) * 4 + 3] = a }
    set(2, 1, 255); set(4, 3, 200); set(0, 4, 10)   // the last is too faint to count
    expect(alphaBounds(px, w, h)).toEqual({ x: 2, y: 1, w: 3, h: 3 })
    expect(alphaBounds(px, w, h, 24, 2)).toEqual({ x: 0, y: 0, w: 6, h: 5 })
    expect(alphaBounds(new Uint8ClampedArray(w * h * 4), w, h)).toBeNull()
  })
  it('brings a large photo within the working size, never enlarging a small one', () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ w: 2048, h: 1536 })
    expect(fitWithin(800, 1200, 2048)).toEqual({ w: 800, h: 1200 })
  })
})

describe('去背後的清理', () => {
  const grid = (w: number, h: number, f: (x: number, y: number) => number) => { const a = new Uint8ClampedArray(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y); return a }
  it('a faint haze goes, the subject goes solid, the edge stays soft', () => {
    const r = refineAlpha(grid(40, 40, (x, y) => (x > 10 && x < 30 && y > 5 && y < 35 ? 230 : x === 30 ? 128 : 40)), 40, 40)
    expect(r[20 * 40 + 20]).toBe(255)
    expect(r[20 * 40 + 2]).toBe(0)
    expect(r[20 * 40 + 30]).toBe(128)
  })
  it('keeps the subject and what touches it (a bat in his hand), drops a far-off scrap', () => {
    const r = refineAlpha(grid(60, 60, (x, y) => {
      if (x >= 20 && x < 40 && y >= 10 && y < 55) return 255     // the player
      if (y === 15 && x >= 40 && x < 58) return 255              // the bat, touching him
      if (x >= 2 && x < 6 && y >= 2 && y < 6) return 255         // a scrap of background, far off
      return 0
    }), 60, 60)
    expect(r[30 * 60 + 30]).toBe(255)
    expect(r[15 * 60 + 55]).toBe(255)
    expect(r[3 * 60 + 3]).toBe(0)
  })
  it('fills a small hole inside him, leaves the big gap and anything open to the edge', () => {
    const r = refineAlpha(grid(60, 60, (x, y) => {
      if (x >= 10 && x < 50 && y >= 5 && y < 55) {
        if (x >= 28 && x < 30 && y >= 20 && y < 22) return 0      // a logo read as background: 4 px
        if (x >= 15 && x < 25 && y >= 30 && y < 45) return 0      // between arm and body: 150 px
        return 255
      }
      return 0
    }), 60, 60)
    expect(r[21 * 60 + 28]).toBe(255)
    expect(r[35 * 60 + 20]).toBe(0)
    expect(r[1 * 60 + 1]).toBe(0)
  })
})
