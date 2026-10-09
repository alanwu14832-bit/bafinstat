/**
 * A random but legal game played through the 紀錄比賽 model (pitch by pitch, runners stealing and getting caught,
 * substitutions, pitching changes), shared by the tests that need many realistic games (record/sim.test.ts …).
 * Test-only: the site never imports it.
 *
 * The recorder's extras (對方投手 now and then while we bat, 記對方打者姓名 in half the games with pinch hitters, the
 * clock for 比賽時間) draw from a second random stream, so the games themselves are the same as without them. `expect`
 * (returned) holds what each saved row should carry, worked out on the side.
 */
import {
  addError, addExtra, addPitch, changePitcher, commitPA, count, defaultPlan, endHalf, impliedResult, newGame, offense, planProblems, runnerEvent, setOppLineup, setOppNames,
  setOppPitcher, stampTimes, substitute,
  type Dest, type OppPitcher, type RecordState,
} from '../record/model'
import type { BattingPA, Game, OppHand, Player } from '../data/types'
import type { OnBase } from '../record/timeline'

export function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
export const NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '子', '丑', '寅', '卯']
export const roster: Player[] = NAMES.map((name) => ({ name, status: '現役' }))
export const POS = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P']
export const FIELDER: Record<string, number[]> = { 內滾: [1, 3, 4, 5, 6], 內飛: [1, 2, 3, 4, 5, 6], 外飛: [7, 8, 9], 界外飛: [2, 3, 5, 7, 9], 犧飛: [7, 8, 9], 犧觸: [1, 2, 3, 5], 雙殺: [4, 5, 6], 野選: [1, 4, 5, 6], 失誤: [4, 5, 6, 7, 8, 9] }

export function playGame(seed: number) {
  const r = rng(seed)
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const game: Game = { id: `G2026010${seed % 9 + 1}-01`, date: '2026-01-01', tournament: '模擬', opponent: '對手', homeAway: r() < 0.5 ? '主' : '客', innings: 7 }
  let s: RecordState = newGame(game, NAMES.slice(0, 9).map((name, i) => ({ name, pos: POS[i] })), '壬', { bench: NAMES.slice(9) })
  let guard = 0
  // ground truth for the timeline: who was on base (row, base) when each plate appearance was sent, and when its
  // batter came up (before the runner plays during his pitches)
  const truth = { bat: new Map<number, OnBase[]>(), pit: new Map<number, OnBase[]>() }
  const start = { bat: new Map<number, OnBase[]>(), pit: new Map<number, OnBase[]>() }
  const snap = (st: RecordState) => st.runners.map((x) => ({ row: x.row, base: x.base })).sort((a, b) => b.base - a.base)
  let upNow = snap(s)
  // the recorder's extras: their own random stream
  const x = rng(seed * 7919 + 13)
  const xpick = <T,>(xs: T[]) => xs[Math.floor(x() * xs.length)]
  const names = x() < 0.5
  let lineupNow = Array.from({ length: 9 }, (_, i) => (x() < 0.8 ? `對${i + 1}` : ''))
  if (names) s = setOppLineup(setOppNames(s, true), lineupNow)
  let oppNow: OppPitcher | undefined
  const want = { bat: [] as Array<Pick<BattingPA, 'oppHand' | 'oppPitcher'>>, pit: [] as Array<string | undefined> }
  let clock = Date.UTC(2026, 0, 1, 5, 0)
  let stamped = s
  const recorder = () => {
    s = stampTimes(stamped, s, new Date((clock += 60000)).toISOString())
    if (offense(s) === 'us' && x() < 0.05) {
      const hand = xpick<OppHand | undefined>(['L', 'R', undefined])
      const raw = xpick(['王', '林', '', ' 陳 '])
      const name = raw.trim() || undefined
      const next = name || hand ? { ...(name ? { name } : {}), ...(hand ? { hand } : {}) } : undefined
      // the first entry also goes on this half's plate appearances so far
      if (!oppNow && next) s.batting.forEach((b, i) => { if (b.inning === s.inning && !want.bat[i].oppHand && !want.bat[i].oppPitcher) want.bat[i] = fields(next) })
      oppNow = next
      s = setOppPitcher(s, { name: raw, hand })
    }
    if (names && offense(s) === 'opp' && x() < 0.05) {
      lineupNow = lineupNow.map((n, i) => (i === Math.floor(x() * 9) ? `代打${guard}` : n))
      s = setOppLineup(s, lineupNow)
    }
    stamped = s
  }
  const fields = (p?: OppPitcher) => ({ ...(p?.name ? { oppPitcher: p.name } : {}), ...(p?.hand ? { oppHand: p.hand } : {}) })
  const runnerPlay = () => {
    const side = offense(s)
    const run = pick(s.runners)
    const ev = pick(['sb', 'cs', 'wp', 'pb', 'err', 'throw', 'pk', 'advance'] as const)
    const before = s.half
    if (!(ev === 'err' && side === 'opp') && !((ev === 'wp' || ev === 'pb') && side === 'us')) s = runnerEvent(s, run.row, run.side, ev)
    if (ev === 'err' && side === 'opp') s = addError(s, pick(['SS', 'LF', '2B']))
    { const bases = s.runners.map((x) => x.base); if (new Set(bases).size !== bases.length) throw new Error(`two runners on one base after ${ev}: ${bases.join(',')}`) }
    if (s.half !== before) upNow = snap(s)
  }
  while (s.inning <= 7 && guard++ < 400) {
    recorder()
    const side = offense(s)
    // before the first pitch: runners move
    if (s.runners.length && r() < 0.15) { runnerPlay(); continue }
    if (side === 'opp' && r() < 0.03) s = addExtra(s, 'wp')
    if (side === 'opp' && r() < 0.03 && s.pitching.length > 10) s = changePitcher(s, pick(['子', '丑']))
    if (side === 'us' && r() < 0.04) s = substitute(s, s.slot, pick(['癸', '寅', '卯']), 'PH')
    // one plate appearance, pitch by pitch
    let result: string | null = null
    const half = s.half
    for (let k = 0; k < 15 && !result; k++) {
      // between pitches: a steal, a wild pitch… (the half may end on it, and this batter never finishes)
      if (s.pitches.length && s.runners.length && r() < 0.08) { runnerPlay(); if (s.half !== half) break }
      const x = r()
      const code = x < 0.35 ? 'B' : x < 0.55 ? 'CS' : x < 0.68 ? 'SS' : x < 0.8 ? 'F' : 'IP'
      if (code === 'IP') { result = pick(['一安', '一安', '二安', '三安', '全壘打', '內滾', '內滾', '內飛', '外飛', '外飛', '界外飛', '犧飛', '犧觸', '雙殺', '野選', '失誤']); break }
      s = addPitch(s, code)
      result = impliedResult(s.pitches)
    }
    if (s.half !== half) continue
    if (!result) result = r() < 0.5 ? '觸身' : '故四'
    // results that need runners / outs to make sense
    if ((result === '犧飛' && !s.runners.some((x) => x.base === 3)) || (result === '犧觸' && !s.runners.length) || (result === '雙殺' && (s.outs >= 2 || !s.runners.some((x) => x.base === 1))) || (result === '野選' && !s.runners.length)) result = '內滾'
    if (result === '犧飛' && s.outs >= 2) result = '外飛'
    const plan = defaultPlan(s, result)
    const bad = planProblems(s, plan)
    if (bad.length) throw new Error(`default plan for ${result}: ${bad.join('; ')}`)
    if (FIELDER[result]) plan.loc = pick(FIELDER[result])
    else if (['一安', '二安', '三安'].includes(result)) plan.loc = pick([7, 8, 9, 56, 46])
    else if (result === '全壘打') plan.loc = pick([7, 8, 9])
    plan.traj = result === '內滾' || result === '雙殺' || result === '野選' || result === '犧觸' ? 'G' : ['外飛', '犧飛', '界外飛', '內飛', '全壘打'].includes(result) ? 'F' : ['一安', '二安', '三安', '失誤'].includes(result) ? pick(['G', 'L', 'F']) : undefined
    // 不死三振: sometimes the batter reaches
    if (result === '三振' && count(s.pitches).strikes >= 3 && !s.runners.some((x) => x.base === 1) && r() < 0.1) plan.batter = 1 as Dest
    const sideKey = offense(s) === 'us' ? 'bat' : 'pit'
    truth[sideKey].set(sideKey === 'bat' ? s.batting.length : s.pitching.length, snap(s))
    start[sideKey].set(sideKey === 'bat' ? s.batting.length : s.pitching.length, upNow)
    if (sideKey === 'bat') want.bat[s.batting.length] = fields(oppNow)
    else want.pit[s.pitching.length] = names ? lineupNow[s.oppOrder - 1] || undefined : undefined
    s = commitPA(s, plan)
    upNow = snap(s)
    const bases = s.runners.map((x) => x.base)
    if (new Set(bases).size !== bases.length) throw new Error(`two runners on one base after ${result}: ${bases.join(',')}`)
  }
  if (s.outs || s.runners.length) s = endHalf(s)
  s = stampTimes(stamped, s, new Date((clock += 60000)).toISOString())
  return { ...s, finished: true, truth, start, expect: want, names }
}
