import { alphaBounds, fitWithin, toAlpha } from './cutoutMath'

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
