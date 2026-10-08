import { act, fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const future = new Date(Date.now() + 5 * 864e5).toISOString()
let list = [
  { email: 'me@team.tw', note: '管理員', created_at: '2026-01-01', user_id: 'u1', bound_at: '2026-01-02', invite_expires: null },
  { email: 'wait@team.tw', note: null, created_at: '2026-02-01', user_id: null, bound_at: null, invite_expires: future },
]
vi.mock('../data/supabase', async (orig) => ({
  ...(await orig<typeof import('../data/supabase')>()),
  listEditors: vi.fn(async () => list),
  addEditor: vi.fn(async (email: string) => { list = [...list, { email, note: null, created_at: '2026-03-01', user_id: null, bound_at: null, invite_expires: future }]; return 'K7Q2M9XAPD' }),
  resetEditor: vi.fn(async () => 'ZZZZZYYYYY'),
}))
const { EditorsPanel } = await import('../components/ui/EditorsPanel')
const { useDataStore } = await import('../store/data')

describe('紀錄員名單 with 邀請碼', () => {
  beforeEach(() => useDataStore.setState({ cloud: { ...useDataStore.getState().cloud, configured: true, user: { id: 'u1', email: 'me@team.tw' } as User, isEditor: true } }))

  it('shows who is activated and who is still waiting for their code', async () => {
    render(<EditorsPanel />)
    expect(await screen.findByText('已啟用')).toBeTruthy()
    expect(screen.getByText(/等待啟用/)).toBeTruthy()
    // no 重發 for yourself
    expect(screen.queryByRole('button', { name: '重發 me@team.tw 的邀請碼' })).toBeNull()
    expect(screen.getByRole('button', { name: '重發 wait@team.tw 的邀請碼' })).toBeTruthy()
  })

  it('adding someone shows their one-time 邀請碼', async () => {
    render(<EditorsPanel />)
    await screen.findAllByText('已啟用')
    fireEvent.change(screen.getAllByLabelText('新紀錄員 email').at(-1)!, { target: { value: 'new@team.tw' } })
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: '新增' }).at(-1)!) })
    expect(await screen.findByText('K7Q2M-9XAPD')).toBeTruthy()
    expect(screen.getByText(/new@team.tw 的邀請碼/)).toBeTruthy()
  })
})
