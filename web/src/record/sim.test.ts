/**
 * Plays many random but legal games through the 紀錄比賽 model (pitch by pitch, runners stealing and getting
 * caught, substitutions, pitching changes) and checks that what gets saved is consistent: the audit finds nothing
 * to flag, saving raises no review warnings, and the saved game shows the same score as the live scoreboard.
 */
import { describe, expect, it } from 'vitest'
import {
  addError, addExtra, addPitch, changePitcher, commitPA, count, defaultPlan, endHalf, impliedResult, newGame, offense, planProblems, runnerEvent, score, substitute, toGameEdit,
  type Dest, type RecordState,
} from './model'
import { auditGame } from '../data/audit'
import { normalizeGameEdit } from '../data/edit'
import { summarizeGame } from '../data/stats'
import type { Game, Player } from '../data/types'
import { deriveHalf, inferHalf, inningsOf, type OnBase } from './timeline'

function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '子', '丑', '寅', '卯']
const roster: Player[] = NAMES.map((name) => ({ name, status: '現役' }))
const POS = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P']
const FIELDER: Record<string, number[]> = { 內滾: [1, 3, 4, 5, 6], 內飛: [1, 2, 3, 4, 5, 6], 外飛: [7, 8, 9], 界外飛: [2, 3, 5, 7, 9], 犧飛: [7, 8, 9], 犧觸: [1, 2, 3, 5], 雙殺: [4, 5, 6], 野選: [1, 4, 5, 6], 失誤: [4, 5, 6, 7, 8, 9] }

function playGame(seed: number) {
  const r = rng(seed)
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const game: Game = { id: `G2026010${seed % 9 + 1}-01`, date: '2026-01-01', tournament: '模擬', opponent: '對手', homeAway: r() < 0.5 ? '主' : '客', innings: 7 }
  let s: RecordState = newGame(game, NAMES.slice(0, 9).map((name, i) => ({ name, pos: POS[i] })), '壬', { bench: NAMES.slice(9) })
  let guard = 0
  // ground truth for the timeline: who was on base (row, base) when each plate appearance was sent
  const truth = { bat: new Map<number, OnBase[]>(), pit: new Map<number, OnBase[]>() }
  while (s.inning <= 7 && guard++ < 400) {
    const side = offense(s)
    // between pitches: runners move
    if (s.runners.length && r() < 0.15) {
      const run = pick(s.runners)
      const ev = pick(['sb', 'cs', 'wp', 'pb', 'err', 'pk', 'advance'] as const)
      if (!(ev === 'err' && side === 'opp') && !((ev === 'wp' || ev === 'pb') && side === 'us')) s = runnerEvent(s, run.row, run.side, ev)
      if (ev === 'err' && side === 'opp') s = addError(s, pick(['SS', 'LF', '2B']))
      { const bases = s.runners.map((x) => x.base); if (new Set(bases).size !== bases.length) throw new Error(`two runners on one base after ${ev}: ${bases.join(',')}`) }
      continue
    }
    if (side === 'opp' && r() < 0.03) s = addExtra(s, 'wp')
    if (side === 'opp' && r() < 0.03 && s.pitching.length > 10) s = changePitcher(s, pick(['子', '丑']))
    if (side === 'us' && r() < 0.04) s = substitute(s, s.slot, pick(['癸', '寅', '卯']), 'PH')
    // one plate appearance, pitch by pitch
    let result: string | null = null
    for (let k = 0; k < 15 && !result; k++) {
      const x = r()
      const code = x < 0.35 ? 'B' : x < 0.55 ? 'CS' : x < 0.68 ? 'SS' : x < 0.8 ? 'F' : 'IP'
      if (code === 'IP') { result = pick(['一安', '一安', '二安', '三安', '全壘打', '內滾', '內滾', '內飛', '外飛', '外飛', '界外飛', '犧飛', '犧觸', '雙殺', '野選', '失誤']); break }
      s = addPitch(s, code)
      result = impliedResult(s.pitches)
    }
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
    truth[sideKey].set(sideKey === 'bat' ? s.batting.length : s.pitching.length, s.runners.map((x) => ({ row: x.row, base: x.base })).sort((a, b) => b.base - a.base))
    s = commitPA(s, plan)
    const bases = s.runners.map((x) => x.base)
    if (new Set(bases).size !== bases.length) throw new Error(`two runners on one base after ${result}: ${bases.join(',')}`)
  }
  if (s.outs || s.runners.length) s = endHalf(s)
  return { ...s, finished: true, truth }
}

describe('random games through the recording model', () => {
  const seeds = Array.from({ length: 150 }, (_, i) => i + 1)
  it.each(seeds)('game %i saves cleanly', (seed) => {
    const s = playGame(seed)
    const issues = auditGame(s.batting, s.pitching).map((i) => i.message)
    expect(issues).toEqual([])
    const edit = toGameEdit(s)
    const { fragment, warnings } = normalizeGameEdit(roster, edit)
    const msgs = warnings.map((w) => w.message).filter((m) => !m.startsWith('沒有守備紀錄') && !m.startsWith('刺殺／助殺由投球紀錄推定'))
    expect(msgs).toEqual([])
    const sum = summarizeGame(fragment, fragment.games[0])
    const live = score(s)
    expect([sum.runsUs, sum.runsOpp]).toEqual([live.us, live.opp])
  })
})

describe('the runner timeline rebuilt from saved rows', () => {
  const seeds = Array.from({ length: 150 }, (_, i) => i + 1)
  it.each(seeds)('game %i: who was on base each plate appearance, and writing it back changes nothing', (seed) => {
    const g = playGame(seed)
    for (const side of ['bat', 'pit'] as const) {
      const rows = side === 'bat' ? g.batting : g.pitching
      let derived: Array<(typeof rows)[number]> = rows.slice()
      for (const [inning, idx] of inningsOf(rows)) {
        const half = inferHalf(rows, idx, side)
        expect(half, `${side} inning ${inning}`).not.toBeNull()
        for (const st of half!.steps) expect(st.before, `${side} PA ${st.index}`).toEqual(g.truth[side].get(st.index))
        derived = deriveHalf(derived as never[], half!, side)
      }
      const pick = (r: (typeof rows)[number]) => JSON.stringify(r, ['basesBefore', 'outsBefore', 'run', 'code', 'outOnBase', 'cs'])
      expect(derived.map(pick)).toEqual(rows.map(pick))
    }
  })
})
