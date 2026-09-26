import { describe, expect, it } from 'vitest'
import { autoOrder, emptyLineup, LINEUP_KEY, lineupIssues, lineupText, positionOf, readLineup, setDesignatedHitter, starters, toggleBench, toLineupSlots, withoutStarter, type Lineup } from './lineup'
import type { Game } from '../data/types'
import { gameLabel, scheduledGames } from '../data/schedule'

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

describe('bench and the chosen game', () => {
  it('reads a lineup saved before 板凳 existed with an empty bench and no game', () => {
    localStorage.setItem(LINEUP_KEY, JSON.stringify({ field: { P: '壬', C: '甲' }, dh: '', order: ['甲', '', '', '', '', '', '', '', ''], updatedAt: '2026-09-01T00:00:00Z' }))
    const l = readLineup()!
    expect(l.bench).toEqual([]); expect(l.gameId).toBe(''); expect(l.reentry).toBe(false)
    expect(l.field).toEqual({ P: '壬', C: '甲' }); expect(l.order[0]).toBe('甲'); expect(l.updatedAt).toBe('2026-09-01T00:00:00Z')
    // garbage in the new fields is dropped rather than crashing the page
    localStorage.setItem(LINEUP_KEY, JSON.stringify({ field: null, order: 'x', bench: ['丙', 3, '', '丙', null], gameId: 7, reentry: 'yes' }))
    expect(readLineup()).toEqual({ ...emptyLineup(), bench: ['丙'] })
    // a list picked without a game survives; a game always wins over it
    localStorage.setItem(LINEUP_KEY, JSON.stringify({ regKey: '2026|新生盃' }))
    expect(readLineup()!.regKey).toBe('2026|新生盃')
    localStorage.setItem(LINEUP_KEY, JSON.stringify({ gameId: 'G1', regKey: '2026|新生盃' }))
    expect(readLineup()).toMatchObject({ gameId: 'G1', regKey: '' })
    localStorage.setItem(LINEUP_KEY, 'null')
    expect(readLineup()).toBeNull()
    localStorage.removeItem(LINEUP_KEY)
  })

  it('starters include the pitcher who does not bat under a DH; starters cannot go on the bench', () => {
    const l = autoOrder({ ...full, dh: '癸' })
    expect(starters(l)).toContain('壬'); expect(starters(l)).toContain('癸'); expect(starters(l)).toHaveLength(10)
    expect(toggleBench(l, '壬')).toBe(l)
    const b = toggleBench(toggleBench(l, '子'), '丑')
    expect(b.bench).toEqual(['子', '丑'])
    expect(toggleBench(b, '子').bench).toEqual(['丑'])
    expect(withoutStarter(['子', '甲', '丑'], b)).toEqual(['子', '丑'])
  })

  it('lineupText lists the bench after the order', () => {
    const l = { ...autoOrder({ ...full, dh: '癸' }), bench: ['子', '丑'] }
    const text = lineupText(l, '對手')
    expect(text.split('\n').at(-2)).toBe('P 壬')
    expect(text.split('\n').at(-1)).toBe('板凳：子、丑')
    expect(lineupText(autoOrder(full))).not.toContain('板凳')
  })

  it('flags a player both starting and benched, bench strangers, a stale game and players off the registration list', () => {
    const roster12 = [...roster, { name: '子' }, { name: '丑' }]
    const l: Lineup = { ...autoOrder(full), bench: ['甲', '子', '子', '路人'], gameId: 'G1' }
    const issues = lineupIssues(l, roster12)
    expect(issues).toContain('甲 同時在先發和板凳')
    expect(issues).toContain('子 在板凳出現兩次')
    expect(issues).toContain('路人 不在球員名單')
    const games: Game[] = [{ id: 'G1', date: '2026-10-03', tournament: '大專盃', opponent: '台大', homeAway: '主', status: 'scheduled' }]
    const ok = { ...l, bench: ['子'] }
    expect(lineupIssues(ok, roster12, { games })).toEqual([])
    expect(lineupIssues(ok, roster12, { games: [{ ...games[0], status: undefined }] })).toEqual(['選的那場已經紀錄或取消了，請重選'])
    expect(lineupIssues(ok, roster12, { games: [] })).toEqual(['選的那場已經紀錄或取消了，請重選'])
    expect(lineupIssues({ ...ok, gameId: '' }, roster12, { games: [] })).toEqual([])
    const eligible = new Set(roster12.map((p) => p.name).filter((n) => n !== '甲' && n !== '子'))
    expect(lineupIssues(ok, roster12, { games, eligible })).toEqual(['甲 不在報名名單', '子 不在報名名單'])
  })
})

describe('picking a scheduled game', () => {
  it('lists only scheduled games, soonest first (time breaks ties), with one label format everywhere', () => {
    const g = (id: string, date: string, time?: string, status?: Game['status']): Game => ({ id, date, time, tournament: '大專盃', opponent: id, homeAway: '主', status })
    const games = [g('C', '2026-10-04', undefined, 'scheduled'), g('B', '2026-10-03', '13:00', 'scheduled'), g('A', '2026-10-03', '09:00', 'scheduled'), g('P', '2026-09-01'), g('X', '2026-10-01', undefined, 'cancelled')]
    expect(scheduledGames(games).map((x) => x.id)).toEqual(['A', 'B', 'C'])
    expect(gameLabel(games[1])).toBe('2026-10-03 13:00 vs B（大專盃）')
    expect(gameLabel(games[0])).toBe('2026-10-04 vs C（大專盃）')
  })
})

describe('designated hitter keeps the batting order right', () => {
  const base = (): Lineup => ({ ...emptyLineup(), field: { P: '壬', C: '甲', '1B': '乙', '2B': '丙', '3B': '丁', SS: '戊', LF: '己', CF: '庚', RF: '辛' }, order: ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'] })
  it('adding a DH takes the pitcher\'s slot', () => {
    const l = setDesignatedHitter(base(), '癸')
    expect(l.dh).toBe('癸'); expect(l.order[8]).toBe('癸'); expect(l.order).not.toContain('壬')
  })
  it('a fielder moved to DH keeps his own slot and the pitcher\'s slot is cleared', () => {
    const l = setDesignatedHitter(base(), '己')
    expect(l.field.LF).toBeUndefined(); expect(l.order[5]).toBe('己'); expect(l.order[8]).toBe('')
  })
  it('switching the DH hands over the slot; dropping it brings the pitcher back', () => {
    const a = setDesignatedHitter(setDesignatedHitter(base(), '癸'), '子')
    expect(a.order[8]).toBe('子'); expect(a.order).not.toContain('癸')
    const b = setDesignatedHitter(a, '')
    expect(b.dh).toBe(''); expect(b.order[8]).toBe('壬')
  })
  it('works when the pitcher is not in the order yet', () => {
    const l = setDesignatedHitter({ ...base(), order: ['甲', '', '', '', '', '', '', '', ''] }, '癸')
    expect(l.order).toEqual(['甲', '', '', '', '', '', '', '', ''])
    expect(autoOrder(l).order).toContain('癸'); expect(autoOrder(l).order).not.toContain('壬')
  })
})

