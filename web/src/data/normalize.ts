/**
 * Normalize + validate a dataset so every import path (master workbook, new
 * single-game template, legacy single-game sheet, cloud rows) yields the same
 * numbers. Idempotent: running it twice changes nothing.
 *
 *  - fills missing 局 / 出局(前) from the I/II/III outcome codes (same rule as the legacy converter)
 *  - maps legacy vocab (犧牲 → 犧觸), trims/upper-cases codes, parses 落點 text
 *  - runs always come from the 得分 column; a mismatch with the R code only produces a warning
 *  - derives fielding lines for a game that has none (everyone who took a fielding position in the batting log,
 *    errors from the opponent's 失誤 rows by batted-ball location, pitchers' innings from their outs)
 *  - credits putouts / assists / double plays from the pitching log when a game has none recorded
 *    (三振→捕手 PO；滾地→守位 A＋一壘 PO；飛球→守位 PO；雙殺→守位 A、樞紐 PO+A、一壘 PO；野選→守位 A；阻殺→捕手 A；牽制→投手 A＋一壘 PO)
 *  - credits 被盜壘 / 阻殺 / 捕逸 to whoever was catching (當日登錄名單) when a game has none recorded
 *  - fills game.innings when blank, and returns human-readable warnings per game
 *  - 對方投手 (L / R, name) and 對方打者 and 對方代跑 trimmed and dropped when blank, 結束時間 as 'HH:MM' · 對方打者左右打 L / R (anything else dropped)
 */
import { isUnfinished, LOC_CODES, LOC_HOLES, POSITION_BY_NUMBER, type BattingPA, type Dataset, type FieldingLine, type Game, type OppBats, type OppHand, type PitchingPA, type Player, type PriorPitch, type SubCharges } from './types'
import { auditGame, type AuditPlace } from './audit'
import { outsCredited } from './stats'
import { cleanErrors, cleanOppErrors, errorsOf } from './errors'
import { CHARGE_COUNTS, defenseTimeline, parseDayRoster, type DefenseStop } from './gameRoster'
import { cleanTime } from './gameTime'

const OUT_CODES: Record<string, number> = { I: 1, II: 2, III: 3 }
const REACH = new Set(['一安', '內安', '二安', '場地二安', '三安', '保送', '故四', '觸身', '失誤', '野選', '妨礙'])
const RESULT_ALIASES: Record<string, string> = { 界外飛球: '界外飛', 界外飛出局: '界外飛', 界外接殺: '界外飛', 犧牲: '犧觸', 犧打: '犧觸', 犧牲觸擊: '犧觸', 犧牲飛球: '犧飛', 全壘: '全壘打', 四壞: '保送', 故意四壞: '故四', 死球: '觸身', 觸身球: '觸身', 雙殺打: '雙殺', 不死三振: '三振', 突破僵局跑者: '突破僵局' }
const NON_FIELD = new Set(['DH', 'PH', 'PR', ''])

export interface GameWarning { gameId: string; message: string }

const cleanResult = (r: string) => { const t = (r ?? '').trim(); return RESULT_ALIASES[t] ?? t }
const cleanCode = (c?: string) => { const t = (c ?? '').trim().toUpperCase(); return t || undefined }
const cleanPitch = (p: string) => p.trim().toUpperCase()
const HOLE_BY_NAME: Record<string, number> = Object.fromEntries(Object.entries(LOC_HOLES).map(([k, v]) => [v, Number(k)]))
/** 落點: a fielder number 1–9, a gap code (56 / 46 / 34 / 78 / 89) or its name (三游 …); anything else is dropped. */
export const cleanLoc = (v: unknown): number | undefined => {
  const t = String(v ?? '').trim()
  if (!t) return undefined
  if (HOLE_BY_NAME[t]) return HOLE_BY_NAME[t]
  const m = /([1-9]{1,2})/.exec(t)
  if (!m) return undefined
  const n = Number(m[1])
  if (LOC_CODES.includes(n)) return n
  const first = Number(m[1][0])
  return first >= 1 && first <= 9 ? first : undefined
}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const HANDS: Record<string, OppHand> = { l: 'L', 左: 'L', 左投: 'L', 左手: 'L', lhp: 'L', left: 'L', r: 'R', 右: 'R', 右投: 'R', 右手: 'R', rhp: 'R', right: 'R' }
/** 對方投手慣用: L / 左 / 左投 / LHP / left → 'L', the same for R; anything else is unknown (undefined). */
export function cleanHand(v: unknown): OppHand | undefined {
  if (typeof v !== 'string') return undefined
  return HANDS[v.trim().toLowerCase()]
}

const BATS: Record<string, OppBats> = { l: 'L', 左: 'L', 左打: 'L', lhb: 'L', left: 'L', r: 'R', 右: 'R', 右打: 'R', rhb: 'R', right: 'R' }
/** 對方打者左右打: L / 左 / 左打 / LHB / left → 'L', the same for R; anything else (不知道, blank) is unknown (undefined). */
export function cleanBats(v: unknown): OppBats | undefined {
  if (typeof v !== 'string') return undefined
  return BATS[v.trim().toLowerCase()]
}

/** 換投前的球數: entries with a name and a positive count, in order, never more pitches than the plate appearance has. */
export function cleanPrior(v: unknown, pitches: number): PriorPitch[] {
  const out: PriorPitch[] = []
  let left = pitches
  if (Array.isArray(v)) for (const x of v) {
    const name = typeof x?.name === 'string' ? x.name.trim() : ''
    const n = Math.min(left, Math.floor(Number(x?.pitches)))
    if (name && n > 0) { out.push({ name, pitches: n }); left -= n }
  }
  return out
}

interface Seq { inning?: number; outsBefore?: number; code?: string; result: string; outOnBase?: number }

/**
 * Re-derive inning / outsBefore for rows that lack them, walking the game in recorded order.
 * Rows that already carry both values are trusted; they also re-anchor the walk.
 */
function fillInnings<T extends Seq>(rows: T[]): { rows: T[]; filled: number } {
  let inning = 1, outs = 0, filled = 0
  const handled = new Set<number>()
  rows.forEach((r, i) => {
    if (handled.has(i)) return
    const hasInning = isNum(r.inning) && r.inning > 0
    const hasOuts = isNum(r.outsBefore)
    if (hasInning && r.inning !== inning) { inning = r.inning!; outs = hasOuts ? r.outsBefore! : 0 }
    if (!hasInning) { r.inning = inning; filled++ }
    if (!hasOuts) { r.outsBefore = outs; filled++ }
    const code = r.code ?? ''
    if (code in OUT_CODES) outs = OUT_CODES[code]
    if (outs >= 3) {
      const nxt = rows[i + 1]
      const runnerOut = (r.outOnBase ?? 0) > 0 && REACH.has(r.result)
      if (runnerOut && nxt && !((nxt.code ?? '') in OUT_CODES) && !(isNum(nxt.inning) && nxt.inning > 0 && nxt.inning !== inning)) {
        if (!(isNum(nxt.inning) && nxt.inning > 0)) { nxt.inning = inning; filled++ }
        if (!isNum(nxt.outsBefore)) { nxt.outsBefore = 2; filled++ }
        handled.add(i + 1)
      }
      inning++; outs = 0
    }
  })
  return { rows, filled }
}

/** The half-inning we field: the top at home, the bottom away. */
export const fieldingHalf = (game: Pick<Game, 'homeAway'>): 'top' | 'bottom' => (game.homeAway === '客' ? 'bottom' : 'top')

/**
 * Who stood at each position when we fielded an inning (data/gameRoster defenseTimeline over the 當日登錄名單), cached;
 * `row` = which of that inning's opponent rows (0 = the first, rowsInInning), for a change made in the middle of the
 * half; left out, the half's last alignment. undefined for a game without a roster (or without starters' positions),
 * which keeps the older rules.
 */
export function fieldersOf(game: Pick<Game, 'dayRoster' | 'homeAway'>): ((inning: number, row?: number, stop?: DefenseStop) => Map<string, string>) | undefined {
  const timeline = defenseTimeline(game.dayRoster)
  if (!timeline) return undefined
  const half = fieldingHalf(game)
  const cache = new Map<string, Map<string, string>>()
  return (inning, row, stop) => {
    const k = `${inning}|${row ?? ''}|${stop ? `${stop.index}${stop.include ? '+' : '-'}` : ''}`
    let m = cache.get(k)
    if (!m) { m = timeline(inning, half, row, stop).byPos; cache.set(k, m) }
    return m
  }
}

/** One opponent row's errors and catcher plays (盜壘 allowed, 阻殺, 捕逸, 牽制出局), each with who stood where when it
 *  happened (`at`, position → name; undefined for a game without the 當日登錄名單's positions). */
export interface RowCharges {
  /** errorsOf(row).positions, in that order */
  errors: Array<{ pos: string; at?: Map<string, string> }>
  unknown: number
  catching: Array<{ sba: number; cs: number; pb: number; pk: number; at?: Map<string, string> }>
}
/**
 * Each opponent row's errors and catcher plays with the alignment they were made under: the row's own (fieldersOf at
 * its place in the inning), except for what a change made in the middle of that plate appearance says came before it
 * (DayRosterSub.before: the alignment just before that change; the row's first errors at those positions) or, when the
 * half ended before the next plate appearance was sent, after it (DayRosterSub.after, on the half's last row: the
 * alignment just after that change; the row's last errors at those positions). A marker the row no longer has (edited
 * since) only takes what is there.
 */
export function rowCharges(game: Pick<Game, 'dayRoster' | 'homeAway'>, pitching: PitchingPA[]): RowCharges[] {
  const fielders = fieldersOf(game)
  const rows = rowsInInning(pitching)
  const half = fieldingHalf(game)
  const subs = game.dayRoster?.subs ?? []
  const lastRow = new Map<number, number>()
  rows.forEach((r, i) => { if (!isUnfinished(pitching[i])) lastRow.set(pitching[i].inning, Math.max(r, lastRow.get(pitching[i].inning) ?? 0)) })
  return pitching.map((p, i) => {
    const e = errorsOf(p)
    const own = fielders?.(p.inning, rows[i])
    const errors: RowCharges['errors'] = e.positions.map((pos) => ({ pos, at: own }))
    const rest = { sba: p.sba || 0, cs: p.cs || 0, pb: p.pb || 0, pk: p.pk || 0 }
    const catching: RowCharges['catching'] = []
    if (fielders) {
      const taken = new Set<number>()
      const take = (c: SubCharges, at: Map<string, string>, fromEnd: boolean) => {
        for (const pos of c.errors ?? []) {
          const free = errors.flatMap((x, k) => (x.pos === pos && !taken.has(k) ? [k] : []))
          const k = fromEnd ? free.at(-1) : free[0]
          if (k !== undefined) { errors[k] = { pos, at }; taken.add(k) }
        }
        const part = { sba: 0, cs: 0, pb: 0, pk: 0, at }
        for (const key of CHARGE_COUNTS) { part[key] = Math.min(rest[key], c[key] ?? 0); rest[key] -= part[key] }
        if (CHARGE_COUNTS.some((key) => part[key])) catching.push(part)
      }
      subs.forEach((x, index) => {
        if (x.inning !== p.inning || x.half !== half) return
        if (x.before && (x.row ?? 0) === rows[i]) take(x.before, fielders(p.inning, rows[i], { index, include: false }), false)
      })
      // (the last row of the half only: later changes' `after` first, each taking the last errors left)
      if (lastRow.get(p.inning) === rows[i]) {
        for (let index = subs.length - 1; index >= 0; index--) {
          const x = subs[index]
          if (x.inning === p.inning && x.half === half && x.after && x.row !== undefined && x.row - 1 === rows[i]) take(x.after, fielders(p.inning, x.row, { index, include: true }), true)
        }
      }
    }
    catching.unshift({ ...rest, at: own })
    return { errors, unknown: e.unknown, catching }
  })
}

/** Each opponent row's place in its inning (0 = the inning's first row), in the order given: what fieldersOf's `row` asks. */
export function rowsInInning(pitching: Pick<PitchingPA, 'inning' | 'result'>[]): number[] {
  const n = new Map<number, number>()
  // (a 未完成打席 row is no plate appearance and comes after the half's last one: it takes no place in the order)
  return pitching.map((p) => { const k = n.get(p.inning) ?? 0; if (!isUnfinished(p)) n.set(p.inning, k + 1); return k })
}

/**
 * Fielding lines for a game that has none, errors charged to the player who erred.
 * With the 當日登錄名單 (fieldersOf): one line per player and position he stood at (a 代打 who stayed in at SS, a 守備調動
 * SS→2B is two lines), 局數 = the innings he stood there (the whole game's 局數 when he never moved), and each error
 * at a position goes to whoever stood there in that half-inning. Without one: everyone who took a fielding position in
 * the batting log, errors by the older rule below. Pitchers come from the pitching log either way.
 */
export function deriveFielding(game: Game, batting: BattingPA[], pitching: PitchingPA[]): { lines: FieldingLine[]; unknownErrors: number } {
  // when: inning × 2 (+1 for the bottom half). We field the top half at home, the bottom half away.
  const at = (inning: number, half: 'top' | 'bottom') => inning * 2 + (half === 'bottom' ? 1 : 0)
  const fieldHalf = fieldingHalf(game)
  const batHalf = fieldHalf === 'top' ? 'bottom' : 'top'
  const fieldErrors: Array<{ pos: string; when: number; there?: string }> = []
  // a pitcher's error goes to whoever was pitching then
  const errByPitcher = new Map<string, number>()
  let unknownErrors = 0
  let pitcherUnknown = 0   // a P error on a row without the pitcher's name: the starter's
  const charges = rowCharges(game, pitching)
  for (const [i, p] of pitching.entries()) {
    const e = charges[i]
    unknownErrors += e.unknown
    for (const { pos, at: who } of e.errors) {
      if (pos === 'P') { if (p.pitcher) errByPitcher.set(p.pitcher, (errByPitcher.get(p.pitcher) ?? 0) + 1); else pitcherUnknown++ }
      else fieldErrors.push({ pos, when: at(p.inning, fieldHalf), there: who?.get(pos) })
    }
  }
  const innings = game.innings ?? Math.max(1, ...batting.map((p) => p.inning), ...pitching.map((p) => p.inning))
  const blank = { po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0 }
  const lines: FieldingLine[] = []
  const fielders = fieldersOf(game)
  const lineOf = (player: string, pos: string) => lines.find((l) => l.player === player && l.pos === pos)
  if (fielders) {
    // starters first (batting order), then everyone else in the order they came in
    const rank = new Map<string, number>()
    for (const n of [...(game.dayRoster?.starters ?? []).map((x) => x.name), ...(game.dayRoster?.subs ?? []).map((x) => x.in)]) if (!rank.has(n)) rank.set(n, rank.size)
    const halves = new Map<string, { player: string; pos: string; n: number }>()
    // the innings we fielded (with any opponent row; all of them when the game has no pitching rows)
    const fielded = Array.from({ length: innings }, (_, i) => i + 1).filter((n) => !pitching.length || pitching.some((p) => p.inning === n))
    for (const inning of fielded) {
      for (const [pos, player] of [...fielders(inning)].sort((a, b) => (rank.get(a[1]) ?? 1e9) - (rank.get(b[1]) ?? 1e9))) {
        if (pos === 'P') continue
        const k = `${player}\u0000${pos}`
        const h = halves.get(k)
        if (h) h.n++; else halves.set(k, { player, pos, n: 1 })
      }
    }
    for (const h of halves.values()) lines.push({ gameId: game.id, player: h.player, pos: h.pos, innings: h.n === fielded.length ? innings : h.n, ...blank, note: '由登錄名單推定' })
  }
  const seen = new Set<string>(lines.map((l) => l.player))
  for (const p of batting) {
    if (!p.batter || seen.has(p.batter) || !p.pos || NON_FIELD.has(p.pos) || p.pos === 'P') continue
    seen.add(p.batter)
    lines.push({ gameId: game.id, player: p.batter, pos: p.pos, innings, ...blank, e: 0, note: '由打席紀錄推定' })
  }
  // each error to the one player at that position then (a 代守 shares the position with the starter, not the error):
  // in from the start (先發) or from his substitution, out at the substitution that took him out; without the 當日登錄名單,
  // from his first plate appearance
  const subs = game.dayRoster?.subs ?? []
  const starters = new Set(game.dayRoster?.starters.map((x) => x.name) ?? [])
  const firstPA = (name: string) => Math.min(...batting.filter((b) => b.batter === name).map((b) => at(b.inning, batHalf)))
  const entry = (name: string) => { if (starters.has(name)) return 0; const s = subs.find((x) => x.in === name); return s ? at(s.inning, s.half) : firstPA(name) }
  const exit = (name: string) => { const s = subs.find((x) => x.out === name && x.in !== name); return s ? at(s.inning, s.half) : Infinity }
  // nobody at that position in the batting log (a defensive sub who never batted): the 當日登錄名單 names him
  const rosterAt = (pos: string, when: number): string | undefined => {
    const who = [...(game.dayRoster?.starters ?? []).filter((x) => x.pos === pos).map((x) => ({ name: x.name, from: 0 })),
      ...subs.filter((x) => x.pos === pos && x.in).map((x) => ({ name: x.in, from: at(x.inning, x.half) }))]
    return (who.filter((x) => x.from <= when).sort((a, b) => b.from - a.from)[0] ?? who[0])?.name
  }
  for (const err of fieldErrors) {
    // whoever stood there in that half-inning (the 當日登錄名單 with every change logged)
    const there = err.there
    if (there) {
      let l = lineOf(there, err.pos)
      if (!l) { l = { gameId: game.id, player: there, pos: err.pos, innings: 0, ...blank, note: '由登錄名單推定' }; lines.push(l) }
      l.e++; l.note = '失誤依守位推定'
      continue
    }
    let cands = lines.filter((l) => l.pos === err.pos)
    if (!cands.length) {
      const name = rosterAt(err.pos, err.when)
      if (name) { const l: FieldingLine = { gameId: game.id, player: name, pos: err.pos, innings, ...blank, e: 0, note: '由登錄名單推定' }; lines.push(l); cands = [l] }
    }
    const pick = cands.find((l) => entry(l.player) <= err.when && err.when < exit(l.player))
      ?? [...cands].filter((l) => entry(l.player) <= err.when).sort((a, b) => entry(b.player) - entry(a.player))[0] ?? cands[0]
    // never dropped: an error nobody can be found for is reported with the ones without a 落點
    if (pick) { pick.e++; pick.note = '失誤依落點推定' } else unknownErrors++
  }
  const outs = new Map<string, number>()
  const order: string[] = []
  const credited = outsCredited(pitching)   // each out once, to the pitcher on the mound (data/stats.ts)
  for (const p of pitching) {
    if (!p.pitcher) continue
    if (!outs.has(p.pitcher)) { outs.set(p.pitcher, 0); order.push(p.pitcher) }
    outs.set(p.pitcher, outs.get(p.pitcher)! + (credited.get(p) ?? 0))
  }
  order.forEach((name, i) => lines.push({ gameId: game.id, player: name, pos: 'P', innings: Math.round(((outs.get(name) ?? 0) / 3) * 10) / 10, ...blank, e: (errByPitcher.get(name) ?? 0) + (i === 0 ? pitcherUnknown : 0), note: i === 0 ? 'SP' : 'RP' }))
  if (unknownErrors && lines.length) lines[0].note = `${lines[0].note ?? ''}；另有 ${unknownErrors} 次失誤未記落點或找不到守備員，未歸屬個人`
  return { lines, unknownErrors }
}

const GROUND = new Set(['內滾', '犧觸'])
const FLY = new Set(['內飛', '外飛', '界外飛', '犧飛'])
/** The batter was put out by the batted ball itself (a fly caught, a ground out) — an out code on his row. */
const batterOutOnPlay = (p: PitchingPA) => (GROUND.has(p.result) || FLY.has(p.result)) && (p.code ?? '') in OUT_CODES
/** Two (or three) outs on one batted ball: a 雙殺, or the batter out and a runner put out on the same play. */
export const doublePlayOn = (p: PitchingPA) => p.result === '雙殺' || (batterOutOnPlay(p) && (p.events ?? []).some((e) => e.play && !e.batter && e.to === 'out'))

/**
 * Credit PO / A / DP to fielding lines from the opponent's plate appearances. Fielders are looked up by the
 * position they played (first line at that position); pitchers by name. Returns how many outs could not be placed.
 */
export function creditPlays(lines: FieldingLine[], pitching: PitchingPA[], game?: Game): { credited: number; unplaced: number } {
  const first = new Map<string, FieldingLine>()
  for (const l of lines) if (l.pos && l.pos !== 'P' && !first.has(l.pos)) first.set(l.pos, l)
  const byPitcher = new Map<string, FieldingLine>()
  for (const l of lines) if (l.pos === 'P' && !byPitcher.has(l.player)) byPitcher.set(l.player, l)
  // with the 當日登錄名單: the line of whoever stood at that position in this row's inning (fieldersOf)
  const charges = game ? rowCharges(game, pitching) : undefined
  let here: Map<string, string> | undefined
  const lineAt = (m: Map<string, string> | undefined, pos: string): FieldingLine | undefined => {
    const who = m?.get(pos)
    return (who ? lines.find((l) => l.player === who && l.pos === pos) : undefined) ?? first.get(pos)
  }
  const byPos = { get: (pos: string) => lineAt(here, pos) }
  let credited = 0, unplaced = 0
  const at = (n: number | undefined, pitcher: string): FieldingLine | undefined => {
    if (!n) return undefined
    if (n === 1) return byPitcher.get(pitcher)
    return byPos.get(POSITION_BY_NUMBER[n])
  }
  const po = (l?: FieldingLine) => { if (l) { l.po++; credited++ } else unplaced++ }
  const a = (l?: FieldingLine) => { if (l) l.a++ }
  const dp = (...ls: Array<FieldingLine | undefined>) => { for (const l of ls) if (l) l.dp++ }
  for (const [i, p] of pitching.entries()) {
    here = charges?.[i].catching[0].at
    const r = p.result
    const first = byPos.get('1B')
    // 三振：捕手刺殺，但不死三振而打者上壘（代碼不是 I/II/III）時沒有出局，不記刺殺
    if (r === '三振') { if (!p.code || p.code in OUT_CODES) po(byPos.get('C')) }
    // 其他出局 (batting out of order, the batter's interference): the catcher's putout
    else if (r === '其他出局') po(byPos.get('C'))
    // a 犧觸／犧飛 the batter reached on (an error on the row, no out code): nobody put him out
    else if ((r === '犧觸' || r === '犧飛') && !((p.code ?? '') in OUT_CODES) && !!p.errors?.length) { /* no putout */ }
    else if (GROUND.has(r)) {
      const f = at(p.loc, p.pitcher)
      if (p.loc === 3) po(first)                       // unassisted at first
      else if (p.loc) { a(f); po(first) }
      else unplaced++
    } else if (FLY.has(r)) po(at(p.loc, p.pitcher))
    // the runners put out on the play with the base they were put out at (被刺殺／封殺／壘死 marks, 打者出局 after reaching):
    // the one who handled the ball gets the assist, whoever covers that base the putout
    const marked = (p.events ?? []).filter((e) => e.play && e.to === 'out' && e.outAt)
    // (second base: the middle infielder away from the ball — 2B on a ball to the left side of the infield, SS on one to the
    // right side or the middle; from the outfield SS takes throws from left and center, 2B from right)
    const loc = p.loc ?? 0
    const second = loc === 5 || loc === 6 || loc === 56 || loc === 9 || loc === 89 ? '2B' : 'SS'
    const coverOf = (b: NonNullable<(typeof marked)[number]['outAt']>) => (b === 1 ? '1B' : b === 3 ? '3B' : b === 'home' ? 'C' : second)
    const fly = p.traj === 'L' || p.traj === 'F' || p.traj === 'P'
    if (r === '雙殺') {
      const two = (p.outsBefore ?? 0) <= 1
      const f = at(p.loc, p.pitcher)
      if (!p.loc) { unplaced += two ? 2 : 1; continue }
      const runnerOuts = marked.filter((e) => !e.batter)
      if (runnerOuts.length) {
        // where the recorder said: a caught line drive / fly (the catch is the batter's out, then the runner doubled off), or
        // a grounder (the lead runner forced, then the relay to first for the batter while there are outs to make)
        const involved: Array<FieldingLine | undefined> = [f]
        let relay = f
        if (fly && two) po(f)
        for (const e of runnerOuts) {
          const covering = byPos.get(coverOf(e.outAt!))
          if (relay && relay !== covering) a(relay)
          po(covering)
          involved.push(covering)
          relay = covering
        }
        if (!fly && two && runnerOuts.length === 1) { if (relay && relay !== first) a(relay); po(first); involved.push(first) }
        if (two) dp(...new Set(involved))
      } else if (fly) {
        // (saved before the base was asked) a caught line drive or fly, the runner most likely doubled off first
        po(f)
        if (two) { if (f !== first) a(f); po(first); dp(...new Set([f, first])) }
      } else {
        const pivot = byPos.get(p.loc === 4 ? 'SS' : '2B')
        if (two) {
          if (p.loc === 3) { a(first); po(pivot); a(pivot); po(first); dp(first, pivot) }
          else { a(f); po(pivot); a(pivot); po(first); dp(f, pivot, first) }
        } else if (p.loc === 3) po(first)
        else { a(f); po(first) }
      }
    } else if (r === '野選' && !marked.length) {
      // (saved before the base was asked) one out on the play: the fielder throws to the base ahead; nobody out = no credit
      const f = at(p.loc, p.pitcher)
      if (p.code && p.code in OUT_CODES) { if (p.loc) { a(f); po(byPos.get(p.loc === 3 || p.loc === 4 ? 'SS' : '2B')) } else unplaced++ }
    }
    if (r !== '雙殺') {
      const f = at(p.loc, p.pitcher)
      const involved: Array<FieldingLine | undefined> = []
      for (const e of marked) {
        // hit by the batted ball: the fielder nearest the ball makes the putout, nobody an assist
        if (e.kind === 'hbb') { po(f); continue }
        const covering = byPos.get(coverOf(e.outAt!))
        if (f && f !== covering) a(f)
        po(covering)
        involved.push(covering)
      }
      // the batter out too (a fly caught, the runner doubled off; a ground out and the runner thrown out): a double play
      if (marked.some((e) => !e.batter) && batterOutOnPlay(p)) dp(...new Set([f, ...involved, ...(GROUND.has(r) ? [first] : [])]))
    }
    // (a 盜壘阻殺 / 牽制出局 by whoever stood there then: a change in the middle of the plate appearance, rowCharges)
    for (const c of charges?.[i].catching ?? [{ cs: p.cs, pk: p.pk, at: undefined }]) {
      if (c.cs) { a(lineAt(c.at, 'C')); for (let k = 0; k < c.cs; k++) po(lineAt(c.at, 'SS')) }
      if (c.pk) { a(byPitcher.get(p.pitcher)); for (let k = 0; k < c.pk; k++) po(lineAt(c.at, '1B')) }
    }
  }
  return { credited, unplaced }
}

export type Catching = { sb: number; cs: number; pb: number }

/**
 * 被盜壘 / 阻殺 / 捕逸 per catcher, from the opponent's plate appearances: each one goes to whoever was catching then.
 * The catcher comes from the game's 當日登錄名單 (the starting C, then every substitution to C, effective from the
 * half-inning it was made in); without one, the game's first fielding line at C.
 */
export function catchingByPlayer(game: Game, pitching: PitchingPA[], lines: FieldingLine[]): Map<string, Catching> {
  const out = new Map<string, Catching>()
  const fallback = lines.find((l) => l.pos === 'C')?.player
  const roster = game.dayRoster
  const starter = roster?.starters.find((s) => s.pos === 'C')?.name
  const toC = (roster?.subs ?? []).filter((x) => x.pos === 'C')
  const halfIdx = (inning: number, half: 'top' | 'bottom') => (inning - 1) * 2 + (half === 'bottom' ? 1 : 0)
  const field: 'top' | 'bottom' = game.homeAway === '客' ? 'bottom' : 'top'
  const catcherAt = (inning: number, fielders?: Map<string, string>) => {
    // whoever stood at C then (the 當日登錄名單 with every change); else the starting C and every substitution to C
    const there = fielders?.get('C')
    if (there) return there
    const at = halfIdx(inning, field)
    let c = starter
    for (const x of toC) if (halfIdx(x.inning, x.half) <= at) c = x.in
    return c ?? fallback
  }
  const charges = rowCharges(game, pitching)
  for (const [i, p] of pitching.entries()) {
    if (!p.sba && !p.cs && !p.pb) continue
    // (each part with the catcher then: a change in the middle of the plate appearance, rowCharges)
    for (const c of charges[i].catching) {
      if (!c.sba && !c.cs && !c.pb) continue
      const name = catcherAt(p.inning, c.at)
      if (!name) continue
      const t = out.get(name) ?? { sb: 0, cs: 0, pb: 0 }
      t.sb += c.sba; t.cs += c.cs; t.pb += c.pb
      out.set(name, t)
    }
  }
  return out
}

/** The fielding line a catcher's numbers go on: his line at C, else his only line, else a new C line. */
export function catcherLine(lines: FieldingLine[], game: Game, name: string): FieldingLine {
  const own = lines.filter((l) => l.player === name)
  const line = own.find((l) => l.pos === 'C') ?? (own.length === 1 && own[0].pos !== 'P' ? own[0] : undefined)
  if (line) return line
  const add: FieldingLine = { gameId: game.id, player: name, pos: 'C', po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0, note: '捕手數據由投球紀錄推定' }
  lines.push(add)
  return add
}

/** Credit 被盜壘 / 阻殺 / 捕逸 to the catchers (in place). Returns how many were credited. */
export function creditCatching(game: Game, lines: FieldingLine[], pitching: PitchingPA[]): number {
  let n = 0
  for (const [name, t] of catchingByPlayer(game, pitching, lines)) {
    const l = catcherLine(lines, game, name)
    l.sb += t.sb; l.cs += t.cs; l.pb += t.pb
    n += t.sb + t.cs + t.pb
  }
  return n
}

/** 對方投手 on a batting row: the name trimmed (at most 40 characters, the database's limit), the hand L / R; each key
 *  left out when there is nothing. */
function oppOf(name: string | undefined, hand: unknown): Pick<BattingPA, 'oppPitcher' | 'oppHand'> {
  const n = typeof name === 'string' ? [...name.trim()].slice(0, 40).join('').trim() : ''
  const h = cleanHand(hand)
  return { ...(n ? { oppPitcher: n } : {}), ...(h ? { oppHand: h } : {}) }
}

/** 對方代跑: trimmed, at most 40 characters (the cloud's limit); left out when blank or the batter himself. */
const oppRunnerOf = (runner?: string, batter?: string): { runner?: string } => {
  const r = runner?.trim().slice(0, 40)
  return r && r !== batter?.trim() ? { runner: r } : {}
}
/** Their RBI: a whole number 0–4 (anything else is 0, which is left out). */
const oppRbiOf = (v: unknown): number => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(4, n)) : 0 }
/** `place`: where its 待核對 warnings are read (an Excel import names the workbook's columns); the site by default. */
export function normalizeDataset(input: Dataset, place: AuditPlace = 'page'): { dataset: Dataset; warnings: GameWarning[] } {
  const warnings: GameWarning[] = []
  const roster: Player[] = input.roster.map((p) => ({ ...p, name: p.name.trim(), primaryPos: p.primaryPos?.trim().toUpperCase() || undefined, secondaryPos: p.secondaryPos?.trim().toUpperCase() || undefined }))
  const names = new Set(roster.map((p) => p.name))
  const batting: BattingPA[] = input.batting.map(({ runner, oppPitcher, oppHand, errors, ...p }) => ({
    ...p, ...oppOf(oppPitcher, oppHand), ...(cleanOppErrors(errors).length ? { errors: cleanOppErrors(errors) } : {}), batter: p.batter.trim(), ...(runner?.trim() && runner.trim() !== p.batter.trim() ? { runner: runner.trim() } : {}), pos: p.pos?.trim().toUpperCase() || undefined, pitches: p.pitches.map(cleanPitch).filter(Boolean), result: cleanResult(p.result), code: cleanCode(p.code),
    loc: cleanLoc(p.loc), traj: p.traj?.trim().toUpperCase() || undefined, quality: p.quality?.trim() || undefined,
    inning: isNum(p.inning) && p.inning > 0 ? p.inning : 0, outsBefore: isNum(p.outsBefore) ? p.outsBefore : undefined,
    basesBefore: p.basesBefore?.trim() || undefined,
  }))
  const pitching: PitchingPA[] = input.pitching.map(({ errors, oppBatter, runner, rbi, oppBats, priorPitchers, ...p }) => ({
    ...p, ...(cleanPrior(priorPitchers, p.pitches.length).length ? { priorPitchers: cleanPrior(priorPitchers, p.pitches.length) } : {}), ...(cleanBats(oppBats) ? { oppBats: cleanBats(oppBats) } : {}), ...(oppRbiOf(rbi) ? { rbi: oppRbiOf(rbi) } : {}), ...(oppBatter?.trim() ? { oppBatter: oppBatter.trim() } : {}), ...oppRunnerOf(runner, oppBatter), ...(cleanErrors(errors).length ? { errors: cleanErrors(errors) } : {}), pitcher: p.pitcher.trim(), pitches: p.pitches.map(cleanPitch).filter(Boolean), result: cleanResult(p.result), code: cleanCode(p.code),
    loc: cleanLoc(p.loc), traj: p.traj?.trim().toUpperCase() || undefined, quality: p.quality?.trim() || undefined,
    inning: isNum(p.inning) && p.inning > 0 ? p.inning : 0, outsBefore: isNum(p.outsBefore) ? p.outsBefore : undefined,
    basesBefore: p.basesBefore?.trim() || undefined,
  }))
  const fielding: FieldingLine[] = input.fielding.map((f) => ({ ...f, player: f.player.trim(), pos: f.pos.trim().toUpperCase() }))
  const games: Game[] = input.games.map(({ dayRoster, endTime, ...g }) => {
    // the key is dropped when there is no (usable) roster, so games without one look exactly as before
    const r = parseDayRoster(dayRoster)
    const end = cleanTime(endTime)
    return { ...g, id: g.id.trim(), tournament: g.tournament?.trim() || '未分類', opponent: g.opponent?.trim() || '未知', ...(end ? { endTime: end } : {}), ...(r ? { dayRoster: r } : {}) }
  })

  for (const g of games) {
    const bat = batting.filter((p) => p.gameId === g.id)
    const pit = pitching.filter((p) => p.gameId === g.id)
    const warn = (message: string) => warnings.push({ gameId: g.id, message })

    const fb = fillInnings(bat); const fp = fillInnings(pit)
    if (fb.filled || fp.filled) warn(`已由出局碼補算 ${fb.filled + fp.filled} 個空白的「局」／「出局(前)」`)

    // runs come from the 得分 column (the scorer's line score agrees with it); the R code is only cross-checked
    const codeNoRun = bat.filter((p) => p.code === 'R' && !p.run).length
    const runNoCode = bat.filter((p) => (p.run ?? 0) > 0 && p.code && p.code !== 'R').length
    if (codeNoRun) warn(`${codeNoRun} 個打席的結果代碼為 R 但「得分」空白，得分以「得分」欄為準（未計分），請核對`)
    if (runNoCode) warn(`${runNoCode} 個打席有「得分」但結果代碼不是 R，請核對`)

    // game innings
    const maxInn = Math.max(0, ...bat.map((p) => p.inning), ...pit.map((p) => p.inning))
    if (!g.innings && maxInn) g.innings = maxInn

    // fielding: derive lines when the game has none at all
    let gameLines = fielding.filter((f) => f.gameId === g.id)
    if (!gameLines.length && (bat.length || pit.length)) {
      const d = deriveFielding(g, bat, pit)
      fielding.push(...d.lines)
      gameLines = d.lines
      warn('沒有守備紀錄，已依打席守位與對方失誤落點推定失誤')
      if (d.unknownErrors) warn(`${d.unknownErrors} 次我隊失誤沒記落點（或那個守位找不到人），算進球隊失誤，但無法歸屬到個人`)
    }
    // putouts / assists: when nobody recorded any, credit them from the opponent's plate appearances
    if (gameLines.length && pit.length && gameLines.every((f) => !f.po && !f.a)) {
      const c = creditPlays(gameLines, pit, g)
      if (c.credited) warn(`刺殺／助殺由投球紀錄推定（三振→捕手、滾地→守位助殺＋一壘刺殺、飛球→守位刺殺、雙殺→樞紐）${c.unplaced ? `；${c.unplaced} 個出局沒有落點，未歸屬` : ''}`)
    }
    // 被盜壘 / 阻殺 / 捕逸: when no line has any, credit them to whoever was catching from the opponent's plate appearances
    if (gameLines.length && pit.length && gameLines.every((f) => !f.sb && !f.cs && !f.pb)) {
      const lines = [...gameLines]
      if (creditCatching(g, lines, pit)) fielding.push(...lines.slice(gameLines.length))
    }

    // consistency checks
    const byInning = new Map<number, number>()
    // the inning's outs = its highest out code (a double play recorded live puts the lead runner's out on his own row,
    // so adding a second out for every 雙殺 row would count it twice; an old sheet's one-row 雙殺 still reaches III)
    for (const p of pit) if ((p.code ?? '') in OUT_CODES) byInning.set(p.inning, Math.max(byInning.get(p.inning) ?? 0, OUT_CODES[p.code!]))
    for (const [inn, outs] of byInning) if (outs !== 3 && inn < maxInn) warn(`投球紀錄第 ${inn} 局出局數為 ${outs}（應為 3），請檢查結果代碼`)
    for (const p of [...bat, ...pit]) if (p.result === '雙殺' && (p.outsBefore ?? 0) >= 2) warn(`第 ${p.inning} 局有 2 出局後的「雙殺」，只計 1 個出局`)
    const issues = auditGame(bat, pit, place).filter((i) => !i.message.includes('落點'))
    if (issues.length) { for (const i of issues.slice(0, 6)) warn(`待核對：${i.message}`); if (issues.length > 6) warn(`另有 ${issues.length - 6} 項待核對，開啟比賽頁可逐一查看`) }
    const noResult = bat.filter((p) => p.batter && !p.result).length + pit.filter((p) => p.pitcher && !p.result).length
    if (noResult) warn(`${noResult} 個打席沒有「打擊結果」，不計入統計`)
    const unknown = [...new Set(bat.flatMap((p) => [p.batter, p.runner ?? '']).filter((n) => n && !names.has(n)))]
    if (unknown.length) {
      for (const n of unknown) { roster.push({ name: n, status: '現役' }); names.add(n) }
      warn(`名單沒有 ${unknown.join('、')}，已自動加入球員名單`)
    }
    for (const n of [...new Set(pit.map((p) => p.pitcher).filter((n) => n && !names.has(n)))]) { roster.push({ name: n, primaryPos: 'P', status: '現役' }); names.add(n); warn(`名單沒有投手 ${n}，已自動加入`) }
    // 中繼: someone who did not pitch in this game (only checked when the game has its pitching rows)
    if (pit.length) {
      const pitched = new Set(pit.map((p) => p.pitcher))
      for (const h of [...new Set((g.holds ?? []).map((x) => x.trim()).filter(Boolean))]) if (!pitched.has(h)) warn(`中繼 ${h} 這場沒有投球紀錄，請核對`)
    }
  }
  return { dataset: { roster, games, batting, pitching, fielding }, warnings }
}
