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
 *  - 對方投手 (L / R, name) and 對方打者 trimmed and dropped when blank, 結束時間 as 'HH:MM'
 */
import { LOC_CODES, LOC_HOLES, POSITION_BY_NUMBER, type BattingPA, type Dataset, type FieldingLine, type Game, type OppHand, type PitchingPA, type Player } from './types'
import { auditGame } from './audit'
import { outsCredited } from './stats'
import { cleanErrors, errorsOf } from './errors'
import { parseDayRoster } from './gameRoster'
import { cleanTime } from './gameTime'

const OUT_CODES: Record<string, number> = { I: 1, II: 2, III: 3 }
const REACH = new Set(['一安', '內安', '二安', '場地二安', '三安', '保送', '故四', '觸身', '失誤', '野選', '妨礙'])
const RESULT_ALIASES: Record<string, string> = { 界外飛球: '界外飛', 界外飛出局: '界外飛', 界外接殺: '界外飛', 犧牲: '犧觸', 犧打: '犧觸', 犧牲觸擊: '犧觸', 犧牲飛球: '犧飛', 全壘: '全壘打', 四壞: '保送', 故意四壞: '故四', 死球: '觸身', 觸身球: '觸身', 雙殺打: '雙殺', 不死三振: '三振' }
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

/** Fielding lines for a game that has none: everyone who took a fielding position in the batting log (subs included,
 *  pitchers come from the pitching log), errors attributed by the opponent's 失誤 batted-ball location. */
export function deriveFielding(game: Game, batting: BattingPA[], pitching: PitchingPA[]): { lines: FieldingLine[]; unknownErrors: number } {
  // when: inning × 2 (+1 for the bottom half). We field the top half at home, the bottom half away.
  const at = (inning: number, half: 'top' | 'bottom') => inning * 2 + (half === 'bottom' ? 1 : 0)
  const fieldHalf = game.homeAway === '客' ? 'bottom' : 'top'
  const batHalf = fieldHalf === 'top' ? 'bottom' : 'top'
  const fieldErrors: Array<{ pos: string; when: number }> = []
  // a pitcher's error goes to whoever was pitching then
  const errByPitcher = new Map<string, number>()
  let unknownErrors = 0
  let pitcherUnknown = 0   // a P error on a row without the pitcher's name: the starter's
  for (const p of pitching) {
    const e = errorsOf(p)
    unknownErrors += e.unknown
    for (const pos of e.positions) {
      if (pos === 'P') { if (p.pitcher) errByPitcher.set(p.pitcher, (errByPitcher.get(p.pitcher) ?? 0) + 1); else pitcherUnknown++ }
      else fieldErrors.push({ pos, when: at(p.inning, fieldHalf) })
    }
  }
  const innings = game.innings ?? Math.max(1, ...batting.map((p) => p.inning), ...pitching.map((p) => p.inning))
  const blank = { po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0 }
  const lines: FieldingLine[] = []
  const seen = new Set<string>()
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
  const exit = (name: string) => { const s = subs.find((x) => x.out === name); return s ? at(s.inning, s.half) : Infinity }
  for (const err of fieldErrors) {
    const cands = lines.filter((l) => l.pos === err.pos)
    const pick = cands.find((l) => entry(l.player) <= err.when && err.when < exit(l.player))
      ?? [...cands].filter((l) => entry(l.player) <= err.when).sort((a, b) => entry(b.player) - entry(a.player))[0] ?? cands[0]
    if (pick) { pick.e++; pick.note = '失誤依落點推定' }
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
  if (unknownErrors && lines.length) lines[0].note = `${lines[0].note ?? ''}；另有 ${unknownErrors} 次失誤未記落點，未歸屬個人`
  return { lines, unknownErrors }
}

const GROUND = new Set(['內滾', '犧觸'])
const FLY = new Set(['內飛', '外飛', '界外飛', '犧飛'])

/**
 * Credit PO / A / DP to fielding lines from the opponent's plate appearances. Fielders are looked up by the
 * position they played (first line at that position); pitchers by name. Returns how many outs could not be placed.
 */
export function creditPlays(lines: FieldingLine[], pitching: PitchingPA[]): { credited: number; unplaced: number } {
  const byPos = new Map<string, FieldingLine>()
  for (const l of lines) if (l.pos && l.pos !== 'P' && !byPos.has(l.pos)) byPos.set(l.pos, l)
  const byPitcher = new Map<string, FieldingLine>()
  for (const l of lines) if (l.pos === 'P' && !byPitcher.has(l.player)) byPitcher.set(l.player, l)
  let credited = 0, unplaced = 0
  const at = (n: number | undefined, pitcher: string): FieldingLine | undefined => {
    if (!n) return undefined
    if (n === 1) return byPitcher.get(pitcher)
    return byPos.get(POSITION_BY_NUMBER[n])
  }
  const po = (l?: FieldingLine) => { if (l) { l.po++; credited++ } else unplaced++ }
  const a = (l?: FieldingLine) => { if (l) l.a++ }
  const dp = (...ls: Array<FieldingLine | undefined>) => { for (const l of ls) if (l) l.dp++ }
  for (const p of pitching) {
    const r = p.result
    const first = byPos.get('1B')
    // 三振：捕手刺殺，但不死三振而打者上壘（代碼不是 I/II/III）時沒有出局，不記刺殺
    if (r === '三振') { if (!p.code || p.code in OUT_CODES) po(byPos.get('C')) }
    else if (GROUND.has(r)) {
      const f = at(p.loc, p.pitcher)
      if (p.loc === 3) po(first)                       // unassisted at first
      else if (p.loc) { a(f); po(first) }
      else unplaced++
    } else if (FLY.has(r)) po(at(p.loc, p.pitcher))
    else if (r === '雙殺') {
      const two = (p.outsBefore ?? 0) <= 1
      const f = at(p.loc, p.pitcher)
      const pivot = byPos.get(p.loc === 4 ? 'SS' : '2B')
      if (!p.loc) { unplaced += two ? 2 : 1; continue }
      if (two) {
        if (p.loc === 3) { a(first); po(pivot); a(pivot); po(first); dp(first, pivot) }
        else { a(f); po(pivot); a(pivot); po(first); dp(f, pivot, first) }
      } else if (p.loc === 3) po(first)
      else { a(f); po(first) }
    } else if (r === '野選') {
      const f = at(p.loc, p.pitcher)
      if (p.loc) { a(f); po(byPos.get(p.loc === 3 || p.loc === 4 ? 'SS' : '2B')) } else unplaced++
    }
    if (p.cs) { a(byPos.get('C')); for (let i = 0; i < p.cs; i++) po(byPos.get('SS')) }
    if (p.pk) { a(byPitcher.get(p.pitcher)); for (let i = 0; i < p.pk; i++) po(first) }
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
  const catcherAt = (inning: number) => {
    const at = halfIdx(inning, field)
    let c = starter
    for (const x of toC) if (halfIdx(x.inning, x.half) <= at) c = x.in
    return c ?? fallback
  }
  for (const p of pitching) {
    if (!p.sba && !p.cs && !p.pb) continue
    const name = catcherAt(p.inning)
    if (!name) continue
    const t = out.get(name) ?? { sb: 0, cs: 0, pb: 0 }
    t.sb += p.sba || 0; t.cs += p.cs || 0; t.pb += p.pb || 0
    out.set(name, t)
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

export function normalizeDataset(input: Dataset): { dataset: Dataset; warnings: GameWarning[] } {
  const warnings: GameWarning[] = []
  const roster: Player[] = input.roster.map((p) => ({ ...p, name: p.name.trim(), primaryPos: p.primaryPos?.trim().toUpperCase() || undefined, secondaryPos: p.secondaryPos?.trim().toUpperCase() || undefined }))
  const names = new Set(roster.map((p) => p.name))
  const batting: BattingPA[] = input.batting.map(({ runner, oppPitcher, oppHand, ...p }) => ({
    ...p, ...oppOf(oppPitcher, oppHand), batter: p.batter.trim(), ...(runner?.trim() && runner.trim() !== p.batter.trim() ? { runner: runner.trim() } : {}), pos: p.pos?.trim().toUpperCase() || undefined, pitches: p.pitches.map(cleanPitch).filter(Boolean), result: cleanResult(p.result), code: cleanCode(p.code),
    loc: cleanLoc(p.loc), traj: p.traj?.trim().toUpperCase() || undefined, quality: p.quality?.trim() || undefined,
    inning: isNum(p.inning) && p.inning > 0 ? p.inning : 0, outsBefore: isNum(p.outsBefore) ? p.outsBefore : undefined,
    basesBefore: p.basesBefore?.trim() || undefined,
  }))
  const pitching: PitchingPA[] = input.pitching.map(({ errors, oppBatter, ...p }) => ({
    ...p, ...(oppBatter?.trim() ? { oppBatter: oppBatter.trim() } : {}), ...(cleanErrors(errors).length ? { errors: cleanErrors(errors) } : {}), pitcher: p.pitcher.trim(), pitches: p.pitches.map(cleanPitch).filter(Boolean), result: cleanResult(p.result), code: cleanCode(p.code),
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
      if (d.unknownErrors) warn(`${d.unknownErrors} 次對方打者靠失誤上壘但沒記落點，無法歸屬到個人`)
    }
    // putouts / assists: when nobody recorded any, credit them from the opponent's plate appearances
    if (gameLines.length && pit.length && gameLines.every((f) => !f.po && !f.a)) {
      const c = creditPlays(gameLines, pit)
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
    const issues = auditGame(bat, pit).filter((i) => !i.message.includes('落點'))
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
