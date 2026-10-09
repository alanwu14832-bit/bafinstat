import { describe, expect, it } from 'vitest'
import type { BattingPA, PitchingPA } from '../data/types'
import { newGame } from './model'
import { earlierPAs, paBrief } from './history'

describe('paBrief', () => {
  it('pitches, then the result in plain words', () => {
    expect(paBrief({ pitches: ['B', 'S', 'IP'], result: '外飛', loc: 8, traj: 'F' })).toBe('3球 中外野飛球出局')
    expect(paBrief({ pitches: ['B', 'B', 'S', 'SS', 'SS'], result: '三振' })).toBe('5球 揮棒落空三振')
    expect(paBrief({ pitches: ['S', 'CS', 'B', 'CS'], result: '三振' })).toBe('4球 看好球三振')
    expect(paBrief({ pitches: ['B', 'B', 'B', 'B'], result: '保送' })).toBe('4球 四壞球保送')
    expect(paBrief({ pitches: ['IP'], result: '一安', loc: 78 })).toBe('1球 左中間安打')
    expect(paBrief({ pitches: ['F', 'IP'], result: '內滾', loc: 6, quality: '強' })).toBe('2球 游擊滾地球出局（強）')
    expect(paBrief({ pitches: ['IP'], result: '雙殺', loc: 6, traj: 'G' })).toBe('1球 游擊滾地球雙殺')
    expect(paBrief({ pitches: [], result: '故四' })).toBe('故意四壞')
    expect(paBrief({ pitches: ['IP'], result: '二安', loc: 7, rbi: 1 })).toBe('1球 左外野二壘安打・1 分打點')
  })
})

const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const bat = (batter: string, result: string, extra: Partial<BattingPA> = {}): BattingPA => ({ gameId: 'G', inning: 1, batter, pitches: ['IP'], result, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...extra })
const pit = (pitcher: string, oppOrder: number, result: string, extra: Partial<PitchingPA> = {}): PitchingPA => ({ gameId: 'G', inning: 1, pitcher, oppOrder, pitches: ['IP'], result, sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...extra })

describe('earlierPAs', () => {
  it('our batter: his own plate appearances, numbered', () => {
    // 客場: we bat first (top)
    const s = { ...newGame({ id: 'G', date: '2026-10-09', tournament: '聯賽', opponent: '資管', homeAway: '客' }, lineup, '甲'), slot: 0 }
    s.batting = [bat('甲', '外飛', { loc: 8, traj: 'F', pitches: ['B', 'S', 'IP'] }), bat('乙', '一安'), bat('甲', '一安', { rbi: 1, loc: 7, inning: 3 }), bat('甲', '突破僵局', { pitches: [] })]
    const e = earlierPAs(s)
    expect(e.map((x) => x.n)).toEqual([1, 2])
    expect(e[0].text).toBe('3球 中外野飛球出局')
    expect(e[1].text).toContain('・1 分打點')
    expect(e[1].inning).toBe(3)
    expect(earlierPAs({ ...s, slot: 4 })).toEqual([])
  })
  it('their slot: by batting order, naming an earlier pitcher', () => {
    // 主場: they bat first
    let s = newGame({ id: 'G', date: '2026-10-09', tournament: '聯賽', opponent: '資管', homeAway: '主' }, lineup, '乙')
    s = { ...s, oppOrder: 3, pitching: [pit('甲', 3, '三振', { pitches: ['S', 'S', 'SS'] }), pit('甲', 4, '內滾'), pit('乙', 3, '內滾', { loc: 6, inning: 4 }), pit('乙', 3, '突破僵局', { pitches: [] })] }
    const e = earlierPAs(s)
    expect(e).toHaveLength(2)
    expect(e[0]).toMatchObject({ n: 1, vs: '甲', text: '3球 揮棒落空三振' })
    expect(e[1].vs).toBeUndefined()
  })
  it('skips another batter of the same slot when names are kept', () => {
    let s = newGame({ id: 'G', date: '2026-10-09', tournament: '聯賽', opponent: '資管', homeAway: '主' }, lineup, '甲')
    s = { ...s, oppOrder: 3, oppNames: true, oppLineup: ['', '', '王', '', '', '', '', '', ''], pitching: [pit('甲', 3, '內滾', { oppBatter: '李' }), pit('甲', 3, '外飛', { oppBatter: '王' }), pit('甲', 3, '內飛')] }
    expect(earlierPAs(s).map((x) => x.text)).toEqual(['1球 外野飛球出局', '1球 內野飛球出局'])
  })
})
