import { describe, expect, it } from 'vitest'
import { addPitch, changePitcher, commitPA, defaultPlan, newGame, runnerEvent, wildPitch } from './model'
import { describeChange } from './summary'
import type { Game } from '../data/types'

const game: Game = { id: 'G20261007-01', date: '2026-10-07', tournament: '測試', opponent: '對手', homeAway: '客', innings: 7 }
const start = () => newGame(game, ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name) => ({ name, pos: 'C' })), '壬', { bench: ['子'] })
const send = (s: ReturnType<typeof start>, r: string) => commitPA(s, defaultPlan(s, r))

describe('the line shown after each tap', () => {
  it('says the result, the runs and the outs', () => {
    let s = send(start(), '一安')
    const t = send(s, '全壘打')
    expect(describeChange(s, t)).toBe('乙 全壘打（2 分打點）・得 2 分・2：0')
    s = t
    expect(describeChange(s, send(s, '三振'))).toBe('丙 三振・1 出局')
  })
  it('names the runner on a play between pitches, and stays quiet on a pitch', () => {
    const s = addPitch(send(send(start(), '一安'), '一安'), 'B')
    expect(describeChange(send(send(start(), '一安'), '一安'), s)).toBeNull()
    expect(describeChange(s, wildPitch(s, 'wp'))).toBe('甲 暴投 2B→3B・乙 暴投 1B→2B')
    expect(describeChange(s, runnerEvent(s, 1, 'us', 'cs'))).toBe('乙 盜壘失敗（1B）・1 出局')
  })
  it('says when the half is over and who came in', () => {
    let s = start()
    for (const r of ['三振', '三振']) s = send(s, r)
    expect(describeChange(s, send(s, '外飛'))).toBe('丙 外飛・三出局，換 1 局下')
    expect(describeChange(s, changePitcher(s, '子'))).toBe('換投：子 接替 壬')
  })
})
