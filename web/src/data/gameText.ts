/**
 * Plain words for one plate appearance, shared by the game page (逐球 tabs, 逐局表), the share text and the
 * recorder's helpers: 「右外野安打」 instead of 一安 + 落點 9, 「1-1 後」 for the count before the result, and the
 * short NPB-style grid cell 「中安②」.
 */
import { count, impliedResult } from '../record/model'
import { batterEndFor } from '../record/timeline'
import { isHitResult } from './stats'
import { isPlaced } from './types'
import type { GameSummary } from './stats'

/** Where the ball went, by 落點 code: the fielder 1–9, or the gap a ball nobody touched went through. */
export const WHERE: Record<number, string> = {
  1: '投手', 2: '捕手', 3: '一壘', 4: '二壘', 5: '三壘', 6: '游擊', 7: '左外野', 8: '中外野', 9: '右外野',
  56: '三游間', 46: '二游間', 34: '一二壘間', 78: '左中間', 89: '右中間',
}

/** A result in plain words; `pitches` decides how a strikeout ended (揮棒落空 / 看好球). */
export function resultPhrase(result: string, loc?: number, traj?: string, pitches?: string[]): string {
  const W = (loc && WHERE[loc]) || ''
  switch (result) {
    case '一安': return W ? `${W}安打` : '一壘安打'
    case '內安': return `${W}內野安打`
    case '二安': return `${W}二壘安打`
    case '場地二安': return `${W}場地二壘安打`
    case '三安': return `${W}三壘安打`
    case '全壘打': return `${W}全壘打`
    case '內滾': return `${W || '內野'}滾地球出局`
    case '雙殺': return W + (traj === 'L' ? '平飛球雙殺' : traj === 'F' || traj === 'P' ? '飛球雙殺' : '滾地球雙殺')
    case '內飛': return `${W || '內野'}飛球出局`
    case '外飛': return traj === 'L' ? `${W}平飛球出局` : `${W || '外野'}飛球出局`
    case '界外飛': return `${W}界外飛球出局`
    case '犧觸': case '犧牲': return `${W}犧牲觸擊`
    case '犧飛': return `${W}犧牲飛球`
    case '野選': return `${W}野手選擇`
    case '失誤': return `${W}失誤上壘`
    case '三振': {
      const last = pitches?.[pitches.length - 1]
      return last === 'SS' ? '揮棒落空三振' : last === 'CS' || last === 'S' ? '看好球三振' : '三振'
    }
    case '保送': return '四壞球保送'
    case '故四': return '故意四壞'
    case '觸身': return '觸身球'
    case '妨礙': return '捕手妨礙上壘'
    case '突破僵局': return '突破僵局上壘'
    default: return result
  }
}

/**
 * The count (balls-strikes) when the result happened, from the pitches: the last pitch put in play is not part of
 * it, nor the 4th ball or the 3rd strike (nor a workbook's hit-by-pitch pitch written as B); a live 觸身／故四／妨礙
 * adds no pitch, so every pitch counts. null when no pitch was recorded.
 */
export function countBefore(pitches: string[], result: string): { balls: number; strikes: number } | null {
  if (!pitches.length || result === '突破僵局') return null
  const head = pitches.slice(0, -1)
  if (pitches[pitches.length - 1] === 'IP') return count(head)
  if (impliedResult(pitches) && !impliedResult(head)) return count(head)
  return count(pitches)
}

/** 「1-1 後」 (balls first, like the B-S lights on 紀錄比賽), or '' without pitches. */
export function countBeforeText(pa: { pitches: string[]; result: string }): string {
  const c = countBefore(pa.pitches, pa.result)
  return c ? `${c.balls}-${c.strikes} 後` : ''
}

/** One-character 落點 for the 逐局表 (三游 = between third and short). */
export const SHORT: Record<number, string> = {
  1: '投', 2: '捕', 3: '一', 4: '二', 5: '三', 6: '游', 7: '左', 8: '中', 9: '右', 56: '三游', 46: '二游', 34: '一二', 78: '左中', 89: '右中',
}

/** ① … ⑳ for 1–20, else (21). */
export const circled = (n: number): string => (n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `(${n})`)

const GRID_SUFFIX: Record<string, string> = {
  一安: '安', 內安: '內安', 二安: '二安', 場地二安: '二安', 三安: '三安', 全壘打: '全壘打',
  內滾: '滾', 雙殺: '雙殺', 內飛: '飛', 外飛: '飛', 界外飛: '界飛', 犧觸: '犧觸', 犧牲: '犧觸', 犧飛: '犧飛', 野選: '野選', 失誤: '失',
}
const GRID_PLAIN: Record<string, string> = { 保送: '四壞', 突破僵局: '突破' }

export type GridTone = 'hit' | 'out' | 'on' | 'other'
export interface GridCell { text: string; tone: GridTone; title: string }

/** The 逐局表 cell of one plate appearance: 「中安②」「游滾」「四壞」, its tone and a full sentence for the tooltip. */
export function gridCell(pa: { result: string; loc?: number; traj?: string; pitches: string[]; rbi?: number; code?: string }): GridCell {
  const r = pa.result
  const where = pa.loc ? SHORT[pa.loc] : undefined
  let text = GRID_PLAIN[r] ?? (where && GRID_SUFFIX[r] ? where + ((r === '外飛' || r === '內飛') && pa.traj === 'L' ? '平飛' : GRID_SUFFIX[r]) : r)
  const rbi = pa.rbi ?? 0
  if (rbi > 0) text += circled(rbi)
  // 不死三振: a 三振 row whose code is not an out (I/II/III) — he reached first, so it is not shown as an out
  const reachedOnK = r === '三振' && !!pa.code && !['I', 'II', 'III'].includes(pa.code)
  const tone: GridTone = isPlaced(pa) ? 'other' : isHitResult(r) ? 'hit' : batterEndFor(r) === 'out' && !reachedOnK ? 'out' : 'on'
  const title = [countBeforeText(pa), resultPhrase(r, pa.loc, pa.traj, pa.pitches)].filter(Boolean).join(' ') + (rbi > 0 ? `，${rbi} 分打點` : '')
  return { text, tone, title }
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const weekdayOf = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); const t = Date.UTC(y, (m || 1) - 1, d || 1); return Number.isNaN(t) ? '' : WEEK[new Date(t).getUTCDay()] }

export interface ShareInput {
  teamName: string
  summary: Pick<GameSummary, 'game' | 'runsUs' | 'runsOpp' | 'result'>
  recap: Array<{ label: string; text: string }>
  /** the game page's address (lib/siteUrl) */
  url: string
  videos?: Array<{ url: string; note?: string }>
  /** how many 待核對 items the game still has */
  issues?: number
}

/**
 * The text 「分享」 copies for a LINE group: score, date and place, the recap, video links and the game page's address,
 * plus a warning when the game still has unchecked items.
 */
export function gameShareText({ teamName, summary, recap, url, videos = [], issues = 0 }: ShareInput): string {
  const g = summary.game
  const res = summary.result === 'W' ? '勝' : summary.result === 'L' ? '敗' : '和'
  const day = weekdayOf(g.date)
  const lines = [
    `${teamName} ${summary.runsUs}:${summary.runsOpp} ${g.opponent}（${res}）`,
    `${g.date}${day ? `（${day}）` : ''}` + [g.tournament, g.homeAway === '主' ? '主場' : '客場', g.venue].filter(Boolean).join('・'),
    '',
  ]
  if (recap.length) { for (const l of recap) lines.push(`・${l.label}：${l.text}`); lines.push('') }
  for (const v of videos) lines.push(`比賽影片${v.note?.trim() ? `（${v.note.trim()}）` : ''}：${v.url}`)
  lines.push(`完整紀錄：${url}`)
  if (issues > 0) lines.push(`（這場還有 ${issues} 項紀錄待核對，數字可能再修正）`)
  return lines.join('\n')
}
