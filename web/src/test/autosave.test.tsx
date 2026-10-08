/**
 * 紀錄比賽 in cloud mode: every change reaches the cloud about a second later — the progress (count, runners) each
 * time, the game's rows only when they changed — and the status line says whether the latest change is synced.
 * (A ball in the middle of a plate appearance used to wait until the plate appearance ended.)
 */
import { describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'

const drafts: Array<{ pitches: string[] }> = []
let failDraft = false
vi.mock('../data/supabase', async (orig) => ({
  ...(await orig<typeof import('../data/supabase')>()),
  saveCloudDraft: vi.fn(async (_id: string, state: { pitches: string[] }) => { if (failDraft) throw new Error('連線中斷'); drafts.push({ pitches: [...state.pitches] }); return true }),
  listCloudDrafts: vi.fn(async () => []),
  deleteCloudDraft: vi.fn(async () => undefined),
}))

import { RecordPage } from '../pages/Record'
import { useDataStore } from '../store/data'
import { writeDraft } from '../record/draft'
import { commitPA, defaultPlan, newGame } from '../record/model'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

describe('autosave while recording (cloud mode)', () => {
  it('syncs a ball mid plate appearance, rewrites the rows only when they change, and says when it failed', async () => {
    const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
    let s = newGame({ id: 'G20261010-01', date: '2026-10-10', tournament: '聯賽', opponent: '政大', homeAway: '主' }, lineup, '甲')
    s = { ...commitPA({ ...s, pitches: ['S', 'IP'] }, defaultPlan({ ...s, pitches: ['S', 'IP'] }, '內滾')), updatedAt: '2026-10-10T05:00:00.000Z' }
    expect(s.pitching).toHaveLength(1)
    writeDraft(s)
    const saveGame = vi.fn(async () => [])
    useDataStore.setState({ saveGame, cloud: { ...useDataStore.getState().cloud, configured: true, status: 'ready', user: { id: 'u1', email: 'a@b.c' } as User, isEditor: true } })

    render(<MemoryRouter><RecordPage /></MemoryRouter>)
    await wait(1300)
    expect(saveGame).toHaveBeenCalledTimes(1)
    expect(drafts.at(-1)?.pitches).toEqual([])
    expect(screen.getByText(/已同步到雲端/)).toBeInTheDocument()

    // a ball: the plate appearance goes on, the progress is synced, the rows are not rewritten
    fireEvent.click(screen.getByRole('button', { name: /^壞球/ }))
    expect(screen.getByText('尚未同步…')).toBeInTheDocument()
    await wait(1300)
    expect(drafts.at(-1)?.pitches).toEqual(['B'])
    expect(saveGame).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/已同步到雲端/)).toBeInTheDocument()

    // the connection drops: the status line says so and offers a retry
    failDraft = true
    fireEvent.click(screen.getByRole('button', { name: /^壞球/ }))
    await wait(1300)
    expect(screen.getByText('同步失敗：最新進度只在這台裝置')).toBeInTheDocument()
    failDraft = false
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重試儲存' })) })
    await wait(50)
    expect(drafts.at(-1)?.pitches).toEqual(['B', 'B'])
    expect(saveGame).toHaveBeenCalledTimes(2)   // 重試 rewrites the rows too
    expect(screen.getByText(/已同步到雲端/)).toBeInTheDocument()
    cleanup()
    writeDraft(null)
  })

  it('an old progress left on the device never replaces a game the cloud has more of (the 9/28 game, 2026-10-08)', async () => {
    drafts.length = 0
    const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
    const game = { id: 'G20260928-01', date: '2026-09-28', tournament: '新生盃', opponent: '經濟', homeAway: '主' as const }
    let s = newGame(game, lineup, '甲')
    s = { ...commitPA({ ...s, pitches: ['B', 'IP'] }, defaultPlan({ ...s, pitches: ['B', 'IP'] }, '一安')), updatedAt: '2026-09-20T02:00:00.000Z' }
    writeDraft(s)
    // the cloud has the whole game: 3 plate appearances here
    const pa = (batter: string) => ({ gameId: game.id, inning: 1, batter, pitches: ['IP'], result: '內滾', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 })
    const pit = (n: number) => ({ gameId: game.id, inning: 1, oppOrder: n, pitcher: '甲', pitches: ['IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 })
    const saveGame = vi.fn(async () => [])
    useDataStore.setState({ saveGame, base: { ...useDataStore.getState().base, games: [game], batting: [pa('甲')], pitching: [pit(1), pit(2)] },
      cloud: { ...useDataStore.getState().cloud, configured: true, status: 'ready', user: { id: 'u1', email: 'a@b.c' } as User, isEditor: true } })
    render(<MemoryRouter><RecordPage /></MemoryRouter>)
    await wait(1300)
    expect(saveGame).not.toHaveBeenCalled()
    expect(drafts).toHaveLength(0)
    expect(screen.getByText('這份紀錄進度比雲端舊')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '丟掉這份舊進度' }))
    await wait(1300)
    expect(saveGame).not.toHaveBeenCalled()
    expect(localStorage.getItem('bafin.record.draft.v1')).toBeNull()
    cleanup()
  })

  it('waits for the cloud games to load before the first save', async () => {
    drafts.length = 0
    const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
    let s = newGame({ id: 'G20261011-01', date: '2026-10-11', tournament: '聯賽', opponent: '政大', homeAway: '主' }, lineup, '甲')
    s = { ...commitPA({ ...s, pitches: ['IP'] }, defaultPlan({ ...s, pitches: ['IP'] }, '內滾')), updatedAt: '2026-10-11T02:00:00.000Z' }
    writeDraft(s)
    const saveGame = vi.fn(async () => [])
    useDataStore.setState({ saveGame, cloud: { ...useDataStore.getState().cloud, configured: true, status: 'loading', user: { id: 'u1', email: 'a@b.c' } as User, isEditor: true } })
    render(<MemoryRouter><RecordPage /></MemoryRouter>)
    await wait(1300)
    expect(saveGame).not.toHaveBeenCalled()
    act(() => useDataStore.setState({ cloud: { ...useDataStore.getState().cloud, status: 'ready' } }))
    await wait(1300)
    expect(saveGame).toHaveBeenCalledTimes(1)
    cleanup()
    writeDraft(null)
  })
})
