import { describe, expect, it } from 'vitest'
import { buildHistory } from './history'
import { MILESTONES, nextMilestone, reachedMilestones, upcomingMilestones } from './milestones'
import { milestoneStories } from './stories'
import { EMPTY_DATASET, type BattingPA, type Dataset, type Game, type PitchingPA, type Player } from './types'

const day = (i: number) => { const d = new Date(Date.UTC(2026, 0, 1 + i)); return d.toISOString().slice(0, 10) }
const game = (i: number, opponent = '對手'): Game => ({ id: `G${String(i).padStart(3, '0')}`, date: day(i), tournament: '聯賽', opponent, homeAway: '主', innings: 7 })
const bat = (gameId: string, batter: string, result: string): BattingPA => ({ gameId, inning: 1, batter, pitches: ['IP'], result, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 })
const pit = (gameId: string, pitcher: string, code = 'I'): PitchingPA => ({ gameId, inning: 1, pitcher, pitches: ['IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, code })

/** 甲's hits per game (each game also has a 內滾 so he always has an at bat); 乙 pitches `outs[i]` outs. */
function ds(hitsPerGame: number[], opts: { status?: string; hr?: number[]; outs?: number[] } = {}): Dataset {
  const games = hitsPerGame.map((_, i) => game(i, i === hitsPerGame.length - 1 ? '群風' : '對手'))
  const batting: BattingPA[] = []
  const pitching: PitchingPA[] = []
  hitsPerGame.forEach((n, i) => {
    for (let k = 0; k < n; k++) batting.push(bat(games[i].id, '甲', '一安'))
    for (let k = 0; k < (opts.hr?.[i] ?? 0); k++) batting.push(bat(games[i].id, '甲', '全壘打'))
    batting.push(bat(games[i].id, '甲', '內滾'))
    const outs = opts.outs?.[i] ?? 1
    for (let k = 0; k < outs; k++) pitching.push(pit(games[i].id, '乙', ['I', 'II', 'III'][k % 3]))
  })
  const roster: Player[] = [{ name: '甲', status: opts.status ?? '現役' }, { name: '乙' }]
  return { ...EMPTY_DATASET, roster, games, batting, pitching }
}

describe('nextMilestone', () => {
  it('finds the next round number within the window', () => {
    expect(nextMilestone('h', 48)).toEqual({ target: 50, left: 2 })
    expect(nextMilestone('h', 46)).toBeNull()
    expect(nextMilestone('h', 50)).toBeNull()
    expect(nextMilestone('hr', 0)).toBeNull()
    expect(nextMilestone('hr', 4)).toEqual({ target: 5, left: 1 })
    expect(nextMilestone('outs', 73)).toEqual({ target: 75, left: 2 })
    expect(MILESTONES.find((m) => m.key === 'outs')!.steps).toEqual([75, 150, 300, 450, 600])
  })
})

describe('里程碑在望', () => {
  it('names a current player close to 50 hits', () => {
    const h = buildHistory(ds(Array(16).fill(3)))
    const up = upcomingMilestones(h, '甲')
    expect(up[0]).toMatchObject({ key: 'h', target: 50, left: 2, text: '甲 再 2 支安打就生涯 50 安', progress: '生涯安打 48／50・再 2 支' })
  })
  it('says nothing for a player who left, or too far away, or without a home run yet', () => {
    expect(upcomingMilestones(buildHistory(ds(Array(16).fill(3), { status: '畢業' })), '甲')).toEqual([])
    const far = upcomingMilestones(buildHistory(ds([...Array(15).fill(3), 1])), '甲')
    expect(far.find((m) => m.key === 'h')).toBeUndefined()
    expect(far.some((m) => m.text.includes('再 1 支全壘打'))).toBe(false)
  })
  it('writes innings for pitchers', () => {
    // 乙: 73 outs over 25 games
    const outs = [...Array(24).fill(3), 1]
    const h = buildHistory(ds(Array(25).fill(0), { outs }))
    expect(upcomingMilestones(h, '乙').find((m) => m.key === 'outs')?.text).toBe('乙 再 0.2 局就生涯投滿 25 局')
  })
})

describe('里程碑達成', () => {
  it('tells the 50th hit in the team’s latest game', () => {
    const h = buildHistory(ds([...Array(16).fill(3), 1, 2]))
    const story = milestoneStories(h, h.roster)[0]
    expect(story).toMatchObject({ kicker: '里程碑達成', figure: '50', player: '甲' })
    expect(story.text).toContain('生涯第 50 支安打')
    expect(story.text).toBe(`甲 ${h.games[17].date.slice(5).replace('-', '/')} 對群風敲出生涯第 50 支安打`)
    // on his own card, without the name
    expect(milestoneStories(h, h.roster, { player: '甲' })[0].text.startsWith('甲')).toBe(false)
  })
  it('calls the first home run the first', () => {
    const h = buildHistory(ds([1, 1], { hr: [0, 1] }))
    expect(milestoneStories(h, h.roster)[0].text).toContain('生涯第一支全壘打')
  })
  it('lists every round number passed, with its game', () => {
    const h = buildHistory(ds([...Array(9).fill(3)]))
    const r = reachedMilestones(h, '甲').filter((m) => m.key === 'h')
    expect(r.map((m) => [m.target, m.game.id])).toEqual([[10, 'G003'], [25, 'G008']])
    expect(r[0].short).toBe('生涯第 10 支安打')
  })
})
