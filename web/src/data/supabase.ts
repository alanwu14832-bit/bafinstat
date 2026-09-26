/**
 * Supabase cloud layer. When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are
 * set, the cloud database becomes the single source of truth: everyone reads
 * it (no login), signed-in scorers write to it. Without the env vars the app
 * runs exactly as before (local-only).
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { BattingPA, Dataset, FieldingLine, Game, GameDayRoster, HomeAway, PitchingPA, Player } from './types'
import { normalizeDataset } from './normalize'
import { parseDayRoster } from './gameRoster'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const cloudConfigured = !!(url && anon)

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient {
  if (!cloudConfigured) throw new Error('Supabase 未設定（缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）')
  if (!client) client = createClient(url!, anon!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  return client
}

// ---------------------------------------------------------------- row ↔ model mapping
interface PlayerRow { name: string; number: string | null; primary_pos: string | null; secondary_pos: string | null; bats: string | null; throws: string | null; status: string | null; note: string | null }
interface GameRow { id: string; date: string; time: string | null; tournament: string; opponent: string; home_away: string; venue: string | null; weather: string | null; recorder: string | null; innings: number | null; winning_pitcher: string | null; losing_pitcher: string | null; save_pitcher: string | null; holds: string[] | null; note: string | null; status?: string | null; day_roster?: GameDayRoster | null }
interface BattingRow { game_id: string; seq: number; inning: number; outs_before: number | null; bases_before: string | null; batting_order: number | null; pos: string | null; batter: string; pitches: string[]; result: string; loc: number | null; traj: string | null; quality: string | null; sb: number; cs: number; adv_on_error: number; out_on_base: number; run: number; rbi: number; code: string | null; note: string | null }
interface PitchingRow { game_id: string; seq: number; inning: number; outs_before: number | null; bases_before: string | null; opp_order: number | null; pitcher: string; opp_batter: string | null; pitches: string[]; result: string; loc: number | null; traj: string | null; quality: string | null; sba: number; cs: number; wp: number; pb: number; pk: number; code: string | null; note: string | null }
interface FieldingRow { game_id: string; seq: number; player: string; pos: string; innings: number | null; po: number; a: number; e: number; dp: number; pb: number; sb: number; cs: number; note: string | null }

const u = <T,>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v)
const n = (v: string | undefined): string | null => (v === undefined || v === '' ? null : v)

export function toPlayerRow(p: Player): PlayerRow {
  return { name: p.name, number: n(p.number), primary_pos: n(p.primaryPos), secondary_pos: n(p.secondaryPos), bats: n(p.bats), throws: n(p.throws), status: n(p.status), note: n(p.note) }
}
export function toGameRow(g: Game): GameRow {
  // day_roster is left out (not null) when a game has none: postgrest fills a key missing from some rows of an array
  // upsert with NULL, and an old-workbook import must not wipe rosters saved in the cloud
  return { id: g.id, date: g.date, time: n(g.time), tournament: g.tournament || '未分類', opponent: g.opponent || '未知', home_away: g.homeAway, venue: n(g.venue), weather: n(g.weather), recorder: n(g.recorder), innings: g.innings ?? null, winning_pitcher: n(g.winningPitcher), losing_pitcher: n(g.losingPitcher), save_pitcher: n(g.savePitcher), holds: g.holds?.length ? g.holds : null, note: n(g.note), status: n(g.status), ...(g.dayRoster ? { day_roster: g.dayRoster } : {}) }
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
    games: rows.games.map((r) => ({ id: r.id, date: r.date, time: u(r.time), tournament: r.tournament, opponent: r.opponent, homeAway: (r.home_away === '客' ? '客' : '主') as HomeAway, venue: u(r.venue), weather: u(r.weather), recorder: u(r.recorder), innings: u(r.innings), winningPitcher: u(r.winning_pitcher), losingPitcher: u(r.losing_pitcher), savePitcher: u(r.save_pitcher), holds: u(r.holds), note: u(r.note), status: (r.status === 'scheduled' || r.status === 'cancelled' ? r.status : undefined), dayRoster: parseDayRoster(r.day_roster) })),
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
  return normalizeDataset(rowsToDataset({ players, games, batting, pitching, fielding })).dataset
}

async function chunked<T>(rows: T[], fn: (chunk: T[]) => Promise<void>, size = 500) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size))
}

/** games columns added by later migrations; a project that has not run them still accepts saves without them. */
const OPTIONAL_GAME_COLUMNS = ['day_roster', 'status', 'updated_by'] as const
type PgError = { message: string; code?: string }
/** Optional games columns a PostgREST error says are missing: PGRST204 "Could not find the 'day_roster' column of
 *  'games' in the schema cache", or 42703 "column games.day_roster does not exist". */
export function missingGameColumns(e: PgError | null): string[] {
  if (!e || !(e.code === 'PGRST204' || e.code === '42703' || /could not find|does not exist/i.test(e.message))) return []
  return OPTIONAL_GAME_COLUMNS.filter((c) => new RegExp(`\\b${c}\\b`).test(e.message))
}
const isMissingGameColumn = (e: PgError | null) => missingGameColumns(e).length > 0

/**
 * Upsert games rows, dropping optional columns an older schema lacks (up to 3 retries, one column per error).
 * Rows with and without day_roster go in separate requests, so games without a roster never get a NULL written over one.
 */
async function upsertGames(rows: Array<Record<string, unknown>>): Promise<{ error: PgError | null; dropped: string[] }> {
  const dropped: string[] = []
  const strip = (r: Record<string, unknown>) => { const o = { ...r }; for (const c of dropped) delete o[c]; return o }
  for (const group of [rows.filter((r) => 'day_roster' in r), rows.filter((r) => !('day_roster' in r))]) {
    if (!group.length) continue
    let { error } = await supabase().from('games').upsert(group.map(strip), { onConflict: 'id' })
    for (let i = 0; error && i < 3; i++) {
      const miss = missingGameColumns(error).filter((c) => !dropped.includes(c))
      if (!miss.length) break
      dropped.push(...miss)
      ;({ error } = await supabase().from('games').upsert(group.map(strip), { onConflict: 'id' }))
    }
    if (error) return { error, dropped }
  }
  return { error: null, dropped }
}

/**
 * Write a dataset to the cloud. mode 'replace' wipes games not present in the
 * upload; 'append' only writes games whose id is new (existing games untouched);
 * 'upsert' overwrites exactly the games in the upload and leaves the rest alone (in-app edits).
 * Returns the number of games written, and `dropped`: games columns the project lacks (migration not run),
 * e.g. 'day_roster' means the 當日登錄名單 was not saved.
 */
export async function pushCloudDataset(ds: Dataset, mode: 'replace' | 'append' | 'upsert'): Promise<{ games: number; skipped: number; dropped: string[] }> {
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
    let { error } = await sb.from('players').upsert(ds.roster.map(toPlayerRow), { onConflict: 'name' })
    fail('球員名單', error)
  }
  if (mode === 'replace') {
    // delete games missing from the upload (child rows cascade)
    const { data, error } = await sb.from('games').select('id'); fail('讀取既有比賽', error)
    const gone = (data ?? []).map((r: { id: string }) => r.id).filter((id) => !ids.has(id))
    if (gone.length) { const { error: e2 } = await sb.from('games').delete().in('id', gone); fail('刪除舊比賽', e2) }
  }
  let dropped: string[] = []
  if (games.length) {
    const { data: auth } = await sb.auth.getUser()
    const by = auth.user?.email ?? null
    // older schema without the audit / status / day_roster columns: those are stripped and the upsert retried
    const res = await upsertGames(games.map((g) => ({ ...toGameRow(g), updated_by: by })))
    dropped = res.dropped
    fail('比賽清單', res.error)
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
  return { games: games.length, skipped, dropped }
}

/**
 * Rewrite only the day_roster of these games (renames inside the jsonb, clearing a roster; pushRoster cannot reach
 * into jsonb). Returns false when the column does not exist yet (migration not run); other errors throw.
 */
export async function updateGameDayRosters(entries: Array<{ id: string; day_roster: GameDayRoster | null }>): Promise<boolean> {
  for (const { id, day_roster } of entries) {
    const { error } = await supabase().from('games').update({ day_roster }).eq('id', id)
    if (isMissingGameColumn(error)) return false
    if (error) throw new Error(`比賽清單: ${error.message}`)
  }
  return true
}

// ---------------------------------------------------------------- roster
/** Upsert players, rename records for renamed players, delete removed players. */
export async function pushRoster(players: Player[], renames: Record<string, string>, removed: string[]) {
  const sb = supabase()
  const fail = (ctx: string, e: { message: string } | null) => { if (e) throw new Error(`${ctx}: ${e.message}`) }
  for (const [from, to] of Object.entries(renames)) {
    fail('打席紀錄', (await sb.from('batting_pa').update({ batter: to }).eq('batter', from)).error)
    fail('投球紀錄', (await sb.from('pitching_pa').update({ pitcher: to }).eq('pitcher', from)).error)
    fail('守備紀錄', (await sb.from('fielding_lines').update({ player: to }).eq('player', from)).error)
    for (const col of ['winning_pitcher', 'losing_pitcher', 'save_pitcher']) fail('比賽清單', (await sb.from('games').update({ [col]: to }).eq(col, from)).error)
    fail('球員名單', (await sb.from('players').delete().eq('name', from)).error)
  }
  if (players.length) fail('球員名單', (await sb.from('players').upsert(players.map(toPlayerRow), { onConflict: 'name' })).error)
  if (removed.length) fail('球員名單', (await sb.from('players').delete().in('name', removed)).error)
}

// ---------------------------------------------------------------- editors allowlist
/**
 * Is this signed-in email allowed to write? Reads the `editors` table (see supabase/migrations/2026-09-11_editors.sql).
 * Returns true when the table does not exist yet (older projects where every signed-in user may write).
 */
export async function fetchIsEditor(email: string | undefined | null): Promise<boolean> {
  if (!email) return false
  const { data, error } = await supabase().from('editors').select('email').eq('email', email.toLowerCase()).limit(1)
  if (error) { if (error.code === '42P01' || /editors/.test(error.message)) return true; throw new Error(error.message) }
  return (data ?? []).length > 0
}

// ---------------------------------------------------------------- live-scoring drafts (cross-device continuation)
export interface CloudDraft<T = unknown> { game_id: string; state: T; updated_by: string | null; updated_at: string }
const draftsMissing = (e: { message: string; code?: string } | null) => !!e && (e.code === '42P01' || /record_drafts/.test(e.message))
/** Upsert the in-progress state. Silently a no-op when the table has not been created yet. */
export async function saveCloudDraft(gameId: string, state: unknown, email?: string | null): Promise<boolean> {
  const { error } = await supabase().from('record_drafts').upsert({ game_id: gameId, state, updated_by: email ?? null, updated_at: new Date().toISOString() }, { onConflict: 'game_id' })
  if (draftsMissing(error)) return false
  if (error) throw new Error(error.message)
  return true
}
export async function listCloudDrafts<T = unknown>(): Promise<CloudDraft<T>[] | null> {
  const { data, error } = await supabase().from('record_drafts').select('*').order('updated_at', { ascending: false })
  if (draftsMissing(error)) return null
  if (error) throw new Error(error.message)
  return (data ?? []) as CloudDraft<T>[]
}
export async function deleteCloudDraft(gameId: string) {
  const { error } = await supabase().from('record_drafts').delete().eq('game_id', gameId)
  if (error && !draftsMissing(error)) throw new Error(error.message)
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
  const { error } = await supabase().auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}import` } })
  if (error) throw new Error(error.message)
}
export async function verifyEmailCode(email: string, token: string) {
  const { error } = await supabase().auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw new Error(error.message)
}
export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase().auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'email 或密碼錯誤' : error.message)
}
export async function signOut() { await supabase().auth.signOut() }
export function onAuthChange(cb: (user: User | null) => void) {
  const { data } = supabase().auth.onAuthStateChange((_e, session) => cb(session?.user ?? null))
  return () => data.subscription.unsubscribe()
}

/** Refetch whenever any table changes (debounced). registrations is subscribed separately (subscribeRegistrationChanges),
 *  only once the table is known to exist: a missing table in this channel would break live refresh for all of them. */
export function subscribeCloudChanges(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const bump = () => { if (timer) clearTimeout(timer); timer = setTimeout(onChange, 800) }
  const ch = supabase().channel('bafin-data')
  for (const table of ['games', 'batting_pa', 'pitching_pa', 'fielding_lines', 'players']) ch.on('postgres_changes', { event: '*', schema: 'public', table }, bump)
  ch.subscribe()
  return () => { if (timer) clearTimeout(timer); void supabase().removeChannel(ch) }
}
/** Live refresh of 報名名單 (debounced). Call only after fetchRegistrations returned rows (table exists). */
export function subscribeRegistrationChanges(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const ch = supabase().channel('bafin-registrations')
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => { if (timer) clearTimeout(timer); timer = setTimeout(onChange, 800) })
  ch.subscribe()
  return () => { if (timer) clearTimeout(timer); void supabase().removeChannel(ch) }
}

// ---------------------------------------------------------------- album links (Google Drive folders etc.)
export interface AlbumRow { id: string; game_id: string | null; title: string | null; date: string | null; url: string; photographer: string | null; note: string | null; created_by: string | null; created_at: string; updated_at: string }
/** Returns null when the albums table does not exist yet. */
export async function fetchAlbums(): Promise<AlbumRow[] | null> {
  const { data, error } = await supabase().from('albums').select('*').order('date', { ascending: false, nullsFirst: false }).limit(2000)
  if (error) { if (error.code === '42P01' || /albums/.test(error.message)) return null; throw new Error(error.message) }
  return (data ?? []) as AlbumRow[]
}
export async function upsertAlbum(row: Omit<AlbumRow, 'created_at' | 'updated_at'> & { id?: string }): Promise<AlbumRow> {
  const { data, error } = await supabase().from('albums').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'id' }).select('*').single()
  if (error) throw new Error(/row-level security/.test(error.message) ? '你的帳號不在紀錄員名單，無法寫入' : error.message)
  return data as AlbumRow
}
export async function deleteAlbumRow(id: string) {
  const { error } = await supabase().from('albums').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------- tournament registration lists (報名名單)
export interface RegistrationRow { season: number; tournament: string; players: string[]; updated_by: string | null; updated_at: string }
const registrationsMissing = (e: PgError | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /registrations/.test(e.message))
const registrationsError = (e: PgError) => new Error(/row-level security/.test(e.message) ? '你的帳號不在紀錄員名單，無法寫入' : registrationsMissing(e) ? '報名名單需要管理員先在 Supabase 執行 supabase/migrations/2026-09-26_rosters.sql' : e.message)
/** Returns null when the registrations table does not exist yet (supabase/migrations/2026-09-26_rosters.sql not run). */
export async function fetchRegistrations(): Promise<RegistrationRow[] | null> {
  const { data, error } = await supabase().from('registrations').select('*').order('season', { ascending: false }).order('tournament', { ascending: true })
  if (error) { if (registrationsMissing(error)) return null; throw new Error(error.message) }
  return (data ?? []) as RegistrationRow[]
}
export async function upsertRegistration(row: Omit<RegistrationRow, 'updated_at'>): Promise<RegistrationRow> {
  const { data, error } = await supabase().from('registrations').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'season,tournament' }).select('*').single()
  if (error) throw registrationsError(error)
  return data as RegistrationRow
}
export async function deleteRegistrationRow(season: number, tournament: string) {
  const { error } = await supabase().from('registrations').delete().eq('season', season).eq('tournament', tournament)
  if (error) throw registrationsError(error)
}
