import { describe, expect, it } from 'vitest'
import { pbpFilterSets } from './pbpFilter'
import { addPitch, commitPA, defaultPlan, newGame, runnerEvent, type PAPlan, type RecordState } from '../record/model'
import type { BattingPA, PitchingPA } from './types'

const lineup = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const pa = (s: RecordState, result: string, patch: Partial<PAPlan> = {}, pitches = ['IP']) => {
  for (const p of pitches) s = addPitch(s, p)
  const plan = defaultPlan(s, result)
  return commitPA(s, { ...plan, ...patch, runners: { ...plan.runners, ...patch.runners } })
}
/** a half-inning: three singles load the bases, a walk forces a run in, a wild pitch scores the man on third, a single scores nobody, two strikeouts and a ground out */
function half(homeAway: '主' | '客') {
  let s = newGame({ id: 'G1', date: '2026-03-01', tournament: 'A', opponent: 'B', homeAway, innings: 7 }, lineup, 'I')
  s = pa(s, '一安', { runners: {} })
  s = pa(s, '一安', { runners: { 0: 2 } })
  s = pa(s, '一安', { runners: { 0: 3, 1: 2 } })              // bases loaded
  s = pa(s, '保送', {}, ['B', 'B', 'B', 'B'])                  // 3: forces a run in
  s = runnerEvent(s, 1, homeAway === '客' ? 'us' : 'opp', 'wp')   // the runner on third scores on a wild pitch
  s = pa(s, '三振', {}, ['S', 'S', 'S'])                       // 4: the wild pitch happened during his at-bat
  s = pa(s, '全壘打', { quality: '強', traj: 'F' })            // 5
  s = pa(s, '三振', {}, ['S', 'S', 'S'])                       // 6
  s = pa(s, '內滾', { quality: '強', traj: 'G' })              // 7
  return s
}

describe('pbpFilterSets', () => {
  it('our side: runs between pitches and on the play, hits, homers, strikeouts and hard-hit balls', () => {
    const s = half('客')
    const f = pbpFilterSets(s.batting, 'bat')
    expect([...f.runs]).toEqual([3, 4, 5])
    expect([...f.hits]).toEqual([0, 1, 2, 5])
    expect([...f.hr]).toEqual([5])
    expect([...f.k]).toEqual([4, 6])
    expect([...f.hard]).toEqual([5, 7])
    expect(f.all.size).toBe(8)
    expect(f.key.size).toBe(0)
    expect([...pbpFilterSets(s.batting, 'bat', [2, 5]).key]).toEqual([2, 5])
  })
  it('their side, from the codes', () => {
    const s = half('主')
    expect([...pbpFilterSets(s.pitching, 'pit').runs]).toEqual([3, 4, 5])
  })
  it('rows the timeline cannot follow fall back to homers, RBIs and runner plays home', () => {
    const r = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G1', inning: 1, batter: 'A', pitches: ['IP'], result: '內滾', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
    const rows = [r({ result: '一安' }), r({ result: '全壘打', rbi: 2 }), r({ result: '犧飛', rbi: 1 }), r({ result: '三振', events: [{ at: 1, kind: 'wp', from: 3, to: 'home' }] }), r({ result: '突破僵局', pitches: [] })]
    const f = pbpFilterSets(rows, 'bat')
    expect([...f.runs]).toEqual([1, 2, 3])
    expect([...f.hits]).toEqual([0, 1])
    const p = (x: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G1', inning: 1, pitcher: 'P', pitches: ['IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...x })
    expect([...pbpFilterSets([p({ result: '全壘打' }), p({ result: '犧飛', code: 'I' }), p({ result: '突破僵局', pitches: [], quality: '強' })], 'pit').runs]).toEqual([0])
  })
  it('a tie-break runner is never a hit, strikeout or hard-hit ball', () => {
    const r: BattingPA = { gameId: 'G1', inning: 8, batter: 'A', pitches: [], result: '突破僵局', quality: '強', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 }
    const f = pbpFilterSets([r], 'bat')
    expect(f.hits.size + f.k.size + f.hard.size + f.hr.size).toBe(0)
  })
})
