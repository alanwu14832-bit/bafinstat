import { beforeEach, describe, expect, it, vi } from 'vitest'

// a stand-in Supabase client: what the site asks of it, and what it answers
const calls: string[] = []
let session: { user: { is_anonymous?: boolean } } | null = null
let answer: { data: unknown; error: { code?: string; message: string } | null } = { data: 'ok', error: null }
let anonError: { message: string } | null = null
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session } }),
      signInAnonymously: async () => { calls.push('anon'); if (anonError) return { error: anonError }; session = { user: { is_anonymous: true } }; return { error: null } },
      signOut: async () => { calls.push('signOut'); session = null; return { error: null } },
    },
    rpc: async (fn: string, args?: unknown) => { calls.push(`${fn}${args ? ` ${JSON.stringify(args)}` : ''}`); return fn === 'quick_login' ? answer : { data: null, error: null } },
  }),
}))
vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
const { quickSignIn, signOut } = await import('./supabase')

beforeEach(() => { calls.length = 0; session = null; answer = { data: 'ok', error: null }; anonError = null })

describe('快速登入', () => {
  it('signs in anonymously, then the database checks the password (trimmed)', async () => {
    await quickSignIn(' 248163 ')
    expect(calls).toEqual(['anon', 'quick_login {"p_code":"248163"}'])
    expect(session?.user.is_anonymous).toBe(true)
  })
  it('a wrong password leaves nobody signed in', async () => {
    answer = { data: 'bad', error: null }
    await expect(quickSignIn('000000')).rejects.toThrow('快速登入密碼不對')
    expect(calls.at(-1)).toBe('signOut')
    expect(session).toBeNull()
  })
  it('says why when it is paused, not set, or the database is not updated', async () => {
    answer = { data: 'locked', error: null }
    await expect(quickSignIn('x')).rejects.toThrow('暫停一小時')
    answer = { data: 'off', error: null }
    await expect(quickSignIn('x')).rejects.toThrow('快速登入還沒設定')
    answer = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.quick_login' } }
    await expect(quickSignIn('x')).rejects.toThrow('2026-10-10_quick_login.sql')
  })
  it('tells the admin to allow anonymous sign-ins when Supabase refuses them', async () => {
    anonError = { message: 'Anonymous sign-ins are disabled' }
    await expect(quickSignIn('248163')).rejects.toThrow('Allow anonymous sign-ins')
    expect(calls).toEqual(['anon'])
  })
  it('is not needed when signed in with an own account', async () => {
    session = { user: { is_anonymous: false } }
    await expect(quickSignIn('248163')).rejects.toThrow('不需要快速登入')
    expect(calls).toEqual([])
  })
  it('signing out of a quick session ends it in the database first', async () => {
    await quickSignIn('248163')
    calls.length = 0
    await signOut()
    expect(calls).toEqual(['quick_logout', 'signOut'])
    session = { user: { is_anonymous: false } }
    calls.length = 0
    await signOut()
    expect(calls).toEqual(['signOut'])
  })
})
