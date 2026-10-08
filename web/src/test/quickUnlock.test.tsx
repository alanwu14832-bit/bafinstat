/** 快速登入 paused after 10 wrong passwords: a recorder signed in with their own account lifts it from the card. */
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'

const h = vi.hoisted(() => ({ locked: true, unlocks: 0 }))
vi.mock('../data/supabase', async (orig) => ({
  ...(await orig<typeof import('../data/supabase')>()),
  fetchQuickLogin: vi.fn(async () => ({ enabled: true, days: 30, active: 2, locked_until: h.locked ? new Date(Date.now() + 3600e3).toISOString() : null, updated_at: null, updated_by: null })),
  unlockQuickLogin: vi.fn(async () => { h.unlocks++; h.locked = false }),
}))

import { QuickLoginSettings } from '../components/ui/QuickLoginSettings'
import { useDataStore } from '../store/data'

describe('解除暫停', () => {
  it('shows the pause with a button that lifts it, keeping the password', async () => {
    useDataStore.setState({ cloud: { ...useDataStore.getState().cloud, configured: true, user: { id: 'u', email: 'a@b.c', is_anonymous: false } as User, isEditor: true } })
    render(<QuickLoginSettings />)
    await act(async () => {})
    expect(screen.getByRole('alert')).toHaveTextContent('快速登入暫停到')
    await act(async () => { screen.getByRole('button', { name: '解除暫停' }).click() })
    expect(h.unlocks).toBe(1)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/已解除暫停/)).toBeInTheDocument()
  })
})
