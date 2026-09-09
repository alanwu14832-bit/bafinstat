import { describe, expect, it } from 'vitest'
import { autoOrder, emptyLineup, lineupIssues, lineupText, positionOf, toLineupSlots, type Lineup } from './lineup'

const roster = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'].map((name) => ({ name }))
const full: Lineup = { ...emptyLineup(), field: { P: '壬', C: '甲', '1B': '乙', '2B': '丙', '3B': '戊', SS: '丁', LF: '己', CF: '庚', RF: '辛' } }

describe('starting lineup', () => {
  it('fills the batting order from the field in scorer order, keeping slots already chosen', () => {
    const l = autoOrder({ ...full, order: ['庚', '', '', '', '', '', '', '', ''] })
    expect(l.order).toEqual(['庚', '壬', '甲', '乙', '丙', '戊', '丁', '己', '辛'])
    expect(positionOf(l, '丁')).toBe('SS')
    expect(toLineupSlots(l)[1]).toEqual({ name: '壬', pos: 'P' })
    expect(lineupIssues(l, roster)).toEqual([])
  })

  it('with a DH the pitcher does not bat', () => {
    const l = autoOrder({ ...full, dh: '癸' })
    expect(l.order).not.toContain('壬')
    expect(l.order).toContain('癸')
    expect(positionOf(l, '癸')).toBe('DH')
    expect(lineupText(l, '對手')).toContain('P 壬')
  })

  it('names the problems: missing spots, duplicates, strangers', () => {
    const l: Lineup = { ...emptyLineup(), field: { C: '甲', '1B': '甲' }, order: ['甲', '甲', '路人', '', '', '', '', '', ''] }
    const issues = lineupIssues(l, roster)
    expect(issues.some((t) => t.startsWith('守位還沒排'))).toBe(true)
    expect(issues).toContain('甲 同時排在 C、1B')
    expect(issues).toContain('甲 在打序出現兩次')
    expect(issues).toContain('路人 不在球員名單')
  })
})
