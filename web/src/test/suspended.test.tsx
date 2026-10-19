/** 保留比賽: a suspended game stays in progress (保留中, no 勝／敗) however long ago, and nothing is recorded until 恢復比賽. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage } from '../pages/Record'
import { readDraft, writeDraft } from '../record/draft'
import { newGame } from '../record/model'
import { isLiveDraft } from '../data/liveGames'
import { answered } from './answered'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = { id: 'G20261019-01', date: '2026-10-19', tournament: '友誼賽', opponent: '測試隊', homeAway: '客' as const, innings: 7 }
Element.prototype.scrollIntoView ??= () => {}
afterEach(() => { cleanup(); writeDraft(null); vi.restoreAllMocks() })

describe('保留比賽', () => {
  it('a suspended draft is in progress however old; an abandoned one goes stale', () => {
    const old = '2026-09-01T10:00:00.000Z'
    const now = Date.parse('2026-10-19T10:00:00.000Z')
    expect(isLiveDraft({ state: { game: { id: 'G' }, suspended: old }, updatedAt: old }, now)).toBe(true)
    expect(isLiveDraft({ state: { game: { id: 'G' } }, updatedAt: old }, now)).toBe(false)
    expect(isLiveDraft({ state: { game: { id: 'G' }, suspended: old, finished: true }, updatedAt: old }, now)).toBe(false)
  })
  it('保留比賽 holds the pitch buttons until 恢復比賽', async () => {
    writeDraft(answered(newGame(game, lineup, '甲')))
    render(<MemoryRouter initialEntries={['/record']}><RecordPage /></MemoryRouter>)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '保留比賽' }))
    await wait(30)
    expect(readDraft()!.suspended).toBeTruthy()
    expect(screen.getByText(/這場比賽保留中/)).toBeInTheDocument()
    expect((screen.getByRole('button', { name: /^壞球/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '恢復比賽' }))
    await wait(30)
    expect(readDraft()!.suspended).toBeUndefined()
    expect((screen.getByRole('button', { name: /^壞球/ }) as HTMLButtonElement).disabled).toBe(false)
  })
})
