/**
 * Stats engine. Definitions mirror the helper columns of the workbook so the
 * website and the spreadsheet always agree. See data/stat_dictionary.json.
 */
import { DEFAULT_PARAMS, LOC_CODES, type BattingPA, type Dataset, type FieldingLine, type Game, type GameResult, type Hand, type PitchingPA, type Player, type StatParams } from './types'

// ------------------------------------------------------------------ helpers
const HIT_RESULTS = new Set(['一安', '二安', '三安', '全壘打'])
const NON_AB_RESULTS = new Set(['保送', '故四', '觸身', '犧觸', '犧牲', '犧飛', '妨礙'])
const SWING_CODES = new Set(['SS', 'F', 'IP'])
const STRIKE_CODES = new Set(['S', 'SS', 'CS', 'F', 'IP'])

export const div = (n: number, d: number): number | null => (d > 0 ? n / d : null)
const count = (pitches: string[], code: string) => pitches.filter((p) => p === code).length

export interface PitchTotals { pitches: number; strikes: number; balls: number; fouls: number; whiffs: number; swings: number; called: number }
export function pitchTotals(pitches: string[]): PitchTotals {
  const whiffs = count(pitches, 'SS')
  const fouls = count(pitches, 'F')
  const inPlay = count(pitches, 'IP')
  const called = count(pitches, 'CS') + count(pitches, 'S')
  const balls = count(pitches, 'B')
  const strikes = whiffs + inPlay + called // "好球" column: S/SS/CS/IP
  return { pitches: strikes + fouls + balls, strikes: strikes + fouls, balls, fouls, whiffs, swings: whiffs + fouls + inPlay, called }
}

const isRISP = (bases?: string) => !!bases && (bases.includes('2') || bases.includes('3'))
const isBIP = (traj?: string) => traj === 'G' || traj === 'F' || traj === 'L'

export function batterHand(roster: Player[], name: string): Hand {
  const p = roster.find((r) => r.name === name)
  return p?.bats === 'L' ? 'L' : 'R'
}

/** Pull / center / opposite from location 1–9 and handedness (switch hitters treated as R). */
export function sprayDirection(loc: number | undefined, hand: Hand): 'pull' | 'center' | 'oppo' | null {
  if (!loc) return null
  if ([1, 2, 8, 46].includes(loc)) return 'center'
  const pullR = [5, 6, 7, 56, 78].includes(loc)
  if (hand === 'L') return pullR ? 'oppo' : 'pull'
  return pullR ? 'pull' : 'oppo'
}

// ------------------------------------------------------------------ batting
export interface BattingLine {
  name: string
  g: number; pa: number; ab: number; r: number; h: number; h1: number; h2: number; h3: number; hr: number; tb: number; xbh: number; rbi: number
  bb: number; ibb: number; hbp: number; so: number; sh: number; sf: number; gidp: number; roe: number; fc: number; sb: number; cs: number
  rispAB: number; rispH: number; bip: number; gb: number; fb: number; ld: number; hard: number
  pitches: number; whiffs: number; swings: number; called: number; firstPitchSwing: number; qab: number
  pull: number; center: number; oppo: number
  avg: number | null; obp: number | null; slg: number | null; ops: number | null; opsPlus: number | null; iso: number | null; babip: number | null; woba: number | null
  kPct: number | null; bbPct: number | null; bbK: number | null; sbPct: number | null; rispAvg: number | null; qabPct: number | null
  pPerPA: number | null; whiffPct: number | null; contactPct: number | null; swingPct: number | null; fpsPct: number | null
  gbPct: number | null; fbPct: number | null; ldPct: number | null; hardPct: number | null; pullPct: number | null; centerPct: number | null; oppoPct: number | null
}

function emptyBatting(name: string): BattingLine {
  return {
    name, g: 0, pa: 0, ab: 0, r: 0, h: 0, h1: 0, h2: 0, h3: 0, hr: 0, tb: 0, xbh: 0, rbi: 0, bb: 0, ibb: 0, hbp: 0, so: 0, sh: 0, sf: 0, gidp: 0, roe: 0, fc: 0, sb: 0, cs: 0,
    rispAB: 0, rispH: 0, bip: 0, gb: 0, fb: 0, ld: 0, hard: 0, pitches: 0, whiffs: 0, swings: 0, called: 0, firstPitchSwing: 0, qab: 0, pull: 0, center: 0, oppo: 0,
    avg: null, obp: null, slg: null, ops: null, opsPlus: null, iso: null, babip: null, woba: null, kPct: null, bbPct: null, bbK: null, sbPct: null, rispAvg: null, qabPct: null,
    pPerPA: null, whiffPct: null, contactPct: null, swingPct: null, fpsPct: null, gbPct: null, fbPct: null, ldPct: null, hardPct: null, pullPct: null, centerPct: null, oppoPct: null,
  }
}

export function finalizeBatting(l: BattingLine, p: StatParams = DEFAULT_PARAMS): BattingLine {
  l.tb = l.h1 + 2 * l.h2 + 3 * l.h3 + 4 * l.hr
  l.xbh = l.h2 + l.h3 + l.hr
  l.avg = div(l.h, l.ab)
  l.obp = div(l.h + l.bb + l.hbp, l.ab + l.bb + l.hbp + l.sf)
  l.slg = div(l.tb, l.ab)
  l.ops = l.obp !== null && l.slg !== null ? l.obp + l.slg : null
  l.iso = l.slg !== null && l.avg !== null ? l.slg - l.avg : null
  l.babip = div(l.h - l.hr, l.ab - l.so - l.hr + l.sf)
  l.woba = div(p.wBB * (l.bb - l.ibb) + p.wHBP * l.hbp + p.w1B * l.h1 + p.w2B * l.h2 + p.w3B * l.h3 + p.wHR * l.hr, l.ab + l.bb - l.ibb + l.sf + l.hbp)
  l.kPct = div(l.so, l.pa); l.bbPct = div(l.bb, l.pa); l.bbK = div(l.bb, l.so); l.sbPct = div(l.sb, l.sb + l.cs)
  l.rispAvg = div(l.rispH, l.rispAB); l.qabPct = div(l.qab, l.pa)
  l.pPerPA = div(l.pitches, l.pa); l.whiffPct = div(l.whiffs, l.swings); l.contactPct = l.whiffPct === null ? null : 1 - l.whiffPct
  l.swingPct = div(l.swings, l.pitches); l.fpsPct = div(l.firstPitchSwing, l.pa)
  l.gbPct = div(l.gb, l.bip); l.fbPct = div(l.fb, l.bip); l.ldPct = div(l.ld, l.bip); l.hardPct = div(l.hard, l.bip)
  l.pullPct = div(l.pull, l.bip); l.centerPct = div(l.center, l.bip); l.oppoPct = div(l.oppo, l.bip)
  return l
}

export function accumulateBatting(l: BattingLine, pa: BattingPA, hand: Hand) {
  const r = pa.result
  if (!r) return
  const pt = pitchTotals(pa.pitches)
  l.pa++
  const isAB = !NON_AB_RESULTS.has(r)
  if (isAB) l.ab++
  const hit = HIT_RESULTS.has(r)
  if (hit) l.h++
  if (r === '一安') l.h1++; if (r === '二安') l.h2++; if (r === '三安') l.h3++; if (r === '全壘打') l.hr++
  if (r === '保送' || r === '故四') l.bb++; if (r === '故四') l.ibb++; if (r === '觸身') l.hbp++; if (r === '三振') l.so++
  if (r === '犧觸' || r === '犧牲') l.sh++; if (r === '犧飛') l.sf++; if (r === '雙殺') l.gidp++; if (r === '失誤') l.roe++; if (r === '野選') l.fc++
  l.r += pa.run; l.rbi += pa.rbi; l.sb += pa.sb; l.cs += pa.cs
  if (isAB && isRISP(pa.basesBefore)) { l.rispAB++; if (hit) l.rispH++ }
  if (isBIP(pa.traj)) {
    l.bip++
    if (pa.traj === 'G') l.gb++; if (pa.traj === 'F') l.fb++; if (pa.traj === 'L') l.ld++
    if (pa.quality === '強') l.hard++
    const dir = sprayDirection(pa.loc, hand)
    if (dir === 'pull') l.pull++; else if (dir === 'center') l.center++; else if (dir === 'oppo') l.oppo++
  }
  l.pitches += pt.pitches; l.whiffs += pt.whiffs; l.swings += pt.swings; l.called += pt.called
  if (SWING_CODES.has(pa.pitches[0] ?? '')) l.firstPitchSwing++
  const hardBIP = isBIP(pa.traj) && pa.quality === '強'
  if (hit || r === '保送' || r === '故四' || r === '觸身' || r === '犧觸' || r === '犧牲' || r === '犧飛' || pa.rbi > 0 || pt.pitches >= 6 || hardBIP) l.qab++
}

export function battingLines(ds: Dataset, pas: BattingPA[], params = DEFAULT_PARAMS): BattingLine[] {
  const map = new Map<string, BattingLine>()
  const games = new Map<string, Set<string>>()
  for (const pa of pas) {
    if (!pa.batter) continue
    let l = map.get(pa.batter)
    if (!l) { l = emptyBatting(pa.batter); map.set(pa.batter, l); games.set(pa.batter, new Set()) }
    accumulateBatting(l, pa, batterHand(ds.roster, pa.batter))
    games.get(pa.batter)!.add(pa.gameId)
  }
  const out = [...map.values()].map((l) => { l.g = games.get(l.name)!.size; return finalizeBatting(l, params) })
  // OPS+ relative to the same slice of the team (100 = team average; no park factor)
  const team = teamBatting(ds, pas, params)
  for (const l of out) l.opsPlus = opsPlus(l, team)
  return out.sort((a, b) => b.pa - a.pa)
}

/** 100 × (OBP ÷ 基準OBP + SLG ÷ 基準SLG − 1), rounded; null when either side is undefined. */
export function opsPlus(l: { obp: number | null; slg: number | null }, base: { obp: number | null; slg: number | null }): number | null {
  if (l.obp === null || l.slg === null || !base.obp || !base.slg) return null
  return Math.round(100 * (l.obp / base.obp + l.slg / base.slg - 1))
}

export function teamBatting(ds: Dataset, pas: BattingPA[], params = DEFAULT_PARAMS): BattingLine {
  const l = emptyBatting('球隊')
  const games = new Set<string>()
  for (const pa of pas) { if (!pa.batter) continue; accumulateBatting(l, pa, batterHand(ds.roster, pa.batter)); games.add(pa.gameId) }
  l.g = games.size
  finalizeBatting(l, params)
  l.opsPlus = l.ops === null ? null : 100
  return l
}

// ------------------------------------------------------------------ pitching
export interface PitchingLine {
  name: string
  g: number; gs: number; w: number; l: number; sv: number; hld: number; outs: number; ip: number; ipDisplay: string
  bf: number; ab: number; pc: number; strikes: number; balls: number; k: number; bb: number; ibb: number; hbp: number; h: number; h2: number; h3: number; hr: number; sf: number
  r: number; er: number; wp: number; sba: number; cs: number; pk: number
  bip: number; gb: number; fb: number; ld: number; hard: number; whiffs: number; swings: number; called: number; firstPitchStrike: number
  era: number | null; whip: number | null; k9: number | null; bb9: number | null; h9: number | null; kbb: number | null; kPct: number | null; bbPct: number | null
  oppAvg: number | null; oppObp: number | null; babip: number | null; fip: number | null; strikePct: number | null
  gbPct: number | null; fbPct: number | null; ldPct: number | null; hardPct: number | null; whiffPct: number | null; cswPct: number | null; fStrikePct: number | null
  pPerIP: number | null; pPerBF: number | null; lobPct: number | null
}

function emptyPitching(name: string): PitchingLine {
  return {
    name, g: 0, gs: 0, w: 0, l: 0, sv: 0, hld: 0, outs: 0, ip: 0, ipDisplay: '0.0', bf: 0, ab: 0, pc: 0, strikes: 0, balls: 0, k: 0, bb: 0, ibb: 0, hbp: 0, h: 0, h2: 0, h3: 0, hr: 0, sf: 0,
    r: 0, er: 0, wp: 0, sba: 0, cs: 0, pk: 0, bip: 0, gb: 0, fb: 0, ld: 0, hard: 0, whiffs: 0, swings: 0, called: 0, firstPitchStrike: 0,
    era: null, whip: null, k9: null, bb9: null, h9: null, kbb: null, kPct: null, bbPct: null, oppAvg: null, oppObp: null, babip: null, fip: null, strikePct: null,
    gbPct: null, fbPct: null, ldPct: null, hardPct: null, whiffPct: null, cswPct: null, fStrikePct: null, pPerIP: null, pPerBF: null, lobPct: null,
  }
}

export const ipDisplay = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`

export function accumulatePitching(l: PitchingLine, pa: PitchingPA) {
  const r = pa.result
  if (!r) return
  const pt = pitchTotals(pa.pitches)
  l.bf++
  if (!NON_AB_RESULTS.has(r)) l.ab++
  l.pc += pt.pitches; l.strikes += pt.strikes; l.balls += pt.balls; l.whiffs += pt.whiffs; l.swings += pt.swings; l.called += pt.called
  if (STRIKE_CODES.has(pa.pitches[0] ?? '')) l.firstPitchStrike++
  if (HIT_RESULTS.has(r)) l.h++
  if (r === '二安') l.h2++; if (r === '三安') l.h3++; if (r === '全壘打') l.hr++; if (r === '犧飛') l.sf++
  if (r === '三振') l.k++; if (r === '保送' || r === '故四') l.bb++; if (r === '故四') l.ibb++; if (r === '觸身') l.hbp++
  // 雙殺 produces two outs but is recorded on one row; only possible with 0–1 outs before the PA (see 數據字典 IP)
  if (pa.code === 'I' || pa.code === 'II' || pa.code === 'III') l.outs += r === '雙殺' && (pa.outsBefore ?? 0) <= 1 ? 2 : 1
  if (pa.code === 'R' || pa.code === 'ER') l.r++
  if (pa.code === 'ER') l.er++
  l.wp += pa.wp; l.sba += pa.sba; l.cs += pa.cs; l.pk += pa.pk
  if (isBIP(pa.traj)) { l.bip++; if (pa.traj === 'G') l.gb++; if (pa.traj === 'F') l.fb++; if (pa.traj === 'L') l.ld++; if (pa.quality === '強') l.hard++ }
}

export function finalizePitching(l: PitchingLine, p: StatParams = DEFAULT_PARAMS): PitchingLine {
  const ip = l.outs / 3
  l.ip = ip; l.ipDisplay = ipDisplay(l.outs)
  l.era = ip > 0 ? (l.er * p.inningsPerGame) / ip : null
  l.whip = ip > 0 ? (l.bb + l.h) / ip : null
  l.k9 = ip > 0 ? (l.k * 9) / ip : null; l.bb9 = ip > 0 ? (l.bb * 9) / ip : null; l.h9 = ip > 0 ? (l.h * 9) / ip : null
  l.kbb = div(l.k, l.bb); l.kPct = div(l.k, l.bf); l.bbPct = div(l.bb, l.bf)
  l.oppAvg = div(l.h, l.ab); l.oppObp = div(l.h + l.bb + l.hbp, l.ab + l.bb + l.hbp + l.sf)
  l.babip = div(l.h - l.hr, l.ab - l.k - l.hr + l.sf)
  l.fip = ip > 0 ? (13 * l.hr + 3 * (l.bb + l.hbp) - 2 * l.k) / ip + p.fipConstant : null
  l.strikePct = div(l.strikes, l.pc)
  l.gbPct = div(l.gb, l.bip); l.fbPct = div(l.fb, l.bip); l.ldPct = div(l.ld, l.bip); l.hardPct = div(l.hard, l.bip)
  l.whiffPct = div(l.whiffs, l.swings); l.cswPct = div(l.called + l.whiffs, l.pc); l.fStrikePct = div(l.firstPitchStrike, l.bf)
  l.pPerIP = ip > 0 ? l.pc / ip : null; l.pPerBF = div(l.pc, l.bf)
  const lobDen = l.h + l.bb + l.hbp - 1.4 * l.hr
  l.lobPct = lobDen > 0 ? (l.h + l.bb + l.hbp - l.r) / lobDen : null
  return l
}

export function pitchingLines(pas: PitchingPA[], games: Game[], params = DEFAULT_PARAMS): PitchingLine[] {
  const map = new Map<string, PitchingLine>()
  const gameSets = new Map<string, Set<string>>()
  const starters = new Map<string, string>() // gameId -> first pitcher
  for (const pa of pas) {
    if (!pa.pitcher) continue
    if (!starters.has(pa.gameId)) starters.set(pa.gameId, pa.pitcher)
    let l = map.get(pa.pitcher)
    if (!l) { l = emptyPitching(pa.pitcher); map.set(pa.pitcher, l); gameSets.set(pa.pitcher, new Set()) }
    accumulatePitching(l, pa)
    gameSets.get(pa.pitcher)!.add(pa.gameId)
  }
  for (const [gid, name] of starters) { const l = map.get(name); if (l && gameSets.get(name)!.has(gid)) l.gs++ }
  for (const g of games) {
    if (g.winningPitcher && map.has(g.winningPitcher)) map.get(g.winningPitcher)!.w++
    if (g.losingPitcher && map.has(g.losingPitcher)) map.get(g.losingPitcher)!.l++
    if (g.savePitcher && map.has(g.savePitcher)) map.get(g.savePitcher)!.sv++
    for (const h of g.holds ?? []) if (map.has(h)) map.get(h)!.hld++
  }
  return [...map.values()].map((l) => { l.g = gameSets.get(l.name)!.size; return finalizePitching(l, params) }).sort((a, b) => b.outs - a.outs)
}

export function teamPitching(pas: PitchingPA[], params = DEFAULT_PARAMS): PitchingLine {
  const l = emptyPitching('球隊')
  const games = new Set<string>()
  for (const pa of pas) { if (!pa.pitcher) continue; accumulatePitching(l, pa); games.add(pa.gameId) }
  l.g = games.size
  return finalizePitching(l, params)
}

// ------------------------------------------------------------------ fielding
export interface FieldingStat {
  name: string; g: number; innings: number; po: number; a: number; e: number; dp: number; tc: number; pb: number; sb: number; cs: number
  fpct: number | null; rfg: number | null; csPct: number | null; positions: string[]
}

export function fieldingLines(lines: FieldingLine[]): FieldingStat[] {
  const map = new Map<string, FieldingStat>()
  for (const f of lines) {
    if (!f.player) continue
    let s = map.get(f.player)
    if (!s) { s = { name: f.player, g: 0, innings: 0, po: 0, a: 0, e: 0, dp: 0, tc: 0, pb: 0, sb: 0, cs: 0, fpct: null, rfg: null, csPct: null, positions: [] }; map.set(f.player, s) }
    s.g++; s.innings += f.innings ?? 0; s.po += f.po; s.a += f.a; s.e += f.e; s.dp += f.dp; s.pb += f.pb; s.sb += f.sb; s.cs += f.cs
    if (f.pos && !s.positions.includes(f.pos)) s.positions.push(f.pos)
  }
  return [...map.values()].map((s) => {
    s.tc = s.po + s.a + s.e
    s.fpct = div(s.po + s.a, s.tc); s.rfg = div(s.po + s.a, s.g); s.csPct = div(s.cs, s.sb + s.cs)
    return s
  }).sort((a, b) => b.tc - a.tc || b.g - a.g)
}

export function errorsByPosition(lines: FieldingLine[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of lines) if (f.pos) out[f.pos] = (out[f.pos] ?? 0) + f.e
  return out
}

// ------------------------------------------------------------------ games / team
export interface GameSummary {
  game: Game
  runsUs: number; runsOpp: number; hitsUs: number; hitsOpp: number; errorsUs: number; errorsOpp: number; lobUs: number
  lineUs: number[]; lineOpp: number[]
  result: GameResult
  pitchesUs: number
}

export function summarizeGame(ds: Dataset, game: Game): GameSummary {
  const bat = ds.batting.filter((p) => p.gameId === game.id)
  const pit = ds.pitching.filter((p) => p.gameId === game.id)
  const fld = ds.fielding.filter((f) => f.gameId === game.id)
  const maxInn = Math.max(game.innings ?? 0, ...bat.map((p) => p.inning), ...pit.map((p) => p.inning), 1)
  const lineUs = Array.from({ length: maxInn }, () => 0)
  const lineOpp = Array.from({ length: maxInn }, () => 0)
  for (const p of bat) if (p.inning >= 1 && p.inning <= maxInn) lineUs[p.inning - 1] += p.run
  for (const p of pit) if (p.inning >= 1 && p.inning <= maxInn && (p.code === 'R' || p.code === 'ER')) lineOpp[p.inning - 1]++
  const runsUs = lineUs.reduce((a, b) => a + b, 0)
  const runsOpp = lineOpp.reduce((a, b) => a + b, 0)
  return {
    game, runsUs, runsOpp,
    hitsUs: bat.filter((p) => HIT_RESULTS.has(p.result)).length,
    hitsOpp: pit.filter((p) => HIT_RESULTS.has(p.result)).length,
    errorsUs: fld.reduce((a, f) => a + f.e, 0),
    errorsOpp: bat.filter((p) => p.result === '失誤').length,
    lobUs: bat.filter((p) => p.code === 'L').length,
    lineUs, lineOpp,
    result: runsUs > runsOpp ? 'W' : runsUs < runsOpp ? 'L' : 'T',
    pitchesUs: pit.reduce((a, p) => a + pitchTotals(p.pitches).pitches, 0),
  }
}

export interface TeamSummary {
  games: number; w: number; l: number; t: number; winPct: number | null; rs: number; ra: number; diff: number; pythag: number | null
  runsPerGame: number | null; runsAllowedPerGame: number | null
  runsByInningUs: number[]; runsByInningOpp: number[]
}

export function teamSummary(summaries: GameSummary[], params = DEFAULT_PARAMS): TeamSummary {
  const w = summaries.filter((s) => s.result === 'W').length
  const l = summaries.filter((s) => s.result === 'L').length
  const t = summaries.length - w - l
  const rs = summaries.reduce((a, s) => a + s.runsUs, 0)
  const ra = summaries.reduce((a, s) => a + s.runsOpp, 0)
  const e = params.pythagExponent
  const maxInn = Math.max(9, ...summaries.map((s) => s.lineUs.length))
  const byUs = Array.from({ length: maxInn }, () => 0)
  const byOpp = Array.from({ length: maxInn }, () => 0)
  for (const s of summaries) { s.lineUs.forEach((v, i) => (byUs[i] += v)); s.lineOpp.forEach((v, i) => (byOpp[i] += v)) }
  return {
    games: summaries.length, w, l, t, winPct: div(w, w + l), rs, ra, diff: rs - ra,
    pythag: rs + ra > 0 ? Math.pow(rs, e) / (Math.pow(rs, e) + Math.pow(ra, e)) : null,
    runsPerGame: div(rs, summaries.length), runsAllowedPerGame: div(ra, summaries.length),
    runsByInningUs: byUs.slice(0, 9), runsByInningOpp: byOpp.slice(0, 9),
  }
}

/** Spray-chart counts by 落點 code (1–9 and the gap codes; balls in play only). Arrays are sparse, indexed by code. */
export function sprayCounts(pas: Array<{ loc?: number; traj?: string; result?: string }>): { all: number[]; hits: number[] } {
  const all = Array.from({ length: 90 }, () => 0)
  const hits = Array.from({ length: 90 }, () => 0)
  for (const p of pas) {
    if (!p.loc || !LOC_CODES.includes(p.loc) || !isBIP(p.traj)) continue
    all[p.loc]++
    if (p.result && HIT_RESULTS.has(p.result)) hits[p.loc]++
  }
  return { all, hits }
}

export const isHitResult = (r: string) => HIT_RESULTS.has(r)
