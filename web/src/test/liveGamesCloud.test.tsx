/**
 * Batch 13 (cloud mode): the games being recorded come from record_drafts (any device), one read shared by every
 * component, finished / stale / practice drafts left out, and a game finished elsewhere shows its result again on the
 * next refresh. The 30 s check of every page reads only the drafts' heads; the whole state only while 即時比分 asks.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rows: Array<{ game_id: string; state: unknown; updated_by: string | null; updated_at: string }> = []
let missing = false
vi.mock('../data/supabase', async (orig) => ({
  ...(await orig<typeof import('../data/supabase')>()),
  cloudConfigured: true,
  // (the store boots the cloud connection when it loads: no sign-in, no change feed in this test)
  currentUser: vi.fn(async () => null),
  onAuthChange: vi.fn(() => () => undefined),
  subscribeCloudChanges: vi.fn(() => () => undefined),
  listCloudDrafts: vi.fn(async () => (missing ? null : rows.map((r) => ({ ...r })))),
  listCloudDraftHeads: vi.fn(async () => (missing ? null : rows.map((r) => {
    const st = r.state as { finished?: boolean; practice?: boolean }
    return { game_id: r.game_id, updated_at: r.updated_at, finished: st.finished ?? null, practice: st.practice ?? null }
  }))),
}))

import { listCloudDraftHeads, listCloudDrafts } from '../data/supabase'
import { DRAFTS_MISSING, LIVE_POLL_MS, refreshLiveGames, resetLiveGames, useLiveGames } from '../hooks/useLiveGames'
import { liveGameIds } from '../data/liveGames'
import { GameView } from '../pages/GameView'
import { summarizeGame } from '../data/stats'
import { useDataStore } from '../store/data'
import { localDate } from '../lib/dates'
import { DEFAULT_FILTERS, EMPTY_DATASET, type Dataset, type Game } from '../data/types'

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const row = (id: string, p: { finished?: boolean; practice?: boolean; at?: string } = {}) => {
  const at = p.at ?? ago(60_000)
  return { game_id: id, updated_by: '紀錄員', updated_at: at, state: { game: { id }, finished: !!p.finished, practice: p.practice, startedAt: at, updatedAt: at } }
}

// (as 即時比分: with the recording states)
function Probe({ name }: { name: string }) {
  const { drafts, error } = useLiveGames({ full: true })
  return <div data-testid={name}>{drafts.map((d) => `${d.state.game.id}:${d.by}`).join(',')}{error ? `!${error}` : ''}</div>
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)) })

// (as every page: the ids only)
function Ids({ name }: { name: string }) {
  const { ids, known } = useLiveGames()
  return <div data-testid={name}>{[...ids].join(',')}{known ? '' : '?'}</div>
}
beforeEach(() => { rows.length = 0; missing = false; resetLiveGames(); vi.mocked(listCloudDrafts).mockClear(); vi.mocked(listCloudDraftHeads).mockClear() })
afterEach(() => { cleanup(); vi.useRealTimers(); resetLiveGames() })

describe('games in progress from the cloud', () => {
  it('one read for every component; only unfinished, recent, real games', async () => {
    rows.push(row('G1'), row('G2', { finished: true }), row('G3', { at: ago(13 * 3600_000) }), row('PRACTICE-20261013', { practice: true }))
    render(<MemoryRouter><Probe name="a" /><Probe name="b" /></MemoryRouter>)
    await flush()
    expect(listCloudDrafts).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('a').textContent).toBe('G1:紀錄員')
    expect(screen.getByTestId('b').textContent).toBe('G1:紀錄員')
    expect([...liveGameIds()]).toEqual(['G1'])
  })

  it('refreshes every 30 s while visible; a game finished on the recorder\'s phone drops out', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    rows.push(row('G1'))
    render(<MemoryRouter><Probe name="a" /></MemoryRouter>)
    await flush()
    expect(screen.getByTestId('a').textContent).toBe('G1:紀錄員')
    rows.length = 0
    await act(async () => { vi.advanceTimersByTime(LIVE_POLL_MS) })
    await flush()
    expect(listCloudDrafts).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('a').textContent).toBe('')
    expect(liveGameIds().size).toBe(0)
  })

  it('a faster page (即時比分, 5 s) speeds the shared refresh up while it is open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    function Fast() { useLiveGames({ pollMs: 5000 }); return null }
    const { rerender } = render(<MemoryRouter><Probe name="a" /><Fast /></MemoryRouter>)
    await flush()
    const n = vi.mocked(listCloudDrafts).mock.calls.length
    await act(async () => { vi.advanceTimersByTime(5000) })
    await flush()
    expect(vi.mocked(listCloudDrafts).mock.calls.length).toBe(n + 1)
    rerender(<MemoryRouter><Probe name="a" /></MemoryRouter>)
    await act(async () => { vi.advanceTimersByTime(5000) })
    await flush()
    expect(vi.mocked(listCloudDrafts).mock.calls.length).toBe(n + 1)
  })

  it('reads again on focus; says when the record_drafts table is missing', async () => {
    rows.push(row('G1'))
    render(<MemoryRouter><Probe name="a" /></MemoryRouter>)
    await flush()
    missing = true
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    await flush()
    expect(listCloudDrafts).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('a').textContent).toBe(`!${DRAFTS_MISSING}`)
    missing = false
    await act(() => refreshLiveGames())
    expect(screen.getByTestId('a').textContent).toBe('G1:紀錄員')
  })

  it('every page reads only the heads; 即時比分 reads the whole states while it is open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    rows.push(row('G1'), row('G2', { finished: true }))
    const { rerender } = render(<MemoryRouter><Ids name="a" /></MemoryRouter>)
    expect(screen.getByTestId('a').textContent).toBe('?')
    await flush()
    expect(screen.getByTestId('a').textContent).toBe('G1')
    expect(listCloudDraftHeads).toHaveBeenCalledTimes(1)
    expect(listCloudDrafts).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(LIVE_POLL_MS) })
    await flush()
    expect(listCloudDraftHeads).toHaveBeenCalledTimes(2)
    expect(listCloudDrafts).not.toHaveBeenCalled()
    // 即時比分 opens: one full read at once (the heads read a moment ago does not serve it), then full reads only
    rerender(<MemoryRouter><Ids name="a" /><Probe name="b" /></MemoryRouter>)
    await flush()
    expect(listCloudDrafts).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('b').textContent).toBe('G1:紀錄員')
    await act(async () => { vi.advanceTimersByTime(LIVE_POLL_MS) })
    await flush()
    expect(listCloudDrafts).toHaveBeenCalledTimes(2)
    expect(listCloudDraftHeads).toHaveBeenCalledTimes(2)
    // it closes: back to the heads
    rerender(<MemoryRouter><Ids name="a" /></MemoryRouter>)
    await act(async () => { vi.advanceTimersByTime(LIVE_POLL_MS) })
    await flush()
    expect(listCloudDraftHeads).toHaveBeenCalledTimes(3)
    expect(listCloudDrafts).toHaveBeenCalledTimes(2)
  })

  it('a failed first read leaves the list unknown; a reload in the same tab starts from the last list', async () => {
    vi.mocked(listCloudDraftHeads).mockRejectedValueOnce(new Error('offline'))
    rows.push(row('G1'))
    render(<MemoryRouter><Ids name="a" /></MemoryRouter>)
    await flush()
    expect(screen.getByTestId('a').textContent).toBe('?')
    await act(() => refreshLiveGames())
    expect(screen.getByTestId('a').textContent).toBe('G1')
    // a fresh copy of the modules (= the page reloaded): the ids are there before any read
    vi.resetModules()
    const fresh = await import('../data/liveGames')
    await import('../hooks/useLiveGames')
    expect([...fresh.liveGameIds()]).toEqual(['G1'])
  })

  it('the game page of today\'s game says neither 勝 nor 比賽進行中 until the list is known', async () => {
    const today: Game = { id: 'G1', date: localDate(), tournament: '系際盃', opponent: '對手', homeAway: '客', innings: 7 }
    const ds: Dataset = { ...EMPTY_DATASET, games: [today], batting: [{ gameId: 'G1', inning: 1, batter: '甲', order: 1, pitches: ['IP'], result: '全壘打', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 1, rbi: 1 }] }
    useDataStore.setState({ base: ds, demo: false, filters: DEFAULT_FILTERS, albums: [], albumsSupported: true })
    let answer: (v: Awaited<ReturnType<typeof listCloudDraftHeads>>) => void = () => undefined
    vi.mocked(listCloudDraftHeads).mockImplementationOnce(() => new Promise((r) => { answer = r }))
    render(<MemoryRouter><GameView summary={summarizeGame(ds, today)} mode="page" onClose={() => undefined} /></MemoryRouter>)
    const head = screen.getByRole('heading', { level: 2 })
    expect(within(head).getByText('確認中')).toBeTruthy()
    expect(within(head).queryByText('勝')).toBeNull()
    // nothing is being recorded: the result shows
    await act(async () => { answer([]) })
    await flush()
    expect(within(head).getByText('勝')).toBeTruthy()
    expect(within(head).queryByText('確認中')).toBeNull()
  })
})
