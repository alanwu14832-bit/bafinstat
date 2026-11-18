import { describe, expect, it } from 'vitest'
import { addPitch, commitPA, defaultPlan, newGame, type RecordState } from './model'
import { applyLiveEdit } from './liveEdit'
import { withResult } from './paEdit'

const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = { id: 'G20261118-09', date: '2026-11-18', tournament: '練習', opponent: '練習對手', homeAway: '客' as const }
const pa = (s: RecordState, pitches: string[], result: string, extra: object = {}) => commitPA(pitches.reduce((x, p) => addPitch(x, p), s), { ...defaultPlan(s, result), ...extra })
const K = ['S', 'S', 'S']

// we bat first: 1 上 三上三下; 1 下 their first two batters (a single, a strikeout) — 1 out, a runner on first
const midGame = () => {
  let s = newGame(game, lineup, '甲')
  s = pa(s, K, '三振'); s = pa(s, K, '三振'); s = pa(s, K, '三振')
  s = pa(s, ['IP'], '一安', { loc: 7, traj: 'L' }); s = pa(s, K, '三振')
  return s
}

describe('紀錄比賽: a plate appearance changed in the full editor while the game goes on', () => {
  it('the setting: 1 下, 1 out, their runner on first', () => {
    const s = midGame()
    expect([s.inning, s.half, s.outs, s.runners.map((r) => r.base)]).toEqual([1, 'bottom', 1, [1]])
  })
  it('a finished half changed: the game in progress stands as it was', () => {
    const s = midGame()
    const batting = s.batting.map((p, k) => (k === 0 ? { ...p, pitches: ['B', 'S', 'S', 'S'] } : p))
    const n = applyLiveEdit(s, batting, s.pitching)
    expect(n.batting[0].pitches).toEqual(['B', 'S', 'S', 'S'])
    expect([n.outs, n.runners]).toEqual([s.outs, s.runners])
  })
  it('a finished half left without its third out: refused', () => {
    const s = midGame()
    const batting = s.batting.map((p, k) => (k === 2 ? { ...withResult(p, '一安'), code: 'L' } : p))
    expect(() => applyLiveEdit(s, batting, s.pitching)).toThrow(/第 1 局（我隊打擊）會變成 2 個出局/)
  })
  it('the half being played: the single made a walk keeps the runner; made an out, the runner is gone and the outs go up', () => {
    const s = midGame()
    const walk = s.pitching.map((p, k) => (k === 0 ? { ...withResult(p, '保送'), pitches: ['B', 'B', 'B', 'B'] } : p))
    const a = applyLiveEdit(s, s.batting, walk)
    expect([a.outs, a.runners.map((r) => [r.base, r.row])]).toEqual([1, [[1, 0]]])
    const out = s.pitching.map((p, k) => (k === 0 ? { ...withResult(p, '內滾'), code: 'I' } : k === 1 ? { ...p, code: 'II', outsBefore: 1, basesBefore: '無' } : p))
    const b = applyLiveEdit(s, s.batting, out)
    expect([b.outs, b.runners]).toEqual([2, []])
  })
  it('a change that would end the half being played, or add a plate appearance: refused', () => {
    // two out, the runner from the single still on first: the single made an out would be the third
    const s = pa(midGame(), K, '三振')
    expect([s.outs, s.half]).toEqual([2, 'bottom'])
    const three = s.pitching.map((p, k) => (k === 0 ? { ...withResult(p, '內滾'), code: 'I' } : k === 1 ? { ...p, code: 'II' } : k === 2 ? { ...p, code: 'III' } : p))
    expect(() => applyLiveEdit(s, s.batting, three)).toThrow(/這個半局就已經三出局/)
    expect(() => applyLiveEdit(s, s.batting.slice(1), s.pitching)).toThrow(/不能新增或刪除打席/)
  })
})
