/**
 * 練球點名. Schedule rows live in Supabase (this feature is cloud-only); the pure helpers here decide deadlines,
 * late replies, attendance rates and exam-break ranges so the page and the tests agree.
 */
import { supabase } from './supabase'

export type VoteStatus = 'yes' | 'late' | 'no'
export const VOTE_LABEL: Record<VoteStatus, string> = { yes: '出席', late: '小遲', no: '請假' }
export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export interface PracticeSeries { id: string; weekday: number; time: string; place: string | null; start_date: string; end_date: string; note: string | null }
export interface PracticeBreak { id: string; label: string; start_date: string; end_date: string }
export interface Practice { id: string; series_id: string | null; date: string; time: string; place: string | null; status: 'scheduled' | 'cancelled'; note: string | null; notified_at: string | null }
export interface Vote { practice_id: string; player_name: string; status: VoteStatus; reason?: string | null; late_reply: boolean; by_proxy?: string | boolean | null; updated_at: string }
export interface RollCall { practice_id: string; player_name: string; present: boolean }

/** ISO date in Taipei regardless of the device clock's zone. */
export const taipeiToday = (now = new Date()) => new Date(now.getTime() + 8 * 3600e3).toISOString().slice(0, 10)
export const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const weekdayOf = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]

/** Votes count as on time until 09:00 on the day of practice (Taipei). */
export function voteDeadline(p: Practice): Date { return new Date(`${p.date}T09:00:00+08:00`) }
export const isLateReply = (p: Practice, now = new Date()) => now.getTime() > voteDeadline(p).getTime()
export const practiceStart = (p: Practice) => new Date(`${p.date}T${p.time.padStart(5, '0')}:00+08:00`)
/** Voting stays open until the practice starts; after that the roll call is the record. */
export const canVote = (p: Practice, now = new Date()) => p.status === 'scheduled' && now.getTime() < practiceStart(p).getTime()

/** 考試週停練，考前一週也停練: the break runs from seven days before the exam week to its last day. */
export function examBreak(examStart: string, examEnd: string): { start_date: string; end_date: string } {
  return { start_date: addDays(examStart, -7), end_date: examEnd }
}

/** Client-side preview of what generate_practices() will create. */
export function expandSeries(series: PracticeSeries[], breaks: PracticeBreak[], from: string, until: string): Array<{ series_id: string; date: string; time: string; place: string | null }> {
  const out: Array<{ series_id: string; date: string; time: string; place: string | null }> = []
  const inBreak = (d: string) => breaks.some((b) => d >= b.start_date && d <= b.end_date)
  for (const s of series) {
    let d = from > s.start_date ? from : s.start_date
    const end = until < s.end_date ? until : s.end_date
    while (d <= end) {
      if (new Date(`${d}T00:00:00Z`).getUTCDay() === s.weekday && !inBreak(d)) out.push({ series_id: s.id, date: d, time: s.time, place: s.place })
      d = addDays(d, 1)
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
}

export interface Tally { yes: number; late: number; no: number; none: number }
export function tally(practice: Practice, votes: Vote[], activeNames: string[]): Tally {
  const mine = votes.filter((v) => v.practice_id === practice.id)
  const t: Tally = { yes: 0, late: 0, no: 0, none: 0 }
  for (const n of activeNames) { const v = mine.find((x) => x.player_name === n); if (!v) t.none++; else t[v.status]++ }
  return t
}

/**
 * 出席率: roll call wins when it exists, otherwise the vote (出席 and 小遲 count as attended). Only practices that
 * already happened and were not cancelled count; 請假 is excused (out of the denominator), no reply is an absence.
 */
export function attendanceRate(player: string, practices: Practice[], votes: Vote[], rolls: RollCall[], now = new Date()): { attended: number; excused: number; absent: number; rate: number | null } {
  let attended = 0, excused = 0, absent = 0
  for (const p of practices) {
    if (p.status !== 'scheduled' || practiceStart(p).getTime() > now.getTime()) continue
    const r = rolls.find((x) => x.practice_id === p.id && x.player_name === player)
    const v = votes.find((x) => x.practice_id === p.id && x.player_name === player)
    if (r) { if (r.present) attended++; else if (v?.status === 'no') excused++; else absent++ }
    else if (v?.status === 'yes' || v?.status === 'late') attended++
    else if (v?.status === 'no') excused++
    else absent++
  }
  const den = attended + absent
  return { attended, excused, absent, rate: den ? attended / den : null }
}

// ---------------------------------------------------------------- cloud
const fail = (what: string, error: { message: string } | null) => { if (error) throw new Error(/row-level security/.test(error.message) ? `${what}：你的帳號沒有這個權限` : `${what}：${error.message}`) }
const missing = (error: { code?: string; message: string } | null) => !!error && (error.code === '42P01' || /practice|schema cache/.test(error.message))

export interface PracticeData { series: PracticeSeries[]; breaks: PracticeBreak[]; practices: Practice[]; votes: Vote[]; rolls: RollCall[]; myName: string | null }
/** null when the migration has not been run. Votes come from the public view; editors and the player also see reasons. */
export async function loadPractice(from: string, until: string, isEditor: boolean, signedIn: boolean): Promise<PracticeData | null> {
  const sb = supabase()
  const [se, br, pr] = await Promise.all([
    sb.from('practice_series').select('*').order('weekday'), sb.from('practice_breaks').select('*').order('start_date'),
    sb.from('practices').select('*').gte('date', from).lte('date', until).order('date').order('time'),
  ])
  if (missing(se.error) || missing(pr.error)) return null
  fail('讀取排程', se.error); fail('讀取停練', br.error); fail('讀取場次', pr.error)
  const ids = (pr.data ?? []).map((p) => p.id)
  let votes: Vote[] = []
  if (ids.length) {
    const pub = await sb.from('practice_votes_public').select('*').in('practice_id', ids)
    fail('讀取投票', pub.error)
    votes = (pub.data ?? []) as Vote[]
    if (signedIn) {
      // full rows (with reasons) for what this account may see: its own vote, or everything for editors
      const full = await sb.from('practice_votes').select('*').in('practice_id', ids)
      if (!full.error && full.data) { const m = new Map(votes.map((v) => [`${v.practice_id}|${v.player_name}`, v])); for (const v of full.data as Vote[]) m.set(`${v.practice_id}|${v.player_name}`, v); votes = [...m.values()] }
    }
  }
  const rl = ids.length ? await sb.from('practice_rollcall').select('*').in('practice_id', ids) : { data: [], error: null }
  fail('讀取點名', rl.error)
  let myName: string | null = null
  if (signedIn) { const me = await sb.rpc('my_player_name'); if (!me.error) myName = (me.data as string | null) ?? null }
  void isEditor
  return { series: (se.data ?? []) as PracticeSeries[], breaks: (br.data ?? []) as PracticeBreak[], practices: (pr.data ?? []) as Practice[], votes, rolls: (rl.data ?? []) as RollCall[], myName }
}

export async function saveSeries(s: Omit<PracticeSeries, 'id'> & { id?: string }) { fail('儲存排程', (await supabase().from('practice_series').upsert(s, { onConflict: 'id' })).error) }
export async function deleteSeries(id: string) { fail('刪除排程', (await supabase().from('practice_series').delete().eq('id', id)).error) }
export async function saveBreak(b: Omit<PracticeBreak, 'id'> & { id?: string }) { fail('儲存停練', (await supabase().from('practice_breaks').upsert(b, { onConflict: 'id' })).error) }
export async function deleteBreak(id: string) { fail('刪除停練', (await supabase().from('practice_breaks').delete().eq('id', id)).error) }
export async function generatePractices(weeks = 8): Promise<number> { const r = await supabase().rpc('generate_practices', { until: addDays(taipeiToday(), weeks * 7) }); fail('展開場次', r.error); return (r.data as number) ?? 0 }
export async function updatePractice(id: string, patch: Partial<Pick<Practice, 'time' | 'place' | 'status' | 'note'>>) { fail('更新場次', (await supabase().from('practices').update(patch).eq('id', id)).error) }
export async function castVote(v: { practice_id: string; player_name: string; status: VoteStatus; reason?: string; late_reply: boolean; by_proxy?: string }) {
  const { data: { user } } = await supabase().auth.getUser()
  fail('投票', (await supabase().from('practice_votes').upsert({ ...v, reason: v.reason || null, by_proxy: v.by_proxy ?? null, user_id: user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: 'practice_id,player_name' })).error)
}
export async function setRollCall(practice_id: string, player_name: string, present: boolean | null) {
  const sb = supabase()
  if (present === null) fail('點名', (await sb.from('practice_rollcall').delete().eq('practice_id', practice_id).eq('player_name', player_name)).error)
  else fail('點名', (await sb.from('practice_rollcall').upsert({ practice_id, player_name, present, updated_at: new Date().toISOString() }, { onConflict: 'practice_id,player_name' })).error)
}
/** Ask the edge function to push now (cancellation notice, manual resend). Needs an editor session. */
export async function notifyNow(practice_id: string, kind: 'notify' | 'cancelled' | 'reminder'): Promise<{ sent: number; failed: number }> {
  const { data, error } = await supabase().functions.invoke('practice-notify', { body: { practice_id, kind } })
  if (error) throw new Error(`發送通知失敗：${error.message}`)
  return data as { sent: number; failed: number }
}
