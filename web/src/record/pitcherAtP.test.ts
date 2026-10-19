/** Putting someone other than the pitcher at P (換人 into the pinch-hitter's slot, 設定守位 for a fielder) is a pitching change. */
import { describe, expect, it } from 'vitest'
import { addPitch, commitPA, defaultPlan, endHalf, newGame, substitute, type RecordState } from './model'

const game = { id: 'G20261019-02', date: '2026-10-19', tournament: '友誼賽', opponent: '測試隊', homeAway: '客' as const, innings: 7 }
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const k = (s: RecordState) => { for (let i = 0; i < 3; i++) s = addPitch(s, 'SS'); return commitPA(s, defaultPlan(s, '三振')) }

describe('someone put at P becomes the pitcher', () => {
  // we bat first: 子 pinch-hits for the pitcher 壬 (9th), then the top half ends and we take the field
  const afterPH = () => {
    let s = newGame(game, lineup, '壬', { bench: ['子', '丑'] })
    s = { ...s, slot: 8 }
    s = substitute(s, 8, '子', 'PH')
    s = k(s)
    return endHalf(s)
  }
  it('換人: 丑 into 子’s slot at P — 丑 pitches from now on, and his strikeout is his', () => {
    let s = substitute(afterPH(), 8, '丑', 'P')
    expect(s.pitcher).toBe('丑')
    expect(s.subs?.map((x) => [x.kind, x.in, x.out, x.pos])).toEqual([['PH', '子', '壬', 'PH'], ['DEF', '丑', '子', 'P'], ['P', '丑', '壬', 'P']])
    s = k(s)
    expect(s.pitching.at(-1)).toMatchObject({ pitcher: '丑', result: '三振' })
  })
  it('設定守位: the pinch hitter 子 himself moved to P — he is the pitcher', () => {
    const s = substitute(afterPH(), 8, '', 'P')
    expect(s.pitcher).toBe('子')
  })
  it('a fielder moved elsewhere (not P) changes nothing about the pitcher', () => {
    const s = substitute(afterPH(), 2, '', 'SS')
    expect(s.pitcher).toBe('壬')
  })
})
