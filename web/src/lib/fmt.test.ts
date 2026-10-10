import { describe, expect, it } from 'vitest'
import { percentile, prInk, prMix } from './fmt'

describe('percentile (midrank)', () => {
  it('ranks within the values, ties sharing the middle', () => {
    expect(percentile(0.3, [0.2, 0.25, 0.3])).toBe(100)
    expect(percentile(0.25, [0.2, 0.25, 0.3])).toBe(50)
    expect(percentile(0, [0, 0, 0, 1])).toBe(33)
    expect(percentile(1, [0, 0, 0, 1])).toBe(100)
  })
  it('turns around when lower is better', () => {
    expect(percentile(0.1, [0.1, 0.2, 0.3], true)).toBe(100)
    expect(percentile(0.3, [0.1, 0.2, 0.3], true)).toBe(0)
  })
  it('places a value that is not among them, never past 0..100', () => {
    expect(percentile(0.5, [0.2, 0.3])).toBe(100)
    expect(percentile(0.1, [0.2, 0.3])).toBe(0)
    expect(percentile(0.25, [0.2, 0.3])).toBe(50)
  })
  it('keeps 50 for one value and 0 for none', () => {
    expect(percentile(0.3, [0.3])).toBe(50)
    expect(percentile(null, [0.1])).toBe(0)
    expect(percentile(0.2, [null, 0.2, null])).toBe(50)
  })
})

describe('PR colours', () => {
  it('mixes red above 50, blue below, grey at 50', () => {
    expect(prMix(50)).toBe('color-mix(in oklab, var(--pr-hot) 0%, var(--pr-mid))')
    expect(prMix(100)).toBe('color-mix(in oklab, var(--pr-hot) 100%, var(--pr-mid))')
    expect(prMix(0)).toBe('color-mix(in oklab, var(--pr-cold) 100%, var(--pr-mid))')
    expect(prMix(25)).toBe('color-mix(in oklab, var(--pr-cold) 50%, var(--pr-mid))')
  })
  it('writes white only on strong colours', () => {
    expect(prInk(55)).toBe('var(--ink)')
    expect(prInk(95)).toBe('#fff')
    expect(prInk(10)).toBe('#fff')
  })
})
