import { describe, expect, it } from 'vitest'
import { currentStreak, hitStreak, playerStories, teamStories } from './stories'
import { buildHistory } from './history'
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

describe('突破僵局 runners are no at bats', () => {
  it('a player whose only row in his latest game is a placed runner keeps his hitting streak', () => {
    const ds = season([[1, 0], [1, 0], [1, 0], [1, 0]])
    // 甲 hits in games 1–3; in game 4 he only ran as the tie-break runner
    const id4 = ds.games[3].id
    const batting = ds.batting.filter((p) => !(p.gameId === id4 && p.batter === '甲')).concat({ ...bat(id4, '甲', '突破僵局', 1), pitches: [], inning: 8, code: 'R' })
    const stories = teamStories(input({ ...ds, batting }), 10)
    expect(stories.find((s) => s.id === 'hit-甲')?.figure).toBe('3')
    expect(hitStreak([{ h: 1 }, { h: 1 }, { h: 1 }])).toBe(3)
  })
})

describe('連續安打：沒有打數的比賽（MLB 9.23(b)）', () => {
  it('skips a game with no at bat and no sacrifice fly, but not a lone sacrifice fly', () => {
    expect(hitStreak([{ h: 1, ab: 2 }, { h: 0, ab: 0 }, { h: 1, ab: 3 }])).toBe(2)
    expect(hitStreak([{ h: 1, ab: 2 }, { h: 0, ab: 0, sf: 1 }])).toBe(0)
    // plain {h} lists behave as before
    expect(hitStreak([{ h: 1 }, { h: 0 }, { h: 2 }, { h: 1 }])).toBe(2)
  })
})

describe('數據故事：隊史（里程碑、連續安打排名）', () => {
  // 甲 hits in all 4 games; 丙 has a 二安 in games 2 and 4
  const ds = season([[3, 1], [4, 2], [5, 0], [2, 1]])
  const all = input(ds)
  const history = buildHistory(ds)
  it('adds nothing all-time without the history', () => {
    const plain = teamStories(all, 10)
    expect(plain.some((x) => x.kicker.startsWith('里程碑'))).toBe(false)
    expect(plain.find((x) => x.id === 'hit-甲')!.text).toBe('甲 連續 4 場有安打')
  })
  it('ranks a hitting streak against everyone’s longest', () => {
    const st = teamStories({ ...all, history }, 10)
    expect(st.find((x) => x.id === 'hit-甲')!.text).toBe('甲 連續 4 場有安打，有紀錄以來隊上最長')
  })
  it('says nothing all-time about a streak the filter cuts short or stitches together', () => {
    // 甲 hits in games 1–5 (the team record, 5); 乙 in games 1–4 only (4, then hitless)
    const g5 = Array.from({ length: 5 }, (_, i) => ({ ...game(i + 1), tournament: i % 2 ? '盃B' : '盃A' }))
    const batting: BattingPA[] = []
    g5.forEach((g, i) => { batting.push(bat(g.id, '甲', '一安'), bat(g.id, '乙', i < 4 ? '一安' : '三振')) })
    const ds: Dataset = { ...EMPTY_DATASET, games: g5, batting, pitching: g5.map((g) => pit(g.id, '丁', '三振', 'I')) }
    const h = buildHistory(ds)
    const slice = (keep: (g: Game) => boolean) => { const ids = new Set(ds.games.filter(keep).map((g) => g.id)); const sub = { ...ds, batting: ds.batting.filter((p) => ids.has(p.gameId)) }; return { ...input(sub), summaries: ds.games.filter(keep).map((g) => summarizeGame(ds, g)), history: h } }
    // all games: his real streak, the longest
    expect(teamStories(slice(() => true), 10).find((x) => x.id === 'hit-甲')!.text).toBe('甲 連續 5 場有安打，有紀錄以來隊上最長')
    // a date filter from game 3: the slice shows 3 of his 5 — no 「第 2 長」
    expect(teamStories(slice((g) => g.date >= '2026-10-03'), 10).find((x) => x.id === 'hit-甲')!.text).toBe('甲 連續 3 場有安打')
    // 甲 hitless in the 盃B games (2, 4): a 盃A filter would stitch games 1, 3, 5 into a 「3 場」 run that never happened
    const broken = { ...ds, batting: ds.batting.map((p) => (p.batter === '甲' && ds.games.find((g) => g.id === p.gameId)!.tournament === '盃B' ? { ...p, result: '三振' } : p)) }
    const hb = buildHistory(broken)
    const ids = new Set(broken.games.filter((g) => g.tournament === '盃A').map((g) => g.id))
    const cup = { ...input({ ...broken, batting: broken.batting.filter((p) => ids.has(p.gameId)) }), summaries: broken.games.filter((g) => ids.has(g.id)).map((g) => summarizeGame(broken, g)), history: hb }
    expect(teamStories(cup, 10).find((x) => x.id === 'hit-甲')!.text).toBe('甲 連續 3 場有安打')
  })
  it('tells one milestone, only when the latest game is on screen', () => {
    // 丁 (9 K a game) passed 25 K in game 3, not the latest; 乙 hits his first home run in the latest game
    const last = ds.games[3].id
    const withHr = { ...ds, batting: [...ds.batting, bat(last, '乙', '全壘打', 1)] }
    const h = buildHistory(withHr)
    const full = input(withHr)
    const st = teamStories({ ...full, history: h }, 10)
    const ms = st.filter((x) => x.kicker.startsWith('里程碑'))
    expect(ms).toHaveLength(1)
    expect(ms[0]).toMatchObject({ kicker: '里程碑達成', player: '乙' })
    expect(ms[0].text).toContain('生涯第一支全壘打')
    // a slice without the latest game says nothing all-time
    const past = { ...full, summaries: full.summaries.slice(0, 3), batting: full.batting.filter((p) => p.gameId !== last), pitching: full.pitching.filter((p) => p.gameId !== last) }
    expect(teamStories({ ...past, history: h }, 10).some((x) => x.kicker.startsWith('里程碑'))).toBe(false)
    // the player card gets its own
    expect(playerStories('乙', { ...full, history: h }, 5).find((x) => x.kicker === '里程碑達成')?.text).toMatch(/^10\/04 對對手敲出生涯第一支全壘打$/)
  })
})
