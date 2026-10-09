/**
 * Cloud mode before and after supabase/migrations/2026-10-14_record_fields.sql (fake client). save_games() silently
 * ignores keys a table lacks, so the site tells from the rows it loads whether games.end_time / batting_pa.opp_hand
 * exist: before, saving a game with them says they were not stored; right after the admin runs the SQL, it does not.
 */
import { vi } from 'vitest'

const state = { migrated: false }
const game = { id: 'G1', date: '2026-10-09', tournament: '大專盃', opponent: '台大', home_away: '主' }
const row = { game_id: 'G1', seq: 1, inning: 1, batter: '甲', pitches: ['IP'], result: '一安', sb: 0, cs: 0, adv_on_error: 0, out_on_base: 0, run: 0, rbi: 0 }
function respond(table: string) {
  if (table === 'games') return { data: [state.migrated ? { ...game, end_time: null } : game], error: null }
  if (table === 'batting_pa') return { data: [state.migrated ? { ...row, opp_hand: null, opp_pitcher: null } : row], error: null }
  return { data: [], error: null }
}
function builder(table: string): unknown {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'upsert', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'range', 'limit']) b[m] = () => builder(table)
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(respond(table)).then(res, rej)
  return b
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => builder(t),
    rpc: async (_name: string, args: { p_games: unknown[] }) => ({ data: args.p_games.length, error: null }),
    auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch },
    removeChannel: async () => undefined,
  }),
}))

describe('結束時間 / 對方投手 before and after the 2026-10-14 migration (fake client)', () => {
  afterAll(() => vi.unstubAllEnvs())
  it('tells from the loaded rows, warns once per save, and stops once the columns are there', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    vi.resetModules()
    const { useDataStore } = await import('../store/data')
    const { END_TIME_UNSUPPORTED, OPP_PITCHER_UNSUPPORTED } = await import('../data/recordFields')
    await useDataStore.getState().loadCloud()
    expect(useDataStore.getState().recordFields).toEqual({ endTime: false, oppPitcher: false })
    useDataStore.setState({ cloud: { ...useDataStore.getState().cloud, user: { id: 'u', email: 'a@b.c' } as never, isEditor: true } })
    const g = { id: 'G1', date: '2026-10-09', tournament: '大專盃', opponent: '台大', homeAway: '主' as const, time: '13:07', endTime: '15:22' }
    const pa = { gameId: 'G1', inning: 1, outsBefore: 0, batter: '甲', pitches: ['IP'], result: '一安', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, oppHand: 'R' as const }
    const w = (await useDataStore.getState().saveGame({ game: g, batting: [pa], pitching: [], fielding: [] })).map((x) => x.message)
    expect(w.filter((m) => m === END_TIME_UNSUPPORTED)).toHaveLength(1)
    expect(w.filter((m) => m === OPP_PITCHER_UNSUPPORTED)).toHaveLength(1)
    // a game without them: nothing to say
    const plain = (await useDataStore.getState().saveGame({ game: { ...g, endTime: undefined }, batting: [{ ...pa, oppHand: undefined }], pitching: [], fielding: [] })).map((x) => x.message)
    expect(plain).not.toContain(END_TIME_UNSUPPORTED)
    expect(plain).not.toContain(OPP_PITCHER_UNSUPPORTED)

    // the admin runs the SQL: the next load sees the columns
    state.migrated = true
    await useDataStore.getState().loadCloud()
    expect(useDataStore.getState().recordFields).toEqual({ endTime: true, oppPitcher: true })
    const after = (await useDataStore.getState().saveGame({ game: g, batting: [pa], pitching: [], fielding: [] })).map((x) => x.message)
    expect(after).not.toContain(END_TIME_UNSUPPORTED)
    expect(after).not.toContain(OPP_PITCHER_UNSUPPORTED)
  })
})
