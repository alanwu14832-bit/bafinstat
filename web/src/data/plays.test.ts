import { describe, expect, it } from 'vitest'
import { balksIn, parsePlays, playsText, playText } from './plays'
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

describe('投手犯規 (balk)', () => {
  it('reads and writes the label, and the raw kind', () => {
    const ev: PlayEvent[] = [{ at: 2, kind: 'bk', from: 1, to: 2 }, { at: 2, kind: 'bk', from: 3, to: 'home' }]
    expect(playsText(ev)).toBe('2 投手犯規 1-2；2 投手犯規 3-H')
    expect(parsePlays(playsText(ev))).toEqual(ev)
    expect(parsePlays('1 bk 2-3')).toEqual([{ at: 1, kind: 'bk', from: 2, to: 3 }])
    expect(playText(ev[0])).toBe('投手犯規 1B→2B')
  })
  it('counts one balk per pitch however many runners moved', () => {
    const bk = (at: number, from: 1 | 2 | 3, to: PlayEvent['to']): PlayEvent => ({ at, kind: 'bk', from, to })
    expect(balksIn([bk(0, 3, 'home'), bk(0, 1, 2)])).toBe(1)
    expect(balksIn([bk(0, 1, 2), bk(0, 2, 3)])).toBe(2)
    expect(balksIn([bk(1, 1, 2), bk(3, 2, 3)])).toBe(2)
    expect(balksIn([bk(0, 2, 3), { at: 0, kind: 'wp', from: 1, to: 2 }, bk(0, 3, 'home')])).toBe(2)
    expect(balksIn([])).toBe(0)
    expect(balksIn(undefined)).toBe(0)
  })
})
