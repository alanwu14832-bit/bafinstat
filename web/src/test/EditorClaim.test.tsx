import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

const calls: string[] = []
vi.mock('../data/supabase', async (orig) => ({
  ...(await orig<typeof import('../data/supabase')>()),
  setOwnPassword: vi.fn(async () => { calls.push('password') }),
  signOutOtherDevices: vi.fn(async () => { calls.push('signout-others') }),
  claimEditor: vi.fn(async (code?: string) => { const clean = code?.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); calls.push(`claim:${clean}`); return clean === 'K7Q2M9XAPD' ? 'ok' : 'bad_code' }),
}))

import { EditorClaim } from '../components/ui/EditorClaim'
import { useDataStore } from '../store/data'
import type { User } from '@supabase/supabase-js'

describe('啟用紀錄員權限 with a 邀請碼', () => {
  it('sets the password first, claims with the code, then signs out other devices', async () => {
    useDataStore.setState({ cloud: { ...useDataStore.getState().cloud, configured: true, user: { id: 'u1', email: 'a@b.c' } as User, isEditor: false, access: 'need_code' } })
    render(<EditorClaim />)
    fireEvent.change(screen.getByLabelText('邀請碼'), { target: { value: 'k7q2m-9xapd' } })
    fireEvent.change(screen.getByLabelText('新密碼'), { target: { value: 'longenough1' } })
    fireEvent.change(screen.getByLabelText('再輸入一次密碼'), { target: { value: 'longenough1' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '啟用紀錄員權限' })) })
    expect(calls).toEqual(['password', 'claim:K7Q2M9XAPD', 'signout-others'])
    expect(useDataStore.getState().cloud.isEditor).toBe(true)
  })
  it('refuses a short password before touching the account', async () => {
    calls.length = 0
    useDataStore.setState({ cloud: { ...useDataStore.getState().cloud, configured: true, user: { id: 'u1', email: 'a@b.c' } as User, isEditor: false, access: 'need_code' } })
    render(<EditorClaim />)
    fireEvent.change(screen.getAllByLabelText('邀請碼').at(-1)!, { target: { value: 'K7Q2M9XAPD' } })
    fireEvent.change(screen.getAllByLabelText('新密碼').at(-1)!, { target: { value: 'short' } })
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: '啟用紀錄員權限' }).at(-1)!) })
    expect(calls).toEqual([])
    expect(screen.getByText('密碼至少 8 個字元')).toBeInTheDocument()
  })
})
