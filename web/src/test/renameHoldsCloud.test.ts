/** Renaming a player in cloud mode also renames them in each game's 中繼成功 list (games.holds, an array column). */
import { describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const updates: Array<{ table: string; values: Record<string, unknown>; where: unknown[] }> = []
function builder(table: string, ops: unknown[][] = []): unknown {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'upsert', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'range']) b[m] = (...args: unknown[]) => builder(table, [...ops, [m, ...args]])
  b.then = (res: (v: unknown) => unknown) => {
    const up = ops.find(([k]) => k === 'update')
    if (up) updates.push({ table, values: up[1] as Record<string, unknown>, where: ops.find(([k]) => k === 'eq')!.slice(1) })
    return Promise.resolve({ data: [], error: null }).then(res)
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

describe('rename in the cloud', () => {
  it('rewrites holds for the games that list the old name, and only those', async () => {
    const game = (id: string, holds?: string[]) => ({ id, date: '2026-10-01', tournament: '聯賽', opponent: '政大', homeAway: '主' as const, winningPitcher: '甲', ...(holds ? { holds } : {}) })
    useDataStore.setState({
      base: { ...EMPTY_DATASET, roster: [{ name: '甲' }, { name: '丙' }], games: [game('G1', ['甲', '丙']), game('G2', ['丙']), game('G3')] },
      cloud: { ...useDataStore.getState().cloud, configured: true, user: { id: 'u', email: 'a@b.c' } as User, isEditor: true },
    })
    await useDataStore.getState().saveRoster({ players: [{ original: '甲', player: { name: '乙' } }, { original: '丙', player: { name: '丙' } }], removed: [] })
    expect(updates.filter((u) => u.table === 'games' && 'holds' in u.values)).toEqual([{ table: 'games', values: { holds: ['乙', '丙'] }, where: ['id', 'G1'] }])
    expect(updates.some((u) => u.table === 'games' && u.values.winning_pitcher === '乙')).toBe(true)
  })
})
