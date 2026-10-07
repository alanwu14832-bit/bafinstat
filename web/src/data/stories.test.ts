import { describe, expect, it } from 'vitest'
import { currentStreak, hitStreak, playerStories, teamStories } from './stories'
import { summarizeGame } from './stats'
import { EMPTY_DATASET, type BattingPA, type Dataset, type Game, type PitchingPA } from './types'

const bat = (gameId: string, batter: string, result: string, run = 0): BattingPA => ({ gameId, inning: 1, batter, pitches: ['IP'], result, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run, rbi: 0 })
const pit = (gameId: string, pitcher: string, result: string, code?: string): PitchingPA => ({ gameId, inning: 1, pitcher, pitches: ['IP'], result, sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...(code ? { code } : {}) })
const game = (n: number, opponent = '對手'): Game => ({ id: `G2026100${n}-01`, date: `2026-10-0${n}`, tournament: '秋季聯賽', opponent, homeAway: '主', innings: 7 })

/** Games where we score `us` runs (甲 scores them) and allow `opp`; 甲 always gets a hit, 乙 never does. */
function season(results: Array<[number, number]>): Dataset {
  const games = results.map((_, i) => game(i + 1))
  const batting: BattingPA[] = []
  const pitching: PitchingPA[] = []
  results.forEach(([us, opp], i) => {
    const id = games[i].id
    batting.push(bat(id, '甲', '一安', us), bat(id, '甲', '內滾'), bat(id, '乙', '三振'), bat(id, '乙', '內滾'), bat(id, '丙', i % 2 ? '二安' : '外飛'))
    for (let k = 0; k < 9; k++) pitching.push(pit(id, '丁', '三振', ['I', 'II', 'III'][k % 3]))
    for (let k = 0; k < opp; k++) pitching.push(pit(id, '丁', '一安', 'ER'))
  })
  return { ...EMPTY_DATASET, games, batting, pitching }
}
const input = (ds: Dataset) => ({ dataset: ds, summaries: ds.games.map((g) => summarizeGame(ds, g)), batting: ds.batting, pitching: ds.pitching })

describe('數據故事：基本判斷', () => {
  it('counts the current streak and stops at a tie or the other result', () => {
    const ds = season([[1, 2], [3, 1], [4, 0], [2, 1]])
    expect(currentStreak(input(ds).summaries)).toEqual({ result: 'W', n: 3 })
    expect(currentStreak(input(season([[1, 1]])).summaries)).toBeNull()
  })
  it('counts games in a row with a hit, ending with the latest game', () => {
    expect(hitStreak([{ h: 1 }, { h: 0 }, { h: 2 }, { h: 1 }])).toBe(2)
    expect(hitStreak([{ h: 1 }, { h: 0 }])).toBe(0)
  })
})

describe('數據故事：全隊', () => {
  it('leads with the winning streak, then the hitting streak, one story per player', () => {
    const stories = teamStories(input(season([[3, 1], [4, 2], [5, 0], [2, 1]])))
    expect(stories[0]).toMatchObject({ id: 'streak', kicker: '連勝中', figure: '4', tone: 'good' })
    expect(stories[0].text).toBe('目前 4 連勝，最近一場 2：1 擊敗對手')
    expect(stories[1]).toMatchObject({ kicker: '連續安打', figure: '4', player: '甲', text: '甲 連續 4 場有安打' })
    const players = stories.flatMap((s) => (s.player ? [s.player] : []))
    expect(new Set(players).size).toBe(players.length)
    expect(stories.length).toBeLessThanOrEqual(4)
  })
  it('says nothing when there are no games', () => {
    expect(teamStories(input(EMPTY_DATASET))).toEqual([])
  })
  it('does not crown a leader on a tie', () => {
    const ds = season([[1, 0], [1, 0], [0, 1]])
    // 丙 bats exactly like 甲 (a hit and a groundout every game), so neither leads
    const even: Dataset = { ...ds, batting: [...ds.batting.filter((p) => p.batter !== '丙'), ...ds.games.flatMap((g) => [bat(g.id, '丙', '一安'), bat(g.id, '丙', '內滾')])] }
    const stories = teamStories(input(even), 10)
    expect(stories.find((s) => s.kicker === '打擊率領先')).toBeUndefined()
  })
})

describe('數據故事：個人', () => {
  it('describes a player through streaks and team ranks', () => {
    const ds = season([[3, 1], [4, 2], [5, 0], [2, 1], [1, 3], [2, 2]])
    const s = playerStories('甲', input(ds), 5)
    expect(s[0]).toMatchObject({ kicker: '連續安打', figure: '6' })
    expect(s.some((x) => x.kicker.startsWith('打擊率'))).toBe(true)
  })
  it('names the best qualified pitcher by ERA', () => {
    const s = playerStories('丁', input(season([[3, 1], [4, 2], [5, 0]])), 5)
    expect(s.find((x) => x.id === 'era')).toMatchObject({ kicker: '防禦率隊內最佳', text: '投 9.0 局' })
  })
})
