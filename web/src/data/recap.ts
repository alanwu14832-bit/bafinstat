/**
 * 戰報摘要: three short, checkable sentences about one game, built only from the recorded rows —
 * where it turned (the half-inning after which the winner led for good), the biggest half-inning, and who stood out.
 * Each sentence points back to its half-inning or player so a reader can check it in the 逐球 view.
 */
import { battingLines, pitchingLines, type GameSummary } from './stats'
import type { Dataset } from './types'

export interface RecapLine {
  kind: 'turn' | 'big' | 'star' | 'pitch'
  label: string
  text: string
  inning?: number
  half?: 'top' | 'bottom'
  /** which 逐球 tab shows that half-inning */
  side?: 'bat' | 'pit'
  player?: string
}

const halfName = (h: 'top' | 'bottom') => (h === 'top' ? '上' : '下')

export function gameRecap(s: GameSummary, ds: Dataset, teamName: string): RecapLine[] {
  const g = s.game
  const weTop = g.homeAway === '客'
  const n = Math.max(s.lineUs.length, s.lineOpp.length)
  const halves: Array<{ inning: number; half: 'top' | 'bottom'; us: boolean; runs: number }> = []
  for (let i = 0; i < n; i++) {
    halves.push({ inning: i + 1, half: 'top', us: weTop, runs: (weTop ? s.lineUs[i] : s.lineOpp[i]) ?? 0 })
    halves.push({ inning: i + 1, half: 'bottom', us: !weTop, runs: (weTop ? s.lineOpp[i] : s.lineUs[i]) ?? 0 })
  }
  const out: RecapLine[] = []
  const bat = ds.batting.filter((p) => p.gameId === g.id)
  const pit = ds.pitching.filter((p) => p.gameId === g.id)

  // 勝負轉折: the last half-inning in which the eventual winner went ahead
  if (s.result !== 'T') {
    const winnerUs = s.result === 'W'
    let us = 0, opp = 0, turn: (typeof halves)[number] | null = null, score = ''
    for (const h of halves) {
      const leadBefore = us > opp ? 'us' : opp > us ? 'opp' : 'tie'
      if (h.us) us += h.runs; else opp += h.runs
      const leadAfter = us > opp ? 'us' : opp > us ? 'opp' : 'tie'
      if (leadAfter === (winnerUs ? 'us' : 'opp') && leadBefore !== leadAfter) { turn = h; score = winnerUs ? `${us}:${opp}` : `${opp}:${us}` }
    }
    if (turn) {
      const team = turn.us ? teamName : g.opponent
      out.push({ kind: 'turn', label: '勝負轉折', inning: turn.inning, half: turn.half, side: turn.us ? 'bat' : 'pit',
        text: `第 ${turn.inning} 局${halfName(turn.half)}，${team}攻下 ${turn.runs} 分，以 ${score} 取得領先，之後沒有再被追上。` })
    }
  } else out.push({ kind: 'turn', label: '比賽結果', text: `雙方 ${s.runsUs}:${s.runsOpp} 戰成平手。` })

  // 關鍵半局: the most runs in one half-inning (two or more)
  const big = [...halves].sort((a, b) => b.runs - a.runs)[0]
  if (big && big.runs >= 2) {
    const team = big.us ? teamName : g.opponent
    let who = ''
    if (big.us) {
      const rbi = new Map<string, number>()
      for (const p of bat) if (p.inning === big.inning && p.rbi > 0) rbi.set(p.batter, (rbi.get(p.batter) ?? 0) + p.rbi)
      if (rbi.size) who = `（打點：${[...rbi].map(([name, r]) => `${name} ${r}`).join('、')}）`
    } else {
      const ps = [...new Set(pit.filter((p) => p.inning === big.inning).map((p) => p.pitcher))]
      if (ps.length) who = `（當時投手：${ps.join('、')}）`
    }
    const hits = (big.us ? bat : pit).filter((p) => p.inning === big.inning && ['一安', '內安', '二安', '場地二安', '三安', '全壘打'].includes(p.result)).length
    out.push({ kind: 'big', label: '關鍵半局', inning: big.inning, half: big.half, side: big.us ? 'bat' : 'pit',
      text: `第 ${big.inning} 局${halfName(big.half)}${team}單局攻下 ${big.runs} 分，${hits} 支安打${who}。` })
  }

  // 代表球員: the best batting line, and the pitcher who decided it (or our starter)
  const lines = battingLines(ds, bat)
  let best = lines[0], score = -1
  for (const l of lines) { const v = l.h * 2 + l.hr * 2 + l.rbi * 1.5 + l.r; if (v > score) { score = v; best = l } }
  if (best && best.h + best.rbi > 0) {
    out.push({ kind: 'star', label: '打擊代表', player: best.name,
      text: `${best.name} ${best.ab} 打數 ${best.h} 安${best.hr ? `，${best.hr} 支全壘打` : ''}${best.rbi ? `，${best.rbi} 分打點` : ''}${best.r ? `，跑回 ${best.r} 分` : ''}。` })
  }
  const pl = pitchingLines(pit, [g])
  const ace = pl.find((l) => l.name === (s.result === 'W' ? g.winningPitcher : undefined)) ?? pl.find((l) => l.gs > 0) ?? pl[0]
  if (ace) {
    out.push({ kind: 'pitch', label: s.result === 'W' && ace.name === g.winningPitcher ? '勝投' : '先發', player: ace.name,
      text: `${ace.name} 投 ${ace.ipDisplay} 局，面對 ${ace.bf} 名打者，${ace.k} 次三振、${ace.bb} 次保送，失 ${ace.r} 分（自責 ${ace.er}）。` })
  }
  return out
}
