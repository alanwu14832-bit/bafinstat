import { describe, expect, it } from 'vitest'
import { SEED_DATASET } from './seed'
import { buildHistory, hitStreaks, hitTest, isActive, largestComeback, onBaseStreaks, onBaseTest, personalBests, scorelessStreak, scorelessStreaks, streaks, teamSeasons, winStreaks } from './history'
import { EMPTY_DATASET, type BattingPA, type Dataset, type Game, type PitchingPA } from './types'

const h8 = buildHistory(SEED_DATASET, undefined, 8)

describe('隊史索引（種子資料，學年制）', () => {
  it('orders the games and counts each season', () => {
    expect(h8.seasons).toEqual([2025])
    expect(h8.teamGames.get(2025)).toBe(2)
    expect(h8.games.map((g) => g.id)).toEqual(['G20251010-01', 'G20251222-01'])
    const c = h8.batCareer.get('蔡奇霖')!
    expect({ g: c.g, pa: c.pa, h: c.h }).toEqual({ g: 2, pa: 7, h: 4 })
    const seasons = h8.batSeasons.get('蔡奇霖')!
    expect(seasons).toHaveLength(1)
    expect(seasons[0]).toMatchObject({ season: 2025, label: '114 學年', teamGames: 2 })
    expect(seasons[0].line.h).toBe(4)
  })
  it('uses calendar years by default', () => {
    const h = buildHistory(SEED_DATASET)
    expect(h.seasons).toEqual([2025])
    expect(h.batSeasons.get('蔡奇霖')![0].label).toBe('2025 年')
  })
  it('finds personal bests, most recent game shown with how often', () => {
    const bests = personalBests(h8, '蔡奇霖')
    const rbi = bests.find((b) => b.key === 'rbi')!
    expect(rbi).toMatchObject({ value: 3, times: 1 })
    expect(rbi.game).toMatchObject({ id: 'G20251010-01', opponent: '群風' })
    const hits = bests.find((b) => b.key === 'h')!
    expect(hits).toMatchObject({ value: 2, times: 2 })
    expect(hits.game.id).toBe('G20251222-01')
    // no home run, so no 全壘打 best
    expect(bests.find((b) => b.key === 'hr')).toBeUndefined()
  })
  it('follows hitting and scoreless streaks', () => {
    expect(hitStreaks(h8, '蔡奇霖').best).toMatchObject({ n: 2, from: '2025-10-10', to: '2025-12-22', active: true })
    const s = scorelessStreaks(h8, '林昱丞')
    expect(s.best).toMatchObject({ n: 9, from: '2025-12-22', to: '2025-12-22', fromInning: 2, toInning: 4 })
    // inning 5 of 12/22 has a run charged to him
    expect(s.current).toBeNull()
  })
  it('measures comebacks, win streaks and seasons for the team', () => {
    // 10/10 trailed 1:4 after the top of the 3rd and won 9:5; 12/22 trailed 4:7 after the top of the 6th and won 8:7
    expect(h8.summaries.map(largestComeback)).toEqual([3, 3])
    expect(winStreaks(h8.summaries).best).toMatchObject({ n: 2, active: true })
    const rows = teamSeasons(h8.summaries, SEED_DATASET.batting, SEED_DATASET.pitching, SEED_DATASET, undefined, { today: '2026-03-01', start: 8 })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: '114 學年', games: 2, w: 2, l: 0, t: 0, rs: 17, ra: 12, diff: 5, small: true, current: true, from: '2025-08-01', to: '2026-07-31' })
    expect(rows[0].winPct).toBe(1)
    const cal = teamSeasons(h8.summaries, SEED_DATASET.batting, SEED_DATASET.pitching, SEED_DATASET, undefined, { today: '2026-03-01', start: 1 })
    expect(cal[0]).toMatchObject({ label: '2025 年', current: false })
  })
  it('is empty without games', () => {
    const h = buildHistory(EMPTY_DATASET)
    expect(h.games).toEqual([])
    expect(winStreaks(h.summaries).best).toBeNull()
  })
})

// hand-built games for 甲: one row per plate appearance
const game = (i: number): Game => ({ id: `G2026010${i}-01`, date: `2026-01-0${i}`, tournament: '聯賽', opponent: '對手', homeAway: '主', innings: 7 })
const bat = (gameId: string, batter: string, result: string, extra: Partial<BattingPA> = {}): BattingPA => ({ gameId, inning: 1, batter, pitches: ['IP'], result, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...extra })
function history(results: string[][], roster = [{ name: '甲' }], more: BattingPA[] = []): ReturnType<typeof buildHistory> {
  const games = results.map((_, i) => game(i + 1))
  const batting = results.flatMap((rs, i) => rs.map((r) => bat(games[i].id, '甲', r))).concat(more)
  // every game has a row for someone, so it counts as played
  const pitching: PitchingPA[] = games.map((g) => ({ gameId: g.id, inning: 1, pitcher: '丁', pitches: ['IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, code: 'I' }))
  const ds: Dataset = { ...EMPTY_DATASET, roster, games, batting, pitching }
  return buildHistory(ds)
}

describe('連續安打／連續上壘（MLB 9.23(b)）', () => {
  it('skips a game with only a walk, but a lone sacrifice fly breaks the streak', () => {
    const h = history([['一安'], ['保送'], ['二安'], ['一安'], ['三振']])
    const s = streaks(h.batGames.get('甲')!, hitTest)
    expect(s.best).toMatchObject({ n: 3, from: '2026-01-01', to: '2026-01-04' })
    expect(s.current).toBeNull()
    const h2 = history([['一安'], ['犧飛'], ['二安'], ['一安'], ['三振']])
    expect(streaks(h2.batGames.get('甲')!, hitTest).best).toMatchObject({ n: 2, from: '2026-01-03', to: '2026-01-04' })
  })
  it('skips a game he only pinch-ran in, for both streaks', () => {
    const games = [game(1), game(2), game(3)]
    const h = history([['一安'], [], ['一安']], [{ name: '甲' }, { name: '乙' }], [bat(games[1].id, '乙', '一安', { runner: '甲', run: 1 })])
    const rows = h.batGames.get('甲')!
    expect(rows).toHaveLength(3)
    expect(rows[1].line.pa).toBe(0)
    expect(streaks(rows, hitTest).best?.n).toBe(2)
    expect(streaks(rows, onBaseTest).best?.n).toBe(2)
  })
  it('counts walks and hit-by-pitches for the on-base streak', () => {
    const h = history([['一安'], ['保送'], ['三振'], ['觸身']])
    const s = onBaseStreaks(h, '甲')
    expect(s.best?.n).toBe(2)
    expect(s.current).toMatchObject({ n: 1, active: true })
  })
  it('marks a streak of a player who left as not active', () => {
    const h = history([['一安'], ['一安']], [{ name: '甲', status: '畢業' } as { name: string }])
    expect(isActive(h, '甲')).toBe(false)
    expect(hitStreaks(h, '甲').current).toMatchObject({ n: 2, active: false })
  })
})

describe('連續無失分局數', () => {
  it('adds the outs of scoreless innings and restarts on an inning with a run', () => {
    const g = { id: 'G', date: '2026-01-01', opponent: '對手', tournament: '', season: 2026, isDemo: false }
    const s = scorelessStreak([{ game: g, inning: 1, outs: 3, runs: 0 }, { game: g, inning: 2, outs: 2, runs: 1 }, { game: g, inning: 3, outs: 3, runs: 0 }, { game: g, inning: 4, outs: 1, runs: 0 }])
    expect(s.best).toMatchObject({ n: 4, fromInning: 3, toInning: 4, active: true })
    expect(s.current?.n).toBe(4)
  })
})
