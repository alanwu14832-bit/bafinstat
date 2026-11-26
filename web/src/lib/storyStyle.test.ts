import { defaultStyle, fgRect, frameHeight, hitTest, placeBox, readStyle, STORY_H, STORY_W, panView, photoRect, DEFAULT_VIEW } from './storyImage'

describe('限時動態的版面設定', () => {
  it('reads a stored look back, keeping what is valid and defaulting the rest', () => {
    const d = defaultStyle()
    expect(readStyle(null)).toEqual(d)
    expect(readStyle('nonsense')).toEqual(d)
    const r = readStyle({ layout: 'split', accent: '#ff0000', ink: 'red', dim: 5, blur: -3, fg: { scale: 99, frame: true }, text: { big: { show: false, scale: 0.1, color: '#00ff00', font: 'serif', dx: 40 }, title: { font: 'comic' } } })
    expect(r.layout).toBe('split')
    expect(r.accent).toBe('#ff0000')
    expect(r.ink).toBe(d.ink)                    // not a #rrggbb colour
    expect(r.dim).toBe(0.8); expect(r.blur).toBe(0)
    expect(r.fg).toMatchObject({ scale: 2.2, frame: true, shadow: true })
    expect(r.text.big).toEqual({ show: false, scale: 0.6, color: '#00ff00', font: 'serif', dx: 40, dy: 0 })
    expect(r.text.title.font).toBe('')
    expect(r.text.headline).toEqual(d.text.headline)
  })
  it('places a block from its top-left corner and finds what is under a point', () => {
    const b = placeBox({ x: 72, y: 1000, w: 900, h: 100 }, { show: true, scale: 1.5, color: '', font: '', dx: 10, dy: -20 })
    expect(b).toEqual({ x: 82, y: 980, w: 1350, h: 150 })
    const boxes = { fg: { x: 400, y: 400, w: 500, h: 900 }, name: { x: 72, y: 870, w: 936, h: 166 }, headline: { x: 72, y: 1400, w: 936, h: 100 } }
    expect(hitTest(boxes, 500, 900)).toBe('name')     // text sits over the front photo
    expect(hitTest(boxes, 600, 600)).toBe('fg')
    expect(hitTest(boxes, 200, 1450)).toBe('headline')
    expect(hitTest(boxes, 20, 100)).toBeNull()
  })
  it('sizes the front photo by height and keeps its shape', () => {
    const r = fgRect(1000, 2000, { cx: 540, cy: 960, scale: 1, frame: false, shadow: true })
    expect(r.h).toBeCloseTo(STORY_H * 0.56)
    expect(r.w).toBeCloseTo(r.h / 2)
    expect(r.x + r.w / 2).toBeCloseTo(540); expect(r.y + r.h / 2).toBeCloseTo(960)
  })
  it('滿版 covers the whole card; the photo pans within that frame', () => {
    expect(frameHeight('full')).toBe(STORY_H)
    const r = photoRect(1600, 1200, DEFAULT_VIEW, STORY_H)
    expect(r.h).toBeCloseTo(STORY_H); expect(r.w).toBeGreaterThan(STORY_W)
    const moved = panView(DEFAULT_VIEW, 100000, 0, 1600, 1200, STORY_H)
    expect(moved.fx).toBe(0)
  })
})
