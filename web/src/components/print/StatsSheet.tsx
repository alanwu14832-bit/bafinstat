import { useStats } from '../../hooks/useStats'
import { useDataStore } from '../../store/data'
import { scopeText } from '../layout/FilterChips'
import { sortNames } from '../../data/rosterSort'
import { TEAM } from '../../config/team'
import { f2, f3 } from '../../lib/fmt'
import type { BattingLine, PitchingLine } from '../../data/stats'

export type StatsSort = 'number' | 'pa'

/** Font size and row height by how many rows the page holds, so a whole team fits on one A4 sheet. */
export function sheetScale(rows: number): { font: string; row: string } {
  if (rows <= 34) return { font: '9pt', row: '5.2mm' }
  if (rows <= 46) return { font: '8pt', row: '4.4mm' }
  return { font: '7pt', row: '3.8mm' }
}

const BAT_COLS: Array<[string, (l: BattingLine) => string | number]> = [
  ['G', (l) => l.g], ['PA', (l) => l.pa], ['AB', (l) => l.ab], ['R', (l) => l.r], ['H', (l) => l.h], ['2B', (l) => l.h2], ['3B', (l) => l.h3], ['HR', (l) => l.hr],
  ['RBI', (l) => l.rbi], ['BB', (l) => l.bb], ['HBP', (l) => l.hbp], ['SO', (l) => l.so], ['SB', (l) => l.sb], ['CS', (l) => l.cs],
  ['AVG', (l) => f3(l.avg)], ['OBP', (l) => f3(l.obp)], ['SLG', (l) => f3(l.slg)], ['OPS', (l) => f3(l.ops)],
]
const PIT_COLS: Array<[string, (l: PitchingLine) => string | number]> = [
  ['G', (l) => l.g], ['GS', (l) => l.gs], ['W', (l) => l.w], ['L', (l) => l.l], ['SV', (l) => l.sv], ['HLD', (l) => l.hld], ['IP', (l) => l.ipDisplay], ['BF', (l) => l.bf],
  ['H', (l) => l.h], ['HR', (l) => l.hr], ['BB', (l) => l.bb], ['HBP', (l) => l.hbp], ['K', (l) => l.k], ['R', (l) => l.r], ['ER', (l) => l.er], ['ERA', (l) => f2(l.era)], ['WHIP', (l) => f2(l.whip)],
]

/** 單頁累計成績表 (A4 portrait): the batting and pitching lines of the current filter, with team totals. */
export function StatsSheet({ sort }: { sort: StatsSort }) {
  const s = useStats()
  const filters = useDataStore((st) => st.filters)
  const roster = s.dataset.roster
  const number = new Map(roster.map((p) => [p.name, p.number ?? '']))
  const batters = s.batters.filter((b) => b.pa >= 1)
  const pitchers = s.pitchers.filter((p) => p.outs > 0 || p.bf > 0)
  const byNumber = <T extends { name: string }>(lines: T[]) => { const order = sortNames(lines.map((l) => l.name), roster, 'number'); return order.map((n) => lines.find((l) => l.name === n)!) }
  const bat = sort === 'pa' ? [...batters].sort((a, b) => b.pa - a.pa || a.name.localeCompare(b.name, 'zh-Hant')) : byNumber(batters)
  const pit = sort === 'pa' ? [...pitchers].sort((a, b) => b.outs - a.outs || b.bf - a.bf || a.name.localeCompare(b.name, 'zh-Hant')) : byNumber(pitchers)
  const scale = sheetScale(bat.length + pit.length + 2)
  const sum = s.summary
  const record = `戰績 ${sum.w} 勝 ${sum.l} 敗${sum.t ? ` ${sum.t} 和` : ''}・得 ${sum.rs} 失 ${sum.ra}`
  const rowStyle = { height: scale.row }
  return (
    <article className="paper portrait" style={{ fontSize: scale.font }} aria-label="累計成績表">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '4mm', borderBottom: '0.5mm solid #222', paddingBottom: '1.5mm' }}>
        <div>
          <h1>{TEAM.org} 累計成績</h1>
          <div className="muted">{scopeText(filters, s.games)}</div>
        </div>
        <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{record}</div>
      </header>

      <h2>打擊</h2>
      <table data-testid="print-batting">
        <thead><tr><th>背號</th><th style={{ textAlign: 'left' }}>姓名</th>{BAT_COLS.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {bat.map((l) => (
            <tr key={l.name} style={rowStyle}><td className="num">{number.get(l.name)}</td><td>{l.name}</td>{BAT_COLS.map(([h, get]) => <td key={h} className="num">{get(l)}</td>)}</tr>
          ))}
          <tr className="total" style={rowStyle}><td /><td>全隊</td>{BAT_COLS.map(([h, get]) => <td key={h} className="num">{h === 'G' ? sum.games : get(s.team)}</td>)}</tr>
        </tbody>
      </table>

      <h2>投球</h2>
      <table data-testid="print-pitching">
        <thead><tr><th style={{ textAlign: 'left' }}>姓名</th>{PIT_COLS.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {pit.map((l) => (
            <tr key={l.name} style={rowStyle}><td>{number.get(l.name) ? `${number.get(l.name)} ` : ''}{l.name}</td>{PIT_COLS.map(([h, get]) => <td key={h} className="num">{get(l)}</td>)}</tr>
          ))}
          <tr className="total" style={rowStyle}><td>全隊</td>{PIT_COLS.map(([h, get]) => <td key={h} className="num">{h === 'G' || h === 'GS' ? sum.games : get(s.teamPitch)}</td>)}</tr>
        </tbody>
      </table>

      <p className="foot">
        G 出賽・PA 打席・AB 打數・R 得分・H 安打・RBI 打點・BB 保送・HBP 觸身・SO/K 三振・SB/CS 盜壘成功／失敗・GS 先發・W/L 勝敗・SV 救援・HLD 中繼・IP 局數・BF 面對打者・ER 自責分。
        ERA 以每場 {s.params.inningsPerGame || TEAM.innings} 局計。印自 {TEAM.siteUrl || window.location.host}・{new Date().toLocaleDateString('zh-TW')}
      </p>
    </article>
  )
}
