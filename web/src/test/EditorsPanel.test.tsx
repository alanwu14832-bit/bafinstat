import { act, fireEvent, render, screen, within } from '@testing-library/react'
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

  it('整批新增: a pasted list becomes one account and one 邀請碼 each, ready to copy', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const write = vi.fn(async (_text: string) => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    render(<EditorsPanel />)
    await screen.findAllByText('已啟用')
    fireEvent.click(screen.getByRole('tab', { name: '整批新增' }))
    const area = screen.getByLabelText('要新增的 email（一行一個）') as HTMLTextAreaElement
    fireEvent.change(area, { target: { value: 'p1@team.tw 王小明 #18\nme@team.tw\n沒有信箱\nP2@team.tw' } })
    expect(screen.getByText(/1 個已經在名單裡/)).toBeTruthy()
    expect(screen.getByText(/1 行找不到 email/)).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '新增 2 個帳號' })) })
    const { addMember } = await import('../data/supabase')
    expect(addMember).toHaveBeenCalledWith('p1@team.tw', 'player', '王小明 #18')
    expect(addMember).toHaveBeenCalledWith('p2@team.tw', 'player', '')
    expect(area.value).toBe('')
    const box = screen.getByRole('region', { name: '整批新增的邀請碼' })
    expect(within(box).getAllByText('K7Q2M-9XAPD')).toHaveLength(2)
    // the message for one person, and the whole table for a spreadsheet
    const one = within(box).getByRole('button', { name: '複製要傳給 p1@team.tw 的訊息' })
    await act(async () => { fireEvent.click(one) })
    expect(write.mock.calls.at(-1)![0]).toContain('email：p1@team.tw、邀請碼：K7Q2M-9XAPD')
    expect(one.textContent).toBe('已複製')
    await act(async () => { fireEvent.click(within(box).getByRole('button', { name: '複製全部' })) })
    expect(write.mock.calls.at(-1)![0]).toBe('email\t備註\t身分\t邀請碼\np1@team.tw\t王小明 #18\t球員\tK7Q2M-9XAPD\np2@team.tw\t\t球員\tK7Q2M-9XAPD')
  })

  it('整批新增: the codes stay when the page is left and opened again; one that fails says why and stays in the box', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { addMember } = await import('../data/supabase')
    vi.mocked(addMember).mockRejectedValueOnce(new Error('這個 email 已經在名單裡'))
    render(<EditorsPanel />)
    await screen.findAllByText('已啟用')
    // (a fresh mount: the two codes of the last batch are still there)
    const box = screen.getByRole('region', { name: '整批新增的邀請碼' })
    expect(within(box).getAllByText('K7Q2M-9XAPD')).toHaveLength(2)
    fireEvent.click(screen.getByRole('tab', { name: '整批新增' }))
    const area = screen.getByLabelText('要新增的 email（一行一個）') as HTMLTextAreaElement
    fireEvent.change(area, { target: { value: 'x1@team.tw 甲\nx2@team.tw 乙' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '新增 2 個帳號' })) })
    expect(within(box).getByText('這個 email 已經在名單裡')).toBeTruthy()
    expect(within(box).getAllByText('K7Q2M-9XAPD')).toHaveLength(3)
    expect(area.value).toBe('x1@team.tw 甲')
    expect(screen.getByText(/新增了 1 個，1 個沒有成功/)).toBeTruthy()
    // 清除 asks first, then the codes are gone
    await act(async () => { fireEvent.click(within(box).getByRole('button', { name: '清除' })) })
    expect(screen.queryByRole('region', { name: '整批新增的邀請碼' })).toBeNull()
  })

  it('a recorder (not an admin) does not see the account list', () => {
    useDataStore.setState({ cloud: { ...useDataStore.getState().cloud, role: 'recorder' } })
    const { container } = render(<EditorsPanel />)
    expect(container.textContent).toBe('')
  })
})
