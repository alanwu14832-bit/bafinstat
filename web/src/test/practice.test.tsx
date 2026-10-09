/**
 * 練習紀錄 (/record?practice=1): the same screen, but nothing leaves this device — no cloud progress, no game rows,
 * no list of cloud drafts — and the real progress on this device is left alone. Visitors without a recorder account
 * can practise too. The store refuses a PRACTICE- game whatever calls it.
 */
import { describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'

vi.mock('../data/supabase', async (orig) => ({
  ...(await orig<typeof import('../data/supabase')>()),
  saveCloudDraft: vi.fn(async () => true),
  listCloudDrafts: vi.fn(async () => []),
  deleteCloudDraft: vi.fn(async () => undefined),
}))

import { RecordPage } from '../pages/Record'
import { useDataStore } from '../store/data'
import { listCloudDrafts, saveCloudDraft } from '../data/supabase'
import { PRACTICE_KEY, readDraft, writeDraft } from '../record/draft'
import { newGame } from '../record/model'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const realSaveGame = useDataStore.getState().saveGame
const cloudBefore = useDataStore.getState().cloud

describe('練習紀錄', () => {
  it('records on this device only, beside the real progress', async () => {
    const real = { ...newGame({ id: 'G20261009-01', date: '2026-10-09', tournament: '聯賽', opponent: '資管', homeAway: '主' }, lineup, '甲'), updatedAt: '2026-10-09T02:00:00.000Z' }
    writeDraft(real)
    const practice = { ...newGame({ id: 'PRACTICE-20261009', date: '2026-10-09', tournament: '練習', opponent: '練習對手', homeAway: '主' }, lineup, '甲'), practice: true }
    writeDraft(practice, PRACTICE_KEY)
    const saveGame = vi.fn(async () => [])
    useDataStore.setState({ saveGame, cloud: { ...cloudBefore, configured: true, status: 'ready', user: { id: 'u1', email: 'a@b.c' } as User, isEditor: true } })

    render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^壞球/ }))
    await wait(1300)
    expect(saveCloudDraft).not.toHaveBeenCalled()
    expect(saveGame).not.toHaveBeenCalled()
    expect(listCloudDrafts).not.toHaveBeenCalled()
    expect(readDraft()).toEqual(real)
    expect(readDraft(PRACTICE_KEY)?.pitches).toEqual(['B'])
    expect(screen.getByText(/練習模式/)).toBeInTheDocument()
    expect(screen.getByText('練習中：不會存檔')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /放棄這場/ })).toBeNull()
    expect(screen.getByRole('button', { name: /結束練習/ })).toBeInTheDocument()
    cleanup()
    writeDraft(null); writeDraft(null, PRACTICE_KEY)
  })

  it('a visitor without a recorder account can practise', () => {
    useDataStore.setState({ cloud: { ...cloudBefore, configured: true, status: 'ready', user: null, isEditor: false } })
    render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>)
    expect(screen.getByRole('button', { name: '開始練習' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '練習紀錄' })).toBeInTheDocument()
    cleanup()
    // the real page still asks to sign in, and offers practice
    render(<MemoryRouter initialEntries={['/record']}><RecordPage /></MemoryRouter>)
    expect(screen.getByText(/還沒有紀錄員帳號/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /開始練習/ })).toHaveAttribute('href', '/record?practice=1')
    cleanup()
  })

  it('the store never saves a practice game', async () => {
    useDataStore.setState({ saveGame: realSaveGame, cloud: { ...cloudBefore, configured: false } })
    const before = useDataStore.getState().base
    await expect(useDataStore.getState().saveGame({ game: { id: 'PRACTICE-20261009', date: '2026-10-09', tournament: '練習', opponent: '練習對手', homeAway: '主' }, batting: [], pitching: [], fielding: [] })).rejects.toThrow('練習比賽不會存檔')
    expect(useDataStore.getState().base).toBe(before)
    useDataStore.setState({ cloud: cloudBefore })
  })
})
