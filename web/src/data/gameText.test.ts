import { describe, expect, it } from 'vitest'
import { circled, countBeforeText, gameShareText, gridCell, resultPhrase } from './gameText'
import type { Game } from './types'

const cb = (pitches: string[], result: string) => countBeforeText({ pitches, result })

describe('countBefore: the count when the result happened', () => {
  it('drops the ball in play, the 4th ball and the 3rd strike', () => {
    expect(cb(['B', 'CS', 'IP'], '一安')).toBe('1-1 後')
    expect(cb(['CS', 'SS', 'B', 'SS'], '三振')).toBe('1-2 後')
    expect(cb(['B', 'B', 'B', 'CS', 'B'], '保送')).toBe('3-1 後')
    expect(cb(['CS', 'CS', 'F', 'F', 'IP'], '外飛')).toBe('0-2 後')
  })
  it('觸身: live adds no pitch, a workbook writes it as B', () => {
    expect(cb(['B', 'CS'], '觸身')).toBe('1-1 後')
    expect(cb(['CS', 'SS', 'B', 'B', 'B', 'F', 'B'], '觸身')).toBe('3-2 後')
  })
  it('no pitches: no count', () => {
    expect(cb([], '故四')).toBe('')
    expect(cb([], '突破僵局')).toBe('')
  })
})

describe('resultPhrase (stand-in for batch 3)', () => {
  it('reads a result in plain words', () => {
    expect(resultPhrase('一安', 9)).toBe('右外野安打')
    expect(resultPhrase('二安', 78)).toBe('左中間二壘安打')
    expect(resultPhrase('場地二安', 89)).toBe('右中間場地二壘安打')
    expect(resultPhrase('內滾', 6)).toBe('游擊滾地球出局')
    expect(resultPhrase('外飛', 8, 'L')).toBe('中外野平飛球出局')
    expect(resultPhrase('一安')).toBe('一壘安打')
    expect(resultPhrase('三振', undefined, undefined, ['B', 'SS'])).toBe('揮棒落空三振')
    expect(resultPhrase('保送')).toBe('四壞球保送')
  })
})

describe('gridCell', () => {
  it('writes the NPB-style cell with the RBI circled', () => {
    expect(gridCell({ result: '一安', loc: 8, pitches: ['B', 'CS', 'IP'], rbi: 2 })).toEqual({ text: '中安②', tone: 'hit', title: '1-1 後 中外野安打，2 分打點' })
    expect(gridCell({ result: '內滾', loc: 6, pitches: ['IP'] })).toMatchObject({ text: '游滾', tone: 'out' })
    expect(gridCell({ result: '保送', pitches: ['B', 'B', 'B', 'B'] })).toMatchObject({ text: '四壞', tone: 'on' })
    expect(gridCell({ result: '全壘打', loc: 7, pitches: ['IP'], rbi: 4 }).text).toBe('左全壘打④')
    expect(gridCell({ result: '外飛', loc: 89, traj: 'L', pitches: ['IP'] }).text).toBe('右中平飛')
    expect(gridCell({ result: '失誤', loc: 6, pitches: ['IP'] })).toMatchObject({ text: '游失', tone: 'on' })
    expect(gridCell({ result: '三振', pitches: ['S', 'S', 'S'] })).toMatchObject({ text: '三振', tone: 'out' })
    // 不死三振: the batter reached (no out code on his row)
    expect(gridCell({ result: '三振', pitches: ['S', 'S', 'SS'], code: 'L' }).tone).toBe('on')
    expect(gridCell({ result: '三振', pitches: ['S', 'S', 'SS'], code: 'II' }).tone).toBe('out')
    expect(gridCell({ result: '一安', pitches: ['IP'] }).text).toBe('一安')
    expect(gridCell({ result: '突破僵局', pitches: [] })).toMatchObject({ text: '突破', tone: 'other' })
    expect(circled(1)).toBe('①')
    expect(circled(20)).toBe('⑳')
    expect(circled(21)).toBe('(21)')
  })
})

describe('gameShareText', () => {
  const game: Game = { id: 'G1', date: '2026-10-03', tournament: '大專盃', opponent: '台大', homeAway: '主', venue: '新生球場' }
  const recap = [{ label: '轉折', text: '第 3 局下 3 分逆轉。' }, { label: '本場之星', text: '甲 3 安 2 打點。' }]
  it('writes score, place, recap, videos and the link', () => {
    expect(gameShareText({ teamName: '喝FIN就好BA', summary: { game, runsUs: 5, runsOpp: 3, result: 'W' }, recap, url: 'https://bafinstat.vercel.app/games/G1', videos: [{ url: 'https://youtu.be/x', note: '上半場' }] })).toBe([
      '喝FIN就好BA 5:3 台大（勝）',
      '2026-10-03（六）大專盃・主場・新生球場',
      '',
      '・轉折：第 3 局下 3 分逆轉。',
      '・本場之星：甲 3 安 2 打點。',
      '',
      '比賽影片（上半場）：https://youtu.be/x',
      '完整紀錄：https://bafinstat.vercel.app/games/G1',
    ].join('\n'))
  })
  it('ties, unchecked items and an empty recap', () => {
    const t = gameShareText({ teamName: 'A', summary: { game, runsUs: 2, runsOpp: 2, result: 'T' }, recap: [], url: 'u', issues: 2 })
    expect(t).toContain('（和）')
    expect(t.endsWith('還有 2 項紀錄待核對，數字可能再修正）')).toBe(true)
    expect(t).not.toContain('・轉折')
    expect(t.split('\n').filter((l) => l.startsWith('・'))).toHaveLength(0)
  })
})
