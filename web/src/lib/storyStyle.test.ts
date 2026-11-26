import { cardFace, defaultOrder, moveLayer, readOrder, defaultFg, defaultStyle, fgRect, hitTest, layersFor, placeBox, photoFrame, readStyle, STORY_H, STORY_W, panView, photoRect, DEFAULT_VIEW, titleLines } from './storyImage'

describe('限時動態的版面設定', () => {
  it('reads a stored look back, keeping what is valid and defaulting the rest', () => {
    const d = defaultStyle()
    expect(readStyle(null)).toEqual(d)
    expect(readStyle('nonsense')).toEqual(d)
    const r = readStyle({ layout: 'split', accent: '#ff0000', ink: 'red', dim: 5, blur: -3, fg: { scale: 99, frame: true }, title: 42, text: { big: { show: false, scale: 0.1, color: '#00ff00', font: 'serif', dx: 40 }, title: { font: 'comic' } } })
    expect(r.layout).toBe('split')
    expect(r.accent).toBe('#ff0000')
    expect(r.ink).toBe(d.ink)                    // not a #rrggbb colour
    expect(r.dim).toBe(0.8); expect(r.blur).toBe(0)
    expect(r.fgs).toHaveLength(3)
    expect(r.fgs[0]).toMatchObject({ scale: 2.2, frame: true, shadow: true })   // an older single front photo becomes the first slot
    expect(r.fgs[1]).toEqual(defaultFg('split', 1))
    expect(r.title).toBe('PLAYER OF THE GAME')
    expect(r.text.big).toEqual({ show: false, scale: 0.6, color: '#00ff00', dx: 40, dy: 0 })   // a block no longer has its own face
    expect(r.fonts).toEqual({ latin: '', cjk: '' })
    expect(readStyle({ fonts: { latin: 'brush', cjk: 'comic' } }).fonts).toEqual({ latin: 'brush', cjk: '' })
    expect(r.text.headline).toEqual(d.text.headline)
  })
  it('places a block from its top-left corner and finds what is under a point', () => {
    const b = placeBox({ x: 72, y: 1000, w: 900, h: 100 }, { show: true, scale: 1.5, color: '', dx: 10, dy: -20 })
    expect(b).toEqual({ x: 82, y: 980, w: 1350, h: 150 })
    const boxes = { fg0: { x: 400, y: 400, w: 500, h: 900 }, fg1: { x: 700, y: 300, w: 200, h: 300 }, name: { x: 72, y: 870, w: 936, h: 166 }, headline: { x: 72, y: 1400, w: 936, h: 100 } }
    expect(hitTest(boxes, 500, 900)).toBe('name')     // text sits over the front photos
    expect(hitTest(boxes, 600, 600)).toBe('fg0')
    expect(hitTest(boxes, 750, 450)).toBe('fg1')      // the later slot is on top
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
    expect(photoFrame('full')).toEqual({ x: 0, y: 0, w: STORY_W, h: STORY_H })
    expect(photoFrame('plain')).toBeNull()
    expect(photoFrame('column')!.x).toBeGreaterThan(300)
    const r = photoRect(1600, 1200, DEFAULT_VIEW, STORY_H)
    expect(r.h).toBeCloseTo(STORY_H); expect(r.w).toBeGreaterThan(STORY_W)
    const moved = panView(DEFAULT_VIEW, 100000, 0, 1600, 1200, STORY_H)
    expect(moved.fx).toBe(0)
  })
  it('the poster templates: their own blocks of text, and the title as the team writes it', () => {
    expect(layersFor('poster').map((l) => l.key)).toEqual(['potg', 'pname', 'stats', 'logo'])
    expect(layersFor('full').map((l) => l.key)).not.toContain('potg')
    expect(titleLines('PLAYER OF THE GAME').map((l) => l.text)).toEqual(['PLAYER', 'OF THE', 'GAME'])
    expect(titleLines('player of the game')[1].size).toBeLessThan(1)
    expect(titleLines('本場 / MVP').map((l) => l.text)).toEqual(['本場', 'MVP'])
    expect(titleLines('  ')).toEqual([])
  })
  it('one face per script on the whole card: the layout\'s pair unless the reader picked one', () => {
    const card = { kind: 'game-bat', team: 'T', title: 'vs X', sub: '', name: '王小明', role: '', big: [], small: [], stats: [], statLine: '1-2', headline: '', footer: '', site: '' } as unknown as Parameters<typeof cardFace>[1]
    const poster = { ...defaultStyle(), layout: 'vertical' as const }
    const f = cardFace(poster, card)
    expect(f).toMatchObject({ latin: 'serif', cjk: 'serif', fellBack: false })
    expect(f.stack.indexOf('Playfair')).toBeLessThan(f.stack.indexOf('Noto Serif TC'))   // the Latin face first, no generic in between
    expect(cardFace({ ...poster, fonts: { latin: 'figure', cjk: 'sans' } }, card)).toMatchObject({ latin: 'figure', cjk: 'sans' })
    expect(cardFace(defaultStyle(), card).stack).not.toMatch(/system-ui/)
  })
  it('圖層: the reader\'s order, kept tidy, and moves among the layers on the card only', () => {
    const d = defaultOrder()
    expect(d.slice(0, 3)).toEqual(['fg0', 'fg1', 'fg2'])                 // the photos under the text to start with
    expect(readOrder(['potg', 'fg1', 'potg', 'nonsense'])).toEqual(['potg', 'fg1', ...d.filter((x) => x !== 'potg' && x !== 'fg1')])
    const shown = ['fg0', 'pname', 'potg'] as const
    const up = moveLayer(d, 'fg0', 'top', [...shown])
    expect(up.filter((x) => (shown as readonly string[]).includes(x))).toEqual(['potg', 'pname', 'fg0'])
    expect(up.filter((x) => !(shown as readonly string[]).includes(x))).toEqual(d.filter((x) => !(shown as readonly string[]).includes(x)))   // the others keep their places
    expect(moveLayer(up, 'fg0', 'down', [...shown]).filter((x) => (shown as readonly string[]).includes(x))).toEqual(['potg', 'fg0', 'pname'])
    expect(moveLayer(d, 'fg0', 'bottom', [...shown])).toEqual(d)          // already at the bottom
    // the pick follows the order: a front photo put over a block is the one under the finger
    const boxes = { fg0: { x: 0, y: 0, w: 500, h: 500 }, pname: { x: 100, y: 100, w: 100, h: 100 } }
    expect(hitTest(boxes, 150, 150)).toBe('pname')
    expect(hitTest(boxes, 150, 150, up)).toBe('fg0')
  })
})
