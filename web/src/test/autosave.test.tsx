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
    useDataStore.setState({ saveGame, cloud: { ...useDataStore.getState().cloud, configured: true, user: { id: 'u1', email: 'a@b.c' } as User, isEditor: true } })

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
})
