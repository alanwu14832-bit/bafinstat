/**
 * Batch 13: a game being recorded shows 比賽進行中, not 勝／敗 — which drafts count as live, the site-wide id set,
 * summarizeGame's 'live' result, and every team tally leaving a live game out.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { forgetLiveGame, isLiveDraft, LIVE_STALE_MS, liveDraftsOf, liveGameIds, mayBeLive, setLiveGameIds, subscribeLiveGameIds, type LiveDraft } from './liveGames'
import { finishedSummaries, resultText, shownLine, summarizeGame, teamSummary, withLiveResult } from './stats'
import { teamSeasons, winRuns, winStreaks } from './history'
import { currentStreak, teamStories } from './stories'
import { buildHistory } from './history'
import { teamRecords } from './records'
import { gameRecap } from './recap'
import { gameShareText } from './gameText'
import { scoutSummary } from './opponent'
import { applyFilters } from './filters'
import { DEFAULT_FILTERS, EMPTY_DATASET, type BattingPA, type Dataset, type Game, type PitchingPA } from './types'

const NOW = Date.parse('2026-10-13T12:00:00Z')
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()
const draft = (id: string, p: { finished?: boolean; practice?: boolean; ago?: number } = {}): LiveDraft => ({
  state: { game: { id }, finished: p.finished ?? false, practice: p.practice, startedAt: iso(p.ago ?? 0) }, updatedAt: iso(p.ago ?? 0),
})

describe('which drafts are games in progress', () => {
  it('unfinished and touched in the last 12 hours', () => {
    expect(isLiveDraft(draft('G1'), NOW)).toBe(true)
    expect(isLiveDraft(draft('G1', { ago: LIVE_STALE_MS - 60_000 }), NOW)).toBe(true)
  })
  it('not when finished, a practice, or left untouched for more than 12 hours', () => {
    expect(isLiveDraft(draft('G1', { finished: true }), NOW)).toBe(false)
    expect(isLiveDraft(draft('G1', { practice: true }), NOW)).toBe(false)
    expect(isLiveDraft(draft('PRACTICE-20261013'), NOW)).toBe(false)
    expect(isLiveDraft(draft('G1', { ago: LIVE_STALE_MS + 60_000 }), NOW)).toBe(false)
    // no usable time at all: not live
    expect(isLiveDraft({ state: { game: { id: 'G1' } }, updatedAt: 'x' }, NOW)).toBe(false)
  })
  it('the state time when the row has none, the latest first', () => {
    expect(isLiveDraft({ state: { game: { id: 'G1' }, updatedAt: iso(1000) }, updatedAt: '' }, NOW)).toBe(true)
    const list = liveDraftsOf([draft('A', { ago: 5000 }), draft('B', { finished: true }), draft('C', { ago: 1000 }), draft('D', { ago: LIVE_STALE_MS * 2 })], NOW)
    expect(list.map((d) => d.state.game.id)).toEqual(['C', 'A'])
  })
})

describe('a game that may still be in progress (before the list is read)', () => {
  it('today or yesterday, not scheduled or cancelled', () => {
    expect(mayBeLive({ date: '2026-10-13' }, '2026-10-13')).toBe(true)
    expect(mayBeLive({ date: '2026-10-12' }, '2026-10-13')).toBe(true)
    expect(mayBeLive({ date: '2026-10-11' }, '2026-10-13')).toBe(false)
    expect(mayBeLive({ date: '2026-10-14' }, '2026-10-13')).toBe(false)
    expect(mayBeLive({ date: '2026-10-13', status: 'scheduled' }, '2026-10-13')).toBe(false)
  })
})

describe('the site-wide set', () => {
  afterEach(() => setLiveGameIds([]))
  it('keeps its identity until the ids change, and tells listeners only then', () => {
    let n = 0
    const off = subscribeLiveGameIds(() => n++)
    setLiveGameIds(['G1'])
    const a = liveGameIds()
    setLiveGameIds(['G1'])
    expect(liveGameIds()).toBe(a)
    expect(n).toBe(1)
    forgetLiveGame('G1')
    expect(liveGameIds().has('G1')).toBe(false)
    expect(n).toBe(2)
    forgetLiveGame('G1')
    expect(n).toBe(2)
    off()
  })
})

// --------------------------------------------------------------------------- the tallies
const g = (id: string, date: string, opponent = '甲隊'): Game => ({ id, date, tournament: '系際盃', opponent, homeAway: '客', innings: 7 })
const bat = (gameId: string, run: number): BattingPA => ({ gameId, inning: 1, batter: '子', order: 1, pitches: ['IP'], result: run ? '全壘打' : '內滾', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run, rbi: run })
const pit = (gameId: string, runs: number): PitchingPA[] => Array.from({ length: Math.max(1, runs) }, () => ({ gameId, inning: 1, pitcher: '丑', oppOrder: 1, pitches: ['IP'], result: runs ? '一安' : '內滾', code: runs ? 'R' : 'I', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 }))
// three wins, then a game in progress that we trail 0:2
const G = [g('G1', '2026-09-01'), g('G2', '2026-09-08'), g('G3', '2026-09-15'), g('G4', '2026-10-13')]
const ds: Dataset = {
  ...EMPTY_DATASET, games: G,
  batting: [bat('G1', 1), bat('G2', 1), bat('G3', 1), bat('G4', 0)],
  pitching: [...pit('G1', 0), ...pit('G2', 0), ...pit('G3', 0), ...pit('G4', 2)],
}
const LIVE = new Set(['G4'])

describe('summarizeGame and the team record with a game in progress', () => {
  afterEach(() => setLiveGameIds([]))
  it("its result is 'live' (the current score stays), 比賽進行中 in words", () => {
    const s = summarizeGame(ds, G[3], LIVE)
    expect(s).toMatchObject({ result: 'live', runsUs: 0, runsOpp: 2 })
    expect(resultText(s.result)).toBe('比賽進行中')
    expect(summarizeGame(ds, G[3]).result).toBe('L')
    // the site-wide set is the default
    setLiveGameIds(['G4'])
    expect(summarizeGame(ds, G[3]).result).toBe('live')
    expect(withLiveResult(summarizeGame(ds, G[3], new Set()))).toMatchObject({ result: 'live' })
    setLiveGameIds([])
    expect(withLiveResult(summarizeGame(ds, G[3], LIVE)).result).toBe('L')
  })
  it('its line score stops at the innings each side has batted in; a finished game keeps every inning', () => {
    // G5: 7 innings scheduled, we (away) batted in the 1st to 3rd, they in the 1st and 2nd
    const g5 = g('G5', '2026-10-13')
    const d5: Dataset = { ...ds, games: [...G, g5], batting: [...ds.batting, bat('G5', 2), { ...bat('G5', 1), inning: 2 }, { ...bat('G5', 0), inning: 3 }], pitching: [...ds.pitching, ...pit('G5', 1), { ...pit('G5', 0)[0], inning: 2 }] }
    const live = summarizeGame(d5, g5, new Set(['G5']))
    expect(live).toMatchObject({ lineUs: [2, 1, 0, 0, 0, 0, 0], lineOpp: [1, 0, 0, 0, 0, 0, 0], playedUs: 3, playedOpp: 2 })
    expect(shownLine(live, 'us')).toEqual([2, 1, 0])
    expect(shownLine(live, 'opp')).toEqual([1, 0])
    const done = summarizeGame(d5, g5, new Set())
    expect(shownLine(done, 'us')).toEqual([2, 1, 0, 0, 0, 0, 0])
    expect(shownLine(done, 'opp')).toEqual([1, 0, 0, 0, 0, 0, 0])
    // a summary made before it went live, then seen as live: the same
    expect(shownLine(withLiveResult(done, new Set(['G5'])), 'opp')).toEqual([1, 0])
  })
  it('teamSummary: W-L-T and win % leave it out, the runs keep it', () => {
    const t = teamSummary(G.map((x) => summarizeGame(ds, x, LIVE)))
    expect(t).toMatchObject({ games: 4, w: 3, l: 0, t: 0, live: 1, winPct: 1, rs: 3, ra: 2 })
    // finished: the loss counts
    expect(teamSummary(G.map((x) => summarizeGame(ds, x, new Set())))).toMatchObject({ w: 3, l: 1, t: 0, live: 0, winPct: 0.75 })
  })
  it('the filter bar: a live game is in 全部, in neither 勝 nor 敗', () => {
    setLiveGameIds(['G4'])
    expect(applyFilters(ds, DEFAULT_FILTERS).summaries).toHaveLength(4)
    expect(applyFilters(ds, { ...DEFAULT_FILTERS, result: 'L' }).summaries).toHaveLength(0)
    expect(applyFilters(ds, { ...DEFAULT_FILTERS, result: 'W' }).summaries).toHaveLength(3)
  })
  it('streaks: the game in progress neither ends nor extends the winning streak', () => {
    const ss = G.map((x) => summarizeGame(ds, x, LIVE))
    expect(currentStreak(ss)).toEqual({ result: 'W', n: 3 })
    expect(winStreaks(ss).current).toMatchObject({ n: 3, active: true, toId: 'G3' })
    expect(winRuns(ss)).toHaveLength(1)
    expect(finishedSummaries(ss)).toHaveLength(3)
    // once it is a loss, the streak is over
    expect(winStreaks(G.map((x) => summarizeGame(ds, x, new Set()))).current).toBeNull()
  })
  it('逐季戰績: no 和 for a game in progress', () => {
    const rows = teamSeasons(G.map((x) => summarizeGame(ds, x, LIVE)), ds.batting, ds.pitching, ds)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ games: 4, w: 3, l: 0, t: 0, winPct: 1 })
  })
  it('紀錄簿 team records and the stories count finished games only', () => {
    setLiveGameIds(['G4'])
    const h = buildHistory(ds)
    const t = teamRecords(h)
    const season = t.season.find((l) => l.id === 'team-season-w')!
    expect(season.entries[0].context).toBe('3 場・3 勝 0 敗')
    const runs = t.game.find((l) => l.id === 'team-runs')!
    expect(runs.entries.length).toBe(3)
    expect(runs.entries.every((r) => r.gameId !== 'G4')).toBe(true)
    const stories = teamStories({ dataset: ds, summaries: G.map((x) => summarizeGame(ds, x)), batting: ds.batting, pitching: ds.pitching })
    expect(stories.find((s) => s.id === 'streak')?.text).toBe('目前 3 連勝，最近完賽的一場 1：0 擊敗甲隊')
  })
  it('the recap, the share text and 歷來對戰 say 比賽進行中', () => {
    const s = summarizeGame(ds, G[3], LIVE)
    expect(gameRecap(s, ds, '我隊')[0]).toMatchObject({ label: '比賽進行中', text: '比賽還在進行，目前 我隊 0:2 甲隊。' })
    expect(gameShareText({ teamName: '我隊', summary: s, recap: [], url: 'https://x/games/G4' }).split('\n')[0]).toBe('我隊 0:2 甲隊（比賽進行中）')
    setLiveGameIds(['G4'])
    expect(scoutSummary(ds, '甲隊')).toMatchObject({ games: 4, w: 3, l: 0, t: 0, live: 1 })
  })
})
