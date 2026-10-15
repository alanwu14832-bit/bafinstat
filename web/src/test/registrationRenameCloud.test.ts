/** Batch 17 bug 3, cloud mode: renaming a tournament writes its 報名名單 under the new name and deletes the old row
 *  (the registrations table's editor-only policies; no new database function). */
import { describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const ops: Array<{ table: string; op: string; args: unknown[]; where: unknown[][] }> = []
function builder(table: string, chain: unknown[][] = []): unknown {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'upsert', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'range', 'single']) b[m] = (...args: unknown[]) => builder(table, [...chain, [m, ...args]])
  b.then = (res: (v: unknown) => unknown) => {
    const write = chain.find(([k]) => k === 'upsert' || k === 'delete' || k === 'update' || k === 'insert')
    if (write) ops.push({ table, op: write[0] as string, args: write.slice(1), where: chain.filter(([k]) => k === 'eq').map((x) => x.slice(1)) })
    const data = table === 'registrations' && write?.[0] === 'upsert' ? write[1] : chain.some(([k]) => k === 'single') ? null : []
    return Promise.resolve({ data, error: null }).then(res)
  }
  return b
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => builder(t),
    rpc: async () => ({ data: null, error: null }),
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch },
    removeChannel: async () => undefined,
  }),
}))
vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
const { useDataStore } = await import('../store/data')
const { EMPTY_DATASET } = await import('../data/types')

describe('tournament rename in the cloud', () => {
  it('upserts the list under the new name, then deletes the old row', async () => {
    const game = { id: 'G20261001-01', date: '2026-10-01', tournament: '秋季聯賽', opponent: '政大', homeAway: '主' as const }
    useDataStore.setState({
      base: { ...EMPTY_DATASET, games: [game] },
      registrations: [{ season: 2026, tournament: '秋季聯賽', players: ['王', '李'] }],
      registrationsSupported: true,
      cloud: { ...useDataStore.getState().cloud, configured: true, user: { id: 'u', email: 'a@b.c' } as User, isEditor: true },
    })
    const warnings = await useDataStore.getState().saveGame({ game: { ...game, tournament: '2026秋季聯賽' }, batting: [], pitching: [], fielding: [] })
    expect(warnings.filter((w) => w.message.includes('報名名單'))).toEqual([])
    const regs = ops.filter((o) => o.table === 'registrations')
    expect(regs.map((o) => o.op)).toEqual(['upsert', 'delete'])
    expect(regs[0].args[0]).toMatchObject({ season: 2026, tournament: '2026秋季聯賽', players: ['王', '李'], updated_by: null })
    expect(regs[1].where).toEqual([['season', 2026], ['tournament', '秋季聯賽']])
    expect(useDataStore.getState().registrations.map((r) => r.tournament)).toEqual(['2026秋季聯賽'])
  })
})
