import { describe, expect, it } from 'vitest'
import { parsePlays, playsText, playText } from './plays'
import type { PlayEvent } from './types'

describe('逐球跑壘 text', () => {
  const plays: PlayEvent[] = [{ at: 2, kind: 'wp', from: 1, to: 2 }, { at: 3, kind: 'sb', from: 3, to: 'home' }, { at: 3, kind: 'cs', from: 2, to: 'out' }]
  it('reads back what it writes', () => {
    expect(playsText(plays)).toBe('2 暴投 1-2；3 盜壘 3-H；3 盜壘失敗 2-X')
    expect(parsePlays(playsText(plays))).toEqual(plays)
    expect(parsePlays('亂寫；1 wp 2-3')).toEqual([{ at: 1, kind: 'wp', from: 2, to: 3 }])
  })
  it('says what happened', () => {
    expect(plays.map(playText)).toEqual(['暴投 1B→2B', '盜壘 3B→得分', '盜壘失敗（2B）'])
  })
  it('keeps 趁傳進壘 on the hit apart from plays between pitches', () => {
    const onHit: PlayEvent[] = [{ at: 3, kind: 'throw', from: 1, to: 2, play: true, batter: true }, { at: 3, kind: 'throw', from: 2, to: 3, play: true }]
    expect(playsText(onHit)).toBe('3 趁傳進壘 1-2 打者；3 趁傳進壘 2-3 跑者')
    expect(parsePlays(playsText(onHit))).toEqual(onHit)
    expect(onHit.map(playText)).toEqual(['打者趁傳進壘 1B→2B', '趁傳進壘 2B→3B'])
  })
})
