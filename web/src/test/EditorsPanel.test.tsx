import { act, fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const future = new Date(Date.now() + 5 * 864e5).toISOString()
let list = [
  { email: 'me@team.tw', note: '管理員', created_at: '2026-01-01', user_id: 'u1', bound_at: '2026-01-02', invite_expires: null, role: 'admin' },
  { email: 'wait@team.tw', note: null, created_at: '2026-02-01', user_id: null, bound_at: null, invite_expires: future, role: 'player' },
]
vi.mock('../data/supabase', async (orig) => ({
  ...(await orig<typeof import('../data/supabase')>()),
  listEditors: vi.fn(async () => list),
  addMember: vi.fn(async (email: string, role: string) => { list = [...list, { email, note: null, created_at: '2026-03-01', user_id: null, bound_at: null, invite_expires: future, role }]; return 'K7Q2M9XAPD' }),
  setMemberRole: vi.fn(async (email: string, role: string) => { list = list.map((e) => (e.email === email ? { ...e, role } : e)) }),
  resetEditor: vi.fn(async () => 'ZZZZZYYYYY'),
}))
const { EditorsPanel } = await import('../components/ui/EditorsPanel')
const { useDataStore } = await import('../store/data')

describe('帳號管理 with 邀請碼 and roles', () => {
  beforeEach(() => useDataStore.setState({ cloud: { ...useDataStore.getState().cloud, configured: true, authReady: true, user: { id: 'u1', email: 'me@team.tw' } as User, isEditor: true, role: 'admin' } }))

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
    fireEvent.change(screen.getAllByLabelText('新帳號 email').at(-1)!, { target: { value: 'new@team.tw' } })
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: '新增' }).at(-1)!) })
    expect(await screen.findByText('K7Q2M-9XAPD')).toBeTruthy()
    expect(screen.getByText(/new@team.tw 的邀請碼/)).toBeTruthy()
  })

  it("shows each account's role; an admin changes someone else's, never their own", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<EditorsPanel />)
    await screen.findAllByText('已啟用')
    expect(screen.queryByLabelText('me@team.tw 的身分')).toBeNull()
    const pick = screen.getAllByLabelText('wait@team.tw 的身分').at(-1)! as HTMLSelectElement
    expect(pick.value).toBe('player')
    await act(async () => { fireEvent.change(pick, { target: { value: 'recorder' } }) })
    expect(await screen.findByText('wait@team.tw 改成紀錄員了')).toBeTruthy()
  })

  it('a recorder (not an admin) does not see the account list', () => {
    useDataStore.setState({ cloud: { ...useDataStore.getState().cloud, role: 'recorder' } })
    const { container } = render(<EditorsPanel />)
    expect(container.textContent).toBe('')
  })
})
