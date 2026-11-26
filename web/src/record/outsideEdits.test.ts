import { describe, expect, it } from 'vitest'
import { addPitch, commitPA, defaultPlan, newGame, type RecordState } from './model'
import { mergeOutsideEdits, type CloudGame } from './outsideEdits'
import { withResult } from './paEdit'

const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = { id: 'G20261126-09', date: '2026-11-26', tournament: '練習', opponent: '練習對手', homeAway: '客' as const }
const pa = (s: RecordState, pitches: string[], result: string, extra: object = {}) => commitPA(pitches.reduce((x, p) => addPitch(x, p), s), { ...defaultPlan(s, result), ...extra })
const K = ['S', 'S', 'S']
// we bat first: 1 上 三上三下; 1 下 a single and a strikeout — 1 out, a runner on first
const midGame = () => {
  let s = newGame(game, lineup, '甲')
  s = pa(s, K, '三振'); s = pa(s, K, '三振'); s = pa(s, K, '三振')
  s = pa(s, ['IP'], '一安', { loc: 7, traj: 'L' }); s = pa(s, K, '三振')
  return s
}
/** the cloud as this device left it after its last save */
const cloudOf = (s: RecordState): CloudGame => JSON.parse(JSON.stringify({ game: s.game, batting: s.batting, pitching: s.pitching }))

describe('比賽中別台裝置的修改', () => {
  it('a 球速 typed in 修改資料 on another device comes in, and the next save keeps it', () => {
    const s = midGame()
    const base = cloudOf(s)
    const cloud = cloudOf(s)
    cloud.pitching[1].speeds = [118, 121, 123]
    cloud.batting[0].note = '對方投手很快'
    const m = mergeOutsideEdits(s, base, cloud)
    expect(m.changed).toBe(2)
    expect(m.state.pitching[1].speeds).toEqual([118, 121, 123])
    expect(m.state.batting[0].note).toBe('對方投手很快')
    expect([m.state.outs, m.state.runners]).toEqual([s.outs, s.runners])   // the game goes on as it was
  })
  it('what this device changed itself since stays its own; nothing changed elsewhere = the same state', () => {
    const s = midGame()
    const base = cloudOf(s)
    const ours = { ...s, pitching: s.pitching.map((p, k) => (k === 1 ? { ...p, speeds: [130, 131, 132] } : p)) }
    const cloud = cloudOf(s)
    cloud.pitching[1].speeds = [118, 121, 123]
    expect(mergeOutsideEdits(ours, base, cloud).state.pitching[1].speeds).toEqual([130, 131, 132])
    expect(mergeOutsideEdits(s, base, cloudOf(s)).state).toBe(s)
    expect(mergeOutsideEdits(s, null, cloudOf(s)).changed).toBe(0)
  })
  it('a device that opened the game earlier (fewer rows) changes only the rows it has; none are taken away', () => {
    const s = midGame()
    const base = cloudOf(s)
    const cloud = cloudOf(s)
    cloud.pitching = cloud.pitching.slice(0, 1)
    cloud.pitching[0].loc = 8
    const m = mergeOutsideEdits(s, base, cloud)
    expect(m.state.pitching).toHaveLength(2)
    expect(m.state.pitching[0].loc).toBe(8)
  })
  it('a change the game in progress cannot follow (this half left with 3 outs) is left out; the 球速 still comes in', () => {
    const s = midGame()
    const base = cloudOf(s)
    const cloud = cloudOf(s)
    cloud.pitching[0] = { ...withResult(cloud.pitching[0], '三振'), code: 'I', speeds: [110] }
    cloud.pitching[0].pitches = ['S', 'S', 'S']
    cloud.pitching[1].speeds = [120]
    const m = mergeOutsideEdits(s, base, cloud)
    expect(m.skipped).toBeGreaterThan(0)
    expect(m.state.pitching[0].result).toBe(s.pitching[0].result)
    expect(m.state.pitching[1].speeds).toEqual([120])
  })
})
