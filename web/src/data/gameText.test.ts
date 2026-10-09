import { describe, expect, it } from 'vitest'
import { resultPhrase } from './gameText'

describe('results in plain words', () => {
  it('names where the ball went', () => {
    expect(resultPhrase('外飛', 8, 'F')).toBe('中外野飛球出局')
    expect(resultPhrase('一安', 78)).toBe('左中間安打')
    expect(resultPhrase('內安', 6)).toBe('游擊內野安打')
    expect(resultPhrase('雙殺', 6, 'G')).toBe('游擊滾地球雙殺')
    expect(resultPhrase('外飛', 9, 'L')).toBe('右外野平飛球出局')
    expect(resultPhrase('一安')).toBe('一壘安打')
    expect(resultPhrase('內滾')).toBe('內野滾地球出局')
  })
  it('tells a swinging strikeout from a called one', () => {
    expect(resultPhrase('三振', undefined, undefined, ['B', 'S', 'SS'])).toBe('揮棒落空三振')
    expect(resultPhrase('三振', undefined, undefined, ['B', 'S', 'CS'])).toBe('看好球三振')
    expect(resultPhrase('三振')).toBe('三振')
  })
  it('spells out the rest', () => {
    expect(resultPhrase('保送')).toBe('四壞球保送')
    expect(resultPhrase('故四')).toBe('故意四壞')
    expect(resultPhrase('突破僵局')).toBe('突破僵局上壘')
    expect(resultPhrase('其他')).toBe('其他')
  })
})
