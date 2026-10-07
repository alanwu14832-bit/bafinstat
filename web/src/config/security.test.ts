import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy } from './security'

describe('Content-Security-Policy', () => {
  it('lets data go only to this site and its own Supabase project, and runs no inline or eval script', () => {
    const csp = contentSecurityPolicy('https://abcd1234.supabase.co')
    expect(csp).toContain("connect-src 'self' https://abcd1234.supabase.co wss://abcd1234.supabase.co")
    expect(csp).toContain("script-src 'self';")
    expect(csp).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/)
    expect(csp).toContain("object-src 'none'")
  })
  it('works without a Supabase project (local mode) or with a malformed address', () => {
    expect(contentSecurityPolicy()).toContain("connect-src 'self';")
    expect(contentSecurityPolicy('not a url')).toContain("connect-src 'self';")
  })
})
