/**
 * 獲勝機率模型 (win expectancy), built in the browser from our own games — both offenses, every plate appearance.
 * Pure: no React, no TEAM; the caller passes the rules (innings, tie-break).
 *
 * 1. 局面 (base-out state): s = outs·8 + bases (bit 1B = 1, 2B = 2, 3B = 4), 0..23; END = 24 is three outs.
 * 2. Per plate appearance from each state, where it went and how many runs scored (runner plays during his pitches
 *    included). Small samples are shrunk three ways: the result rates toward WIN_PRIOR (300 plate appearances' worth),
 *    the advancement chances toward WIN_PRIOR (20 opportunities' worth), and each state's transitions toward a rule
 *    model built from those (30 plate appearances' worth). So a site with few games mostly shows the prior.
 * 3. F[s][r]: the chance the offense scores r more runs this half from s (20 = 20 or more); RE[s] = its mean (RE24).
 * 4. Home win probability by backward induction, inning by inning, half by half, from (inning, half, state, home
 *    lead), assuming two equal teams; extra innings start from the tie-break state.
 *
 * It describes what happened in a game; it is not a prediction (it ignores who bats or pitches, time limits and the
 * mercy rule).
 */

export const END = 24
export type HalfName = 'top' | 'bottom'
/** What a plate appearance's result does to the bases, in the rule model's terms. */
export type Cls = 'K' | 'BB' | '1B' | '2B' | '3B' | 'HR' | 'E' | 'FC' | 'OUT'
export const CLASSES: Cls[] = ['K', 'BB', '1B', '2B', '3B', 'HR', 'E', 'FC', 'OUT']
/** Advancement chances: single2H 一安二壘跑者回本壘, single13 一安一壘跑者上三壘, double1H 二安一壘跑者回本壘,
 *  outAdvance 出局時跑者推進, dp 雙殺, runnerPlay 打席中跑壘推進, runnerOut 打席中跑者出局. */
export type AdvKey = 'single2H' | 'single13' | 'double1H' | 'outAdvance' | 'dp' | 'runnerPlay' | 'runnerOut'
export const ADV_KEYS: AdvKey[] = ['single2H', 'single13', 'double1H', 'outAdvance', 'dp', 'runnerPlay', 'runnerOut']

export const stateOf = (outs: number, bases: number): number => (outs >= 3 ? END : outs * 8 + (bases & 7))
export const outsOf = (s: number): number => (s >= END ? 3 : s >> 3)
export const basesOf = (s: number): number => (s >= END ? 0 : s & 7)
/** Runners on base → bases mask (1B = 1, 2B = 2, 3B = 4). */
export function basesMask(on: ReadonlyArray<{ base: number }>): number {
  let m = 0
  for (const o of on) if (o.base >= 1 && o.base <= 3) m |= 1 << (o.base - 1)
  return m
}
/** Bases by mask, as the site writes them (「一、三壘」); 0 is 「無人」. */
export const BASES_LABEL: string[] = ['無人', '一壘', '二壘', '一、二壘', '三壘', '一、三壘', '二、三壘', '滿壘']
const popcount = (b: number) => (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1)

/**
 * WIN_PRIOR: committed starting values for an amateur game, what the model leans on while a site has few games.
 * Hand-set from typical college / club box scores (many strikeouts and walks, few home runs, about one error per
 * eleven plate appearances); our own numbers replace them as games come in (rateWeight / advWeight / stateWeight
 * are how many plate appearances / opportunities / transitions of our own the prior is worth).
 */
export const WIN_PRIOR = {
  rates: { K: 0.2, BB: 0.15, '1B': 0.14, '2B': 0.04, '3B': 0.012, HR: 0.006, E: 0.06, FC: 0.02, OUT: 0.372 } as Record<Cls, number>,
  rateWeight: 300,
  adv: { single2H: 0.7, single13: 0.35, double1H: 0.55, outAdvance: 0.35, dp: 0.1, runnerPlay: 0.3, runnerOut: 0.05 } as Record<AdvKey, number>,
  advWeight: 20,
  stateWeight: 30,
}
export type WinPrior = typeof WIN_PRIOR

/** The result's class: 三振 K; 保送／故四／觸身／妨礙 BB; 一安／內安 1B; 二安／場地二安 2B; 三安 3B; 全壘打 HR; 失誤 E;
 *  野選 FC; every other out OUT. */
export function resultClass(result: string): Cls {
  switch (result) {
    case '三振': return 'K'
    case '保送': case '故四': case '觸身': case '妨礙': return 'BB'
    case '一安': case '內安': return '1B'
    case '二安': case '場地二安': return '2B'
    case '三安': return '3B'
    case '全壘打': return 'HR'
    case '失誤': return 'E'
    case '野選': return 'FC'
    default: return 'OUT'
  }
}

export interface Transition { to: number; runs: number; p: number }
type Branch = [outs: number, bases: number, runs: number, p: number]

/** What one result does from (outs o, bases b) — runs scored on a play that makes the third out never count. */
function resultBranches(o: number, b: number, c: Cls, adv: Partial<Record<AdvKey, number>>): Branch[] {
  const has1 = !!(b & 1), has2 = !!(b & 2), has3 = !!(b & 4)
  switch (c) {
    case 'K': return [[o + 1, b, 0, 1]]
    case 'BB': {
      if (!has1) return [[o, b | 1, 0, 1]]
      if (!has2) return [[o, b | 3, 0, 1]]
      if (!has3) return [[o, 7, 0, 1]]
      return [[o, 7, 1, 1]]
    }
    case '1B': {
      const s2H = adv.single2H ?? 0, s13 = adv.single13 ?? 0
      const out: Branch[] = []
      const second: Array<[boolean | null, number]> = has2 ? [[true, s2H], [false, 1 - s2H]] : [[null, 1]]
      for (const [home, p2] of second) {
        let nb = 1, r = has3 ? 1 : 0
        if (home === true) r++
        else if (home === false) nb |= 4
        if (has1) {
          if (!(nb & 4)) { out.push([o, nb | 4, r, p2 * s13]); out.push([o, nb | 2, r, p2 * (1 - s13)]) }
          else out.push([o, nb | 2, r, p2])
        } else out.push([o, nb, r, p2])
      }
      return out
    }
    case '2B': {
      const d1H = adv.double1H ?? 0
      const r = (has2 ? 1 : 0) + (has3 ? 1 : 0)
      return has1 ? [[o, 2, r + 1, d1H], [o, 6, r, 1 - d1H]] : [[o, 2, r, 1]]
    }
    case '3B': return [[o, 4, popcount(b), 1]]
    case 'HR': return [[o, 0, popcount(b) + 1, 1]]
    case 'E': return [[o, ((b << 1) & 7) | 1, has3 ? 1 : 0, 1]]
    case 'FC': {
      if (!b) return [[o, 1, 0, 1]]
      if (has1) {
        // the runner from first is forced out; the ones forced behind him move up
        let nb = 1, r = 0
        if (has2) nb |= 4
        if (has3) { if (has2) r = 1; else nb |= 4 }
        return [[o + 1, nb, r, 1]]
      }
      // nobody forced: the lead runner is put out, the rest stay
      const lead = has3 ? 4 : 2
      return [[o + 1, (b & ~lead) | 1, 0, 1]]
    }
    case 'OUT': {
      if (o >= 2) return [[3, 0, 0, 1]]
      const dp = has1 ? adv.dp ?? 0 : 0, oa = adv.outAdvance ?? 0
      const out: Branch[] = []
      if (dp) out.push([o + 2, b & ~1, 0, dp])
      out.push([o + 1, (b << 1) & 7, has3 ? 1 : 0, (1 - dp) * oa])
      out.push([o + 1, b, 0, (1 - dp) * (1 - oa)])
      return out
    }
  }
}

/**
 * The rule model from one state: first a runner play during the plate appearance (with runners on: the lead runner
 * moves up a base with runnerPlay — from third he scores — or is put out with runnerOut), then the result by class.
 * `rates` need not cover every class (missing = 0); outcomes with no chance are left out, equal ones merged.
 */
export function ruleOutcomes(state: number, rates: Partial<Record<Cls, number>>, adv: Partial<Record<AdvKey, number>>): Transition[] {
  const o0 = outsOf(state), b0 = basesOf(state)
  const acc = new Map<number, Transition>()
  const add = (o: number, b: number, runs: number, p: number) => {
    if (!(p > 0)) return
    const to = stateOf(o, b)
    const r = Math.min(20, runs)
    const k = to * 32 + r
    const t = acc.get(k)
    if (t) t.p += p
    else acc.set(k, { to, runs: r, p })
  }
  const pre: Branch[] = []
  if (b0) {
    const lead = b0 & 4 ? 4 : b0 & 2 ? 2 : 1
    const rp = adv.runnerPlay ?? 0, ro = adv.runnerOut ?? 0
    if (rp) pre.push(lead === 4 ? [o0, b0 & ~4, 1, rp] : [o0, (b0 & ~lead) | (lead << 1), 0, rp])
    if (ro) pre.push([o0 + 1, b0 & ~lead, 0, ro])
    pre.push([o0, b0, 0, 1 - rp - ro])
  } else pre.push([o0, b0, 0, 1])
  for (const [o, b, r0, p0] of pre) {
    if (!(p0 > 0)) continue
    if (o >= 3) { add(3, 0, r0, p0); continue }
    for (const c of CLASSES) {
      const rate = rates[c] ?? 0
      if (!(rate > 0)) continue
      for (const [o1, b1, r1, p1] of resultBranches(o, b, c, adv)) add(o1, b1, r0 + (o1 >= 3 ? 0 : r1), p0 * rate * p1)
    }
  }
  return [...acc.values()].sort((a, z) => z.p - a.p || a.to - z.to || a.runs - z.runs)
}

/** One plate appearance of the training data (a followed half-inning of a real game). */
export interface PaSample {
  /** state when the batter came up */
  from: number
  /** state after his result (END on the third out) */
  to: number
  /** runs on runner plays during it and on the result */
  runs: number
  cls: Cls
  /** advancement facts (true = it happened, false = it could have; left out = no chance) */
  adv?: Partial<Record<AdvKey, boolean>>
  /** id of the half-inning it belongs to (for the actual run values; samples of one half in order) */
  half?: number
}

export interface WinParams { rates: Record<Cls, number>; adv: Record<AdvKey, number> }

/** Result rates p_c = (n_c + 300·prior_c) / (N + 300); advancement a_j = (succ + 20·prior_j) / (opps + 20). */
export function estimateParams(transitions: ReadonlyArray<PaSample>, prior: WinPrior = WIN_PRIOR): WinParams {
  const n = Object.fromEntries(CLASSES.map((c) => [c, 0])) as Record<Cls, number>
  const succ = Object.fromEntries(ADV_KEYS.map((k) => [k, 0])) as Record<AdvKey, number>
  const opps = Object.fromEntries(ADV_KEYS.map((k) => [k, 0])) as Record<AdvKey, number>
  for (const t of transitions) {
    n[t.cls]++
    for (const k of ADV_KEYS) { const v = t.adv?.[k]; if (v === undefined) continue; opps[k]++; if (v) succ[k]++ }
  }
  const N = transitions.length
  const rates = Object.fromEntries(CLASSES.map((c) => [c, (n[c] + prior.rateWeight * prior.rates[c]) / (N + prior.rateWeight)])) as Record<Cls, number>
  const adv = Object.fromEntries(ADV_KEYS.map((k) => [k, (succ[k] + prior.advWeight * prior.adv[k]) / (opps[k] + prior.advWeight)])) as Record<AdvKey, number>
  // the runner play and the runner out share one chance
  const both = adv.runnerPlay + adv.runnerOut
  if (both > 0.95) { adv.runnerPlay *= 0.95 / both; adv.runnerOut *= 0.95 / both }
  return { rates, adv }
}

export const MAX_RUNS = 20

export interface RunSample {
  /** training plate appearances that started in each state */
  n: number[]
  /** runs actually scored from each state to the end of the half (complete halves only); null without any */
  empiricalRe: Array<number | null>
  /** complete halves (three outs) that started from 無人、0 出局 */
  halves: number
  /** training plate appearances */
  pas: number
  /** runs per half: the model from 無人、0 出局, and the actual average over `halves` */
  runsPerHalfModel: number
  runsPerHalfActual: number | null
  /** runs in a half: 0, 1, 2, 3 or more — the model's chances and the actual shares */
  runDist: { model: number[]; actual: number[] | null }
}

export interface RunModel {
  params: WinParams
  /** per state 0..23: where a plate appearance goes */
  T: Transition[][]
  /** per state 0..24: runs still to come this half, F[s][r] (r = 20 means 20 or more) */
  F: Float64Array[]
  /** RE24: expected runs for the rest of the half (RE[END] = 0) */
  re: Float64Array
  sample: RunSample
}

/** T_s = (C_s + 30·Rule_s) / (n_s + 30), then the runs-remaining distribution by iteration. */
export function buildRunModel(transitions: ReadonlyArray<PaSample>, prior: WinPrior = WIN_PRIOR): RunModel {
  const params = estimateParams(transitions, prior)
  const counts: Array<Map<number, number>> = Array.from({ length: END }, () => new Map())
  const n = Array.from({ length: END }, () => 0)
  for (const t of transitions) {
    if (t.from < 0 || t.from >= END) continue
    const k = t.to * 32 + Math.min(MAX_RUNS, Math.max(0, t.runs))
    counts[t.from].set(k, (counts[t.from].get(k) ?? 0) + 1)
    n[t.from]++
  }
  const w = prior.stateWeight
  const T: Transition[][] = []
  for (let s = 0; s < END; s++) {
    const acc = new Map<number, number>()
    for (const [k, c] of counts[s]) acc.set(k, c)
    for (const t of ruleOutcomes(s, params.rates, params.adv)) { const k = t.to * 32 + t.runs; acc.set(k, (acc.get(k) ?? 0) + w * t.p) }
    const den = n[s] + w
    T.push([...acc.entries()].map(([k, c]) => ({ to: Math.floor(k / 32), runs: k % 32, p: c / den })).sort((a, z) => z.p - a.p || a.to - z.to || a.runs - z.runs))
  }
  const R = MAX_RUNS + 1
  const F = Array.from({ length: END + 1 }, () => new Float64Array(R))
  F[END][0] = 1
  // Gauss-Seidel sweeps (each state takes its successors' newest values) until nothing moves by 1e-12
  const nf = new Float64Array(R)
  for (let iter = 0; iter < 500; iter++) {
    let change = 0
    for (let s = 0; s < END; s++) {
      nf.fill(0)
      for (const t of T[s]) {
        const src = F[t.to], p = t.p, k = t.runs
        for (let j = 0; j < R; j++) { const v = src[j]; if (v) nf[j + k < R ? j + k : R - 1] += p * v }
      }
      const fs = F[s]
      for (let j = 0; j < R; j++) { const d = Math.abs(nf[j] - fs[j]); if (d > change) change = d; fs[j] = nf[j] }
    }
    if (change < 1e-12) break
  }
  const re = new Float64Array(END + 1)
  for (let s = 0; s < END; s++) { let e = 0; for (let r = 1; r < R; r++) e += r * F[s][r]; re[s] = e }
  return { params, T, F, re, sample: runSample(transitions, n, F, re) }
}

const dist4 = (runs: number[]) => { const d = [0, 0, 0, 0]; for (const r of runs) d[Math.min(3, r)]++; return d.map((x) => x / runs.length) }

function runSample(transitions: ReadonlyArray<PaSample>, n: number[], F: Float64Array[], re: Float64Array): RunSample {
  const halves = new Map<number, PaSample[]>()
  for (const t of transitions) if (t.half !== undefined) (halves.get(t.half) ?? halves.set(t.half, []).get(t.half)!).push(t)
  const sum = Array.from({ length: END }, () => 0), cnt = Array.from({ length: END }, () => 0)
  const perHalf: number[] = []
  for (const list of halves.values()) {
    if (list[list.length - 1].to !== END) continue
    let rest = 0
    for (let i = list.length - 1; i >= 0; i--) {
      rest += list[i].runs
      const s = list[i].from
      if (s >= 0 && s < END) { sum[s] += rest; cnt[s]++ }
    }
    if (list[0].from === 0) perHalf.push(rest)
  }
  const f0 = F[0]
  return {
    n,
    empiricalRe: sum.map((x, s) => (cnt[s] ? x / cnt[s] : null)),
    halves: perHalf.length,
    pas: transitions.length,
    runsPerHalfModel: re[0],
    runsPerHalfActual: perHalf.length ? perHalf.reduce((a, b) => a + b, 0) / perHalf.length : null,
    runDist: { model: [f0[0], f0[1], f0[2], 1 - f0[0] - f0[1] - f0[2]], actual: perHalf.length ? dist4(perHalf) : null },
  }
}

/** Regulation innings and the tie-break: from which inning extra halves start with runners on, and on which bases. */
export interface WinRules { innings: number; tiebreakFrom: number | null; tiebreakBases: number[] }
/** From the inning after regulation, on `tiebreak`'s bases ('12' = 一、二壘; '' = no tie-break). */
export function defaultWinRules(innings: number, tiebreak = '12'): WinRules {
  const bases = [...new Set(String(tiebreak).split('').filter((c) => c === '1' || c === '2' || c === '3').map(Number))].sort((a, z) => a - z)
  return { innings, tiebreakFrom: bases.length ? innings + 1 : null, tiebreakBases: bases }
}

export interface WinModel {
  run: RunModel
  rules: WinRules
  /** innings after this one play like it */
  lastInning: number
  /** the home team's chance from a tied extra inning that repeats for ever: P(H > A) ÷ (1 − P(H = A)) */
  pStar: number
  startState(inning: number): number
  /** home win probability in this state, before the plate appearance */
  we(inning: number, half: HalfName, state: number, homeDiff: number): number
  /** home win probability right after a play that left `toState` (END: the half is over) and this home lead */
  after(inning: number, half: HalfName, toState: number, homeDiff: number): number
  /** how much a plate appearance here can move the home win probability (not normalised) */
  liRaw(inning: number, half: HalfName, state: number, homeDiff: number): number
}

const D = 30
const WD = 2 * D + 1
const clampD = (d: number) => (d < -D ? -D : d > D ? D : d)

/** Home win probability by backward induction (see the file comment). */
export function buildWinModel(run: RunModel, rules: WinRules): WinModel {
  const N = Math.max(1, rules.innings)
  const Tb = rules.tiebreakFrom ?? Infinity
  const tbMask = basesMask(rules.tiebreakBases.map((base) => ({ base })))
  const startState = (i: number) => (i >= Tb && tbMask ? stateOf(0, tbMask) : 0)
  const L = Math.max(N + 1, Number.isFinite(Tb) ? Tb : 0)
  const F = run.F
  const fl = F[startState(L)]
  let gt = 0, eq = 0
  for (let h = 0; h <= MAX_RUNS; h++) { eq += fl[h] * fl[h]; for (let a = 0; a < h; a++) gt += fl[h] * fl[a] }
  const pStar = eq < 1 ? gt / (1 - eq) : 0.5
  const table = new Float64Array(L * 2 * END * WD)
  const at = (i: number, h: number, s: number, d: number) => (((i - 1) * 2 + h) * END + s) * WD + d + D
  const get = (i: number, h: number, s: number, d: number) => table[at(i, h, s, clampD(d))]
  // what follows the end of a half
  const nb = (i: number, x: number): number => {
    x = clampD(x)
    if (i >= N) return x > 0 ? 1 : x < 0 ? 0 : i + 1 > L ? pStar : get(i + 1, 0, startState(i + 1), 0)
    return get(i + 1, 0, startState(i + 1), x)
  }
  const nt = (i: number, x: number): number => {
    x = clampD(x)
    return i >= N && x > 0 ? 1 : get(i, 1, startState(i), x)
  }
  const R = MAX_RUNS + 1
  // nb / nt of one inning as arrays: NB[d + r + D] for the bottom half, NT[d − r + D + MAX_RUNS] for the top
  const NB = new Float64Array(WD + MAX_RUNS), NT = new Float64Array(WD + MAX_RUNS)
  for (let i = L; i >= 1; i--) {
    for (let x = 0; x < NB.length; x++) NB[x] = nb(i, x - D)
    for (let s = 0; s < END; s++) {
      const f = F[s]
      const base = at(i, 1, s, 0)
      for (let d = -D; d <= D; d++) {
        let v: number
        if (i >= N && d > 0) v = 1
        else { v = 0; for (let r = 0; r < R; r++) { const q = f[r]; if (q) v += q * NB[d + r + D] } }
        table[base + d] = v
      }
    }
    for (let x = 0; x < NT.length; x++) NT[x] = nt(i, x - D - MAX_RUNS)
    for (let s = 0; s < END; s++) {
      const f = F[s]
      const base = at(i, 0, s, 0)
      for (let d = -D; d <= D; d++) {
        let v = 0
        for (let r = 0; r < R; r++) { const q = f[r]; if (q) v += q * NT[d - r + D + MAX_RUNS] }
        table[base + d] = v
      }
    }
  }
  const inn = (i: number) => (i < 1 ? 1 : i > L ? L : Math.floor(i))
  const hIdx = (half: HalfName) => (half === 'top' ? 0 : 1)
  const after = (i: number, half: HalfName, to: number, d: number): number => {
    const ii = inn(i)
    if (to >= END) return half === 'top' ? nt(ii, d) : nb(ii, d)
    if (half === 'bottom' && ii >= N && d > 0) return 1
    return get(ii, hIdx(half), to, d)
  }
  const we = (i: number, half: HalfName, s: number, d: number): number => {
    if (s >= END) return after(i, half, END, d)
    return get(inn(i), hIdx(half), s, d)
  }
  const liRaw = (i: number, half: HalfName, s: number, d: number): number => {
    if (s < 0 || s >= END) return 0
    const w0 = we(i, half, s, d)
    let v = 0
    for (const t of run.T[s]) v += t.p * Math.abs(after(i, half, t.to, half === 'top' ? d - t.runs : d + t.runs) - w0)
    return v
  }
  return { run, rules, lastInning: L, pStar, startState, we, after, liRaw }
}
