/**
 * Saving games through save_games() (supabase/migrations/2026-10-13_save_games.sql): each batch of games is one
 * call (one transaction in the database), a failure deletes nothing, saves from one device run one after another,
 * 合併匯入 leaves existing games alone, 取代全部 removes the extra games only after the new ones are in.
 */
import { vi } from 'vitest'

type Call = { kind: 'rpc' | 'from'; name: string; ops?: unknown[][]; args?: Record<string, unknown> }
const calls: Call[] = []
const cloudIds = new Set<string>()
let failNext = false
let gate: Promise<void> | null = null
function builder(table: string, ops: unknown[][] = []): unknown {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'upsert', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'range']) b[m] = (...args: unknown[]) => builder(table, [...ops, [m, ...args]])
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
    calls.push({ kind: 'from', name: table, ops })
    const del = ops.find(([k]) => k === 'delete'), inn = ops.find(([k]) => k === 'in')
    if (table === 'games' && del && inn) for (const id of inn[2] as string[]) cloudIds.delete(id)
    const range = ops.find(([k]) => k === 'range') as [string, number, number] | undefined
    const rows = table === 'games' && !del ? [...cloudIds].sort().map((id) => ({ id })).slice(range?.[1] ?? 0, (range?.[2] ?? 1e9) + 1) : []
    return Promise.resolve({ data: rows, error: null }).then(res, rej)
  }
  return b
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => builder(t),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ kind: 'rpc', name, args })
      if (gate) await gate
      if (failNext) { failNext = false; return { data: null, error: { code: '23514', message: 'new row for relation "batting_pa" violates check constraint "batting_pa_sizes"' } } }
      const games = args.p_games as Array<{ id: string }>
      const fresh = games.filter((g) => !(args.p_only_new && cloudIds.has(g.id)))
      for (const g of fresh) cloudIds.add(g.id)
      return { data: fresh.length, error: null }
    },
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch },
    removeChannel: async () => undefined,
  }),
}))
vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
const { pushCloudDataset } = await import('../data/supabase')

const game = (id: string) => ({ id, date: '2026-10-01', tournament: '大專盃', opponent: '台大', homeAway: '主' as const })
const pa = (gameId: string, batter: string) => ({ gameId, inning: 1, batter, pitches: ['IP'], result: '一安', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 })
const ds = (ids: string[]) => ({ roster: [], games: ids.map(game), batting: ids.flatMap((id) => [pa(id, '甲'), pa(id, '乙')]), pitching: [], fielding: [] })
const writes = () => calls.filter((c) => c.kind === 'from' && c.ops?.some(([k]) => k === 'delete' || k === 'insert' || k === 'upsert'))

beforeEach(() => { calls.length = 0; cloudIds.clear(); failNext = false; gate = null })

describe('save_games', () => {
  it('saves a game and its records in one call, numbered per game', async () => {
    const r = await pushCloudDataset(ds(['G1']), 'upsert')
    expect(r).toEqual({ games: 1, skipped: 0, dropped: [] })
    expect(calls.map((c) => `${c.kind}:${c.name}`)).toEqual(['rpc:save_games'])
    const args = calls[0].args!
    expect((args.p_batting as Array<{ seq: number; batter: string }>).map((b) => [b.seq, b.batter])).toEqual([[1, '甲'], [2, '乙']])
    expect(args.p_only_new).toBe(false)
  })
  it('a failure throws and deletes nothing (the database rolled the whole save back)', async () => {
    failNext = true
    await expect(pushCloudDataset(ds(['G1']), 'upsert')).rejects.toThrow('batting_pa_sizes')
    expect(writes()).toEqual([])
  })
  it('saves from one device run one after another', async () => {
    let open!: () => void
    gate = new Promise((r) => { open = r })
    const a = pushCloudDataset(ds(['G1']), 'upsert')
    const b = pushCloudDataset(ds(['G2']), 'upsert')
    await new Promise((r) => setTimeout(r, 10))
    expect(calls.filter((c) => c.kind === 'rpc')).toHaveLength(1)   // the second waits for the first
    open()
    await Promise.all([a, b])
    expect(calls.filter((c) => c.kind === 'rpc').map((c) => (c.args!.p_games as Array<{ id: string }>)[0].id)).toEqual(['G1', 'G2'])
  })
  it('a failed save does not block the next one', async () => {
    failNext = true
    await expect(pushCloudDataset(ds(['G1']), 'upsert')).rejects.toThrow()
    await expect(pushCloudDataset(ds(['G1']), 'upsert')).resolves.toMatchObject({ games: 1 })
  })
  it('合併匯入 leaves games already in the cloud alone, and counts them', async () => {
    cloudIds.add('G1')
    const r = await pushCloudDataset(ds(['G1', 'G2']), 'append')
    expect(r).toMatchObject({ games: 1, skipped: 1 })
    expect(calls[0].args!.p_only_new).toBe(true)
  })
  it('a whole season goes in batches of 25 games', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `G${String(i + 1).padStart(2, '0')}`)
    const r = await pushCloudDataset(ds(ids), 'upsert')
    expect(r.games).toBe(30)
    expect(calls.filter((c) => c.kind === 'rpc').map((c) => (c.args!.p_games as unknown[]).length)).toEqual([25, 5])
  })
  it('取代全部 removes the games the file lacks only after the new ones are saved, reading every page of ids', async () => {
    for (let i = 0; i < 1001; i++) cloudIds.add(`OLD${String(i).padStart(4, '0')}`)
    await pushCloudDataset(ds(['G1']), 'replace')
    const kinds = calls.map((c) => (c.kind === 'rpc' ? 'rpc' : c.ops!.some(([k]) => k === 'delete') ? 'delete' : 'select'))
    expect(kinds.indexOf('rpc')).toBeLessThan(kinds.indexOf('delete'))
    expect([...cloudIds]).toEqual(['G1'])
  })
  it('sends the end time and the opponent pitcher (2026-10-14 columns)', async () => {
    const d = ds(['G1'])
    const withNew = { ...d, games: [{ ...d.games[0], time: '13:07', endTime: '15:22' }], batting: [{ ...d.batting[0], oppHand: 'L' as const, oppPitcher: '王' }, d.batting[1]] }
    await pushCloudDataset(withNew, 'upsert')
    const args = calls[0].args!
    expect((args.p_games as Array<Record<string, unknown>>)[0].end_time).toBe('15:22')
    const rows = args.p_batting as Array<Record<string, unknown>>
    expect([rows[0].opp_hand, rows[0].opp_pitcher]).toEqual(['L', '王'])
    expect('opp_hand' in rows[1]).toBe(false)
  })
})
