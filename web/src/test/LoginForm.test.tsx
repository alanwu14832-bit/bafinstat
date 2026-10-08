import { act, fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const signUp = vi.fn(async (_email: string, _password: string) => {})
const claim = vi.fn(async (code?: string) => (code?.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === 'K7Q2M9XAPD' ? 'ok' : 'bad_code'))
vi.mock('../data/supabase', async (orig) => ({
  ...(await orig<typeof import('../data/supabase')>()),
  signInWithPassword: vi.fn(),
  signUpWithPassword: (email: string, password: string) => signUp(email, password),
  claimEditor: (code?: string) => claim(code),
}))
const { LoginForm } = await import('../components/ui/LoginForm')
const { useDataStore } = await import('../store/data')

const fill = (email: string, invite: string, pw: string, again = pw) => {
  fireEvent.click(screen.getByRole('tab', { name: '第一次使用' }))
  fireEvent.change(screen.getByLabelText('email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('邀請碼'), { target: { value: invite } })
  fireEvent.change(screen.getByLabelText('設定密碼'), { target: { value: pw } })
  fireEvent.change(screen.getByLabelText('再輸入一次密碼'), { target: { value: again } })
}

describe('LoginForm 第一次使用', () => {
  beforeEach(() => { signUp.mockClear(); claim.mockClear(); useDataStore.setState({ cloud: { ...useDataStore.getState().cloud, user: { id: 'u1', email: 'new@gmail.com' } as User } }) })

  it('checks the password pair and the 邀請碼 before asking the server', () => {
    render(<LoginForm />)
    fill('new@gmail.com', 'K7Q2M-9XAPD', 'abcdefgh', 'abcdefgx')
    fireEvent.click(screen.getByRole('button', { name: '設定密碼並登入' }))
    expect(screen.getByRole('status').textContent).toBe('兩次輸入的密碼不一樣')
    fill('new@gmail.com', 'K7Q2M-9XAPD', 'short', 'short')
    fireEvent.click(screen.getByRole('button', { name: '設定密碼並登入' }))
    expect(screen.getByRole('status').textContent).toBe('密碼至少 8 個字元')
    fill('new@gmail.com', 'K7Q2', 'abcdefgh')
    fireEvent.click(screen.getByRole('button', { name: '設定密碼並登入' }))
    expect(screen.getByRole('status').textContent).toBe('請輸入紀錄員給你的 10 碼邀請碼')
    expect(signUp).not.toHaveBeenCalled()
  })

  it('creates the account with the trimmed email, then activates it with the 邀請碼', async () => {
    const done = vi.fn()
    render(<LoginForm onDone={done} />)
    fill(' new@gmail.com ', 'k7q2m-9xapd', 'abcdefgh')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '設定密碼並登入' })) })
    expect(await screen.findByText('已設定密碼並啟用紀錄員權限')).toBeTruthy()
    expect(signUp).toHaveBeenCalledWith('new@gmail.com', 'abcdefgh')
    expect(claim).toHaveBeenCalledWith('K7Q2M-9XAPD')
    expect(done).toHaveBeenCalled()
  })

  it('a wrong 邀請碼 leaves the account browse-only and says so', async () => {
    render(<LoginForm />)
    fill('new@gmail.com', 'AAAAA-BBBBB', 'abcdefgh')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '設定密碼並登入' })) })
    expect(await screen.findByText(/邀請碼不對/)).toBeTruthy()
  })
})
