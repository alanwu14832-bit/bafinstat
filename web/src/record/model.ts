/**
 * Live scorekeeping state machine. Pure functions over a RecordState; the page keeps history for undo.
 * Rows are written in exactly the shape of the 單場-打擊 / 單場-投球 templates, so the finished game
 * goes through normalizeDataset and the stats engine like any import:
 *   - 局 / 出局(前) / 壘上(前) are filled from the live state
 *   - the batter's fate code (I/II/III out, L left on base, R scored; opp: R unearned / ER earned) is written
 *     on that batter's own row when it happens, exactly like the paper sheet
 *   - runner events (盜壘 / 盜壘失敗 / 失誤進壘 / 壘死) land on the runner's own row (our offense) or as
 *     被盜壘 / 阻殺 / 暴投 / 捕逸 / 牽制 on the current opponent PA (their offense)
 *   - a pickoff throw that does not get the runner (牽制・安全) has no column in the template, so it is written
 *     into the row's 備註 as「牽制 N 次」
 *   - a ball in play always ends with an IP pitch: 界外飛 recorded as F becomes IP, a missing IP is appended
 */
import type { BattingPA, DayRosterSub, Game, GameDayRoster, PitchingPA } from '../data/types'
import type { GameEdit } from '../data/edit'

export type Half = 'top' | 'bottom'
export type Side = 'us' | 'opp'
export type Base = 1 | 2 | 3
export type Dest = 'out' | 1 | 2 | 3 | 'home'
export interface LineupSlot { name: string; pos: string }
export interface Runner { base: Base; side: Side; row: number; name: string }
/** pka = pickoff throws where the runner was safe (noted, not a template column) */
export interface Extras { sba: number; cs: number; wp: number; pb: number; pk: number; pka: number }

export interface RecordState {
  game: Game
  lineup: LineupSlot[]
  /** index of the next batter in `lineup` */
  slot: number
  pitcher: string
  oppOrder: number
  oppBatter: string
  inning: number
  half: Half
  outs: number
  runners: Runner[]
  batting: BattingPA[]
  pitching: PitchingPA[]
  /** pitches of the plate appearance in progress */
  pitches: string[]
  /** opponent-offense events during the PA in progress */
  extras: Extras
  finished: boolean
  startedAt: string
  /** last local change (ISO); used to pick the newer of a local vs cloud draft */
  updatedAt?: string
  // 當日登錄名單. All optional: drafts started before these existed (this device, record_drafts, the public Live page)
  // lack them, so every reader goes through startersOf / appeared / … below, which fall back to the rows.
  /** the lineup as the game started (substitute() overwrites `lineup` in place) */
  starters?: LineupSlot[]
  startingPitcher?: string
  /** 板凳: came today, did not start */
  bench?: string[]
  /** 允許再上場: players substituted out may come back */
  reentry?: boolean
  /** every substitution, in the order it happened */
  subs?: DayRosterSub[]
}

export const OUT_RESULTS = new Set(['三振', '內滾', '內飛', '外飛', '界外飛', '犧觸', '犧飛', '雙殺'])
/** Results where the ball was put in play (the PA's last pitch is IP). */
export const BIP_RESULTS = new Set(['一安', '二安', '三安', '全壘打', '內滾', '內飛', '外飛', '界外飛', '犧觸', '犧飛', '雙殺', '野選', '失誤'])
export const REACH_RESULTS = new Set(['一安', '二安', '三安', '全壘打', '保送', '故四', '觸身', '失誤', '野選', '妨礙'])
const HIT_BASES: Record<string, Dest> = { 一安: 1, 二安: 2, 三安: 3, 全壘打: 'home' }
const ROMAN = ['I', 'II', 'III'] as const
const EXTRAS0: Extras = { sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, pka: 0 }

export const weBatTop = (s: RecordState) => s.game.homeAway === '客'
export const offense = (s: RecordState): Side => (s.half === 'top') === weBatTop(s) ? 'us' : 'opp'
export const basesString = (runners: Runner[]) => { const b = runners.map((r) => r.base).sort().join(''); return b || '無' }

export function count(pitches: string[]): { balls: number; strikes: number } {
  let balls = 0, strikes = 0
  for (const p of pitches) {
    if (p === 'B') balls++
    else if (p === 'S' || p === 'SS' || p === 'CS') strikes++
    else if (p === 'F' && strikes < 2) strikes++
  }
  return { balls, strikes }
}

/** Result the count implies (4 balls → 保送, 3 strikes → 三振), or null. */
export function impliedResult(pitches: string[]): '保送' | '三振' | null {
  const c = count(pitches)
  if (c.balls >= 4) return '保送'
  if (c.strikes >= 3) return '三振'
  return null
}

/** Pitch list with the ball-in-play pitch guaranteed for a BIP result (a caught foul is IP, not F). */
export function withInPlay(pitches: string[], result: string): string[] {
  if (!BIP_RESULTS.has(result)) return pitches
  const last = pitches[pitches.length - 1]
  if (last === 'IP') return pitches
  if (last === 'F' || last === 'S' || last === 'CS') return [...pitches.slice(0, -1), 'IP']
  return [...pitches, 'IP']
}

export function newGame(game: Game, lineup: LineupSlot[], pitcher: string, opts: { bench?: string[]; reentry?: boolean } = {}): RecordState {
  // the bench never repeats a starter (Setup may have promoted a bench player into the lineup)
  const starting = new Set([...lineup.map((l) => l.name), pitcher])
  const bench = [...new Set((opts.bench ?? []).filter((n) => n && !starting.has(n)))]
  return {
    game, lineup, slot: 0, pitcher, oppOrder: 1, oppBatter: '', inning: 1, half: 'top', outs: 0, runners: [], batting: [], pitching: [], pitches: [], extras: { ...EXTRAS0 }, finished: false, startedAt: new Date().toISOString(),
    starters: lineup.map((l) => ({ ...l })), startingPitcher: pitcher, bench, reentry: !!opts.reentry, subs: [],
  }
}

export const addPitch = (s: RecordState, code: string): RecordState => ({ ...s, pitches: [...s.pitches, code] })
export const undoPitch = (s: RecordState): RecordState => ({ ...s, pitches: s.pitches.slice(0, -1) })
export const addExtra = (s: RecordState, key: keyof Extras): RecordState => ({ ...s, extras: { ...s.extras, [key]: s.extras[key] + 1 } })
export const setOppBatter = (s: RecordState, name: string): RecordState => ({ ...s, oppBatter: name })
/**
 * New pitcher, logged as a 換投. Without a DH the old pitcher bats in the lineup as P: a pitcher from the bench takes
 * that slot; a fielder who moves to the mound keeps his own slot (now P) and the old pitcher's slot is left for the
 * recorder to change. With a DH (the old pitcher is not in the lineup) only `pitcher` changes.
 */
export function changePitcher(s: RecordState, name: string): RecordState {
  if (!name || name === s.pitcher) return { ...s, pitcher: name }
  const old = s.lineup.findIndex((l) => l.name === s.pitcher)
  let lineup = s.lineup
  if (old >= 0 && s.lineup[old].pos === 'P') {
    const fielder = s.lineup.findIndex((l) => l.name === name)
    lineup = s.lineup.map((l, i) => (fielder >= 0 ? (i === fielder ? { ...l, pos: 'P' } : l) : i === old ? { name, pos: 'P' } : l))
  }
  const sub: DayRosterSub = { kind: 'P', in: name, out: s.pitcher, pos: 'P', inning: s.inning, half: s.half, ...(old >= 0 ? { slot: old } : {}) }
  return { ...s, pitcher: name, lineup, subs: [...(s.subs ?? []), sub] }
}
export const setSlot = (s: RecordState, slot: number): RecordState => ({ ...s, slot: ((slot % s.lineup.length) + s.lineup.length) % s.lineup.length })
export const setOppOrder = (s: RecordState, n: number): RecordState => ({ ...s, oppOrder: ((n - 1 + 9) % 9) + 1 })
/** Substitute (pinch hitter / defensive change) in a lineup slot. A new name is logged; a position-only change (no name) is not. */
export function substitute(s: RecordState, slot: number, name: string, pos: string): RecordState {
  // someone new taking the current pitcher's slot at P is a pitching change: route it so `pitcher` follows
  const cur = s.lineup[slot]
  if (cur && name && name !== cur.name && cur.name === s.pitcher && (pos || cur.pos) === 'P') return changePitcher(s, name)
  const lineup = s.lineup.map((l, i) => (i === slot ? { name: name || l.name, pos: pos || l.pos } : l))
  const old = s.lineup[slot]
  if (!old || !name || name === old.name) return { ...s, lineup }
  const sub: DayRosterSub = { kind: pos === 'PH' ? 'PH' : pos === 'PR' ? 'PR' : 'DEF', in: name, out: old.name, pos: pos || old.pos, inning: s.inning, half: s.half, slot }
  return { ...s, lineup, subs: [...(s.subs ?? []), sub] }
}
export const setReentry = (s: RecordState, on: boolean): RecordState => ({ ...s, reentry: on })

/* ------------------------------------------------ who is in the game (all tolerant of drafts without the roster fields) */
/** In the game right now: the batting order plus the pitcher (under a DH he is not in `lineup`). */
export function onField(s: RecordState): Set<string> {
  return new Set([...s.lineup.map((l) => l.name), s.pitcher].filter(Boolean))
}
/** The starting lineup. Older drafts have no copy: the first batter in each slot started there (a pinch hitter shares the order). */
export function startersOf(s: RecordState): LineupSlot[] {
  if (s.starters) return s.starters
  return s.lineup.map((l, i) => { const p = s.batting.find((b) => b.order === i + 1 && b.batter); return p ? { name: p.batter, pos: p.pos ?? l.pos } : l })
}
export function startingPitcherOf(s: RecordState): string {
  return s.startingPitcher ?? (s.pitching.find((p) => p.pitcher)?.pitcher || s.pitcher)
}
/** Everyone who has been in the game (started, came in, batted, pitched, or is out there now). */
export function appeared(s: RecordState): Set<string> {
  const subs = s.subs ?? []
  const out = new Set<string>([...startersOf(s).map((l) => l.name), startingPitcherOf(s), ...subs.flatMap((x) => [x.out, x.in]), ...s.batting.map((p) => p.batter), ...s.pitching.map((p) => p.pitcher), ...onField(s)])
  out.delete('')
  return out
}
/** Substituted out: was in the game, is not any more. */
export function leftGame(s: RecordState): string[] {
  const now = onField(s)
  return [...appeared(s)].filter((n) => !now.has(n))
}
/** Bench players who have not come in yet. */
export function unusedBench(s: RecordState): string[] {
  const seen = appeared(s)
  return (s.bench ?? []).filter((n) => !seen.has(n))
}

export interface SubCandidates { names: string[]; disabled: Set<string>; tag: (name: string) => string | undefined }
/**
 * Who can come in, best first: today's unused bench, then the rest of `pool` who have not played, (for a pitching
 * change) the fielders who could move to the mound, then players already substituted out, who stay greyed out
 * unless re-entry is allowed.
 */
export function subCandidates(s: RecordState, pool: string[], mode: 'batter' | 'pitcher'): SubCandidates {
  const bench = unusedBench(s)
  const seen = appeared(s)
  const left = leftGame(s)
  const fielders = mode === 'pitcher' ? s.lineup.map((l) => l.name).filter((n) => n && n !== s.pitcher) : []
  // a pitcher without a batting slot (pinch-hit for without a DH, then relieved) must be able to take that slot
  const mound = mode === 'batter' && s.pitcher && !s.lineup.some((l) => l.name === s.pitcher) ? [s.pitcher] : []
  const names = [...new Set([...bench, ...pool.filter((n) => !seen.has(n)), ...mound, ...fielders, ...left])]
  const benchSet = new Set(bench), leftSet = new Set(left)
  return { names, disabled: s.reentry ? new Set() : leftSet, tag: (n) => (benchSet.has(n) ? '（板凳）' : leftSet.has(n) ? '（已下場）' : mound.includes(n) ? '（投手）' : undefined) }
}

export interface PAPlan {
  result: string
  loc?: number
  traj?: string
  quality?: string
  batter: Dest
  /** destination per runner, keyed by that runner's row index */
  runners: Record<number, Dest>
  rbi: number
  /** opponent runs on this play are earned (ER) rather than unearned (R) */
  earned: boolean
}

/** Sensible default destinations for a result; the recorder adjusts before confirming. */
export function defaultPlan(s: RecordState, result: string): PAPlan {
  const runners: Record<number, Dest> = {}
  const adv = (r: Runner, n: number): Dest => { const b = r.base + n; return b >= 4 ? 'home' : (b as Base) }
  let batter: Dest = 'out'
  if (result in HIT_BASES) {
    batter = HIT_BASES[result]
    const n = result === '全壘打' ? 4 : result === '一安' ? 1 : result === '二安' ? 2 : 3
    for (const r of s.runners) runners[r.row] = adv(r, n)
  } else if (result === '保送' || result === '故四' || result === '觸身' || result === '妨礙') {
    batter = 1
    // forced runners only
    const on = new Set(s.runners.map((r) => r.base))
    for (const r of s.runners) {
      const forced = r.base === 1 || (r.base === 2 && on.has(1)) || (r.base === 3 && on.has(1) && on.has(2))
      runners[r.row] = forced ? adv(r, 1) : r.base
    }
  } else if (result === '失誤' || result === '野選') {
    batter = 1
    for (const r of s.runners) runners[r.row] = result === '野選' && r.base === 1 ? 'out' : adv(r, 1)
    if (result === '野選' && !s.runners.some((r) => r.base === 1) && s.runners.length) runners[s.runners[0].row] = 'out'
  } else if (result === '犧飛') {
    for (const r of s.runners) runners[r.row] = r.base === 3 ? 'home' : r.base
  } else if (result === '犧觸') {
    for (const r of s.runners) runners[r.row] = adv(r, 1)
  } else if (result === '雙殺') {
    const lead = s.runners.find((r) => r.base === 1) ?? s.runners[0]
    for (const r of s.runners) runners[r.row] = r === lead ? 'out' : r.base
  } else {
    for (const r of s.runners) runners[r.row] = r.base
  }
  const plan: PAPlan = { result, batter, runners, rbi: 0, earned: true }
  plan.rbi = defaultRbi(plan)
  return plan
}

/** Runs scored on the play, minus the cases that never earn an RBI (error, double play). */
export function scoredOn(plan: PAPlan): number { return Object.values(plan.runners).filter((d) => d === 'home').length + (plan.batter === 'home' ? 1 : 0) }
export function defaultRbi(plan: PAPlan): number { return plan.result === '失誤' || plan.result === '雙殺' ? 0 : scoredOn(plan) }

/** Commit the plate appearance in progress. Returns the new state (half-inning ends automatically at 3 outs). */
export function commitPA(s: RecordState, plan: PAPlan): RecordState {
  const side = offense(s)
  const batting = s.batting.map((p) => ({ ...p }))
  const pitching = s.pitching.map((p) => ({ ...p }))
  let outs = s.outs
  const base = { gameId: s.game.id, inning: s.inning, outsBefore: s.outs, basesBefore: basesString(s.runners), pitches: withInPlay(s.pitches, plan.result), result: plan.result, loc: plan.loc, traj: plan.traj, quality: plan.quality }
  const note = s.extras.pka ? `牽制 ${s.extras.pka} 次` : undefined
  const extras = { sba: s.extras.sba, cs: s.extras.cs, wp: s.extras.wp, pb: s.extras.pb, pk: s.extras.pk }
  let rowIndex: number
  if (side === 'us') {
    const slot = s.lineup[s.slot]
    batting.push({ ...base, order: s.slot + 1, pos: slot?.pos || undefined, batter: slot?.name ?? '', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: plan.rbi, note })
    rowIndex = batting.length - 1
  } else {
    pitching.push({ ...base, oppOrder: s.oppOrder, pitcher: s.pitcher, oppBatter: s.oppBatter || undefined, ...extras, note })
    rowIndex = pitching.length - 1
  }
  const next: RecordState = { ...s, batting, pitching }
  const markOut = (row: number, rside: Side, isBatter: boolean) => {
    outs = Math.min(3, outs + 1)
    const r = rside === 'us' ? batting[row] : pitching[row]
    if (!isBatter && rside === 'us') (r as BattingPA).outOnBase += 1
    r.code = ROMAN[outs - 1]
  }
  const markRun = (row: number, rside: Side) => {
    const r = rside === 'us' ? batting[row] : pitching[row]
    if (rside === 'us') { (r as BattingPA).run = 1; r.code = 'R' } else r.code = plan.earned ? 'ER' : 'R'
  }
  // runners first, lead runner first, then the batter
  const runners: Runner[] = []
  for (const r of [...s.runners].sort((a, b) => b.base - a.base)) {
    const d = plan.runners[r.row] ?? r.base
    if (d === 'out') markOut(r.row, r.side, false)
    else if (d === 'home') markRun(r.row, r.side)
    else runners.push({ ...r, base: d })
  }
  const batterName = side === 'us' ? (s.lineup[s.slot]?.name ?? '') : (s.oppBatter || `對方 ${s.oppOrder} 棒`)
  if (plan.batter === 'out') markOut(rowIndex, side, true)
  else if (plan.batter === 'home') markRun(rowIndex, side)
  else runners.push({ base: plan.batter, side, row: rowIndex, name: batterName })
  next.outs = outs
  next.runners = runners.sort((a, b) => b.base - a.base)
  next.pitches = []
  next.extras = { ...EXTRAS0 }
  if (side === 'us') next.slot = (s.slot + 1) % s.lineup.length
  else { next.oppOrder = (s.oppOrder % 9) + 1; next.oppBatter = '' }
  return outs >= 3 ? endHalf(next) : next
}

export type RunnerEvent = 'sb' | 'cs' | 'wp' | 'pb' | 'err' | 'pk' | 'pkSafe' | 'advance' | 'score' | 'out'

/** Something happened to a runner between pitches. */
export function runnerEvent(s: RecordState, row: number, side: Side, ev: RunnerEvent): RecordState {
  const runner = s.runners.find((r) => r.row === row && r.side === side)
  if (!runner) return s
  const batting = s.batting.map((p) => ({ ...p }))
  const pitching = s.pitching.map((p) => ({ ...p }))
  const extras = { ...s.extras }
  let outs = s.outs
  const r = side === 'us' ? batting[row] : pitching[row]
  const advance = (n: number): Dest => { const b = runner.base + n; return b >= 4 ? 'home' : (b as Base) }
  let dest: Dest = runner.base
  switch (ev) {
    case 'sb': dest = advance(1); if (side === 'us') (r as BattingPA).sb += 1; else extras.sba += 1; break
    case 'cs': dest = 'out'; if (side === 'us') (r as BattingPA).cs += 1; else extras.cs += 1; break
    case 'wp': dest = advance(1); if (side === 'opp') extras.wp += 1; break
    case 'pb': dest = advance(1); if (side === 'opp') extras.pb += 1; break
    case 'err': dest = advance(1); if (side === 'us') (r as BattingPA).advOnError += 1; break
    case 'pk': dest = 'out'; if (side === 'us') (r as BattingPA).outOnBase += 1; else extras.pk += 1; break
    case 'pkSafe': extras.pka = (extras.pka ?? 0) + 1; break
    case 'advance': dest = advance(1); break
    case 'score': dest = 'home'; break
    case 'out': dest = 'out'; if (side === 'us') (r as BattingPA).outOnBase += 1; break
  }
  let runners = s.runners.filter((x) => x !== runner)
  if (dest === 'out') { outs = Math.min(3, outs + 1); r.code = ROMAN[outs - 1] }
  else if (dest === 'home') { if (side === 'us') { (r as BattingPA).run = 1; r.code = 'R' } else r.code = 'ER' }
  else runners = [...runners, { ...runner, base: dest }]
  const next: RecordState = { ...s, batting, pitching, extras, outs, runners: runners.sort((a, b) => b.base - a.base) }
  return outs >= 3 ? endHalf(next) : next
}

/** Flip an opponent run between earned (ER) and unearned (R). */
export function toggleEarned(s: RecordState, row: number): RecordState {
  const pitching = s.pitching.map((p, i) => (i === row && (p.code === 'R' || p.code === 'ER') ? { ...p, code: p.code === 'ER' ? 'R' : 'ER' } : p))
  return { ...s, pitching }
}

/** End the half-inning: runners left on base get L, sides switch, inning advances after the bottom half. */
export function endHalf(s: RecordState): RecordState {
  const batting = s.batting.map((p) => ({ ...p }))
  const pitching = s.pitching.map((p) => ({ ...p }))
  for (const r of s.runners) { const row = r.side === 'us' ? batting[r.row] : pitching[r.row]; if (!row.code) row.code = 'L' }
  return { ...s, batting, pitching, runners: [], outs: 0, pitches: [], extras: { ...EXTRAS0 }, half: s.half === 'top' ? 'bottom' : 'top', inning: s.half === 'bottom' ? s.inning + 1 : s.inning }
}

export interface Score { us: number; opp: number; lineUs: number[]; lineOpp: number[] }
export function score(s: RecordState): Score {
  const n = Math.max(s.inning, s.game.innings ?? 0)
  const lineUs = Array.from({ length: n }, () => 0), lineOpp = Array.from({ length: n }, () => 0)
  for (const p of s.batting) if (p.run) lineUs[p.inning - 1] += p.run
  for (const p of s.pitching) if (p.code === 'R' || p.code === 'ER') lineOpp[p.inning - 1] += 1
  return { us: lineUs.reduce((a, b) => a + b, 0), opp: lineOpp.reduce((a, b) => a + b, 0), lineUs, lineOpp }
}

/** The 當日登錄名單 this game produces: starters with their batting order (the non-batting pitcher under a DH without one), bench, substitutions. */
export function dayRosterOf(s: RecordState): GameDayRoster {
  const starters: GameDayRoster['starters'] = startersOf(s).flatMap((l, i) => (l.name ? [{ name: l.name, pos: l.pos, order: i + 1 }] : []))
  const sp = startingPitcherOf(s)
  if (sp && !starters.some((x) => x.name === sp)) starters.push({ name: sp, pos: 'P' })
  return { starters, bench: s.bench ?? [], subs: s.subs ?? [], reentry: !!s.reentry }
}

/** Package the game for saveGame (normalize derives fielding, innings and warnings). */
export function toGameEdit(s: RecordState, extra: Partial<Game> = {}): GameEdit {
  const played = Math.max(1, ...s.batting.map((p) => p.inning), ...s.pitching.map((p) => p.inning))
  // only drafts started with the roster fields know the bench; older ones keep whatever the game already had
  const roster = s.starters ? { dayRoster: dayRosterOf(s) } : {}
  return { game: { ...s.game, innings: s.finished ? played : s.game.innings ?? played, ...roster, ...extra }, batting: s.batting, pitching: s.pitching, fielding: [] }
}

/** G+YYYYMMDD-NN, NN = next free sequence for that date. */
export function nextGameId(date: string, existing: string[]): string {
  const prefix = `G${date.replace(/-/g, '')}-`
  let n = 1
  while (existing.includes(`${prefix}${String(n).padStart(2, '0')}`)) n++
  return `${prefix}${String(n).padStart(2, '0')}`
}
