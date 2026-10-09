/**
 * A project that has run neither 2026-10-13_save_games.sql nor 2026-10-14_record_fields.sql: saves go piecewise and the
 * games upsert drops end_time (toGameRow always sends it, null when blank). The 結束時間 warning must come only when a
 * saved game really had an end time.
 */
import { vi } from 'vitest'

const game = { id: 'G1', date: '2026-10-09', tournament: '大專盃', opponent: '台大', home_away: '主' }
function builder(table: string, ops: string[] = []): unknown {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'upsert', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'range', 'limit']) b[m] = (...args: unknown[]) => {
    if (m === 'upsert' && table === 'games' && (args[0] as Array<Record<string, unknown>>).some((r) => 'end_time' in r))
      return { ...builder(table, [...ops, m]) as object, then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: 'PGRST204', message: "Could not find the 'end_time' column of 'games' in the schema cache" } }).then(res) }
    return builder(table, [...ops, m])
  }
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: table === 'games' && !ops.includes('upsert') && !ops.includes('delete') ? [game] : [], error: null }).then(res, rej)
  return b
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => builder(t),
    rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.save_games' } }),
    auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch },
    removeChannel: async () => undefined,
  }),
}))

describe('結束時間 warning on the piecewise save path (old schema)', () => {
  afterAll(() => vi.unstubAllEnvs())
  it('says nothing about 結束時間 for a game without one, and warns for a game with one', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    vi.resetModules()
    const { useDataStore } = await import('../store/data')
    const { pushCloudDataset } = await import('../data/supabase')
    const { END_TIME_UNSUPPORTED } = await import('../data/recordFields')
    const g = { id: 'G1', date: '2026-10-09', tournament: '大專盃', opponent: '台大', homeAway: '主' as const }
    // the column really is dropped on this path …
    expect((await pushCloudDataset({ roster: [], games: [g], batting: [], pitching: [], fielding: [] }, 'upsert')).dropped).toContain('end_time')
    await useDataStore.getState().loadCloud()
    useDataStore.setState({ cloud: { ...useDataStore.getState().cloud, user: { id: 'u', email: 'a@b.c' } as never, isEditor: true } })
    // … but a game with no end time lost nothing
    const plain = (await useDataStore.getState().saveGame({ game: g, batting: [], pitching: [], fielding: [] })).map((x) => x.message)
    expect(plain).not.toContain(END_TIME_UNSUPPORTED)
    const imported = await useDataStore.getState().appendDataset({ roster: [], games: [{ ...g, id: 'G2' }], batting: [], pitching: [], fielding: [] })
    expect(imported?.warnings.map((x) => x.message)).not.toContain(END_TIME_UNSUPPORTED)
    const timed = (await useDataStore.getState().saveGame({ game: { ...g, time: '13:07', endTime: '15:22' }, batting: [], pitching: [], fielding: [] })).map((x) => x.message)
    expect(timed.filter((m) => m === END_TIME_UNSUPPORTED)).toHaveLength(1)
  })
})
