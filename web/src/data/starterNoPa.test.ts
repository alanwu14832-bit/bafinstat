/** A starter replaced before he ever batted is listed on the game page's 打擊 box and the 逐局表 (as /live does). */
import { describe, expect, it } from 'vitest'
import { ourBattingBox } from './boxScore'
import { buildScoresheet } from './scoresheet'
import type { BattingPA } from './types'

const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, outsBefore: 0, basesBefore: '無', order: 1, batter: '甲', pitches: ['IP'], result: '內滾', code: 'I', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
// 乙 started at 2nd and was replaced before he batted: 子 batted in his slot
const rows = [bat({}), bat({ order: 2, batter: '子', pos: 'PH', code: 'II' }), bat({ order: 3, batter: '丙', code: 'III' })]
const starters = [{ name: '甲', pos: 'SS', order: 1 }, { name: '乙', pos: 'CF', order: 2 }, { name: '丙', pos: 'C', order: 3 }]

describe('a starter who never batted', () => {
  it('has an empty line at the top of his slot in the box', () => {
    const box = ourBattingBox({ roster: [] }, rows, undefined, starters)
    expect(box.map((l) => l.name)).toEqual(['甲', '乙', '子', '丙'])
    expect(box[1]).toMatchObject({ pa: 0, ab: 0, h: 0 })
    expect(ourBattingBox({ roster: [] }, rows).map((l) => l.name)).toEqual(['甲', '子', '丙'])
  })
  it('heads his slot on the 逐局表', () => {
    const sheet = buildScoresheet(rows, 'bat', { innings: 1, starters })
    expect(sheet.lines.find((l) => l.order === 2)!.players.map((p) => p.name)).toEqual(['乙', '子'])
  })
})
