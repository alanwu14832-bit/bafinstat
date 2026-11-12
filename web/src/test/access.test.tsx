import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { accessOf } from '../hooks/useAccess'
import { RequireLevel } from '../components/layout/Gate'
import { Sidebar } from '../components/layout/Sidebar'
import { useDataStore } from '../store/data'
import type { Role } from '../data/supabase'

const user = { id: 'u1', email: 'p@team.tw' } as User
const as = (role: Role | null | undefined, signedIn = true) => {
  const cloud = useDataStore.getState().cloud
  useDataStore.setState({ cloud: { ...cloud, configured: true, authReady: true, user: signedIn ? user : null, role: signedIn ? role : null, isEditor: role === 'recorder' || role === 'admin' } })
}

describe('身分分層: who sees what', () => {
  afterEach(() => cleanup())

  it('works out the level: local mode sees everything, a saved older version nothing beyond the public pages', () => {
    expect(accessOf({ configured: false, user: null }).level).toBe(3)
    expect(accessOf({ configured: true, user, role: 'admin', authReady: true }, true).level).toBe(0)
    expect(accessOf({ configured: true, user: null, authReady: false }).pending).toBe(true)
    expect(accessOf({ configured: true, user: null, authReady: true })).toEqual({ level: 0, role: null, pending: false })
    expect(accessOf({ configured: true, user, role: undefined, authReady: true }).pending).toBe(true)
    expect(accessOf({ configured: true, user, role: null, authReady: true }).level).toBe(0)
    expect(accessOf({ configured: true, user, role: 'player', authReady: true }).level).toBe(1)
    expect(accessOf({ configured: true, user, role: 'coach', authReady: true }).level).toBe(1)   // 教練 sees what a player sees
    expect(accessOf({ configured: true, user, role: 'recorder', authReady: true }).level).toBe(2)
    expect(accessOf({ configured: true, user, role: 'admin', authReady: true }).level).toBe(3)
  })

  it('a 球員 page asks a visitor to sign in; a player sees it; a 紀錄員 page tells a player what it needs', () => {
    as(null, false)
    render(<MemoryRouter><RequireLevel level={1} title="打擊"><p>打擊表</p></RequireLevel></MemoryRouter>)
    expect(screen.getByText('登入後就看得到這一頁')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '登入' })).toBeInTheDocument()
    expect(screen.queryByText('打擊表')).toBeNull()
    cleanup()
    as('player')
    render(<MemoryRouter><RequireLevel level={1}><p>打擊表</p></RequireLevel><RequireLevel level={2}><p>紀錄比賽</p></RequireLevel></MemoryRouter>)
    expect(screen.getByText('打擊表')).toBeInTheDocument()
    expect(screen.getByText('這一頁要紀錄員以上的帳號')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '登入' })).toBeNull()
  })

  it('the menu: visitors see the 球員 pages with a lock and no 紀錄員／管理者 pages; an admin sees 帳號管理', () => {
    as(null, false)
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    expect(screen.getByRole('link', { name: '打擊' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('登入後才能看').length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: '紀錄比賽' })).toBeNull()
    expect(screen.queryByRole('link', { name: '帳號管理' })).toBeNull()
    cleanup()
    as('recorder')
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    expect(screen.getByRole('link', { name: '紀錄比賽' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '帳號管理' })).toBeNull()
    expect(screen.queryAllByLabelText('登入後才能看')).toHaveLength(0)
    cleanup()
    as('admin')
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    expect(screen.getByRole('link', { name: '帳號管理' })).toBeInTheDocument()
  })

  it('練習紀錄 stays open to everyone; the 紀錄比賽 notice offers it', () => {
    as(null, false)
    render(<MemoryRouter><RequireLevel level={2} open><p>練習畫面</p></RequireLevel></MemoryRouter>)
    expect(screen.getByText('練習畫面')).toBeInTheDocument()
    cleanup()
    render(<MemoryRouter><RequireLevel level={2} title="紀錄比賽" extra={<a href="/record?practice=1">先練習看看</a>}><p>紀錄畫面</p></RequireLevel></MemoryRouter>)
    expect(screen.queryByText('紀錄畫面')).toBeNull()
    expect(screen.getByRole('link', { name: '先練習看看' })).toBeInTheDocument()
  })
})
