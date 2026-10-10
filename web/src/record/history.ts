/**
 * 這位打者今天前幾個打席: one plain line under the batter on 紀錄比賽 (「第1打席 3球 中外野飛球出局」), for our batter
 * and for the opponent's slot alike. Pure: reads the game being recorded only.
 */
import { resultPhrase } from '../data/gameText'
import { pitchTotals } from '../data/stats'
import { isPA } from '../data/types'
import { offense, oppBatterOf, type RecordState } from './model'

/** 「3球 中外野飛球出局（強）・1 分打點」 */
export function paBrief(pa: { pitches: string[]; result: string; loc?: number; traj?: string; quality?: string; rbi?: number }): string {
  const n = pitchTotals(pa.pitches ?? []).pitches
  return [n ? `${n}球` : '', resultPhrase(pa.result, pa.loc, pa.traj, pa.pitches)].filter(Boolean).join(' ')
    + (pa.quality === '強' ? '（強）' : pa.quality === '弱' ? '（弱）' : '')
    + (pa.rbi ? `・${pa.rbi} 分打點` : '')
}

export interface EarlierPA { n: number; inning: number; text: string; /** the pitcher then, when it is not the one pitching now */ vs?: string }

/** The plate appearances the one now batting had earlier in this game (突破僵局 runners are not plate appearances). */
export function earlierPAs(s: RecordState): EarlierPA[] {
  if (offense(s) === 'us') {
    const name = s.lineup[s.slot]?.name
    if (!name) return []
    return s.batting.filter((b) => isPA(b) && b.batter === name).map((b, i) => ({ n: i + 1, inning: b.inning, text: paBrief(b) }))
  }
  const cur = oppBatterOf(s)
  return s.pitching
    .filter((p) => isPA(p) && p.oppOrder === s.oppOrder && !(cur && p.oppBatter && p.oppBatter !== cur))
    .map((p, i) => ({ n: i + 1, inning: p.inning, text: paBrief(p), ...(p.pitcher !== s.pitcher ? { vs: p.pitcher } : {}) }))
}
