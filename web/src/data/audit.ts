/**
 * Row-level consistency checks for one game. Complements the game-level warnings in normalize.ts by
 * pointing at the exact plate appearance that looks wrong, so a scorer can fix it in the editor.
 */
import { isHoleLoc, LOC_HOLES, type BattingPA, type PitchingPA } from './types'
import { pitchTotals } from './stats'

export interface Issue { side: 'bat' | 'pit'; index: number; message: string }

const OUT_RESULTS = new Set(['三振', '內滾', '內飛', '外飛', '界外飛', '犧觸', '犧飛', '雙殺'])
const HIT_RESULTS = new Set(['一安', '二安', '三安', '全壘打'])
const OUT_CODES: Record<string, number> = { I: 1, II: 2, III: 3 }
const BALL_RESULTS = new Set(['保送', '故四'])
// scorers write the hit-by-pitch ball as B, so four balls + 觸身 is normal
const FOUR_BALL_OK = new Set(['保送', '故四', '觸身'])

function checkSequence<T extends { inning: number; code?: string; result: string; outsBefore?: number; pitches: string[]; loc?: number; traj?: string }>(rows: T[], side: 'bat' | 'pit', out: Issue[]) {
  let inning = 0, lastOut = 0
  rows.forEach((p, i) => {
    const where = `第 ${p.inning} 局・${side === 'bat' ? (p as unknown as BattingPA).batter : `${(p as unknown as PitchingPA).pitcher} 對第 ${(p as unknown as PitchingPA).oppOrder ?? '?'} 棒`}`
    if (p.inning !== inning) { inning = p.inning; lastOut = 0 }
    const code = p.code ?? ''
    // out-code order inside an inning (a runner-out row may legitimately carry a later out, so only flag going backwards or skipping two)
    if (code in OUT_CODES) {
      const n = OUT_CODES[code]
      if (n < lastOut) out.push({ side, index: i, message: `${where}：出局碼 ${code} 在 ${['', 'I', 'II', 'III'][lastOut]} 之後，順序倒退` })
      else if (n > lastOut + 1) out.push({ side, index: i, message: `${where}：出局碼從 ${lastOut ? ['', 'I', 'II', 'III'][lastOut] : '無'} 跳到 ${code}，中間少了一個出局` })
      lastOut = Math.max(lastOut, n)
    }
    // result vs code
    if (OUT_RESULTS.has(p.result) && !(code in OUT_CODES)) out.push({ side, index: i, message: `${where}：結果「${p.result}」是出局，但結果代碼不是 I／II／III` })
    if (code in OUT_CODES && (HIT_RESULTS.has(p.result) || BALL_RESULTS.has(p.result) || p.result === '觸身') && !(side === 'bat' ? (p as unknown as BattingPA).outOnBase : true)) {
      if (side === 'bat') out.push({ side, index: i, message: `${where}：上壘（${p.result}）卻記出局碼 ${code}，若是壘上被觸殺請填「壘死」` })
    }
    if (p.result === '雙殺' && (p.outsBefore ?? 0) >= 2) out.push({ side, index: i, message: `${where}：2 出局後不可能雙殺` })
    // pitches vs result
    const t = pitchTotals(p.pitches)
    const strikes = p.pitches.reduce((s, c) => (c === 'S' || c === 'SS' || c === 'CS' ? s + 1 : c === 'F' && s < 2 ? s + 1 : s), 0)
    if (p.pitches.length && t.balls >= 4 && !FOUR_BALL_OK.has(p.result)) out.push({ side, index: i, message: `${where}：記了 ${t.balls} 個壞球，結果卻是「${p.result || '空白'}」` })
    if (p.pitches.length && strikes >= 3 && p.result !== '三振') out.push({ side, index: i, message: `${where}：已達 3 好球，結果卻是「${p.result || '空白'}」` })
    if (p.result === '三振' && p.pitches.length && strikes < 3) out.push({ side, index: i, message: `${where}：三振但逐球只有 ${strikes} 個好球` })
    if (BALL_RESULTS.has(p.result) && p.result === '保送' && p.pitches.length && t.balls < 4) out.push({ side, index: i, message: `${where}：保送但逐球只有 ${t.balls} 個壞球` })
    // batted ball detail
    const inPlay = p.pitches.includes('IP') || HIT_RESULTS.has(p.result) || ['內滾', '內飛', '外飛', '界外飛', '犧觸', '犧飛', '雙殺', '野選', '失誤'].includes(p.result)
    if (inPlay && p.result && !p.loc && p.result !== '三振') out.push({ side, index: i, message: `${where}：擊進場內（${p.result}）但沒記落點` })
    if ((p.result === '三振' || BALL_RESULTS.has(p.result) || p.result === '觸身') && p.loc) out.push({ side, index: i, message: `${where}：「${p.result}」不應有落點 ${p.loc}` })
    if (isHoleLoc(p.loc) && (OUT_RESULTS.has(p.result) || p.result === '野選')) out.push({ side, index: i, message: `${where}：出局／野選的落點記為「${LOC_HOLES[p.loc]}」，請改填處理球的守備員（1–9）` })
    if (p.result === '界外飛' && p.traj === 'G') out.push({ side, index: i, message: `${where}：界外飛球軌跡記為滾地` })
    if (p.result === '全壘打' && p.traj === 'G') out.push({ side, index: i, message: `${where}：全壘打軌跡記為滾地` })
  })
}

export function auditGame(batting: BattingPA[], pitching: PitchingPA[]): Issue[] {
  const out: Issue[] = []
  checkSequence(batting, 'bat', out)
  checkSequence(pitching, 'pit', out)
  batting.forEach((p, i) => {
    const where = `第 ${p.inning} 局・${p.batter}`
    if (p.code === 'R' && !p.run) out.push({ side: 'bat', index: i, message: `${where}：代碼 R 但「得分」空白` })
    if (p.run && p.code !== 'R') out.push({ side: 'bat', index: i, message: `${where}：有得分但代碼是 ${p.code ?? '空白'}，不是 R` })
    if (p.rbi > 4) out.push({ side: 'bat', index: i, message: `${where}：打點 ${p.rbi} 超過 4` })
    if (p.rbi > 0 && (p.result === '三振' || p.result === '雙殺') ) out.push({ side: 'bat', index: i, message: `${where}：「${p.result}」通常不會有打點` })
  })
  pitching.forEach((p, i) => {
    if ((p.code === 'R' || p.code === 'ER') && OUT_RESULTS.has(p.result) && p.result !== '犧飛') out.push({ side: 'pit', index: i, message: `第 ${p.inning} 局・對第 ${p.oppOrder ?? '?'} 棒：出局（${p.result}）卻記為失分代碼 ${p.code}` })
  })
  return out
}
