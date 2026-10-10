import { describe, expect, it } from 'vitest'
import { newGame, type RecordState, type Score } from './model'
import { dueUp, halfPlayed, nextHalfPlayed, onDeckOf, oppNameAt, upLabel } from './upNext'
import type { Game, PitchingPA } from '../data/types'

const NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬']
const game = (homeAway: '主' | '客'): Game => ({ id: 'G20261020-01', date: '2026-10-20', tournament: '系際盃', opponent: '對手', homeAway, innings: 7 })
const state = (homeAway: '主' | '客', patch: Partial<RecordState> = {}, names = NAMES): RecordState =>
  ({ ...newGame(game(homeAway), names.map((name) => ({ name, pos: 'DH' })), '丁'), ...patch })
const sc = (us: number, opp: number): Score => ({ us, opp, lineUs: [], lineOpp: [] })
const pit = (oppOrder: number, oppBatter?: string): PitchingPA =>
  ({ gameId: 'G20261020-01', inning: 1, oppOrder, pitcher: '丁', ...(oppBatter ? { oppBatter } : {}), pitches: ['IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 })

describe('準備打擊／再下一棒', () => {
  it('our next two after the batter at the plate wrap around the lineup', () => {
    const s = state('客', { half: 'top', slot: 7 })
    expect(onDeckOf(s)).toEqual({ onDeck: { us: true, order: 9, name: '壬' }, inHole: { us: true, order: 1, name: '甲' } })
    expect(upLabel(onDeckOf(s).onDeck!)).toBe('9 棒 壬')
  })
  it('a 2-man lineup never shows the batter at the plate', () => {
    const s = state('客', { half: 'top', slot: 0 }, ['甲', '乙'])
    expect(onDeckOf(s)).toEqual({ onDeck: { us: true, order: 2, name: '乙' }, inHole: null })
  })
  it('the opponent by batting order only', () => {
    const s = state('主', { half: 'top', oppOrder: 8 })
    const up = onDeckOf(s)
    expect(up).toEqual({ onDeck: { us: false, order: 9, name: '' }, inHole: { us: false, order: 1, name: '' } })
    expect(upLabel(up.onDeck!)).toBe('第 9 棒')
    expect(upLabel(up.inHole!)).toBe('第 1 棒')
  })
  it('opponent names from the rows (latest wins), the batter at the plate and their typed lineup', () => {
    const s = state('主', { half: 'top', oppOrder: 8, oppBatter: '黃', pitching: [pit(9, '陳'), pit(1), pit(9, '林'), pit(2)] })
    expect(oppNameAt(s, 9)).toBe('林')
    expect(oppNameAt(s, 8)).toBe('黃')
    expect(oppNameAt(s, 3)).toBe('')
    expect(upLabel(onDeckOf(s).onDeck!)).toBe('第 9 棒 林')
    const typed = { ...s, oppNames: true, oppLineup: ['一號', '', '', '', '', '', '', '', '九號'] }
    expect(oppNameAt(typed, 9)).toBe('九號')
    expect(oppNameAt(typed, 1)).toBe('一號')
    // a typed lineup is only read when 記對方打者姓名 is on
    expect(oppNameAt({ ...typed, oppNames: false }, 1)).toBe('')
  })
  it('while we bat, their next batter (s.oppOrder) is named from the earlier rows too', () => {
    // 客, top: we bat; their last commit cleared oppBatter, oppOrder is only their next batter
    const s = state('客', { inning: 4, half: 'top', oppOrder: 1, oppBatter: '', pitching: [pit(1, '陳一'), pit(2, '林二'), pit(3, '王三')] })
    expect(dueUp(s, sc(0, 0), 7).map(upLabel)).toEqual(['第 1 棒 陳一', '第 2 棒 林二', '第 3 棒 王三'])
  })
})

describe('攻守交換後', () => {
  it('while we field: our next three from the slot', () => {
    const s = state('主', { half: 'top', slot: 4 })
    const due = dueUp(s, sc(0, 0), 7)
    expect(due.map((b) => b.order)).toEqual([5, 6, 7])
    expect(due.map((b) => b.name)).toEqual(['戊', '己', '庚'])
  })
  it('while we bat: their next three from oppOrder', () => {
    const s = state('客', { half: 'top', oppOrder: 9 })
    expect(dueUp(s, sc(0, 0), 7).map((b) => b.order)).toEqual([9, 1, 2])
    expect(dueUp(s, sc(0, 0), 7).every((b) => !b.us)).toBe(true)
  })
  it('only when the next half will be played (regulation rule only)', () => {
    // we are home (主): home = us
    const top7 = state('主', { inning: 7, half: 'top' })
    expect(nextHalfPlayed(top7, sc(4, 2), 7)).toBe(false)
    expect(dueUp(top7, sc(4, 2), 7)).toEqual([])
    expect(nextHalfPlayed(top7, sc(1, 3), 7)).toBe(true)
    expect(nextHalfPlayed({ ...top7, half: 'bottom' }, sc(2, 2), 7)).toBe(true)
    expect(nextHalfPlayed({ ...top7, half: 'bottom' }, sc(1, 3), 7)).toBe(false)
    expect(nextHalfPlayed({ ...top7, inning: 3, half: 'bottom' }, sc(0, 9), 7)).toBe(true)
    // the varsity plays 9
    expect(nextHalfPlayed(top7, sc(4, 2), 9)).toBe(true)
    expect(nextHalfPlayed({ ...top7, inning: 9 }, sc(4, 2), 9)).toBe(false)
    // we are away (客): home = them
    const away = state('客', { inning: 7, half: 'top' })
    expect(nextHalfPlayed(away, sc(2, 4), 7)).toBe(false)
    expect(nextHalfPlayed(away, sc(4, 2), 7)).toBe(true)
  })
  it('a half the record page moved on to after the game was over is not played, nor the one after it', () => {
    const line = (n: number, at: number, runs: number) => Array.from({ length: n }, (_, i) => (i === at ? runs : 0))
    const score = (us: number, opp: number, lineUs: number[], lineOpp: number[]): Score => ({ us, opp, lineUs, lineOpp })
    // 主, the away team leads 5–3 after 7▼: the draft is on 8▲ with no rows
    const top8 = state('主', { inning: 8, half: 'top' })
    const over = score(3, 5, line(8, 0, 3), line(8, 0, 5))
    expect(halfPlayed(top8, over, 7)).toBe(false)
    expect(nextHalfPlayed(top8, over, 7)).toBe(false)
    expect(dueUp(top8, over, 7)).toEqual([])
    // tied after 7▼: 8▲ is played; the away team scoring in it keeps it played (and the bottom too)
    const tied = score(5, 5, line(8, 0, 5), line(8, 0, 5))
    expect(halfPlayed(top8, tied, 7)).toBe(true)
    const scored = score(5, 7, line(8, 0, 5), [5, 0, 0, 0, 0, 0, 0, 2])
    expect(halfPlayed(top8, scored, 7)).toBe(true)
    expect(nextHalfPlayed(top8, scored, 7)).toBe(true)
    // 客 leading after 7▲ with the home team (them) ahead: 7▼ is not played
    const bot7 = state('主', { inning: 7, half: 'bottom' })
    const homeAhead = score(4, 2, line(7, 0, 4), line(7, 0, 2))
    expect(halfPlayed(bot7, homeAhead, 7)).toBe(false)
    // a walk-off in progress: home was behind when 7▼ began
    const walkOff = score(4, 3, [2, 0, 0, 0, 0, 0, 2], line(7, 0, 3))
    expect(halfPlayed(bot7, walkOff, 7)).toBe(true)
    expect(nextHalfPlayed(bot7, walkOff, 7)).toBe(false)
    expect(halfPlayed({ ...bot7, inning: 3 }, homeAhead, 7)).toBe(true)
  })
})
