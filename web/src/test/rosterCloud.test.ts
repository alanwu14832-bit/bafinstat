/**
 * Cloud mode against a fake Supabase client, before and after supabase/migrations/2026-09-26_rosters.sql: game saves
 * strip the missing day_roster column and warn, games without a roster never send the key, registrations degrade to
 * "not available" and work once the table exists.
 */
import { vi } from 'vitest'

// a fake Supabase: games has no day_roster column, registrations table missing (migration not run)
type Op = [string, unknown[]]
const calls: Array<{ table: string; ops: Op[] }> = []
const state = { migrated: false }
function respond(table: string, ops: Op[]) {
  const has = (m: string) => ops.some(([k]) => k === m)
  if (table === 'registrations') {
    if (!state.migrated) return { data: null, error: { code: '42P01', message: 'relation "public.registrations" does not exist' } }
    if (has('upsert')) return { data: { ...(ops.find(([k]) => k === 'upsert')![1][0] as object) }, error: null }
    return { data: [{ season: 2026, tournament: '大專盃', players: ['甲', '乙'], updated_by: null, updated_at: '2026-09-01' }], error: null }
  }
  if (table === 'games' && has('upsert')) {
    const rows = ops.find(([k]) => k === 'upsert')![1][0] as Array<Record<string, unknown>>
    if (!state.migrated && rows.some((r) => 'day_roster' in r)) return { data: null, error: { code: 'PGRST204', message: "Could not find the 'day_roster' column of 'games' in the schema cache" } }
    return { data: null, error: null }
  }
  if (table === 'games' && has('update')) {
    const v = ops.find(([k]) => k === 'update')![1][0] as Record<string, unknown>
    if (!state.migrated && 'day_roster' in v) return { data: null, error: { code: 'PGRST204', message: "Could not find the 'day_roster' column of 'games' in the schema cache" } }
    return { data: null, error: null }
  }
  if (table === 'editors') return { data: [{ email: 'a@b.c' }], error: null }
  return { data: [], error: null }
}
function builder(table: string, ops: Op[] = []): unknown {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'upsert', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'range', 'limit', 'single', 'maybeSingle']) b[m] = (...args: unknown[]) => builder(table, [...ops, [m, args]])
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => { calls.push({ table, ops }); return Promise.resolve(respond(table, ops)).then(res, rej) }
  return b
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => builder(t),
    auth: { getUser: async () => ({ data: { user: { id: 'u', email: 'a@b.c' } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch },
    removeChannel: async () => undefined,
  }),
}))

describe('cloud mode without / with the rosters migration (fake client)', () => {
  afterAll(() => vi.unstubAllEnvs())
  it('strips day_roster, warns, keeps other rows untouched, degrades registrations', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    vi.resetModules()
    const sb = await import('../data/supabase')
    const { useDataStore } = await import('../store/data')
    const { DAY_ROSTER_UNSUPPORTED } = await import('../data/gameRoster')
    const { REGISTRATIONS_UNSUPPORTED } = await import('../data/registrations')
    expect(sb.cloudConfigured).toBe(true)

    const dayRoster = { starters: [{ name: '甲', pos: 'CF', order: 1 }], bench: ['丙'], reentry: false }
    const g1 = { id: 'G1', date: '2026-10-03', tournament: '大專盃', opponent: '台大', homeAway: '主' as const, dayRoster }
    const g2 = { id: 'G2', date: '2026-10-04', tournament: '大專盃', opponent: '政大', homeAway: '主' as const }
    calls.length = 0
    const r = await sb.pushCloudDataset({ roster: [], games: [g1, g2], batting: [], pitching: [], fielding: [] }, 'upsert')
    expect(r.dropped).toEqual(['day_roster'])
    const ups = calls.filter((c) => c.table === 'games' && c.ops[0][0] === 'upsert').map((c) => c.ops[0][1][0] as Array<Record<string, unknown>>)
    // first try with the roster, retry without, then the roster-less game in its own request, never with the key
    expect(ups.map((rows) => rows.map((x) => [x.id, 'day_roster' in x]))).toEqual([[['G1', true]], [['G1', false]], [['G2', false]]])

    // the store turns it into a save warning and remembers it
    await new Promise((res) => setTimeout(res, 0))
    useDataStore.setState({ cloud: { ...useDataStore.getState().cloud, user: { id: 'u', email: 'a@b.c' } as never, isEditor: true } })
    const warnings = await useDataStore.getState().saveGame({ game: g1, batting: [], pitching: [], fielding: [] })
    expect(warnings.map((w) => w.message)).toContain(DAY_ROSTER_UNSUPPORTED)
    expect(useDataStore.getState().dayRosterSupported).toBe(false)

    // registrations: table missing → not supported, saving says why
    await useDataStore.getState().loadRegistrations()
    expect(useDataStore.getState().registrationsSupported).toBe(false)
    await expect(useDataStore.getState().saveRegistration({ season: 2026, tournament: '大專盃', players: ['甲'] })).rejects.toThrow(REGISTRATIONS_UNSUPPORTED)

    // after the migration: roster saved with the game, registrations load
    state.migrated = true
    calls.length = 0
    const w2 = await useDataStore.getState().saveGame({ game: g1, batting: [], pitching: [], fielding: [] })
    expect(w2.map((w) => w.message)).not.toContain(DAY_ROSTER_UNSUPPORTED)
    expect(useDataStore.getState().dayRosterSupported).toBe(true)
    await useDataStore.getState().loadRegistrations()
    expect(useDataStore.getState().registrationsSupported).toBe(true)
    expect(useDataStore.getState().registrations[0]).toMatchObject({ season: 2026, tournament: '大專盃', players: ['甲', '乙'] })
    await useDataStore.getState().saveRegistration({ season: 2026, tournament: '聯賽', players: ['甲'] })
    expect(useDataStore.getState().registrations.map((x) => x.tournament)).toEqual(['大專盃', '聯賽'])
  })
})
