/** Their runner caught stealing for the third out before the next plate appearance ended: the printed sheet marks his CS. */
import { describe, expect, it } from 'vitest'
import { addPitch, commitPA, defaultPlan, newGame, runnerEvent } from '../record/model'
import { buildScoresheet } from './scoresheet'

const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const out = (s: ReturnType<typeof newGame>) => commitPA(addPitch(s, 'IP'), { ...defaultPlan(addPitch(s, 'IP'), '內滾'), loc: 6, traj: 'G' })

describe('the half ends on a 盜壘失敗 between pitches', () => {
  it('the runner’s box says CS', () => {
    let s = newGame({ id: 'G', date: '2026-10-20', tournament: 't', opponent: 'o', homeAway: '主', innings: 7 }, lineup, '壬')
    s = out(out(s))
    s = addPitch(s, 'IP'); s = commitPA(s, { ...defaultPlan(s, '一安'), loc: 8, traj: 'L' })
    s = addPitch(s, 'B')
    s = runnerEvent(s, s.runners[0].row, 'opp', 'cs')
    expect(s.half).toBe('bottom')
    const sheet = buildScoresheet(s.pitching.filter((p) => p.inning === 1), 'pit', { innings: 1 })
    const cell = sheet.lines.find((l) => l.order === 3)!.cells[1][0]
    expect(cell.notes ?? []).toContain('CS')
  })
})
