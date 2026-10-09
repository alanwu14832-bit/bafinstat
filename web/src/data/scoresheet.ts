/**
 * One side of one game as a scoresheet: batting-order slots × innings. Each cell is one plate appearance (or a
 * tie-break runner, or a 代跑's entry) with both renderings the site needs — the NPB-style 逐局表 text 「中安②」
 * (gridCell) and the traditional scorer's mark 「1B8」 with the runner's path round the diamond, for the printed
 * scoresheet. The path comes from the runner timeline (record/timeline) when the inning can be followed; otherwise
 * from the row alone (scored → home, a reach result → its base), and the inning is listed in `unfollowed`.
 */
import { inferAll, inningsOf, placedBases, scored as scoredRow, batterEndFor, type End, type Side } from '../record/timeline'
import { REACH_RESULTS } from '../record/model'
import { countBefore, gridCell, type GridTone } from './gameText'
import { oppKey } from './opponent'
import { isHitResult, pitchTotals } from './stats'
import { isPlaced, type BattingPA, type DayRosterSub, type PitchingPA } from './types'

type Row = BattingPA | PitchingPA

export interface SheetPlayer { name: string; pos?: string; /** a defensive replacement who never batted in this slot (shown 「（守備）」) */ sub?: boolean }
export interface SheetCell {
  /** index of the row in the rows given (for 'pr' cells: the row the runner ran for) */
  row: number
  player: string
  kind: 'pa' | 'placed' | 'pr'
  /** 逐局表 text 「中安②」, its tone and the full sentence */
  text: string
  tone: GridTone
  title: string
  /** scorer's mark: 1B8, K, G6, F8, BB, HR78… */
  mark: string
  /** a strikeout looking (last pitch a called strike) */
  looking?: boolean
  /** the out number this row carries (I / II / III) */
  out?: 1 | 2 | 3
  /** the furthest base reached: 0 none, 1–3, 4 home */
  reached: number
  /** put out on the bases running to this base (× on the line into it) */
  outAt?: number
  scored: boolean
  /** (opponent) the run was earned */
  earned?: boolean
  left: boolean
  rbi: number
  count: { balls: number; strikes: number } | null
  pitches: number
  notes: string[]
  /** (opponent) our pitcher changed before this batter: the new pitcher */
  pitcherChange?: string
}
export interface SheetLine { order: number | null; players: SheetPlayer[]; cells: Record<number, SheetCell[]> }
export interface InningTotals { r: number; h: number; e: number | null; lob: number }
export interface Scoresheet {
  innings: number
  lines: SheetLine[]
  perInning: Record<number, InningTotals>
  totals: InningTotals & { pa: number; ab: number; rbi: number }
  /** innings drawn from the rows alone (no runner timeline) */
  unfollowed: number[]
}

const OUT_NO: Record<string, 1 | 2 | 3> = { I: 1, II: 2, III: 3 }
const NON_AB = new Set(['保送', '故四', '觸身', '犧觸', '犧牲', '犧飛', '妨礙'])
const PLAY_ABBR: Record<string, string> = { sb: 'SB', cs: 'CS', wp: 'WP', pb: 'PB', pk: 'PK', err: 'E', bk: 'BK' }

/** The scorer's mark of a result (loc = 落點 code, blank when not recorded). */
export function scoreMark(result: string, loc?: number, traj?: string, pitches: string[] = []): { mark: string; looking?: boolean } {
  const l = loc ? String(loc) : ''
  switch (result) {
    case '一安': case '內安': return { mark: `1B${l}` }
    case '二安': case '場地二安': return { mark: `2B${l}` }
    case '三安': return { mark: `3B${l}` }
    case '全壘打': return { mark: `HR${l}` }
    case '保送': return { mark: 'BB' }
    case '故四': return { mark: 'IBB' }
    case '觸身': return { mark: 'HBP' }
    case '妨礙': return { mark: 'CI' }
    case '三振': return { mark: 'K', looking: pitches[pitches.length - 1] === 'CS' }
    case '內滾': return { mark: `G${l}` }
    case '內飛': return { mark: `P${l}` }
    case '外飛': return { mark: `${traj === 'L' ? 'L' : 'F'}${l}` }
    case '界外飛': return { mark: `FF${l}` }
    case '雙殺': return { mark: `DP${l}` }
    case '野選': return { mark: `FC${l}` }
    case '失誤': return { mark: `E${l}` }
    case '犧觸': case '犧牲': return { mark: `SAC${l}` }
    case '犧飛': return { mark: `SF${l}` }
    case '突破僵局': return { mark: 'TB' }
    default: return { mark: result }
  }
}

const endBase = (e: End): number => (e === 'home' ? 4 : e === 'out' ? 0 : e)

/**
 * Build one side's scoresheet. `rows`: this game's rows of that side in recorded order (our batting for 'bat', our
 * pitching = their batting for 'pit'). `innings`: the scheduled length (the grid shows at least that many).
 * `subs`: the game's dayRoster.subs, so a defensive replacement who never batted still gets his slot line.
 */
export function buildScoresheet(rows: Row[], side: Side, opts: { innings: number; subs?: DayRosterSub[] }): Scoresheet {
  const halves = inferAll(rows, side)
  const unfollowed: number[] = []
  const notes = rows.map(() => [] as string[])
  const path = rows.map(() => ({ reached: 0, outAt: undefined as number | undefined }))

  for (const [inning, idx] of inningsOf(rows)) {
    const half = halves.get(inning)
    if (half) {
      // each runner's own way round: his step's end, then his later moves and destinations
      for (const st of half.steps) for (const m of st.moves) if (PLAY_ABBR[m.kind]) notes[m.row].push(PLAY_ABBR[m.kind])
      // steals typed as counts only (a workbook's 盜壘 with no 跑壘事件): the moves miss them, so add what is left over
      if (side === 'bat') for (const k of idx) {
        const b = rows[k] as BattingPA
        const have = (abbr: string) => notes[k].filter((n) => n === abbr).length
        for (let n = have('SB'); n < (b.sb ?? 0); n++) notes[k].push('SB')
        for (let n = have('CS'); n < (b.cs ?? 0); n++) notes[k].push('CS')
      }
      half.steps.forEach((st, j) => {
        const k = st.index
        const r = rows[k]
        let reached = 0, outAt: number | undefined
        const go = (e: End) => {
          if (outAt !== undefined || reached >= 4) return
          if (e === 'out') { if (reached >= 1) outAt = reached + 1; return }
          reached = Math.max(reached, endBase(e))
        }
        if (st.batter === 'out' && isHitResult(r.result)) { const b = endBase(batterEndFor(r.result)); reached = b; outAt = b + 1 }
        else go(st.batter)
        for (const later of half.steps.slice(j + 1)) {
          for (const m of later.moves) if (m.row === k) go(m.to)
          if (later.dest[k] !== undefined) go(later.dest[k])
        }
        path[k] = { reached, outAt }
      })
      continue
    }
    unfollowed.push(inning)
    const placed = placedBases(rows, idx)
    for (const k of idx) {
      const r = rows[k]
      for (const e of r.events ?? []) if (!e.play && PLAY_ABBR[e.kind]) notes[k].push(PLAY_ABBR[e.kind])
      if (side === 'bat' && !(r.events ?? []).length) {
        const b = r as BattingPA
        for (let n = 0; n < b.sb; n++) notes[k].push('SB')
        for (let n = 0; n < b.cs; n++) notes[k].push('CS')
      }
      let reached = 0, outAt: number | undefined
      if (scoredRow(r, side)) reached = 4
      else if (isPlaced(r)) reached = placed[k] ?? 2
      else if (REACH_RESULTS.has(r.result) || (r.result === '三振' && !OUT_NO[r.code ?? ''])) reached = r.result === '三振' ? 1 : endBase(batterEndFor(r.result))
      if (reached >= 1 && reached < 4 && OUT_NO[r.code ?? '']) outAt = reached + 1
      path[k] = { reached, outAt }
    }
  }

  const innings = Math.max(opts.innings || 0, ...rows.map((r) => r.inning), 1)
  const perInning: Record<number, InningTotals> = {}
  const anyErrors = side === 'pit' && rows.some((r) => Array.isArray((r as PitchingPA).errors))
  for (let i = 1; i <= innings; i++) perInning[i] = { r: 0, h: 0, e: side === 'pit' && !anyErrors ? null : 0, lob: 0 }
  const totals = { r: 0, h: 0, e: side === 'pit' && !anyErrors ? null as number | null : 0, lob: 0, pa: 0, ab: 0, rbi: 0 }

  const slotOf = (r: Row): number | null => (side === 'bat' ? (r as BattingPA).order : (r as PitchingPA).oppOrder) ?? null
  const lines = new Map<number | null, SheetLine>()
  const lineFor = (slot: number | null) => { let l = lines.get(slot); if (!l) { l = { order: slot, players: [], cells: {} }; lines.set(slot, l) } return l }
  const addPlayer = (l: SheetLine, p: SheetPlayer) => { if (!l.players.some((x) => x.name === p.name)) l.players.push(p) }
  const prDone = new Set<string>()

  rows.forEach((r, k) => {
    const t = perInning[r.inning] ?? (perInning[r.inning] = { r: 0, h: 0, e: 0, lob: 0 })
    const run = side === 'bat' ? (r as BattingPA).run : r.code === 'R' || r.code === 'ER' ? 1 : 0
    t.r += run; totals.r += run
    if (isHitResult(r.result)) { t.h++; totals.h++ }
    const e = side === 'bat' ? (r.result === '失誤' || r.result === '妨礙' ? 1 : 0) : ((r as PitchingPA).errors?.length ?? 0)
    if (t.e !== null) t.e += e
    if (totals.e !== null) totals.e += e
    if (r.code === 'L') { t.lob++; totals.lob++ }
    const placedRow = isPlaced(r)
    if (!placedRow && r.result) { totals.pa++; if (!NON_AB.has(r.result)) totals.ab++ }
    const rbi = side === 'bat' ? (r as BattingPA).rbi ?? 0 : 0
    totals.rbi += rbi

    const slot = slotOf(r)
    const line = lineFor(slot)
    const name = side === 'bat' ? (r as BattingPA).batter : oppKey(r as PitchingPA)
    addPlayer(line, side === 'bat' ? { name, pos: (r as BattingPA).pos } : { name })
    const g = gridCell({ ...r, rbi })
    const { mark, looking } = scoreMark(r.result, r.loc, r.traj, r.pitches)
    const runner = side === 'bat' ? (r as BattingPA).runner : undefined
    const cellNotes = [...(runner && runner !== name ? [`代跑 ${runner}`] : []), ...notes[k]]
    const prev = k > 0 ? rows[k - 1] : undefined
    const cell: SheetCell = {
      row: k, player: name, kind: placedRow ? 'placed' : 'pa', text: g.text, tone: g.tone, title: g.title, mark,
      ...(looking ? { looking } : {}), ...(OUT_NO[r.code ?? ''] ? { out: OUT_NO[r.code!] } : {}),
      reached: path[k].reached, ...(path[k].outAt !== undefined ? { outAt: path[k].outAt } : {}),
      scored: scoredRow(r, side), ...(side === 'pit' ? { earned: r.code === 'ER' } : {}), left: r.code === 'L', rbi,
      count: countBefore(r.pitches, r.result), pitches: pitchTotals(r.pitches).pitches, notes: cellNotes,
      ...(side === 'pit' && prev && (prev as PitchingPA).pitcher !== (r as PitchingPA).pitcher ? { pitcherChange: (r as PitchingPA).pitcher } : {}),
    }
    ;(line.cells[r.inning] ??= []).push(cell)
    // a pinch runner's entry: once per inning, in the slot he ran for
    if (runner && runner !== name && !prDone.has(`${runner}\u0000${r.inning}`)) {
      prDone.add(`${runner}\u0000${r.inning}`)
      addPlayer(line, { name: runner, pos: '代跑' })
      line.cells[r.inning].push({ row: k, player: runner, kind: 'pr', text: '代跑', tone: 'other', title: `代跑（替 ${name}）`, mark: 'PR', reached: 0, scored: false, left: false, rbi: 0, count: null, pitches: 0, notes: [] })
    }
  })
  // defensive replacements who never batted: listed under their slot
  if (side === 'bat') for (const s of opts.subs ?? []) {
    // DayRosterSub.slot is the lineup index (0 = leadoff), as record/model substitute() stores it; lines use the order
    if (s.kind !== 'DEF' || s.slot === undefined || s.slot < 0 || !s.in) continue
    addPlayer(lineFor(s.slot + 1), { name: s.in, pos: s.pos || undefined, sub: true })
  }

  const ordered = [...lines.values()].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9))
  return { innings: Math.max(innings, ...Object.keys(perInning).map(Number)), lines: ordered, perInning, totals, unfollowed }
}
