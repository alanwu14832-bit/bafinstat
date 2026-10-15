/**
 * A project without save_games() and without the 2026-10-15 columns (batting_pa.errors, pitching_pa.rbi): the piecewise
 * save drops them, keeps every other row, and says so — only for the column the game really had.
 */
import { vi } from 'vitest'

const inserted: Record<string, Array<Record<string, unknown>>> = {}
function builder(table: string): unknown {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'upsert', 'update', 'delete', 'eq', 'in', 'order', 'range', 'limit']) b[m] = () => builder(table)
  b.insert = (rows: Array<Record<string, unknown>>) => {
    // (and the 2026-10-16 one: pitching_pa.opp_bats)
    const missing = table === 'batting_pa' && rows.some((r) => 'errors' in r) ? 'errors' : table === 'pitching_pa' && rows.some((r) => 'rbi' in r) ? 'rbi' : table === 'pitching_pa' && rows.some((r) => 'opp_bats' in r) ? 'opp_bats' : null
    const res = missing ? { data: null, error: { code: 'PGRST204', message: `Could not find the '${missing}' column of '${table}' in the schema cache` } } : (inserted[table] = rows, { data: null, error: null })
    return { then: (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok) }
  }
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res, rej)
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

describe('對方失誤 / 對方打點 on the piecewise save path (columns missing)', () => {
  afterAll(() => vi.unstubAllEnvs())
  it('saves the rows without them and reports each one', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    vi.resetModules()
    const { pushCloudDataset, BATTING_ERRORS, OPP_BATS_COLUMN, PITCHING_RBI } = await import('../data/supabase')
    const g = { id: 'G1', date: '2026-10-09', tournament: '大專盃', opponent: '台大', homeAway: '主' as const }
    const pa = { gameId: 'G1', inning: 1, outsBefore: 0, batter: '甲', pitches: ['IP'], result: '一安', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, errors: ['C'] }
    const opp = { gameId: 'G1', inning: 1, outsBefore: 0, pitcher: '乙', pitches: ['IP'], result: '二安', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, rbi: 1, oppBats: 'L' as const }
    const r = await pushCloudDataset({ roster: [], games: [g], batting: [pa], pitching: [opp], fielding: [] }, 'upsert')
    expect(r.dropped).toEqual(expect.arrayContaining([BATTING_ERRORS, PITCHING_RBI, OPP_BATS_COLUMN]))
    expect(inserted.batting_pa).toHaveLength(1)
    expect('errors' in inserted.batting_pa[0]).toBe(false)
    expect(inserted.pitching_pa).toHaveLength(1)
    expect('rbi' in inserted.pitching_pa[0]).toBe(false)
    expect('opp_bats' in inserted.pitching_pa[0]).toBe(false)
  })
})
