/**
 * The numbers the 球員 page compares: the comparison rows (BAT_METRICS / PIT_METRICS) and the 隊內百分位 bars
 * (BAT_PCT / PIT_PCT): each player's percentile rank against the teammates who played enough in the same filter.
 * Pure functions, no React.
 */
import { ipDisplay, type BattingLine, type PitchingLine } from './stats'
import { f2, f3, percentile, pct, signedPct } from '../lib/fmt'

/** volume: a count of chances (G, PA, IP) — more of it is 較多, not 較佳 */
export type Metric<T> = { label: string; get: (l: T) => number | null | undefined; fmt: (v: number) => string; lowerBetter?: boolean; volume?: boolean; min?: (l: T) => boolean }
export const BAT_METRICS: Metric<BattingLine>[] = [
  { label: 'G', get: (l) => l.g, fmt: String, volume: true }, { label: 'PA', get: (l) => l.pa, fmt: String, volume: true }, { label: 'H', get: (l) => l.h, fmt: String }, { label: 'HR', get: (l) => l.hr, fmt: String }, { label: 'RBI', get: (l) => l.rbi, fmt: String }, { label: 'SB', get: (l) => l.sb, fmt: String },
  { label: 'AVG', get: (l) => l.avg, fmt: f3 }, { label: 'OBP', get: (l) => l.obp, fmt: f3 }, { label: 'SLG', get: (l) => l.slg, fmt: f3 }, { label: 'OPS', get: (l) => l.ops, fmt: f3 }, { label: 'OPS+', get: (l) => l.opsPlus, fmt: String }, { label: 'wRC+', get: (l) => l.wrcPlus, fmt: String }, { label: 'wOBA', get: (l) => l.woba, fmt: f3 },
  { label: 'K%', get: (l) => l.kPct, fmt: pct, lowerBetter: true }, { label: 'BB%', get: (l) => l.bbPct, fmt: pct }, { label: 'Whiff%', get: (l) => l.whiffPct, fmt: pct, lowerBetter: true }, { label: 'sSeager', get: (l) => l.sSeager, fmt: signedPct }, { label: 'IFFB%', get: (l) => l.iffbPct, fmt: pct, lowerBetter: true }, { label: '壘死', get: (l) => l.baserunningOuts, fmt: String, lowerBetter: true }, { label: 'Hard%', get: (l) => l.hardPct, fmt: pct }, { label: 'RISP AVG', get: (l) => l.rispAvg, fmt: f3 }, { label: 'QAB%', get: (l) => l.qabPct, fmt: pct },
]
export const PIT_METRICS: Metric<PitchingLine>[] = [
  { label: 'IP', get: (l) => l.outs, fmt: ipDisplay, volume: true }, { label: 'ERA', get: (l) => l.era, fmt: f2, lowerBetter: true }, { label: 'FIP', get: (l) => l.fip, fmt: f2, lowerBetter: true }, { label: 'WHIP', get: (l) => l.whip, fmt: f2, lowerBetter: true },
  { label: 'K/7', get: (l) => l.k7, fmt: f2 }, { label: 'K/9', get: (l) => l.k9, fmt: f2 }, { label: 'BB/9', get: (l) => l.bb9, fmt: f2, lowerBetter: true }, { label: 'K%', get: (l) => l.kPct, fmt: pct }, { label: 'CSW%', get: (l) => l.cswPct, fmt: pct }, { label: 'IFFB%', get: (l) => l.iffbPct, fmt: pct }, { label: '被打擊率', get: (l) => l.oppAvg, fmt: f3, lowerBetter: true },
]

/** One bar of 隊內百分位: label = the code (glossary key), name = the Chinese name; sample(l) is checked against
 *  minSample (unit says what is counted: 打數, 打席…); below it the bar is grey (樣本少) but still drawn. */
export interface PctMetric<T> {
  key: string; label: string; name: string; group: string
  get: (l: T) => number | null
  fmt: (v: number) => string
  lowerBetter: boolean
  sample: (l: T) => number
  minSample: number
  unit: string
}

const bat = (key: string, label: string, name: string, group: string, get: (l: BattingLine) => number | null, fmt: (v: number) => string, sample: (l: BattingLine) => number, minSample: number, unit: string, lowerBetter = false): PctMetric<BattingLine> =>
  ({ key, label, name, group, get, fmt, lowerBetter, sample, minSample, unit })
const pit = (key: string, label: string, name: string, group: string, get: (l: PitchingLine) => number | null, fmt: (v: number) => string, sample: (l: PitchingLine) => number, minSample: number, unit: string, lowerBetter = false): PctMetric<PitchingLine> =>
  ({ key, label, name, group, get, fmt, lowerBetter, sample, minSample, unit })
const int = (v: number) => String(Math.round(v))
const ab = (l: BattingLine) => l.ab, paOf = (l: BattingLine) => l.pa

export const BAT_PCT: PctMetric<BattingLine>[] = [
  bat('wrcPlus', 'wRC+', 'wRC+', '打擊結果', (l) => l.wrcPlus, int, paOf, 10, '打席'),
  bat('avg', 'AVG', '打擊率', '打擊結果', (l) => l.avg, f3, ab, 10, '打數'),
  bat('obp', 'OBP', '上壘率', '打擊結果', (l) => l.obp, f3, paOf, 10, '打席'),
  bat('slg', 'SLG', '長打率', '打擊結果', (l) => l.slg, f3, ab, 10, '打數'),
  bat('iso', 'ISO', '純長打率', '打擊結果', (l) => l.iso, f3, ab, 10, '打數'),
  bat('kPct', 'K%', '三振率', '選球與揮棒', (l) => l.kPct, pct, paOf, 10, '打席', true),
  bat('bbPct', 'BB%', '保送率', '選球與揮棒', (l) => l.bbPct, pct, paOf, 10, '打席'),
  bat('whiffPct', 'Whiff%', '揮空率', '選球與揮棒', (l) => l.whiffPct, pct, (l) => l.swings, 15, '次揮棒', true),
  bat('sSeager', 'sSeager', '選擇性積極', '選球與揮棒', (l) => l.sSeager, signedPct, (l) => l.called + l.ballsTaken, 15, '顆沒揮的球'),
  bat('qabPct', 'QAB%', '好打席率', '選球與揮棒', (l) => l.qabPct, pct, paOf, 10, '打席'),
  bat('hardPct', 'Hard%', '強勁擊球率', '擊球品質', (l) => l.hardPct, pct, (l) => l.bip, 10, '個場內球'),
  bat('iffbPct', 'IFFB%', '內野飛球率', '擊球品質', (l) => l.iffbPct, pct, (l) => l.fb, 5, '個飛球', true),
  bat('rispAvg', 'RISP AVG', '得點圈打擊率', '擊球品質', (l) => l.rispAvg, f3, (l) => l.rispAB, 5, '得點圈打數'),
]

const outs = (l: PitchingLine) => l.outs, bf = (l: PitchingLine) => l.bf
export const PIT_PCT: PctMetric<PitchingLine>[] = [
  pit('era', 'ERA', '防禦率', '結果', (l) => l.era, f2, outs, 9, '個出局', true),
  pit('fip', 'FIP', 'FIP', '結果', (l) => l.fip, f2, outs, 9, '個出局', true),
  pit('whip', 'WHIP', '每局被上壘', '結果', (l) => l.whip, f2, outs, 9, '個出局', true),
  pit('oppAvg', '被打擊率', '被打擊率', '結果', (l) => l.oppAvg, f3, (l) => l.ab, 15, '打數', true),
  pit('pPerIP', 'P/IP', '每局用球', '結果', (l) => l.pPerIP, (v) => v.toFixed(1), outs, 9, '個出局', true),
  pit('kPct', 'K%', '三振率', '三振與保送', (l) => l.kPct, pct, bf, 15, '位打者'),
  pit('bbPct', 'BB%', '保送率', '三振與保送', (l) => l.bbPct, pct, bf, 15, '位打者', true),
  pit('kbbPct', 'K-BB%', '三振減保送', '三振與保送', (l) => (l.kPct === null || l.bbPct === null ? null : l.kPct - l.bbPct), pct, bf, 15, '位打者'),
  pit('whiffPct', 'Whiff%', '揮空率', '好球與揮空', (l) => l.whiffPct, pct, (l) => l.swings, 15, '次揮棒'),
  pit('cswPct', 'CSW%', '好球＋揮空', '好球與揮空', (l) => l.cswPct, pct, (l) => l.pc, 50, '球'),
  pit('strikePct', 'Strike%', '好球率', '好球與揮空', (l) => l.strikePct, pct, (l) => l.pc, 50, '球'),
  pit('fStrikePct', 'FStrike%', '首球好球率', '好球與揮空', (l) => l.fStrikePct, pct, bf, 15, '位打者'),
  pit('hardPct', 'Hard%', '被強勁擊球率', '被擊球', (l) => l.hardPct, pct, (l) => l.bip, 10, '個場內球', true),
  pit('gbPct', 'GB%', '滾地球率', '被擊球', (l) => l.gbPct, pct, (l) => l.bip, 10, '個場內球'),
]

/** Who the percentiles are measured against: PA ≥ 10 (batters) / BF ≥ 10 (pitchers) in the filtered games. */
export const PCT_POOL_MIN = { bat: 10, pit: 10 }
/** Fewer qualified teammates than this and the pool widens to everyone who played (relaxed). */
export const PCT_NEED = 5

/** The comparison pool: the lines with volume ≥ min; fewer than `need` of them → everyone with ≥ 1 (relaxed). */
export function teamPool<T>(lines: T[], volume: (l: T) => number, min: number, need = PCT_NEED): { pool: T[]; min: number; relaxed: boolean } {
  const pool = lines.filter((l) => volume(l) >= min)
  if (pool.length >= need) return { pool, min, relaxed: false }
  return { pool: lines.filter((l) => volume(l) >= 1), min: 1, relaxed: true }
}

export interface PctRow {
  key: string; label: string; name: string; group: string
  value: number | null; display: string
  /** 0–100 (100 = best on the team); null without a value */
  pr: number | null
  /** 1 = best among `of` */
  rank: number | null; of: number
  sample: number; unit: string; minSample: number
  /** below the sample minimum: grey bar */
  small: boolean
}

/** The teammates a metric compares with: those with a value and enough sample (all with a value when fewer than PCT_NEED). */
function peersOf<T>(m: PctMetric<T>, pool: T[]): T[] {
  const valued = pool.filter((p) => m.get(p) !== null)
  const enough = valued.filter((p) => m.sample(p) >= m.minSample)
  return enough.length >= PCT_NEED ? enough : valued
}

/** One metric's PR and rank for a line within a pool (the line is placed among the peers when it is not one of them). */
export function pctOf<T>(line: T, pool: T[], m: PctMetric<T>): Omit<PctRow, 'key' | 'label' | 'name' | 'group'> {
  const v = m.get(line)
  const peers = peersOf(m, pool)
  const values = peers.map((p) => m.get(p))
  const inside = peers.includes(line)
  const of = peers.length + (inside ? 0 : 1)
  const better = v === null ? 0 : values.filter((x) => x !== null && (m.lowerBetter ? x < v : x > v)).length
  const sample = m.sample(line)
  return {
    value: v, display: v === null ? '—' : m.fmt(v),
    pr: v === null ? null : percentile(v, values, m.lowerBetter),
    rank: v === null ? null : better + 1, of,
    sample, unit: m.unit, minSample: m.minSample, small: sample < m.minSample,
  }
}

export function percentileRows<T>(line: T, pool: T[], metrics: PctMetric<T>[]): PctRow[] {
  return metrics.map((m) => ({ key: m.key, label: m.label, name: m.name, group: m.group, ...pctOf(line, pool, m) }))
}

/** 「隊內第 3／14（.312，42 打數）」: what a bar's PR circle says when tapped. */
export const pctTitle = (r: PctRow) => (r.rank === null ? `${r.name}：沒有資料` : `隊內第 ${r.rank}／${r.of}（${r.display}，${r.sample} ${r.unit}）`)

export interface CompareCell { text: string; pr: number | null; best: boolean; more: boolean; small: boolean }
export interface CompareRow { label: string; volume: boolean; cells: CompareCell[] }

/** The comparison grid: one row per metric, one cell per player. pr / small come from prOf (the 百分位 pool) when that
 *  metric has a percentile; best = the best value among ≥ 2 non-small values (ties all best; none when they are all equal); volume rows (G, PA, IP)
 *  only mark the most as `more`, never coloured. */
export function compareRows<T>(lines: Array<T | undefined>, metrics: Metric<T>[], prOf?: (label: string, line: T) => { pr: number | null; small: boolean } | null): CompareRow[] {
  return metrics.map((m) => {
    const vals = lines.map((l) => (l ? (m.get(l) ?? null) : null))
    const info = lines.map((l) => (l && !m.volume ? prOf?.(m.label, l) ?? null : null))
    const small = info.map((x) => !!x?.small)
    const eligible = vals.map((v, i) => (v !== null && !small[i] ? v : null)).filter((v): v is number => v !== null)
    // no 最佳／較多 when every eligible value is the same (four players with 0 HR: nobody is best)
    const differ = eligible.some((v) => v !== eligible[0])
    const top = eligible.length >= 2 && differ ? (m.lowerBetter && !m.volume ? Math.min(...eligible) : Math.max(...eligible)) : null
    return {
      label: m.label, volume: !!m.volume,
      cells: vals.map((v, i) => {
        const hit = top !== null && v === top && !small[i]
        return { text: v === null ? '—' : m.fmt(v), pr: m.volume || v === null ? null : info[i]?.pr ?? null, best: hit && !m.volume, more: hit && !!m.volume, small: small[i] }
      }),
    }
  })
}

/** prOf for compareRows: a metric's PR within the pool, matched to the percentile metrics by label; metrics without a
 *  percentile (OPS, wOBA, K/9…) only borrow the sample rule of a close relative so a tiny sample is not 「最佳」. */
export function comparePr<T>(pool: T[], pctMetrics: PctMetric<T>[], sampleLike: Record<string, string> = {}) {
  const byLabel = new Map(pctMetrics.map((m) => [m.label, m]))
  return (label: string, line: T) => {
    const m = byLabel.get(label)
    if (m) { const r = pctOf(line, pool, m); return { pr: r.pr, small: r.small } }
    const like = byLabel.get(sampleLike[label] ?? '')
    return like ? { pr: null, small: like.sample(line) < like.minSample } : null
  }
}
/** Rates in BAT_METRICS / PIT_METRICS without a bar of their own, and the bar whose sample rule they follow. */
export const BAT_SAMPLE_LIKE: Record<string, string> = { OPS: 'OBP', 'OPS+': 'OBP', wOBA: 'OBP' }
export const PIT_SAMPLE_LIKE: Record<string, string> = { 'K/7': 'ERA', 'K/9': 'ERA', 'BB/9': 'ERA', 'IFFB%': 'GB%' }
