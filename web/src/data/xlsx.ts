/**
 * Import the master workbook (打席紀錄 / 投球紀錄 / 守備紀錄 / 比賽清單 / 球員名單)
 * or a single-game template (單場-摘要 / 單場-打擊 / 單場-投球) with SheetJS.
 * Only input columns are read; every statistic is recomputed by stats.ts, so a
 * workbook saved without cached formula values still imports correctly.
 */
import * as XLSX from 'xlsx'
import type { BattingPA, Dataset, FieldingLine, Game, HomeAway, PitchingPA, Player } from './types'
import { rawGameToDataset, TEAM_NAME, type RawGame, type RawPA } from './seed'

type Row = Record<string, unknown>

export interface ImportReport {
  mode: 'master' | 'single' | 'legacy'
  games: number
  batting: number
  pitching: number
  fielding: number
  roster: number
  warnings: string[]
  /** legacy mode: the parsed game so the user can set 比賽ID / 杯賽 before confirming */
  legacy?: RawGame
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim())
const num = (v: unknown): number => {
  if (v === undefined || v === null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const opt = (v: unknown): number | undefined => (str(v) === '' ? undefined : num(v))

/** Excel serial or text → ISO date. */
function toISODate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = str(v).replace(/\//g, '-')
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : s
}
function toTime(v: unknown): string | undefined {
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); if (d) return `${String(d.H).padStart(2, '0')}:${String(d.M).padStart(2, '0')}` }
  const s = str(v); return s || undefined
}

/** Parse batted-ball location: accepts 6 / "6" / "6游擊". */
function toLoc(v: unknown): number | undefined {
  const m = /([1-9])/.exec(str(v))
  return m ? Number(m[1]) : undefined
}

function sheetRows(wb: XLSX.WorkBook, name: string, headerRow: number): Row[] {
  const ws = wb.Sheets[name]
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { range: headerRow, defval: '' })
  return rows
}

function pitchesOf(r: Row): string[] {
  const out: string[] = []
  for (let i = 1; i <= 12; i++) { const v = str(r[`球${i}`]).toUpperCase(); if (v) out.push(v) }
  return out
}

function parseBatting(rows: Row[], gameId?: string): BattingPA[] {
  return rows.filter((r) => str(r['打者'])).map((r) => ({
    gameId: gameId ?? str(r['比賽ID']), inning: num(r['局']), outsBefore: opt(r['出局(前)']), basesBefore: str(r['壘上(前)']) || undefined,
    order: opt(r['棒次']), pos: str(r['守位']) || undefined, batter: str(r['打者']), pitches: pitchesOf(r), result: str(r['打擊結果']),
    loc: toLoc(r['落點']), traj: str(r['軌跡']).toUpperCase() || undefined, quality: str(r['強度']) || undefined,
    sb: num(r['盜壘']), cs: num(r['盜壘失敗']), advOnError: num(r['失誤進壘']), outOnBase: num(r['壘死']), run: num(r['得分']), rbi: num(r['打點']),
    code: str(r['結果代碼']).toUpperCase() || undefined, note: str(r['備註']) || undefined,
  }))
}
function parsePitching(rows: Row[], gameId?: string): PitchingPA[] {
  return rows.filter((r) => str(r['投手'])).map((r) => ({
    gameId: gameId ?? str(r['比賽ID']), inning: num(r['局']), outsBefore: opt(r['出局(前)']), basesBefore: str(r['壘上(前)']) || undefined,
    oppOrder: opt(r['對方棒次']), pitcher: str(r['投手']), oppBatter: str(r['對方打者']) || undefined, pitches: pitchesOf(r), result: str(r['打擊結果']),
    loc: toLoc(r['落點']), traj: str(r['軌跡']).toUpperCase() || undefined, quality: str(r['強度']) || undefined,
    sba: num(r['被盜壘']), cs: num(r['阻殺']), wp: num(r['暴投']), pb: num(r['捕逸']), pk: num(r['牽制出局']),
    code: str(r['結果代碼']).toUpperCase() || undefined, note: str(r['備註']) || undefined,
  }))
}
function parseFielding(rows: Row[], gameId?: string): FieldingLine[] {
  return rows.filter((r) => str(r['球員'])).map((r) => ({
    gameId: gameId ?? str(r['比賽ID']), player: str(r['球員']), pos: str(r['守位']).toUpperCase(), innings: opt(r['局數']),
    po: num(r['刺殺PO']), a: num(r['助殺A']), e: num(r['失誤E']), dp: num(r['雙殺DP']), pb: num(r['捕逸PB']), sb: num(r['被盜壘SB']), cs: num(r['阻殺CS']), note: str(r['備註']) || undefined,
  }))
}
function parseRoster(rows: Row[]): Player[] {
  return rows.filter((r) => str(r['姓名'])).map((r) => ({
    number: str(r['背號']) || undefined, name: str(r['姓名']), primaryPos: str(r['主守位']).toUpperCase() || undefined, secondaryPos: str(r['副守位']).toUpperCase() || undefined,
    bats: (str(r['打擊慣用']).toUpperCase() || undefined) as Player['bats'], throws: (str(r['投球慣用']).toUpperCase() || undefined) as Player['throws'],
    status: str(r['狀態']) || undefined, note: str(r['備註']) || undefined,
  }))
}
function parseGames(rows: Row[]): Game[] {
  return rows.filter((r) => str(r['比賽ID'])).map((r) => ({
    id: str(r['比賽ID']), date: toISODate(r['日期']), time: toTime(r['時間']), tournament: str(r['杯賽']) || '未分類', opponent: str(r['對手']) || '未知',
    homeAway: (str(r['主客']) === '客' ? '客' : '主') as HomeAway, venue: str(r['場地']) || undefined, weather: str(r['天氣']) || undefined, recorder: str(r['紀錄者']) || undefined,
    innings: opt(r['局數']), winningPitcher: str(r['勝投']) || undefined, losingPitcher: str(r['敗投']) || undefined, savePitcher: str(r['救援']) || undefined,
    holds: str(r['中繼']) ? str(r['中繼']).split(/[,，、\s]+/).filter(Boolean) : undefined, note: str(r['備註']) || undefined,
  }))
}

/** Read the 單場-摘要 header block (labels in B/E columns, values to the right). */
function parseSingleMeta(wb: XLSX.WorkBook): Game | null {
  const ws = wb.Sheets['單場-摘要']
  if (!ws) return null
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, range: 0 })
  const meta: Record<string, unknown> = {}
  for (const row of grid.slice(0, 8)) for (let c = 0; c < row.length - 1; c++) { const k = str(row[c]); if (k && row[c + 1] !== '' && row[c + 1] !== undefined) meta[k] = row[c + 1] }
  const id = str(meta['比賽ID'])
  if (!id) return null
  return {
    id, date: toISODate(meta['日期']), time: toTime(meta['時間']), tournament: str(meta['杯賽']) || '未分類', opponent: str(meta['對手']) || '未知',
    homeAway: (str(meta['主客']) === '客' ? '客' : '主') as HomeAway, venue: str(meta['場地']) || undefined, weather: str(meta['天氣']) || undefined,
    recorder: str(meta['紀錄者']) || undefined, innings: opt(meta['局數']),
  }
}


// ---------------------------------------------------------------- legacy single-game sheet (當日比賽統計 / 打　擊 / 投球守備)
const LEGACY_SUMMARY = '當日比賽統計'
const LEGACY_BAT = ['打　擊', '打 擊', '打擊']
const LEGACY_PIT = ['投球守備']
const REACH = new Set(['一安', '二安', '三安', '保送', '故四', '觸身', '失誤', '野選', '妨礙'])

function findSheet(wb: XLSX.WorkBook, names: string[]): XLSX.WorkSheet | undefined {
  for (const n of names) if (wb.Sheets[n]) return wb.Sheets[n]
  const loose = wb.SheetNames.find((n) => names.some((x) => n.replace(/\s|　/g, '') === x.replace(/\s|　/g, '')))
  return loose ? wb.Sheets[loose] : undefined
}
function cellv(ws: XLSX.WorkSheet, ref: string): unknown { return ws[ref]?.v }

/** 'CF(P)' → CF (starter); '(PR)' → PR (sub); '(PH)DH(CF)(LF)' → DH (sub). */
function parsePos(raw: string): { pos: string; starter: boolean } {
  const t = raw.trim()
  if (!t) return { pos: '', starter: true }
  const outside = t.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).filter(Boolean)
  const inside = [...t.matchAll(/\(([^)]*)\)/g)].map((m) => m[1])
  return { pos: (outside[0] ?? inside[0] ?? t).toUpperCase(), starter: !t.startsWith('(') }
}

function legacyPAs(ws: XLSX.WorkSheet): RawPA[] {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:Y1')
  const out: RawPA[] = []
  for (let r = 2; r <= range.e.r; r++) { // row index 2 = sheet row 3 (row 2 is the sheet's own example)
    const at = (c: number) => ws[XLSX.utils.encode_cell({ r, c })]?.v
    const name = str(at(2))
    if (!name) continue
    const pitches: string[] = []
    for (let c = 3; c <= 11; c++) { const v = str(at(c)).toUpperCase(); if (v) pitches.push(v) }
    out.push({
      code: str(at(0)).toUpperCase() || null, order: num(at(1)), name, pitches, result: str(at(15)), loc: toLoc(at(16)) ?? null, traj: (str(at(17)).toUpperCase() || null),
      quality: str(at(18)) || null, sb: num(at(19)), adv_err: num(at(20)), out_on_base: num(at(21)), run: num(at(22)), rbi: num(at(23)), note: str(at(24)) || null, inning: 0, outs_before: 0,
    })
  }
  return out
}

/** Same rule as tools/convert_single_game.py: an inning ends after the row producing the 3rd out; a runner out
 *  recorded on a reaching batter's row keeps the following non-out row in the same inning. */
function assignInnings(rows: RawPA[]): RawPA[] {
  let inning = 1, outs = 0
  const handled = new Set<number>()
  rows.forEach((r, i) => {
    if (handled.has(i)) return
    r.inning = inning; r.outs_before = outs
    if (r.code === 'I' || r.code === 'II' || r.code === 'III') outs = { I: 1, II: 2, III: 3 }[r.code]
    if (outs >= 3) {
      const nxt = rows[i + 1]
      const runnerOut = r.out_on_base > 0 && REACH.has(r.result)
      if (runnerOut && nxt && !['I', 'II', 'III'].includes(nxt.code ?? '')) { nxt.inning = inning; nxt.outs_before = 2; handled.add(i + 1) }
      inning++; outs = 0
    }
  })
  return rows
}

export function parseLegacyGame(wb: XLSX.WorkBook): RawGame {
  const sm = wb.Sheets[LEGACY_SUMMARY]
  const bat = findSheet(wb, LEGACY_BAT); const pit = findSheet(wb, LEGACY_PIT)
  if (!sm || !bat || !pit) throw new Error('舊格式需要「當日比賽統計」「打　擊」「投球守備」三張工作表')
  const date = toISODate(cellv(sm, 'S2'))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('「當日比賽統計」S2 的日期無法辨識')
  const teams = [3, 4].map((r) => ({ name: str(cellv(sm, `D${r}`)), ha: str(cellv(sm, `C${r}`)), line: 'EFGHIJKL'.split('').map((c) => cellv(sm, `${c}${r}`)) })).filter((t) => t.name)
  let us = teams.find((t) => t.name === TEAM_NAME); let opp = teams.find((t) => t.name !== TEAM_NAME)
  if (!us) { us = teams[teams.length - 1]; opp = teams[0] }
  const homeAway: HomeAway = us.ha === '客' ? '客' : '主'
  const lineup: RawGame['lineup'] = []
  for (let r = 8; r < 40; r++) {
    const name = str(cellv(sm, `D${r}`))
    if (name === '總和') break
    if (!name) continue
    const { pos, starter } = parsePos(str(cellv(sm, `C${r}`)))
    lineup.push({ order: opt(cellv(sm, `B${r}`)) ?? null, pos_raw: str(cellv(sm, `C${r}`)) || null, name, pos, starter })
  }
  const pitchers: RawGame['pitchers'] = []
  for (let r = 18; r < 50; r++) {
    if (str(cellv(sm, `B${r}`)) === '勝敗' && str(cellv(sm, `C${r}`)) === '任務') {
      for (let rr = r + 1; rr < r + 12; rr++) { const nm = str(cellv(sm, `D${rr}`)); if (!nm || nm === '總和') break; pitchers.push({ name: nm, role: str(cellv(sm, `C${rr}`)), decision: str(cellv(sm, `B${rr}`)).toUpperCase() === 'W' || str(cellv(sm, `B${rr}`)) === '勝' ? 'W' : str(cellv(sm, `B${rr}`)).toUpperCase() === 'L' || str(cellv(sm, `B${rr}`)) === '敗' ? 'L' : '' }) }
      break
    }
  }
  const posOf = new Map(lineup.map((l) => [l.name, l.pos]))
  const batting = assignInnings(legacyPAs(bat)).map((p) => ({ ...p, pos: posOf.get(p.name) ?? '' }))
  const pitching = assignInnings(legacyPAs(pit))
  const runsBy = (rows: RawPA[], f: (p: RawPA) => number) => rows.reduce<Record<number, number>>((a, p) => { a[p.inning] = (a[p.inning] ?? 0) + f(p); return a }, {})
  const rb = runsBy(batting, (p) => p.run), rp = runsBy(pitching, (p) => (p.code === 'R' || p.code === 'ER' ? 1 : 0))
  const warnings: string[] = []
  const check = (label: string, line: unknown[], derived: Record<number, number>) => line.forEach((v, i) => { if (v === undefined || v === null || v === '' || String(v).toUpperCase() === 'X') return; if (num(v) !== (derived[i + 1] ?? 0)) warnings.push(`${label}第 ${i + 1} 局：紀錄表 ${num(v)} 分，逐打席推算 ${derived[i + 1] ?? 0} 分`) })
  check('我隊', us.line, rb); if (opp) check('對手', opp.line, rp)
  const inningsPlayed = Math.max(1, ...batting.map((p) => p.inning), ...pitching.map((p) => p.inning))
  return {
    game_id: `G${date.replace(/-/g, '')}-01`, date, time: toTime(cellv(sm, 'S3')) ?? null, tournament: '未分類', opponent: opp?.name || '未知', home_away: homeAway,
    venue: str(cellv(sm, 'V2')) || null, weather: str(cellv(sm, 'V3')) || null, recorder: str(cellv(sm, 'V4')) || null, innings_played: inningsPlayed, lineup, pitchers, batting, pitching, warnings,
  }
}

/** Re-key a legacy game after the user edits 比賽ID / 杯賽 on the import page. */
export function legacyToDataset(raw: RawGame, overrides: { id: string; tournament: string; opponent?: string }): Dataset {
  const g: RawGame = { ...raw, game_id: overrides.id.trim() || raw.game_id, tournament: overrides.tournament.trim() || raw.tournament, opponent: overrides.opponent?.trim() || raw.opponent }
  g.batting = raw.batting.map((p) => ({ ...p })); g.pitching = raw.pitching.map((p) => ({ ...p }))
  return rawGameToDataset(g)
}

export function parseWorkbook(data: ArrayBuffer): { dataset: Dataset; report: ImportReport } {
  const wb = XLSX.read(data, { type: 'array', cellDates: false })
  const names = wb.SheetNames
  const warnings: string[] = []
  if (names.includes('打席紀錄') || names.includes('投球紀錄')) {
    const roster = parseRoster(sheetRows(wb, '球員名單', 2))
    const games = parseGames(sheetRows(wb, '比賽清單', 2))
    const batting = parseBatting(sheetRows(wb, '打席紀錄', 0))
    const pitching = parsePitching(sheetRows(wb, '投球紀錄', 0))
    const fielding = parseFielding(sheetRows(wb, '守備紀錄', 0))
    const ids = new Set(games.map((g) => g.id))
    const orphan = new Set([...batting, ...pitching, ...fielding].map((p) => p.gameId).filter((id) => id && !ids.has(id)))
    if (orphan.size) warnings.push(`有 ${orphan.size} 個比賽ID 在紀錄中出現但不在『比賽清單』：${[...orphan].slice(0, 5).join('、')}`)
    const unknownBatters = new Set(batting.map((p) => p.batter).filter((n) => !roster.some((r) => r.name === n)))
    if (unknownBatters.size) warnings.push(`有 ${unknownBatters.size} 位打者不在『球員名單』：${[...unknownBatters].slice(0, 5).join('、')}`)
    return { dataset: { roster, games, batting, pitching, fielding }, report: { mode: 'master', games: games.length, batting: batting.length, pitching: pitching.length, fielding: fielding.length, roster: roster.length, warnings } }
  }
  if (names.includes('單場-打擊') || names.includes('單場-摘要')) {
    const game = parseSingleMeta(wb)
    if (!game) throw new Error('『單場-摘要』的 C2 沒有比賽ID')
    const batting = parseBatting(sheetRows(wb, '單場-打擊', 0), game.id)
    const pitching = parsePitching(sheetRows(wb, '單場-投球', 0), game.id)
    // fielding block inside 單場-摘要: find the header row that starts with 比賽ID/球員
    const ws = wb.Sheets['單場-摘要']
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
    let fielding: FieldingLine[] = []
    const hdrIdx = grid.findIndex((row) => str(row[1]) === '比賽ID' && str(row[2]) === '球員')
    if (hdrIdx >= 0) {
      const rows = XLSX.utils.sheet_to_json<Row>(ws, { range: hdrIdx, defval: '' })
      fielding = parseFielding(rows.filter((r) => str(r['球員'])), game.id)
    }
    return { dataset: { roster: [], games: [game], batting, pitching, fielding }, report: { mode: 'single', games: 1, batting: batting.length, pitching: pitching.length, fielding: fielding.length, roster: 0, warnings } }
  }
  if (names.includes(LEGACY_SUMMARY)) {
    const raw = parseLegacyGame(wb)
    const dataset = rawGameToDataset(raw)
    return { dataset, report: { mode: 'legacy', games: 1, batting: raw.batting.length, pitching: raw.pitching.length, fielding: dataset.fielding.length, roster: dataset.roster.length, warnings: raw.warnings ?? [], legacy: raw } }
  }
  throw new Error(`找不到可辨識的工作表（需要『打席紀錄』、『單場-打擊』或舊格式的『當日比賽統計』）。目前工作表：${names.join('、')}`)
}

/** Export the current dataset as a CSV bundle (one sheet per log) for backup. */
export function datasetToWorkbook(ds: Dataset): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const games = ds.games.map((g) => ({ 比賽ID: g.id, 日期: g.date, 時間: g.time ?? '', 杯賽: g.tournament, 對手: g.opponent, 主客: g.homeAway, 場地: g.venue ?? '', 天氣: g.weather ?? '', 紀錄者: g.recorder ?? '', 局數: g.innings ?? '', 勝投: g.winningPitcher ?? '', 敗投: g.losingPitcher ?? '', 救援: g.savePitcher ?? '', 中繼: (g.holds ?? []).join(','), 備註: g.note ?? '' }))
  const bat = ds.batting.map((p) => ({ 比賽ID: p.gameId, 局: p.inning, '出局(前)': p.outsBefore ?? '', '壘上(前)': p.basesBefore ?? '', 棒次: p.order ?? '', 守位: p.pos ?? '', 打者: p.batter, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`球${i + 1}`, p.pitches[i] ?? ''])), 打擊結果: p.result, 落點: p.loc ?? '', 軌跡: p.traj ?? '', 強度: p.quality ?? '', 盜壘: p.sb || '', 盜壘失敗: p.cs || '', 失誤進壘: p.advOnError || '', 壘死: p.outOnBase || '', 得分: p.run || '', 打點: p.rbi || '', 結果代碼: p.code ?? '', 備註: p.note ?? '' }))
  const pit = ds.pitching.map((p) => ({ 比賽ID: p.gameId, 局: p.inning, '出局(前)': p.outsBefore ?? '', '壘上(前)': p.basesBefore ?? '', 對方棒次: p.oppOrder ?? '', 投手: p.pitcher, 對方打者: p.oppBatter ?? '', ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`球${i + 1}`, p.pitches[i] ?? ''])), 打擊結果: p.result, 落點: p.loc ?? '', 軌跡: p.traj ?? '', 強度: p.quality ?? '', 被盜壘: p.sba || '', 阻殺: p.cs || '', 暴投: p.wp || '', 捕逸: p.pb || '', 牽制出局: p.pk || '', 結果代碼: p.code ?? '', 備註: p.note ?? '' }))
  const fld = ds.fielding.map((f) => ({ 比賽ID: f.gameId, 球員: f.player, 守位: f.pos, 局數: f.innings ?? '', 刺殺PO: f.po, 助殺A: f.a, 失誤E: f.e, 雙殺DP: f.dp, 捕逸PB: f.pb, 被盜壘SB: f.sb, 阻殺CS: f.cs, 備註: f.note ?? '' }))
  const roster = ds.roster.map((p) => ({ 背號: p.number ?? '', 姓名: p.name, 主守位: p.primaryPos ?? '', 副守位: p.secondaryPos ?? '', 打擊慣用: p.bats ?? '', 投球慣用: p.throws ?? '', 狀態: p.status ?? '', 備註: p.note ?? '' }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(games), '比賽清單')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(roster), '球員名單')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bat), '打席紀錄')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pit), '投球紀錄')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fld), '守備紀錄')
  return wb
}
