import { describe, expect, it } from 'vitest'
import { compareImageSize, prRgb } from './shareImage'

describe('share image helpers', () => {
  it('colours a PR between blue, grey and red', () => {
    expect(prRgb(50)).toBe('rgb(95,95,102)')
    expect(prRgb(100)).toBe('rgb(232,97,95)')
    expect(prRgb(0)).toBe('rgb(93,147,220)')
    expect(prRgb(150)).toBe('rgb(232,97,95)')
  })
  it('sizes the comparison image by its rows', () => {
    expect(compareImageSize(9, 22)).toEqual({ w: 1080, h: 1662 })
  })
})
