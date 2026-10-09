/**
 * Stats engine. Definitions mirror the helper columns of the workbook so the
 * website and the spreadsheet always agree. See data/stat_dictionary.json.
 */
import { balksIn } from './plays'
import { countTrail, isTwoStrikeBattle } from './counts'
import { pitcherSituations } from './pitchingSituations'
import { BATTER_OUT_BIP, DEFAULT_PARAMS, HIT_BASE_COUNT, isDouble, isPlaced, isSingle, LOC_CODES, TRAJ_OF, type BattingPA, type Dataset, type FieldingLine, type Game, type GameResult, type Hand, type PitchingPA, type Player, type StatParams } from './types'

// ------------------------------------------------------------------ helpers
const HIT_RESULTS = new Set(Object.keys(HIT_BASE_COUNT))
export const NON_AB_RESULTS = new Set(['保送', '故四', '觸身', '犧觸', '犧牲', '犧飛', '妨礙'])
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
// P = 內野飛球: a fly ball that stays in the infield (counted with the fly balls, and on its own for IFFB%)
const isBIP = (traj?: string) => traj === 'G' || traj === 'F' || traj === 'L' || traj === 'P'

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
  /** 壘死: outs on the bases from his own baserunning mistakes */
  baserunningOuts: number
  rispAB: number; rispH: number; bip: number; gb: number; fb: number; ld: number; hard: number; iffb: number
  pitches: number; whiffs: number; swings: number; called: number; firstPitchSwing: number; qab: number
  /** plate appearances that reached two strikes / of those, 3+ more pitches after it (兩好球纏鬥) / 6+ pitches (6球以上) */
  twoStrikePA: number; twoStrikeBattles: number; longPA: number
  /** balls he took (not counting an intentional walk's) — the out-of-zone takes of sSeager */
  ballsTaken: number
  pull: number; center: number; oppo: number
  avg: number | null; obp: number | null; slg: number | null; ops: number | null; opsPlus: number | null; iso: number | null; babip: number | null; woba: number | null
  /** wRC+ against the same slice of the team (100 = team average) */
  wrcPlus: number | null
  /** Simple SEAGER: selective aggression (see finalizeBatting) */
  sSeager: number | null
  kPct: number | null; bbPct: number | null; bbK: number | null; sbPct: number | null; rispAvg: number | null; qabPct: number | null
  pPerPA: number | null; whiffPct: number | null; contactPct: number | null; swingPct: number | null; fpsPct: number | null
  gbPct: number | null; fbPct: number | null; ldPct: number | null; iffbPct: number | null; hardPct: number | null; pullPct: number | null; centerPct: number | null; oppoPct: number | null
  /** 獲勝機率增加值 / 局面得分增值: filled in by data/winTimeline.withWinBatting (the model), null here */
  wpa: number | null; re24: number | null
}

function emptyBatting(name: string): BattingLine {
  return {
    name, g: 0, pa: 0, ab: 0, r: 0, h: 0, h1: 0, h2: 0, h3: 0, hr: 0, tb: 0, xbh: 0, rbi: 0, bb: 0, ibb: 0, hbp: 0, so: 0, sh: 0, sf: 0, gidp: 0, roe: 0, fc: 0, sb: 0, cs: 0, baserunningOuts: 0,
    rispAB: 0, rispH: 0, bip: 0, gb: 0, fb: 0, ld: 0, iffb: 0, hard: 0, pitches: 0, whiffs: 0, swings: 0, called: 0, firstPitchSwing: 0, qab: 0, twoStrikePA: 0, twoStrikeBattles: 0, longPA: 0, ballsTaken: 0, pull: 0, center: 0, oppo: 0,
    avg: null, obp: null, slg: null, ops: null, opsPlus: null, iso: null, babip: null, woba: null, wrcPlus: null, sSeager: null, kPct: null, bbPct: null, bbK: null, sbPct: null, rispAvg: null, qabPct: null,
    pPerPA: null, whiffPct: null, contactPct: null, swingPct: null, fpsPct: null, gbPct: null, fbPct: null, ldPct: null, iffbPct: null, hardPct: null, pullPct: null, centerPct: null, oppoPct: null,
    wpa: null, re24: null,
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
  // Simple SEAGER (Sky Kalkman's take on Robert Orr's SEAGER): out-of-zone takes ÷ (zone swings + out-of-zone takes)
  // − zone takes ÷ all takes. No pitch location is recorded, so a take's zone is the umpire's call (called strike =
  // in the zone, ball = out of it) and every swing counts as a zone swing.
  const takes = l.called + l.ballsTaken
  l.sSeager = takes > 0 && l.swings + l.ballsTaken > 0 ? l.ballsTaken / (l.swings + l.ballsTaken) - l.called / takes : null
  l.gbPct = div(l.gb, l.bip); l.fbPct = div(l.fb, l.bip); l.ldPct = div(l.ld, l.bip); l.iffbPct = div(l.iffb, l.fb); l.hardPct = div(l.hard, l.bip)
  l.pullPct = div(l.pull, l.bip); l.centerPct = div(l.center, l.bip); l.oppoPct = div(l.oppo, l.bip)
  return l
}

export function accumulateBatting(l: BattingLine, pa: BattingPA, hand: Hand) {
  const r = pa.result
  if (!r) return
  // a tie-break runner is no plate appearance: only what he did on the bases counts (the game still counts for G)
  if (isPlaced(pa)) { l.r += pa.run; l.sb += pa.sb; l.cs += pa.cs; l.baserunningOuts += pa.baserunningOuts ?? 0; return }
  const pt = pitchTotals(pa.pitches)
  l.pa++
  const isAB = !NON_AB_RESULTS.has(r)
  if (isAB) l.ab++
  const hit = HIT_RESULTS.has(r)
  if (hit) l.h++
  if (isSingle(r)) l.h1++; if (isDouble(r)) l.h2++; if (r === '三安') l.h3++; if (r === '全壘打') l.hr++
  if (r === '保送' || r === '故四') l.bb++; if (r === '故四') l.ibb++; if (r === '觸身') l.hbp++; if (r === '三振') l.so++
  if (r === '犧觸' || r === '犧牲') l.sh++; if (r === '犧飛') l.sf++; if (r === '雙殺') l.gidp++; if (r === '失誤') l.roe++; if (r === '野選') l.fc++
  l.r += pa.run; l.rbi += pa.rbi; l.sb += pa.sb; l.cs += pa.cs; l.baserunningOuts += pa.baserunningOuts ?? 0
  if (isAB && isRISP(pa.basesBefore)) { l.rispAB++; if (hit) l.rispH++ }
  if (isBIP(pa.traj)) {
    l.bip++
    if (pa.traj === 'G') l.gb++; if (pa.traj === 'F' || pa.traj === 'P') l.fb++; if (pa.traj === 'P') l.iffb++; if (pa.traj === 'L') l.ld++
    if (pa.quality === '強') l.hard++
    const dir = sprayDirection(pa.loc, hand)
    if (dir === 'pull') l.pull++; else if (dir === 'center') l.center++; else if (dir === 'oppo') l.oppo++
  }
  l.pitches += pt.pitches; l.whiffs += pt.whiffs; l.swings += pt.swings; l.called += pt.called
  if (r !== '故四') l.ballsTaken += pt.balls
  if (SWING_CODES.has(pa.pitches[0] ?? '')) l.firstPitchSwing++
  const hardBIP = isBIP(pa.traj) && pa.quality === '強'
  // 兩好球纏鬥: 3+ pitches after reaching two strikes (the last one included); 6球以上: 6+ pitches
  const trail = countTrail(pa.pitches)
  const battle = isTwoStrikeBattle(trail)
  if (trail.twoStrikeAt !== null) l.twoStrikePA++
  if (battle) l.twoStrikeBattles++
  if (pt.pitches >= 6) l.longPA++
  if (hit || r === '保送' || r === '故四' || r === '觸身' || r === '犧觸' || r === '犧牲' || r === '犧飛' || pa.rbi > 0 || pt.pitches >= 6 || hardBIP || battle) l.qab++
}

/** One line over the given plate appearances (all counted for `name`, whoever batted): counts and rates, no OPS+ / wRC+.
 *  The 情境拆分 rows use it (a pitcher's rows go through splits.asBattingPA first). */
export function lineFor(name: string, pas: BattingPA[], roster: Player[], params = DEFAULT_PARAMS): BattingLine {
  const l = emptyBatting(name)
  const games = new Set<string>()
  for (const pa of pas) { if (!pa.result) continue; accumulateBatting(l, pa, batterHand(roster, pa.batter)); games.add(pa.gameId) }
  l.g = games.size
  return finalizeBatting(l, params)
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
  // 代跑: the run, steals and caught stealing after the batter reached belong to whoever ran for him
  for (const pa of pas) {
    if (!pa.batter || !pa.runner || pa.runner === pa.batter || !pa.result) continue
    const from = map.get(pa.batter)!
    let to = map.get(pa.runner)
    if (!to) { to = emptyBatting(pa.runner); map.set(pa.runner, to); games.set(pa.runner, new Set()) }
    from.r -= pa.run; from.sb -= pa.sb; from.cs -= pa.cs; from.baserunningOuts -= pa.baserunningOuts ?? 0
    to.r += pa.run; to.sb += pa.sb; to.cs += pa.cs; to.baserunningOuts += pa.baserunningOuts ?? 0
    games.get(pa.runner)!.add(pa.gameId)
  }
  const out = [...map.values()].map((l) => { l.g = games.get(l.name)!.size; return finalizeBatting(l, params) })
  // OPS+ and wRC+ relative to the same slice of the team (100 = team average; no park factor)
  const team = teamBatting(ds, pas, params)
  for (const l of out) { l.opsPlus = opsPlus(l, team); l.wrcPlus = wrcPlus(l, team) }
  return out.sort((a, b) => b.pa - a.pa)
}

/** 100 × (OBP ÷ 基準OBP + SLG ÷ 基準SLG − 1), rounded; null when either side is undefined. */
export function opsPlus(l: { obp: number | null; slg: number | null }, base: { obp: number | null; slg: number | null }): number | null {
  if (l.obp === null || l.slg === null || !base.obp || !base.slg) return null
  return Math.round(100 * (l.obp / base.obp + l.slg / base.slg - 1))
}

/** FanGraphs Guts! 2025 wOBA scale: turns a wOBA difference into runs per plate appearance (the weights are 2025's too). */
export const WOBA_SCALE = 1.232
/**
 * wRC+ against `base` (the team in the same filter): 100 × ((wOBA − 基準wOBA) ÷ wOBA scale + 基準R/PA) ÷ 基準R/PA,
 * rounded; null when either wOBA is undefined or the base scored no runs.
 */
export function wrcPlus(l: { woba: number | null }, base: { woba: number | null; r: number; pa: number }): number | null {
  if (l.woba === null || base.woba === null || !base.pa || !base.r) return null
  const rpa = base.r / base.pa
  return Math.round((100 * ((l.woba - base.woba) / WOBA_SCALE + rpa)) / rpa)
}

export function teamBatting(ds: Dataset, pas: BattingPA[], params = DEFAULT_PARAMS): BattingLine {
  const l = emptyBatting('球隊')
  const games = new Set<string>()
  for (const pa of pas) { if (!pa.batter) continue; accumulateBatting(l, pa, batterHand(ds.roster, pa.batter)); games.add(pa.gameId) }
  l.g = games.size
  finalizeBatting(l, params)
  l.opsPlus = l.ops === null ? null : 100
  l.wrcPlus = wrcPlus(l, l)
  return l
}

// ------------------------------------------------------------------ pitching
export interface PitchingLine {
  name: string
  g: number; gs: number; w: number; l: number; sv: number; hld: number; outs: number; ip: number; ipDisplay: string
  bf: number; ab: number; pc: number; strikes: number; balls: number; k: number; bb: number; ibb: number; hbp: number; h: number; h2: number; h3: number; hr: number; sf: number
  r: number; er: number; wp: number; sba: number; cs: number; pk: number
  /** 投手犯規 (balks), counted from the runner plays (one balk moves every runner, logged once per runner) */
  bk: number
  bip: number; gb: number; fb: number; ld: number; iffb: number; hard: number; whiffs: number; swings: number; called: number; firstPitchStrike: number
  era: number | null; whip: number | null; k7: number | null; k9: number | null; bb9: number | null; h9: number | null; kbb: number | null; kPct: number | null; bbPct: number | null
  oppAvg: number | null; oppObp: number | null; babip: number | null; fip: number | null; strikePct: number | null
  gbPct: number | null; fbPct: number | null; ldPct: number | null; iffbPct: number | null; hardPct: number | null; whiffPct: number | null; cswPct: number | null; fStrikePct: number | null
  pPerIP: number | null; pPerBF: number | null; lobPct: number | null
  /** 滾地／飛球出局 (battedOutKind) and walks who came around to score (保送得分) */
  go: number; ao: number; bbScored: number
  /** need whole games and the score (pitchingLines' ctx; 0 without it): leadoff batters faced / put out, half-innings
   *  pitched alone to 3 outs, of those with every pitch recorded (pitchInn, 13P%'s denominator) / in ≤ 13 pitches and 1-2-3, inherited runners / that scored, blown saves, and
   *  relief entries that could not be judged (no runners recorded for a mid-inning change) */
  leadoffBf: number; leadoffOuts: number; fullInn: number; pitchInn: number; inn13: number; inn123: number; ir: number; irs: number; bs: number; sitGaps: number
  goAo: number | null; bbScoredPct: number | null; leadoffOutPct: number | null; inn13Pct: number | null; irsPct: number | null
  /** 獲勝機率增加值 / 局面得分增值 (runs saved): filled in by data/winTimeline.withWinPitching (the model), null here */
  wpa: number | null; re24: number | null
}

function emptyPitching(name: string): PitchingLine {
  return {
    name, g: 0, gs: 0, w: 0, l: 0, sv: 0, hld: 0, outs: 0, ip: 0, ipDisplay: '0.0', bf: 0, ab: 0, pc: 0, strikes: 0, balls: 0, k: 0, bb: 0, ibb: 0, hbp: 0, h: 0, h2: 0, h3: 0, hr: 0, sf: 0,
    r: 0, er: 0, wp: 0, sba: 0, cs: 0, pk: 0, bk: 0, bip: 0, gb: 0, fb: 0, ld: 0, iffb: 0, hard: 0, whiffs: 0, swings: 0, called: 0, firstPitchStrike: 0,
    era: null, whip: null, k7: null, k9: null, bb9: null, h9: null, kbb: null, kPct: null, bbPct: null, oppAvg: null, oppObp: null, babip: null, fip: null, strikePct: null,
    gbPct: null, fbPct: null, ldPct: null, iffbPct: null, hardPct: null, whiffPct: null, cswPct: null, fStrikePct: null, pPerIP: null, pPerBF: null, lobPct: null,
    go: 0, ao: 0, bbScored: 0, leadoffBf: 0, leadoffOuts: 0, fullInn: 0, pitchInn: 0, inn13: 0, inn123: 0, ir: 0, irs: 0, bs: 0, sitGaps: 0,
    goAo: null, bbScoredPct: null, leadoffOutPct: null, inn13Pct: null, irsPct: null,
    wpa: null, re24: null,
  }
}

/**
 * 滾地出局 (GO) or 飛球出局 (AO) for a ball in play the batter was out on (內滾 內飛 外飛 界外飛 犧飛 雙殺), from its
 * 軌跡 or, when none was recorded, the one the result implies: G = GO; F, P, L = AO. Anything else (三振, 犧觸, hits,
 * 野選, 失誤, walks) is neither. The one definition the site uses (投球表, 比賽附註).
 */
export function battedOutKind(pa: { result: string; traj?: string }): 'GO' | 'AO' | null {
  if (!BATTER_OUT_BIP.has(pa.result)) return null
  const t = pa.traj || TRAJ_OF[pa.result]
  if (t === 'G') return 'GO'
  if (t === 'F' || t === 'P' || t === 'L') return 'AO'
  return null
}

export const ipDisplay = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`

const OUT_NO: Record<string, number> = { I: 1, II: 2, III: 3 }
/**
 * How many outs each plate appearance's pitcher is credited with (IP), for a list of rows in game order.
 * Every out of an inning is counted once: its result code (I / II / III = the 1st / 2nd / 3rd out) is on the row of
 * the player who made it. A 雙殺 also stands for the out before its own when no row carries that one (a workbook
 * puts the code on the batter's row only; live recording codes the runner's row too — counting 2 for the 雙殺 row
 * then counted that out twice). Each out goes to the pitcher on the mound when it was made — the plate appearance
 * during which the inning's outs passed it (outs before) — so a reliever gets the double play that erases a runner
 * his predecessor put on. Rows without outs-before keep the out on the row that carries it.
 */
export function outsCredited(pas: PitchingPA[]): Map<PitchingPA, number> {
  const credit = new Map<PitchingPA, number>()
  const groups = new Map<string, PitchingPA[]>()
  for (const pa of pas) { const k = `${pa.gameId}\u0000${pa.inning}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(pa) }
  for (const rows of groups.values()) {
    const owner = new Map<number, PitchingPA>()
    const coded = rows.filter((pa) => OUT_NO[pa.code ?? ''])
    for (const pa of coded) owner.set(OUT_NO[pa.code!], pa)
    if (owner.size < coded.length) {
      // the same out number twice (rows with a wrong inning, a mistyped code): count row by row as before
      for (const pa of coded) credit.set(pa, (credit.get(pa) ?? 0) + (pa.result === '雙殺' && (pa.outsBefore ?? 0) <= 1 && !owner.has(OUT_NO[pa.code!] - 1) ? 2 : 1))
      continue
    }
    for (const pa of rows) {
      const k = OUT_NO[pa.code ?? '']
      if (pa.result === '雙殺' && k >= 2 && (pa.outsBefore ?? 0) <= 1 && !owner.has(k - 1)) owner.set(k - 1, pa)
    }
    const timed = rows.every((r) => typeof r.outsBefore === 'number')
    for (const [k, holder] of owner) {
      let at = holder
      if (timed) {
        const i = rows.findIndex((r, j) => r.outsBefore! < k && (j === rows.length - 1 || rows[j + 1].outsBefore! >= k))
        if (i >= 0) at = rows[i]
      }
      credit.set(at, (credit.get(at) ?? 0) + 1)
    }
  }
  return credit
}

/** outs: what outsCredited gives this row (callers with the whole game pass it; alone, the row's own code counts) */
export function accumulatePitching(l: PitchingLine, pa: PitchingPA, outs?: number) {
  const r = pa.result
  if (!r) return
  // a tie-break runner: not a batter faced; his outs on the bases and his run (never earned) are the pitcher's
  if (isPlaced(pa)) {
    if (outs !== undefined) l.outs += outs
    else if (pa.code === 'I' || pa.code === 'II' || pa.code === 'III') l.outs += 1
    if (pa.code === 'R' || pa.code === 'ER') l.r++
    if (pa.code === 'ER') l.er++
    // (a half that ended before anyone batted keeps its pitcher's plays on the last runner: record/model settlePending)
    l.wp += pa.wp; l.sba += pa.sba; l.cs += pa.cs; l.pk += pa.pk; l.bk += balksIn(pa.events)
    return
  }
  const pt = pitchTotals(pa.pitches)
  l.bf++
  if (!NON_AB_RESULTS.has(r)) l.ab++
  l.pc += pt.pitches; l.strikes += pt.strikes; l.balls += pt.balls; l.whiffs += pt.whiffs; l.swings += pt.swings; l.called += pt.called
  if (STRIKE_CODES.has(pa.pitches[0] ?? '')) l.firstPitchStrike++
  if (HIT_RESULTS.has(r)) l.h++
  if (isDouble(r)) l.h2++; if (r === '三安') l.h3++; if (r === '全壘打') l.hr++; if (r === '犧飛') l.sf++
  if (r === '三振') l.k++; if (r === '保送' || r === '故四') l.bb++; if (r === '故四') l.ibb++; if (r === '觸身') l.hbp++
  // outs: counted once per out and credited to the pitcher on the mound (outsCredited)
  if (outs !== undefined) l.outs += outs
  else if (pa.code === 'I' || pa.code === 'II' || pa.code === 'III') l.outs += r === '雙殺' && (pa.outsBefore ?? 0) <= 1 ? 2 : 1
  if (pa.code === 'R' || pa.code === 'ER') l.r++
  if (pa.code === 'ER') l.er++
  l.wp += pa.wp; l.sba += pa.sba; l.cs += pa.cs; l.pk += pa.pk; l.bk += balksIn(pa.events)
  if (isBIP(pa.traj)) { l.bip++; if (pa.traj === 'G') l.gb++; if (pa.traj === 'F' || pa.traj === 'P') l.fb++; if (pa.traj === 'P') l.iffb++; if (pa.traj === 'L') l.ld++; if (pa.quality === '強') l.hard++ }
  const kind = battedOutKind(pa)
  if (kind === 'GO') l.go++; else if (kind === 'AO') l.ao++
  if ((r === '保送' || r === '故四') && (pa.code === 'R' || pa.code === 'ER')) l.bbScored++
}

/** FIP before its constant: (13 HR + 3 (BB + HBP) − 2 K) per inning, scaled from MLB's 9 innings to ours. */
export function fipCore(l: { hr: number; bb: number; hbp: number; k: number; outs: number }, inningsPerGame: number): number {
  const ip = l.outs / 3
  return ip > 0 ? ((13 * l.hr + 3 * (l.bb + l.hbp) - 2 * l.k) / ip) * (inningsPerGame / 9) : 0
}

/**
 * The FIP constant from our own games, the way FanGraphs sets it for a league: team ERA − team FIP before the
 * constant, over every game recorded (not just the filtered ones, so a pitcher's FIP does not move with the
 * filter). Then team FIP equals team ERA, and a pitcher's FIP reads against the team. Without innings yet, MLB's
 * constant scaled to our game length.
 */
export function fipConstantFrom(pas: PitchingPA[], inningsPerGame: number): number {
  const t = emptyPitching('')
  const outs = outsCredited(pas)
  for (const pa of pas) if (pa.pitcher) accumulatePitching(t, pa, outs.get(pa) ?? 0)
  if (t.outs === 0) return DEFAULT_PARAMS.fipConstant * (inningsPerGame / 9)
  return (t.er * inningsPerGame) / (t.outs / 3) - fipCore(t, inningsPerGame)
}

/** The parameters the stats are computed with: the FIP constant filled in from the games when it is automatic. */
export function resolveParams(params: StatParams, pitching: PitchingPA[]): StatParams {
  return params.fipAuto ? { ...params, fipConstant: fipConstantFrom(pitching, params.inningsPerGame) } : params
}

export function finalizePitching(l: PitchingLine, p: StatParams = DEFAULT_PARAMS): PitchingLine {
  const ip = l.outs / 3
  l.ip = ip; l.ipDisplay = ipDisplay(l.outs)
  l.era = ip > 0 ? (l.er * p.inningsPerGame) / ip : null
  l.whip = ip > 0 ? (l.bb + l.h) / ip : null
  // K/7: per 7 innings, the length of most of our games (K/9 is the MLB convention)
  l.k7 = ip > 0 ? (l.k * 7) / ip : null; l.k9 = ip > 0 ? (l.k * 9) / ip : null; l.bb9 = ip > 0 ? (l.bb * 9) / ip : null; l.h9 = ip > 0 ? (l.h * 9) / ip : null
  l.kbb = div(l.k, l.bb); l.kPct = div(l.k, l.bf); l.bbPct = div(l.bb, l.bf)
  l.oppAvg = div(l.h, l.ab); l.oppObp = div(l.h + l.bb + l.hbp, l.ab + l.bb + l.hbp + l.sf)
  l.babip = div(l.h - l.hr, l.ab - l.k - l.hr + l.sf)
  // FIP on the same scale as our ERA (per inningsPerGame innings, like ERA), plus the constant (see fipConstantFrom)
  l.fip = ip > 0 ? fipCore(l, p.inningsPerGame) + p.fipConstant : null
  l.strikePct = div(l.strikes, l.pc)
  l.gbPct = div(l.gb, l.bip); l.fbPct = div(l.fb, l.bip); l.ldPct = div(l.ld, l.bip); l.iffbPct = div(l.iffb, l.fb); l.hardPct = div(l.hard, l.bip)
  l.whiffPct = div(l.whiffs, l.swings); l.cswPct = div(l.called + l.whiffs, l.pc); l.fStrikePct = div(l.firstPitchStrike, l.bf)
  l.pPerIP = ip > 0 ? l.pc / ip : null; l.pPerBF = div(l.pc, l.bf)
  const lobDen = l.h + l.bb + l.hbp - 1.4 * l.hr
  l.lobPct = lobDen > 0 ? (l.h + l.bb + l.hbp - l.r) / lobDen : null
  l.goAo = div(l.go, l.ao); l.bbScoredPct = div(l.bbScored, l.bb); l.leadoffOutPct = div(l.leadoffOuts, l.leadoffBf)
  l.inn13Pct = div(l.inn13, l.pitchInn); l.irsPct = div(l.irs, l.ir)
  return l
}

/** What the per-game pitching numbers need besides the rows: our runs by inning in each game (GameSummary.lineUs). */
export interface GameContext { ourRuns: Map<string, number[]> }
export const ourRunsOf = (s: GameSummary[]) => new Map(s.map((x) => [x.game.id, x.lineUs]))

/** Adds the per-game situations (pitchingSituations.ts) of `pas` to the lines, by pitcher name. */
function addSituations(lines: (name: string) => PitchingLine | undefined, pas: PitchingPA[], games: Game[], ctx: GameContext) {
  for (const [name, x] of pitcherSituations(pas, games, ctx.ourRuns)) {
    const l = lines(name)
    if (!l) continue
    l.leadoffBf += x.leadoffBf; l.leadoffOuts += x.leadoffOuts; l.fullInn += x.fullInn; l.pitchInn += x.pitchInn; l.inn13 += x.inn13; l.inn123 += x.inn123
    l.ir += x.ir; l.irs += x.irs; l.bs += x.bs; l.sitGaps += x.gaps
  }
}

/** ctx (our runs by inning) adds the numbers that need whole games and the score: leadoff outs, 1-2-3 innings, inherited
 *  runners, blown saves… Without it they stay 0 / null (the per-game logs and trends do not need them). */
export function pitchingLines(pas: PitchingPA[], games: Game[], params = DEFAULT_PARAMS, ctx?: GameContext): PitchingLine[] {
  const map = new Map<string, PitchingLine>()
  const gameSets = new Map<string, Set<string>>()
  const starters = new Map<string, string>() // gameId -> first pitcher
  const outs = outsCredited(pas)
  for (const pa of pas) {
    if (!pa.pitcher) continue
    if (!starters.has(pa.gameId)) starters.set(pa.gameId, pa.pitcher)
    let l = map.get(pa.pitcher)
    if (!l) { l = emptyPitching(pa.pitcher); map.set(pa.pitcher, l); gameSets.set(pa.pitcher, new Set()) }
    accumulatePitching(l, pa, outs.get(pa) ?? 0)
    gameSets.get(pa.pitcher)!.add(pa.gameId)
  }
  for (const [gid, name] of starters) { const l = map.get(name); if (l && gameSets.get(name)!.has(gid)) l.gs++ }
  for (const g of games) {
    if (g.winningPitcher && map.has(g.winningPitcher)) map.get(g.winningPitcher)!.w++
    if (g.losingPitcher && map.has(g.losingPitcher)) map.get(g.losingPitcher)!.l++
    if (g.savePitcher && map.has(g.savePitcher)) map.get(g.savePitcher)!.sv++
    for (const h of g.holds ?? []) if (map.has(h)) map.get(h)!.hld++
  }
  if (ctx) addSituations((n) => map.get(n), pas, games, ctx)
  return [...map.values()].map((l) => { l.g = gameSets.get(l.name)!.size; return finalizePitching(l, params) }).sort((a, b) => b.outs - a.outs)
}

/** The team's pitching line: every count summed (GS = games with a starter, W / L / SV / HLD from the games'
 *  decisions), G = games pitched, and the rates recomputed from the totals. */
export function teamPitching(pas: PitchingPA[], params = DEFAULT_PARAMS, games: Game[] = [], ctx?: GameContext): PitchingLine {
  const l = emptyPitching('球隊')
  const ids = new Set<string>()
  const outs = outsCredited(pas)
  for (const pa of pas) { if (!pa.pitcher) continue; accumulatePitching(l, pa, outs.get(pa) ?? 0); ids.add(pa.gameId) }
  l.g = ids.size
  l.gs = ids.size
  const pitched = (gameId: string, name?: string) => !!name && pas.some((p) => p.gameId === gameId && p.pitcher === name)
  for (const g of games) {
    if (!ids.has(g.id)) continue
    if (pitched(g.id, g.winningPitcher)) l.w++
    if (pitched(g.id, g.losingPitcher)) l.l++
    if (pitched(g.id, g.savePitcher)) l.sv++
    for (const h of g.holds ?? []) if (pitched(g.id, h)) l.hld++
  }
  if (ctx) addSituations(() => l, pas, games, ctx)
  return finalizePitching(l, params)
}

// ------------------------------------------------------------------ fielding
export interface FieldingStat {
  name: string; g: number; innings: number; po: number; a: number; e: number; dp: number; tc: number; pb: number; sb: number; cs: number
  fpct: number | null; rfg: number | null; csPct: number | null; positions: string[]
  /** some of his lines were inferred from the plate appearances (no 守備紀錄 typed for that game) */
  inferred: boolean
}

/** A fielding line the site worked out itself (from the plate appearances), not one typed into the 守備紀錄. */
export const isInferredLine = (f: FieldingLine) => /推定/.test(f.note ?? '') || f.note === 'SP' || f.note === 'RP'

export function fieldingLines(lines: FieldingLine[]): FieldingStat[] {
  const map = new Map<string, FieldingStat>()
  // a player with two lines in one game (he moved to another position) played one game
  const games = new Set<string>()
  for (const f of lines) {
    if (!f.player) continue
    let s = map.get(f.player)
    if (!s) { s = { name: f.player, g: 0, innings: 0, po: 0, a: 0, e: 0, dp: 0, tc: 0, pb: 0, sb: 0, cs: 0, fpct: null, rfg: null, csPct: null, positions: [], inferred: false }; map.set(f.player, s) }
    const key = `${f.player}\u0000${f.gameId}`
    if (!games.has(key)) { games.add(key); s.g++ }
    if (isInferredLine(f)) s.inferred = true
    s.innings += f.innings ?? 0; s.po += f.po; s.a += f.a; s.e += f.e; s.dp += f.dp; s.pb += f.pb; s.sb += f.sb; s.cs += f.cs
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
    // their errors we know of: we reached on one (失誤), or on catcher's interference (妨礙, charged to the catcher)
    errorsOpp: bat.filter((p) => p.result === '失誤' || p.result === '妨礙').length,
    lobUs: bat.filter((p) => p.code === 'L').length,
    lineUs, lineOpp,
    result: runsUs > runsOpp ? 'W' : runsUs < runsOpp ? 'L' : 'T',
    pitchesUs: pit.reduce((a, p) => a + pitchTotals(p.pitches).pitches, 0),
  }
}

export interface TeamSummary {
  games: number; w: number; l: number; t: number; winPct: number | null; rs: number; ra: number; diff: number
  runsPerGame: number | null; runsAllowedPerGame: number | null
  runsByInningUs: number[]; runsByInningOpp: number[]
}

export function teamSummary(summaries: GameSummary[]): TeamSummary {
  const w = summaries.filter((s) => s.result === 'W').length
  const l = summaries.filter((s) => s.result === 'L').length
  const t = summaries.length - w - l
  const rs = summaries.reduce((a, s) => a + s.runsUs, 0)
  const ra = summaries.reduce((a, s) => a + s.runsOpp, 0)
  const maxInn = Math.max(9, ...summaries.map((s) => s.lineUs.length))
  const byUs = Array.from({ length: maxInn }, () => 0)
  const byOpp = Array.from({ length: maxInn }, () => 0)
  for (const s of summaries) { s.lineUs.forEach((v, i) => (byUs[i] += v)); s.lineOpp.forEach((v, i) => (byOpp[i] += v)) }
  return {
    games: summaries.length, w, l, t, winPct: div(w, w + l), rs, ra, diff: rs - ra,
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

