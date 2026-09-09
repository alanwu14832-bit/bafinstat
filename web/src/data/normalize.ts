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
 *  - fills game.innings when blank, and returns human-readable warnings per game
 */
import { POSITION_BY_NUMBER, type BattingPA, type Dataset, type FieldingLine, type Game, type PitchingPA, type Player } from './types'

const OUT_CODES: Record<string, number> = { I: 1, II: 2, III: 3 }
const REACH = new Set(['一安', '二安', '三安', '保送', '故四', '觸身', '失誤', '野選', '妨礙'])
const RESULT_ALIASES: Record<string, string> = { 犧牲: '犧觸', 犧打: '犧觸', 犧牲觸擊: '犧觸', 犧牲飛球: '犧飛', 全壘: '全壘打', 四壞: '保送', 故意四壞: '故四', 死球: '觸身', 觸身球: '觸身', 雙殺打: '雙殺', 不死三振: '三振' }
const NON_FIELD = new Set(['DH', 'PH', 'PR', ''])

export interface GameWarning { gameId: string; message: string }

const cleanResult = (r: string) => { const t = (r ?? '').trim(); return RESULT_ALIASES[t] ?? t }
const cleanCode = (c?: string) => { const t = (c ?? '').trim().toUpperCase(); return t || undefined }
const cleanPitch = (p: string) => p.trim().toUpperCase()
const cleanLoc = (v: unknown): number | undefined => { const m = /([1-9])/.exec(String(v ?? '')); return m ? Number(m[1]) : undefined }
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

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
function deriveFielding(game: Game, batting: BattingPA[], pitching: PitchingPA[]): { lines: FieldingLine[]; unknownErrors: number } {
  const errByPos: Record<string, number> = {}
  let unknownErrors = 0
  for (const p of pitching) {
    if (p.result !== '失誤') continue
    const pos = p.loc ? POSITION_BY_NUMBER[p.loc] : undefined
    if (pos) errByPos[pos] = (errByPos[pos] ?? 0) + 1; else unknownErrors++
  }
  const innings = game.innings ?? Math.max(1, ...batting.map((p) => p.inning), ...pitching.map((p) => p.inning))
  const blank = { po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0 }
  const lines: FieldingLine[] = []
  const seen = new Set<string>()
  for (const p of batting) {
    if (!p.batter || seen.has(p.batter) || !p.pos || NON_FIELD.has(p.pos) || p.pos === 'P') continue
    seen.add(p.batter)
    lines.push({ gameId: game.id, player: p.batter, pos: p.pos, innings, ...blank, e: errByPos[p.pos] ?? 0, note: errByPos[p.pos] ? '失誤依落點推定' : '由打席紀錄推定' })
  }
  const outs = new Map<string, number>()
  const order: string[] = []
  for (const p of pitching) {
    if (!p.pitcher) continue
    if (!outs.has(p.pitcher)) { outs.set(p.pitcher, 0); order.push(p.pitcher) }
    if ((p.code ?? '') in OUT_CODES) outs.set(p.pitcher, outs.get(p.pitcher)! + (p.result === '雙殺' && (p.outsBefore ?? 0) <= 1 ? 2 : 1))
  }
  order.forEach((name, i) => lines.push({ gameId: game.id, player: name, pos: 'P', innings: Math.round(((outs.get(name) ?? 0) / 3) * 10) / 10, ...blank, e: i === 0 ? errByPos.P ?? 0 : 0, note: i === 0 ? 'SP' : 'RP' }))
  if (unknownErrors && lines.length) lines[0].note = `${lines[0].note ?? ''}；另有 ${unknownErrors} 次失誤未記落點，未歸屬個人`
  return { lines, unknownErrors }
}

const GROUND = new Set(['內滾', '犧觸'])
const FLY = new Set(['內飛', '外飛', '犧飛'])

/**
 * Credit PO / A / DP to fielding lines from the opponent's plate appearances. Fielders are looked up by the
 * position they played (first line at that position); pitchers by name. Returns how many outs could not be placed.
 */
function creditPlays(lines: FieldingLine[], pitching: PitchingPA[]): { credited: number; unplaced: number } {
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
    if (r === '三振') po(byPos.get('C'))
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

export function normalizeDataset(input: Dataset): { dataset: Dataset; warnings: GameWarning[] } {
  const warnings: GameWarning[] = []
  const roster: Player[] = input.roster.map((p) => ({ ...p, name: p.name.trim(), primaryPos: p.primaryPos?.trim().toUpperCase() || undefined, secondaryPos: p.secondaryPos?.trim().toUpperCase() || undefined }))
  const names = new Set(roster.map((p) => p.name))
  const batting: BattingPA[] = input.batting.map((p) => ({
    ...p, batter: p.batter.trim(), pos: p.pos?.trim().toUpperCase() || undefined, pitches: p.pitches.map(cleanPitch).filter(Boolean), result: cleanResult(p.result), code: cleanCode(p.code),
    loc: cleanLoc(p.loc), traj: p.traj?.trim().toUpperCase() || undefined, quality: p.quality?.trim() || undefined,
    inning: isNum(p.inning) && p.inning > 0 ? p.inning : 0, outsBefore: isNum(p.outsBefore) ? p.outsBefore : undefined,
    basesBefore: p.basesBefore?.trim() || undefined,
  }))
  const pitching: PitchingPA[] = input.pitching.map((p) => ({
    ...p, pitcher: p.pitcher.trim(), pitches: p.pitches.map(cleanPitch).filter(Boolean), result: cleanResult(p.result), code: cleanCode(p.code),
    loc: cleanLoc(p.loc), traj: p.traj?.trim().toUpperCase() || undefined, quality: p.quality?.trim() || undefined,
    inning: isNum(p.inning) && p.inning > 0 ? p.inning : 0, outsBefore: isNum(p.outsBefore) ? p.outsBefore : undefined,
    basesBefore: p.basesBefore?.trim() || undefined,
  }))
  const fielding: FieldingLine[] = input.fielding.map((f) => ({ ...f, player: f.player.trim(), pos: f.pos.trim().toUpperCase() }))
  const games: Game[] = input.games.map((g) => ({ ...g, id: g.id.trim(), tournament: g.tournament?.trim() || '未分類', opponent: g.opponent?.trim() || '未知' }))

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

    // consistency checks
    const byInning = new Map<number, number>()
    for (const p of pit) if ((p.code ?? '') in OUT_CODES) byInning.set(p.inning, (byInning.get(p.inning) ?? 0) + (p.result === '雙殺' && (p.outsBefore ?? 0) <= 1 ? 2 : 1))
    for (const [inn, outs] of byInning) if (outs !== 3 && inn < maxInn) warn(`投球紀錄第 ${inn} 局出局數為 ${outs}（應為 3），請檢查結果代碼`)
    for (const p of [...bat, ...pit]) if (p.result === '雙殺' && (p.outsBefore ?? 0) >= 2) warn(`第 ${p.inning} 局有 2 出局後的「雙殺」，只計 1 個出局`)
    const noResult = bat.filter((p) => p.batter && !p.result).length + pit.filter((p) => p.pitcher && !p.result).length
    if (noResult) warn(`${noResult} 個打席沒有「打擊結果」，不計入統計`)
    const unknown = [...new Set(bat.map((p) => p.batter).filter((n) => n && !names.has(n)))]
    if (unknown.length) {
      for (const n of unknown) { roster.push({ name: n, status: '現役' }); names.add(n) }
      warn(`名單沒有 ${unknown.join('、')}，已自動加入球員名單`)
    }
    for (const n of [...new Set(pit.map((p) => p.pitcher).filter((n) => n && !names.has(n)))]) { roster.push({ name: n, primaryPos: 'P', status: '現役' }); names.add(n); warn(`名單沒有投手 ${n}，已自動加入`) }
  }
  return { dataset: { roster, games, batting, pitching, fielding }, warnings }
}
