/**
 * Supabase cloud layer. When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are
 * set, the cloud database becomes the single source of truth: everyone reads
 * it (no login), signed-in scorers write to it. Without the env vars the app
 * runs exactly as before (local-only).
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { BattingPA, Dataset, FieldingLine, Game, HomeAway, PitchingPA, Player } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const cloudConfigured = !!(url && anon)

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient {
  if (!cloudConfigured) throw new Error('Supabase 未設定（缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）')
  if (!client) client = createClient(url!, anon!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  return client
}

// ---------------------------------------------------------------- row ↔ model mapping
interface PlayerRow { name: string; number: string | null; primary_pos: string | null; secondary_pos: string | null; bats: string | null; throws: string | null; status: string | null; note: string | null }
interface GameRow { id: string; date: string; time: string | null; tournament: string; opponent: string; home_away: string; venue: string | null; weather: string | null; recorder: string | null; innings: number | null; winning_pitcher: string | null; losing_pitcher: string | null; save_pitcher: string | null; holds: string[] | null; note: string | null }
interface BattingRow { game_id: string; seq: number; inning: number; outs_before: number | null; bases_before: string | null; batting_order: number | null; pos: string | null; batter: string; pitches: string[]; result: string; loc: number | null; traj: string | null; quality: string | null; sb: number; cs: number; adv_on_error: number; out_on_base: number; run: number; rbi: number; code: string | null; note: string | null }
interface PitchingRow { game_id: string; seq: number; inning: number; outs_before: number | null; bases_before: string | null; opp_order: number | null; pitcher: string; opp_batter: string | null; pitches: string[]; result: string; loc: number | null; traj: string | null; quality: string | null; sba: number; cs: number; wp: number; pb: number; pk: number; code: string | null; note: string | null }
interface FieldingRow { game_id: string; seq: number; player: string; pos: string; innings: number | null; po: number; a: number; e: number; dp: number; pb: number; sb: number; cs: number; note: string | null }

const u = <T,>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v)
const n = (v: string | undefined): string | null => (v === undefined || v === '' ? null : v)

export function toPlayerRow(p: Player): PlayerRow {
  return { name: p.name, number: n(p.number), primary_pos: n(p.primaryPos), secondary_pos: n(p.secondaryPos), bats: n(p.bats), throws: n(p.throws), status: n(p.status), note: n(p.note) }
}
export function toGameRow(g: Game): GameRow {
  return { id: g.id, date: g.date, time: n(g.time), tournament: g.tournament || '未分類', opponent: g.opponent || '未知', home_away: g.homeAway, venue: n(g.venue), weather: n(g.weather), recorder: n(g.recorder), innings: g.innings ?? null, winning_pitcher: n(g.winningPitcher), losing_pitcher: n(g.losingPitcher), save_pitcher: n(g.savePitcher), holds: g.holds?.length ? g.holds : null, note: n(g.note) }
}
export function toBattingRow(p: BattingPA, seq: number): BattingRow {
  return { game_id: p.gameId, seq, inning: p.inning, outs_before: p.outsBefore ?? null, bases_before: n(p.basesBefore), batting_order: p.order ?? null, pos: n(p.pos), batter: p.batter, pitches: p.pitches, result: p.result, loc: p.loc ?? null, traj: n(p.traj), quality: n(p.quality), sb: p.sb, cs: p.cs, adv_on_error: p.advOnError, out_on_base: p.outOnBase, run: p.run, rbi: p.rbi, code: n(p.code), note: n(p.note) }
}
export function toPitchingRow(p: PitchingPA, seq: number): PitchingRow {
  return { game_id: p.gameId, seq, inning: p.inning, outs_before: p.outsBefore ?? null, bases_before: n(p.basesBefore), opp_order: p.oppOrder ?? null, pitcher: p.pitcher, opp_batter: n(p.oppBatter), pitches: p.pitches, result: p.result, loc: p.loc ?? null, traj: n(p.traj), quality: n(p.quality), sba: p.sba, cs: p.cs, wp: p.wp, pb: p.pb, pk: p.pk, code: n(p.code), note: n(p.note) }
}
export function toFieldingRow(f: FieldingLine, seq: number): FieldingRow {
  return { game_id: f.gameId, seq, player: f.player, pos: f.pos, innings: f.innings ?? null, po: f.po, a: f.a, e: f.e, dp: f.dp, pb: f.pb, sb: f.sb, cs: f.cs, note: n(f.note) }
}

export function rowsToDataset(rows: { players: PlayerRow[]; games: GameRow[]; batting: BattingRow[]; pitching: PitchingRow[]; fielding: FieldingRow[] }): Dataset {
  return {
    roster: rows.players.map((r) => ({ name: r.name, number: u(r.number), primaryPos: u(r.primary_pos), secondaryPos: u(r.secondary_pos), bats: u(r.bats) as Player['bats'], throws: u(r.throws) as Player['throws'], status: u(r.status), note: u(r.note) })),
    games: rows.games.map((r) => ({ id: r.id, date: r.date, time: u(r.time), tournament: r.tournament, opponent: r.opponent, homeAway: (r.home_away === '客' ? '客' : '主') as HomeAway, venue: u(r.venue), weather: u(r.weather), recorder: u(r.recorder), innings: u(r.innings), winningPitcher: u(r.winning_pitcher), losingPitcher: u(r.losing_pitcher), savePitcher: u(r.save_pitcher), holds: u(r.holds), note: u(r.note) })),
    batting: rows.batting.map((r) => ({ gameId: r.game_id, inning: r.inning, outsBefore: u(r.outs_before), basesBefore: u(r.bases_before), order: u(r.batting_order), pos: u(r.pos), batter: r.batter, pitches: r.pitches ?? [], result: r.result, loc: u(r.loc), traj: u(r.traj), quality: u(r.quality), sb: r.sb, cs: r.cs, advOnError: r.adv_on_error, outOnBase: r.out_on_base, run: r.run, rbi: r.rbi, code: u(r.code), note: u(r.note) })),
    pitching: rows.pitching.map((r) => ({ gameId: r.game_id, inning: r.inning, outsBefore: u(r.outs_before), basesBefore: u(r.bases_before), oppOrder: u(r.opp_order), pitcher: r.pitcher, oppBatter: u(r.opp_batter), pitches: r.pitches ?? [], result: r.result, loc: u(r.loc), traj: u(r.traj), quality: u(r.quality), sba: r.sba, cs: r.cs, wp: r.wp, pb: r.pb, pk: r.pk, code: u(r.code), note: u(r.note) })),
    fielding: rows.fielding.map((r) => ({ gameId: r.game_id, player: r.player, pos: r.pos, innings: u(r.innings === null ? null : Number(r.innings)), po: r.po, a: r.a, e: r.e, dp: r.dp, pb: r.pb, sb: r.sb, cs: r.cs, note: u(r.note) })),
  }
}

// ---------------------------------------------------------------- queries
async function selectAll<T>(table: string, order: string[]): Promise<T[]> {
  const out: T[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    let q = supabase().from(table).select('*').range(from, from + page - 1)
    for (const col of order) q = q.order(col, { ascending: true })
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < page) break
  }
  return out
}

/** Load the whole database (a season is a few thousand rows; fine for a team). */
export async function fetchCloudDataset(): Promise<Dataset> {
  const [players, games, batting, pitching, fielding] = await Promise.all([
    selectAll<PlayerRow>('players', ['name']), selectAll<GameRow>('games', ['date', 'id']), selectAll<BattingRow>('batting_pa', ['game_id', 'seq']),
    selectAll<PitchingRow>('pitching_pa', ['game_id', 'seq']), selectAll<FieldingRow>('fielding_lines', ['game_id', 'seq']),
  ])
  return rowsToDataset({ players, games, batting, pitching, fielding })
}

async function chunked<T>(rows: T[], fn: (chunk: T[]) => Promise<void>, size = 500) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size))
}

/**
 * Write a dataset to the cloud. mode 'replace' wipes games not present in the
 * upload; 'append' only writes games whose id is new (existing games untouched).
 * Returns the number of games written.
 */
export async function pushCloudDataset(ds: Dataset, mode: 'replace' | 'append'): Promise<{ games: number; skipped: number }> {
  const sb = supabase()
  const fail = (ctx: string, e: { message: string } | null) => { if (e) throw new Error(`${ctx}: ${e.message}`) }
  let games = ds.games
  let skipped = 0
  if (mode === 'append') {
    const { data, error } = await sb.from('games').select('id')
    fail('讀取既有比賽', error)
    const existing = new Set((data ?? []).map((r: { id: string }) => r.id))
    games = ds.games.filter((g) => !existing.has(g.id))
    skipped = ds.games.length - games.length
  }
  const ids = new Set(games.map((g) => g.id))
  if (ds.roster.length) {
    const { error } = await sb.from('players').upsert(ds.roster.map(toPlayerRow), { onConflict: 'name' })
    fail('球員名單', error)
  }
  if (mode === 'replace') {
    // delete games missing from the upload (child rows cascade)
    const { data, error } = await sb.from('games').select('id'); fail('讀取既有比賽', error)
    const gone = (data ?? []).map((r: { id: string }) => r.id).filter((id) => !ids.has(id))
    if (gone.length) { const { error: e2 } = await sb.from('games').delete().in('id', gone); fail('刪除舊比賽', e2) }
  }
  if (games.length) {
    const { error } = await sb.from('games').upsert(games.map(toGameRow), { onConflict: 'id' }); fail('比賽清單', error)
    // child rows: clear then insert, per game batch
    const idList = [...ids]
    for (const table of ['batting_pa', 'pitching_pa', 'fielding_lines']) {
      await chunked(idList, async (chunk) => { const { error: e } = await sb.from(table).delete().in('game_id', chunk); fail(table, e) }, 200)
    }
    const seqBy = <T extends { gameId: string }>(rows: T[]) => { const c = new Map<string, number>(); return rows.filter((r) => ids.has(r.gameId)).map((r) => { const s = (c.get(r.gameId) ?? 0) + 1; c.set(r.gameId, s); return [r, s] as const }) }
    await chunked(seqBy(ds.batting).map(([r, s]) => toBattingRow(r, s)), async (rows) => { const { error: e } = await sb.from('batting_pa').insert(rows); fail('打席紀錄', e) })
    await chunked(seqBy(ds.pitching).map(([r, s]) => toPitchingRow(r, s)), async (rows) => { const { error: e } = await sb.from('pitching_pa').insert(rows); fail('投球紀錄', e) })
    await chunked(seqBy(ds.fielding).map(([r, s]) => toFieldingRow(r, s)), async (rows) => { const { error: e } = await sb.from('fielding_lines').insert(rows); fail('守備紀錄', e) })
  }
  return { games: games.length, skipped }
}

export async function deleteCloudGame(id: string) {
  const { error } = await supabase().from('games').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------- auth
export async function currentUser(): Promise<User | null> {
  const { data } = await supabase().auth.getSession()
  return data.session?.user ?? null
}
export async function sendMagicLink(email: string) {
  const { error } = await supabase().auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + window.location.pathname + window.location.hash } })
  if (error) throw new Error(error.message)
}
export async function verifyEmailCode(email: string, token: string) {
  const { error } = await supabase().auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw new Error(error.message)
}
export async function signOut() { await supabase().auth.signOut() }
export function onAuthChange(cb: (user: User | null) => void) {
  const { data } = supabase().auth.onAuthStateChange((_e, session) => cb(session?.user ?? null))
  return () => data.subscription.unsubscribe()
}

/** Refetch whenever any table changes (debounced). */
export function subscribeCloudChanges(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const bump = () => { if (timer) clearTimeout(timer); timer = setTimeout(onChange, 800) }
  const ch = supabase().channel('bafin-data')
  for (const table of ['games', 'batting_pa', 'pitching_pa', 'fielding_lines', 'players']) ch.on('postgres_changes', { event: '*', schema: 'public', table }, bump)
  ch.subscribe()
  return () => { if (timer) clearTimeout(timer); void supabase().removeChannel(ch) }
}
