import { describe, expect, it } from 'vitest'
import { familyLoaded } from './storyFonts'

describe('圖卡字型', () => {
  it('a face counts as there only once a face of that family has finished loading', () => {
    const faces: Array<{ family: string; status: string }> = []
    Object.defineProperty(document, 'fonts', { configurable: true, value: { forEach: (fn: (f: { family: string; status: string }) => void) => faces.forEach(fn) } })
    expect(familyLoaded('"HanWang YanKai"')).toBe(false)              // not added yet (Safari's check() would say "ready")
    faces.push({ family: 'HanWang YanKai', status: 'loading' })
    expect(familyLoaded('"HanWang YanKai", serif')).toBe(false)
    faces[0].status = 'loaded'
    expect(familyLoaded('"HanWang YanKai", serif')).toBe(true)
    expect(familyLoaded('"Knewave"')).toBe(false)
  })
})
