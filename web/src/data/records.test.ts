import { describe, expect, it } from 'vitest'
import { SEED_DATASET } from './seed'
import { buildHistory } from './history'
import { careerRecords, dateRange, gameRecords, moreTiedText, rankTop, recordsCsv, seasonRecords, SINGLE_GAME_MIN, teamRecords } from './records'
import { EMPTY_DATASET, type BattingPA, type Dataset, type Game, type PitchingPA, type Player } from './types'

describe('rankTop', () => {
  it('shares ranks on ties and skips the next', () => {
    const r = rankTop([5, 4, 4, 3, 3, 3, 2], (v) => v)
    expect(r.rows.map((x) => x.rank)).toEqual([1, 2, 2, 4, 4, 4])
    expect(r.moreTied).toBe(0)
  })
  it('collapses a tie too big for the cut', () => {
    const r = rankTop([5, 4, 3, 3, 3, 3, 3, 3], (v) => v)
    expect(r.rows.map((x) => x.value)).toEqual([5, 4])
    expect(r.moreTied).toBe(6)
    expect(r.moreValue).toBe(3)
  })
  it('ranks low lists ascending and drops blanks', () => {
    const r = rankTop([2.5, null, 1.2, 3.0], (v) => v, { low: true })
    expect(r.rows.map((x) => x.value)).toEqual([1.2, 2.5, 3.0])
  })
})

const h = buildHistory(SEED_DATASET)

describe('紀錄簿（種子資料）', () => {
  it('lists single games with at least 2 hits, oldest first, all tied first', () => {
    const { bat, pit } = gameRecords(h)
    const hits = bat.find((l) => l.id === 'game-h')!
    expect(hits.rule).toBe('單場至少 2 支才列入')
    expect(hits.entries).toHaveLength(6)
    expect(hits.entries.every((e) => e.rank === 1 && e.value === 2)).toBe(true)
    expect(hits.entries.slice(0, 3).every((e) => e.gameId === 'G20251010-01')).toBe(true)
    expect(new Set(hits.entries.slice(0, 3).map((e) => e.name))).toEqual(new Set(['蘇柏愷', '蔡奇霖', '曾亭維']))
    expect(new Set(hits.entries.slice(3).map((e) => e.name))).toEqual(new Set(['嚴敬翔', '蔡奇霖', '梁睿至']))
    expect(hits.entries[0].context).toBe('2025/10/10 對 群風')
    const rbi = bat.find((l) => l.id === 'game-rbi')!
    expect(rbi.entries.map((e) => [e.name, e.value, e.rank, e.context])).toEqual([['蔡奇霖', 3, 1, '2025/10/10 對 群風'], ['鄭羣燁', 3, 1, '2025/12/22 對 工海物治']])
    const outs = pit.find((l) => l.id === 'game-outs')!
    expect(outs.entries.map((e) => [e.name, e.display])).toEqual([['林昱丞', '4.2']])
    expect(SINGLE_GAME_MIN.outs).toBe(9)
  })
  it('keeps team records', () => {
    const t = teamRecords(h, { today: '2026-03-01' })
    const fewest = t.game.find((l) => l.id === 'team-fewestHits')!
    // 10/10 is out: 15 outs < 21
    expect(fewest.entries.map((e) => [e.value, e.gameId])).toEqual([[10, 'G20251222-01']])
    expect(fewest.entries[0].title).toBe('2025/12/22 對 工海物治')
    const inning = t.game.find((l) => l.id === 'team-inning')!
    expect(inning.entries.filter((e) => e.value === 4).map((e) => [e.gameId, e.context.split('・')[0]])).toEqual([['G20251010-01', '第 3 局'], ['G20251010-01', '第 4 局'], ['G20251222-01', '第 7 局']])
    expect(inning.entries.filter((e) => e.value === 4).every((e) => e.rank === 1)).toBe(true)
    const comeback = t.game.find((l) => l.id === 'team-comeback')!
    expect(comeback.entries.map((e) => e.value)).toEqual([3, 3])
    expect(t.streak[0].entries).toHaveLength(1)
    expect(t.streak[0].entries[0]).toMatchObject({ value: 2, ongoing: true })
    // fewer than 5 decided games: no 最高勝率 yet
    expect(t.season.find((l) => l.id === 'team-season-pct')!.entries).toEqual([])
    expect(t.season.find((l) => l.id === 'team-season-w')!.entries[0]).toMatchObject({ value: 2, title: '2025 年', ongoing: false })
  })
  it('writes CSV rows', () => {
    const rows = recordsCsv(gameRecords(h).bat.filter((l) => l.id === 'game-rbi'))
    expect(rows[0]).toEqual({ cat: '單場', item: '打點', rank: 1, player: '蔡奇霖', value: '3', when: '2025-10-10', opponent: '群風', sample: '' })
  })
})

// a hand-built league: 3 team games in 2026; 甲 has 7 PA, 乙 6 PA, 丙 (畢業) 9 PA
const game = (i: number): Game => ({ id: `G2026030${i}-01`, date: `2026-03-0${i}`, tournament: '聯賽', opponent: '對手', homeAway: '主', innings: 7 })
const bat = (gameId: string, batter: string, result: string): BattingPA => ({ gameId, inning: 1, batter, pitches: ['IP'], result, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 })
const pit = (gameId: string): PitchingPA => ({ gameId, inning: 1, pitcher: '丁', pitches: ['IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, code: 'I' })
function league(nGames = 3): Dataset {
  const games = Array.from({ length: nGames }, (_, i) => ({ ...game(1), id: `G${i}`, date: `2026-03-${String(i + 1).padStart(2, '0')}` }))
  const batting: BattingPA[] = []
  const pa = (who: string, k: number) => { for (let i = 0; i < k; i++) batting.push(bat(games[i % 3].id, who, i % 2 ? '內滾' : '一安')) }
  pa('甲', 7); pa('乙', 6); pa('丙', 9)
  const roster: Player[] = [{ name: '甲' }, { name: '乙', status: '現役' }, { name: '丙', status: '畢業' }]
  return { ...EMPTY_DATASET, roster, games, batting, pitching: games.map((g) => pit(g.id)) }
}

describe('規定打席（單季、生涯）', () => {
  it('needs 7 PA in a season of 3 team games', () => {
    const avg = seasonRecords(buildHistory(league()), { today: '2026-03-10' }).bat.find((l) => l.id === 'season-avg')!
    const names = avg.entries.map((e) => e.name)
    expect(names).toContain('甲')
    expect(names).not.toContain('乙')
    expect(avg.entries.find((e) => e.name === '甲')).toMatchObject({ ongoing: true, context: '2026 年・7 打席' })
  })
  it('drops players who left with 只看現役', () => {
    const all = careerRecords(buildHistory(league())).bat.find((l) => l.id === 'career-g')!
    expect(all.entries.map((e) => e.name)).toContain('丙')
    expect(all.entries.find((e) => e.name === '丙')!.active).toBe(false)
    const active = careerRecords(buildHistory(league()), { activeOnly: true }).bat.find((l) => l.id === 'career-g')!
    expect(active.entries.map((e) => e.name)).not.toContain('丙')
  })
  it('needs 100 career PA once there are 60 games', () => {
    const avg = careerRecords(buildHistory(league(60))).bat.find((l) => l.id === 'career-avg')!
    expect(avg.rule).toBe('生涯至少 100 打席')
    expect(avg.entries).toEqual([])
    const small = careerRecords(buildHistory(league(3))).bat.find((l) => l.id === 'career-avg')!
    expect(small.rule).toContain('生涯至少 7 打席')
    expect(small.entries.map((e) => e.name).sort()).toEqual(['丙', '甲'])
  })
})

describe('並列與單位', () => {
  it('gives every team list the unit of its own value', () => {
    const t = teamRecords(h, { today: '2025-12-31' })
    const unit = Object.fromEntries([...t.game, ...t.season, ...t.streak].map((l) => [l.id, l.unit]))
    expect(unit).toEqual({
      'team-runs': '分', 'team-hits': '支', 'team-margin': '分', 'team-inning': '分', 'team-sb': '次', 'team-k': '次', 'team-fewestHits': '支', 'team-comeback': '分',
      'team-season-w': '勝', 'team-season-pct': '', 'team-season-rpg': '分', 'team-season-rapg': '分', 'team-winStreak': '連勝',
    })
  })
  it('says 「另有」 under listed rows, 「共…並列紀錄」 when the tie is for first place', () => {
    const base = { category: 'game' as const, moreTied: 6, moreDisplay: '3', unit: '支' }
    expect(moreTiedText({ ...base, entries: [{ rank: 1, value: 5, display: '5', context: '' }] })).toBe('另有 6 人次並列 3 支')
    expect(moreTiedText({ ...base, entries: [] })).toBe('共 6 人次並列紀錄 3 支')
    expect(moreTiedText({ ...base, category: 'team', unit: '分', entries: [] })).toBe('共 6 筆並列紀錄 3 分')
    expect(moreTiedText({ ...base, moreTied: 0, entries: [] })).toBe('')
    // a whole first place too big to show: no rows, and the CSV row says so too
    const r = rankTop([2, 2, 2, 2, 2, 2, 2, 2], (v) => v)
    expect(r.rows).toEqual([])
    expect(r.moreTied).toBe(8)
  })
  it('writes both years for a streak over New Year, and the season span', () => {
    expect(dateRange('2025-10-10', '2025-12-22')).toBe('10/10–12/22')
    expect(dateRange('2025-10-10', '2025-12-22', true)).toBe('2025/10/10–12/22')
    expect(dateRange('2025-12-22', '2026-02-15')).toBe('2025/12/22–2026/02/15')
    expect(dateRange('2025-12-22', '2025-12-22')).toBe('12/22')
    // 甲 hits in 3 straight games from 2025-12-20 to 2026-01-05; we win all three
    const games: Game[] = ['2025-12-20', '2025-12-28', '2026-01-05'].map((date, i) => ({ id: `Y${i}`, date, tournament: '聯賽', opponent: '對手', homeAway: '主', innings: 7 }))
    const batting = games.flatMap((g) => [{ ...bat(g.id, '甲', '一安'), run: 1 }])
    const ds: Dataset = { ...EMPTY_DATASET, roster: [{ name: '甲' }], games, batting, pitching: games.map((g) => pit(g.id)) }
    const hy = buildHistory(ds, undefined, 1)
    const streak = careerRecords(hy).bat.find((l) => l.id === 'career-hitStreak')!.entries[0]
    expect(streak.context).toBe('2025–2026 年・2025/12/20–2026/01/05')
    const wins = teamRecords(hy, { today: '2026-01-06' }).streak[0].entries[0]
    expect(wins).toMatchObject({ title: '2025/12/20–2026/01/05', context: '2025–2026 年' })
  })
})
