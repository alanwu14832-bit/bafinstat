/**
 * 資料完整度: how much of what the formulas need is filled in on our plate appearances — pitches, 軌跡／落點／強度 of the
 * batted balls, 出局(前), 壘上(前), 棒次, and the opponent's side (對方投手左右投 on our batting rows, 對方打者左右打 on our
 * pitching rows). A rate that needs a detail only counts the plate appearances (batted balls) that have it, so a low share
 * here means a smaller sample there; each row says which numbers it shrinks. 打擊慣用 missing from the 球員名單 is listed
 * by name: his Pull／Center／Oppo are left out rather than guessed.
 */
import { isBattedBall, isPA, LOC_CODES, QUALITIES, type BattingPA, type Dataset, type PitchingPA } from './types'

export interface Share { n: number; d: number }
export interface CompletenessRow { key: string; label: string; /** which numbers get a smaller sample without it */ affects: string; bat?: Share; pit?: Share }
export interface Completeness { rows: CompletenessRow[]; /** batters whose 打擊慣用 is not in the 球員名單, with their batted balls */ noBats: Array<{ name: string; bip: number }> }

const TRAJ = new Set(['G', 'F', 'L', 'P', 'B'])
const share = <T,>(rows: T[], has: (r: T) => boolean): Share => ({ n: rows.filter(has).length, d: rows.length })

export function completeness(ds: Pick<Dataset, 'batting' | 'pitching' | 'roster'>): Completeness {
  const bat = ds.batting.filter(isPA) as BattingPA[], pit = ds.pitching.filter(isPA) as PitchingPA[]
  const bipB = bat.filter((r) => isBattedBall(r)), bipP = pit.filter((r) => isBattedBall(r))
  const both = (hasB: (r: BattingPA) => boolean, hasP: (r: PitchingPA) => boolean, base: 'pa' | 'bip'): { bat: Share; pit: Share } =>
    base === 'pa' ? { bat: share(bat, hasB), pit: share(pit, hasP) } : { bat: share(bipB, hasB), pit: share(bipP, hasP) }
  const rows: CompletenessRow[] = [
    { key: 'pitches', label: '逐球', affects: 'P/PA、P/BF、P/IP、Whiff%、Swing%、F-Strike%、球數拆分、QAB', ...both((r) => r.pitches.length > 0, (r) => r.pitches.length > 0, 'pa') },
    { key: 'traj', label: '擊球軌跡', affects: 'GB%／LD%／FB%／PU%／AIR%、HR/FB、各軌跡 BABIP', ...both((r) => !!r.traj && TRAJ.has(r.traj), (r) => !!r.traj && TRAJ.has(r.traj), 'bip') },
    { key: 'loc', label: '擊球落點', affects: 'Pull／Center／Oppo、落點圖', ...both((r) => !!r.loc && LOC_CODES.includes(r.loc), (r) => !!r.loc && LOC_CODES.includes(r.loc), 'bip') },
    { key: 'quality', label: '擊球強度', affects: 'Soft／Med／Hard、QAB', ...both((r) => !!r.quality && (QUALITIES as readonly string[]).includes(r.quality), (r) => !!r.quality && (QUALITIES as readonly string[]).includes(r.quality), 'bip') },
    { key: 'outs', label: '出局(前)', affects: '出局拆分、WPA／RE24、換投後出局歸屬', ...both((r) => typeof r.outsBefore === 'number', (r) => typeof r.outsBefore === 'number', 'pa') },
    { key: 'bases', label: '壘上(前)', affects: '得點圈打擊率、壘上拆分、IR／IRS、WPA／RE24', ...both((r) => r.basesBefore !== undefined && r.basesBefore !== null && r.basesBefore !== '', (r) => r.basesBefore !== undefined && r.basesBefore !== null && r.basesBefore !== '', 'pa') },
    { key: 'order', label: '棒次', affects: '棒次拆分、第幾輪', ...both((r) => !!r.order, (r) => !!r.oppOrder, 'pa') },
    { key: 'hand', label: '對方左右手', affects: '打擊：對左投／對右投；投球：對左打／對右打、Pull／Center／Oppo', ...both((r) => !!r.oppHand, (r) => !!r.oppBats, 'pa') },
  ]
  const bats = new Map(ds.roster.map((p) => [p.name, p.bats]))
  const miss = new Map<string, number>()
  for (const r of bipB) {
    const b = bats.get(r.batter)
    if (b !== 'L' && b !== 'R' && b !== 'S') miss.set(r.batter, (miss.get(r.batter) ?? 0) + 1)
  }
  return { rows, noBats: [...miss].map(([name, bip]) => ({ name, bip })).sort((a, b) => b.bip - a.bip) }
}
