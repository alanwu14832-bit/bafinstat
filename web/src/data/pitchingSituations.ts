/**
 * Pitching numbers that need a whole game (every row, in recorded order) and the score, not just one row:
 *
 * - 繼承跑者 (IR) / 回來得分 (IRS): runners on base when a reliever came in mid-inning, and how many of them scored
 *   while he pitched. The runs stay on the earlier pitcher's rows (R / ER do not move).
 * - 救援失敗 (BS): he came in with a save situation (lead of 1–3, or the tying run on base, at bat or on deck — MLB
 *   9.19(c)(1)–(2); the 3-inning clause is not used) and the opponent tied or went ahead while he pitched.
 * - 中繼建議: relievers who came in with a save situation, got at least one out, did not finish the game and left
 *   still ahead (MLB's hold, only a hint: the recorder ticks 中繼 himself).
 * - 首打者出局, 三上三下, 13 球內結束的局: per half-inning.
 *
 * Runners come from the runner timeline (record/timeline.ts). Older imports without 壘上(前) / 出局(前) cannot place a
 * mid-inning change: those entries are not judged (`sure` false) and are counted as gaps instead. A pitcher who starts
 * a half inherits nobody — which also keeps 突破僵局 runners from counting as inherited.
 *
 * Imports only data/types and the record helpers (no cycle with stats.ts, which merges these into PitchingLine).
 */
import { isPA, isPlaced, PITCH_CODES, type Game, type HomeAway, type PitchingPA } from './types'
import { batterEndFor, inferAll, inningsOf, outsIn } from '../record/timeline'
import { runsIn } from '../record/earned'
import type { PitchingLine } from './stats'

export interface ReliefEntry {
  pitcher: string
  /** the row (index into the game's rows) he came in on */
  row: number
  inning: number
  /** outs and runners on base when he came in */
  outs: number
  runners: number
  /** our lead when he came in (null without the score, or when it cannot be told) */
  lead: number | null
  saveSituation: boolean
  /** inherited runners / of those, scored while he pitched */
  ir: number
  irs: number
  /** 救援失敗: the tying run scored (or they went ahead) while he pitched, from a save situation */
  blown: boolean
  /** outs while he pitched */
  outsMade: number
  /** our lead when the next pitcher came in (null if unknown, or he finished the game) */
  leadAtExit: number | null
  /** he was the last pitcher of the game */
  finished: boolean
  /** false: the change cannot be placed in the inning (no runners recorded), so nothing above is judged (one gap) */
  sure: boolean
}

export interface Score { homeAway: HomeAway; ourLine: number[] }

const OUT_NO: Record<string, number> = { I: 1, II: 2, III: 3 }
const scoredRow = (r: PitchingPA) => r.code === 'R' || r.code === 'ER'

/** Every relief appearance of one game (the starter's first stint is none), in order. */
export function reliefEntries(rows: PitchingPA[], score?: Score): ReliefEntry[] {
  if (!rows.length) return []
  const weTop = score?.homeAway === '客'
  const ourLine = score?.ourLine ?? []
  const halves = inferAll(rows, 'pit')
  const innings = inningsOf(rows)
  const entries: ReliefEntry[] = []
  const inherited = new Map<ReliefEntry, Set<number>>()
  let cur = rows.find((r) => r.pitcher)?.pitcher ?? ''
  let e = null as ReliefEntry | null
  // (read through a function: TypeScript does not see `take` reassigning it)
  const now = () => e
  let us = 0, them = 0
  /** `exitKnown` false: the change falls inside a half without runners recorded, so the score when he left is unknown */
  const take = (p: string, row: number, inning: number, outs: number, on: number[], sure: boolean, exitKnown = true) => {
    if (e) e.leadAtExit = exitKnown && e.sure && score ? us - them : null
    const lead = sure && score ? us - them : null
    const next: ReliefEntry = {
      pitcher: p, row, inning, outs, runners: on.length, lead, saveSituation: lead !== null && lead > 0 && (lead <= 3 || lead <= on.length + 2),
      ir: on.length, irs: 0, blown: false, outsMade: 0, leadAtExit: null, finished: false, sure,
    }
    entries.push(next); inherited.set(next, new Set(on))
    e = next; cur = p
  }
  const blownCheck = () => { if (e && e.sure && e.saveSituation && !e.blown && us - them <= 0) e.blown = true }
  const last = Math.max(...rows.map((r) => r.inning), ourLine.length)
  for (let inning = 1; inning <= last; inning++) {
    if (weTop) us += ourLine[inning - 1] ?? 0
    const idx = innings.get(inning)
    const half = halves.get(inning)
    if (idx && half) {
      let outs = 0
      half.steps.forEach((st, j) => {
        const p = rows[st.index].pitcher
        if (p && p !== cur) take(p, st.index, inning, outs, j === 0 ? [] : st.before.map((o) => o.row), true)
        for (const row of runsIn(st)) { them++; if (e && inherited.get(e)!.has(row)) e.irs++ }
        const n = outsIn(st)
        outs += n
        if (e) e.outsMade += n
        blownCheck()
      })
    } else if (idx) {
      // No runner timeline: a change on the half's first row is still clear; one later in the half is not. Only the
      // entry made by that later change is unsure (one gap per change). The pitcher he replaces keeps what was already
      // settled (a blown save in an earlier inning, his inherited runners); what happened in this half before he left
      // (and so his lead at exit, which hold suggestions need) is unknown and left out.
      const first = rows[idx[0]]
      if (first.pitcher && first.pitcher !== cur) take(first.pitcher, idx[0], inning, 0, [], true)
      for (const i of idx) {
        const r = rows[i]
        if (r.pitcher && r.pitcher !== cur) {
          const bases = (r.basesBefore ?? '').replace(/[^123]/g, '')
          take(r.pitcher, i, inning, r.outsBefore ?? 0, [], false, false)
          now()!.runners = new Set(bases).size
        }
        if (scoredRow(r)) them++
        const x = now()
        if (x && OUT_NO[r.code ?? '']) x.outsMade++
      }
      blownCheck()
    }
    if (!weTop) us += ourLine[inning - 1] ?? 0
  }
  const lastEntry = now()
  if (lastEntry) lastEntry.finished = true
  return entries
}

export interface Situations { leadoffBf: number; leadoffOuts: number; fullInn: number; pitchInn: number; inn13: number; inn123: number; ir: number; irs: number; bs: number; gaps: number }
const empty = (): Situations => ({ leadoffBf: 0, leadoffOuts: 0, fullInn: 0, pitchInn: 0, inn13: 0, inn123: 0, ir: 0, irs: 0, bs: 0, gaps: 0 })
const PITCHES = new Set<string>(PITCH_CODES)
const emptyBases = (b?: string) => !b || b === '無' || b === '0'

/**
 * Per pitcher, over whole games (`pas` = every row of each game, in recorded order): leadoff batters faced / put out,
 * half-innings he pitched alone to three outs (of those: with every batter's pitches recorded (pitchInn) and of these in
 * ≤ 13 pitches, and 1-2-3: exactly three batters, all out, starting with the bases empty), inherited runners / scored, blown saves, and relief entries that could not be judged.
 * Inherited runners and blown saves need the score (`ourRuns`, our runs by inning per game id): without it there are
 * no save situations, so no blown saves.
 */
export function pitcherSituations(pas: PitchingPA[], games: Game[], ourRuns?: Map<string, number[]>): Map<string, Situations> {
  const out = new Map<string, Situations>()
  const of = (name: string) => out.get(name) ?? out.set(name, empty()).get(name)!
  const byGame = new Map<string, PitchingPA[]>()
  for (const p of pas) (byGame.get(p.gameId) ?? byGame.set(p.gameId, []).get(p.gameId)!).push(p)
  const gameOf = new Map(games.map((g) => [g.id, g]))
  for (const [id, rows] of byGame) {
    const halves = inferAll(rows, 'pit')
    for (const [inning, idx] of inningsOf(rows)) {
      const half = halves.get(inning) ?? null
      const stepOf = new Map((half?.steps ?? []).map((st) => [st.index, st]))
      const batterOut = (i: number) => (half ? stepOf.get(i)?.batter === 'out' : batterEndFor(rows[i].result) === 'out' && !!OUT_NO[rows[i].code ?? ''])
      const pa = idx.filter((i) => isPA(rows[i]))
      if (pa.length) {
        const first = rows[pa[0]]
        if (first.pitcher) { const x = of(first.pitcher); x.leadoffBf++; if (batterOut(pa[0])) x.leadoffOuts++ }
      }
      const p0 = rows[idx[0]].pitcher
      const one = !!p0 && idx.every((i) => rows[i].pitcher === p0)
      const outs = half ? half.steps.reduce((a, st) => a + outsIn(st), 0) : Math.max(0, ...idx.map((i) => OUT_NO[rows[i].code ?? ''] ?? 0))
      if (one && outs >= 3) {
        const x = of(p0)
        x.fullInn++
        // 13 球內 only where every batter's pitches were recorded (an Excel import without 球1… would read as 0 pitches);
        // a 故四 can be given without a pitch
        const known = (i: number) => rows[i].pitches.filter((c) => PITCHES.has(c)).length
        if (pa.every((i) => known(i) > 0 || rows[i].result === '故四') && pa.some((i) => known(i) > 0)) {
          x.pitchInn++
          if (idx.reduce((a, i) => a + known(i), 0) <= 13) x.inn13++
        }
        const placed = idx.some((i) => isPlaced(rows[i]))
        const startEmpty = pa.length ? (half ? stepOf.get(pa[0])?.before.length === 0 : emptyBases(rows[pa[0]].basesBefore)) : false
        if (!placed && pa.length === 3 && pa.every(batterOut) && startEmpty) x.inn123++
      }
    }
    const g = gameOf.get(id)
    const line = ourRuns?.get(id)
    for (const en of reliefEntries(rows, g && line ? { homeAway: g.homeAway, ourLine: line } : undefined)) {
      if (!en.pitcher) continue
      const x = of(en.pitcher)
      if (en.sure) { x.ir += en.ir; x.irs += en.irs; if (en.blown) x.bs++ }
      else x.gaps++
    }
  }
  return out
}

/** Our runs by inning in one game, from its batting rows (= summarizeGame's lineUs), for 紀錄比賽 and 修改資料. */
export function runsByInning(batting: Array<{ inning: number; run: number }>): number[] {
  const n = Math.max(0, ...batting.map((p) => p.inning))
  const line = Array.from({ length: n }, () => 0)
  for (const p of batting) if (p.inning >= 1) line[p.inning - 1] += p.run
  return line
}

/** 中繼 suggestions: save situation, at least one out, not blown, did not finish, still ahead when he left — minus the
 *  pitchers in `exclude` (勝投, 救援). */
export function holdCandidates(entries: ReliefEntry[], exclude: Array<string | undefined>): string[] {
  const no = new Set(exclude.filter(Boolean))
  const out: string[] = []
  for (const e of entries) {
    if (!e.sure || !e.saveSituation || e.blown || e.outsMade < 1 || e.finished || e.leadAtExit === null || e.leadAtExit <= 0) continue
    if (no.has(e.pitcher) || out.includes(e.pitcher)) continue
    out.push(e.pitcher)
  }
  return out
}

/** The 投球 lines of a game's notes (比賽附註): 滾地－飛球出局, 繼承跑者－回來得分, 救援失敗, 三上三下, and the gap note.
 *  Empty lines are left out. */
export function pitchingNotes(lines: PitchingLine[]): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = []
  const add = (label: string, parts: string[]) => { if (parts.length) out.push({ label, text: parts.join('、') }) }
  add('滾地－飛球出局', lines.filter((l) => l.go + l.ao > 0).map((l) => `${l.name} ${l.go}-${l.ao}`))
  add('繼承跑者－回來得分', lines.filter((l) => l.ir > 0).map((l) => `${l.name} ${l.ir}-${l.irs}`))
  add('救援失敗', lines.filter((l) => l.bs > 0).map((l) => (l.bs > 1 ? `${l.name} ${l.bs}` : l.name)))
  add('三上三下', lines.filter((l) => l.inn123 > 0).map((l) => `${l.name} ${l.inn123} 局`))
  const gaps = lines.reduce((a, l) => a + l.sitGaps, 0)
  if (gaps > 0) out.push({ label: '換投紀錄', text: `這場有 ${gaps} 次換投的跑者紀錄不完整，繼承跑者與救援失敗沒有判斷` })
  return out
}
