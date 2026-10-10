import type { Game } from '../../data/types'
import type { GameSummary, PitchingLine } from '../../data/stats'
import { TEAM_NAME } from '../../data/seed'
import { TEAM } from '../../config/team'
import type { Scoresheet as ScoresheetData, SheetCell, SheetLine } from '../../data/scoresheet'

const CIRCLED = ['', '①', '②', '③']
// bases on the little diamond (40 × 40): home, first, second, third, home
const BASE_XY: Array<[number, number]> = [[20, 37], [37, 20], [20, 3], [3, 20], [20, 37]]

/** The little diamond of one plate appearance: bases run drawn thick, home filled when he scored, × where he was put
 *  out on the way, a dot on the base he was left on. Inline SVG, black on white. */
export function CellDiamond({ cell }: { cell: SheetCell }) {
  const reached = Math.max(0, Math.min(4, cell.reached))
  const path = BASE_XY.slice(0, reached + 1).map(([x, y]) => `${x},${y}`).join(' ')
  const outLeg = cell.outAt && cell.outAt >= 1 && cell.outAt <= 4 ? [BASE_XY[cell.outAt - 1], BASE_XY[cell.outAt]] : null
  const mid = outLeg ? [(outLeg[0][0] + outLeg[1][0]) / 2, (outLeg[0][1] + outLeg[1][1]) / 2] : null
  const leftAt = cell.left && reached >= 1 && reached <= 3 ? BASE_XY[reached] : null
  return (
    <svg viewBox="0 0 40 40" aria-hidden>
      <polygon points="20,37 37,20 20,3 3,20" fill={cell.scored ? '#222' : 'none'} stroke="#9a9a9a" strokeWidth="1" />
      {reached >= 1 && <polyline points={path} fill="none" stroke="#111" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />}
      {mid && <path d={`M${mid[0] - 4},${mid[1] - 4} L${mid[0] + 4},${mid[1] + 4} M${mid[0] + 4},${mid[1] - 4} L${mid[0] - 4},${mid[1] + 4}`} stroke="#111" strokeWidth="2.4" />}
      {leftAt && <circle cx={leftAt[0]} cy={leftAt[1]} r="3.4" fill="#111" />}
    </svg>
  )
}

/** One plate appearance in its cell: diamond, mark (a K turned around when looking), out number, RBI dots, count. */
function PaCell({ cell }: { cell: SheetCell }) {
  return (
    <div className={cell.pitcherChange ? 'pa with-pitcher' : 'pa'} title={cell.player}>
      {cell.pitcherChange && <span className="pa-pitcher">{cell.pitcherChange}</span>}
      {cell.count && <span className="pa-count">{cell.count.balls}-{cell.count.strikes}{cell.pitches ? `・${cell.pitches}` : ''}</span>}
      {cell.out && <span className="pa-out">{CIRCLED[cell.out]}</span>}
      {cell.kind === 'pr' ? <span className="pa-mark">代跑</span> : <CellDiamond cell={cell} />}
      {cell.kind !== 'pr' && <span className={cell.looking ? 'pa-mark looking' : 'pa-mark'}>{cell.mark}</span>}
      {cell.rbi > 0 && <span className="pa-rbi">{'•'.repeat(Math.min(4, cell.rbi))}</span>}
      {cell.notes.length > 0 && <span className="pa-notes">{cell.notes.join(' ')}</span>}
    </div>
  )
}

/** Per-slot totals for the right columns (AB R H RBI BB SO), from the cells. */
function slotTotals(line: SheetLine) {
  const cells = Object.values(line.cells).flat().filter((c) => c.kind === 'pa')
  const NON_AB = /^(保送|故四|觸身|犧觸|犧牲|犧飛|妨礙|BB|IBB|HBP|CI|SAC|SF)/
  const HIT = /^(一安|內安|二安|場地二安|三安|全壘打|1B|2B|3B|HR)/
  return {
    ab: cells.filter((c) => !NON_AB.test(c.mark)).length,
    r: Object.values(line.cells).flat().filter((c) => c.scored).length,
    h: cells.filter((c) => HIT.test(c.mark)).length,
    rbi: cells.reduce((a, c) => a + c.rbi, 0),
    bb: cells.filter((c) => /^(保送|故四|BB|IBB)/.test(c.mark)).length,
    so: cells.filter((c) => /^(三振|K)/.test(c.mark)).length,
  }
}

export interface ScoresheetProps {
  game: Game
  summary: GameSummary
  /** whose plate appearances this page shows */
  side: 'us' | 'opp'
  sheet: ScoresheetData
  /** our pitchers (printed under the opponent's batting) */
  pitchers?: PitchingLine[]
  /** the inning whose home half was not played (the home team already ahead): printed X */
  homeX?: number
}

/** 傳統記分表 (A4 landscape), one team's batting per page: header, line score, the slot × inning grid, per-inning
 *  R / H / E / LOB and per-slot totals, and on the opponent's page our pitchers. Plain table + SVG. */
export function Scoresheet({ game, summary, side, sheet, pitchers, homeX }: ScoresheetProps) {
  const innings = Array.from({ length: Math.max(sheet.innings, summary.lineUs.length, summary.lineOpp.length) }, (_, i) => i + 1)
  const weHome = game.homeAway === '主'
  // each team's E is the errors that team made (as GameView's line score): ours from our fielding, theirs from our
  // batters reaching on 失誤
  const us = { name: TEAM_NAME, line: summary.lineUs, r: summary.runsUs, h: summary.hitsUs, e: summary.errorsUs }
  const opp = { name: game.opponent, line: summary.lineOpp, r: summary.runsOpp, h: summary.hitsOpp, e: summary.errorsOpp }
  const teams = weHome ? [{ ...opp, home: false }, { ...us, home: true }] : [{ ...us, home: false }, { ...opp, home: true }]
  const batting = side === 'us' ? TEAM_NAME : game.opponent
  const decisions = [
    game.winningPitcher && `勝投 ${game.winningPitcher}`, game.losingPitcher && `敗投 ${game.losingPitcher}`,
    game.savePitcher && `救援 ${game.savePitcher}`, game.holds?.length ? `中繼 ${game.holds.join('、')}` : '',
  ].filter(Boolean)
  return (
    <article className="paper" aria-label={`${batting}打擊記分表`} data-testid="scoresheet">
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '6mm', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h1>{TEAM_NAME} vs {game.opponent}　記分表</h1>
          <div className="muted">{[`${game.date}${game.time ? ` ${game.time}${game.endTime ? `–${game.endTime}` : ''}` : ''}`, game.tournament, weHome ? '主場（後攻）' : '客場（先攻）', game.venue, game.weather, game.recorder && `紀錄員 ${game.recorder}`].filter(Boolean).join('・')}</div>
          <div style={{ marginTop: '1mm', fontWeight: 600 }}>本頁：{batting} 打擊{decisions.length ? <span className="muted" style={{ fontWeight: 400 }}>　{decisions.join('・')}</span> : null}</div>
        </div>
        <table style={{ width: 'auto' }} aria-label="局分表">
          <thead><tr><th />{innings.map((i) => <th key={i} style={{ width: '5mm' }}>{i}</th>)}<th>R</th><th>H</th><th>E</th></tr></thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.home ? 'h' : 'a'}>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{t.name}</td>
                {innings.map((i) => <td key={i} className="num" style={{ textAlign: 'center' }}>{t.home && homeX === i ? 'X' : i <= t.line.length ? t.line[i - 1] : ''}</td>)}
                <td className="num" style={{ fontWeight: 700 }}>{t.r}</td><td className="num">{t.h}</td><td className="num">{t.e}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </header>

      <table className="sheet-grid" style={{ marginTop: '2.5mm' }}>
        <thead>
          <tr>
            <th className="slot">棒</th><th className="who">球員（守位）</th>
            {innings.map((i) => <th key={i}>{i}</th>)}
            {(side === 'us' ? ['打數 AB', '得分 R', '安打 H', '打點 RBI', '保送 BB', '三振 SO'] : ['打數 AB', '得分 R', '安打 H', '保送 BB', '三振 SO']).map((h) => <th key={h} className="tot">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {sheet.lines.map((line, k) => {
            const t = slotTotals(line)
            return (
              <tr key={line.order ?? `x${k}`} data-testid="slot-row">
                <td className="slot">{line.order ?? '—'}</td>
                <td className="who">
                  {line.players.length ? line.players.map((p) => <div key={p.name}>{p.name}{p.pos ? `（${p.pos}）` : ''}{p.sub ? '（守備）' : ''}</div>) : <div>&nbsp;</div>}
                  {line.order === null && <div className="muted">棒次未記</div>}
                </td>
                {innings.map((i) => {
                  const cells = line.cells[i] ?? []
                  return <td key={i} className={cells.some((c) => c.pitcherChange) ? 'cell change' : 'cell'}>{cells.length > 0 && <div className="pa-stack">{cells.map((c, j) => <PaCell key={j} cell={c} />)}</div>}</td>
                })}
                <td className="num">{t.ab}</td><td className="num">{t.r}</td><td className="num">{t.h}</td>{side === 'us' && <td className="num">{t.rbi}</td>}<td className="num">{t.bb}</td><td className="num">{t.so}</td>
              </tr>
            )
          })}
          {([['得分 R', 'r'], ['安打 H', 'h'], ['失誤 E', 'e'], ['殘壘 LOB', 'lob']] as const).map(([label, key]) => (
            <tr key={key} className={key === 'r' ? 'total' : undefined}>
              <td colSpan={2} style={{ fontWeight: 600 }}>{label}</td>
              {innings.map((i) => { const v = sheet.perInning[i]?.[key]; return <td key={i} className="num" style={{ textAlign: 'center' }}>{v === null || v === undefined ? '' : v}</td> })}
              <td colSpan={side === 'us' ? 6 : 5} />
            </tr>
          ))}
        </tbody>
      </table>

      {side === 'opp' && pitchers && pitchers.length > 0 && (
        <>
          <h2>{TEAM_NAME} 投手</h2>
          <table aria-label="我隊投手">
            <thead><tr>{['投手', '局數', '打席', '用球', '好球', '被安打', '失分', '自責分', '保送', '觸身', '三振', '勝敗'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {pitchers.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td><td className="num">{p.ipDisplay}</td><td className="num">{p.bf}</td><td className="num">{p.pc}</td><td className="num">{p.strikes}</td><td className="num">{p.h}</td>
                  <td className="num">{p.r}</td><td className="num">{p.er}</td><td className="num">{p.bb}</td><td className="num">{p.hbp}</td><td className="num">{p.k}</td>
                  <td style={{ textAlign: 'center' }}>{p.w ? '勝' : p.l ? '敗' : p.sv ? '救援' : p.hld ? '中繼' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p className="foot">
        記號：1B 一安・2B 二安・3B 三安・HR 全壘打・BB 保送・IBB 故四・HBP 觸身・K 三振（反寫＝站著被三振）・G 滾地・F 飛球・L 平飛・P 內野飛球・FF 界外飛・DP 雙殺・FC 野選・E 失誤・SAC 犧觸・SF 犧飛・TB 突破僵局跑者；
        數字是守位（1 投 2 捕 3 一 4 二 5 三 6 游 7 左 8 中 9 右）。粗線＝跑過的壘包，塗滿＝得分，×＝在那裡出局，黑點＝殘壘；①②③ 第幾個出局；• 打點；左上小字是最後球數・用球數。
        {sheet.unfollowed.length > 0 && <> 第 {sheet.unfollowed.join('、')} 局只畫上壘與得分。</>}
        <br />印自 {TEAM.siteUrl || window.location.host}・列印日期 {new Date().toLocaleDateString('zh-TW')}・比賽 {game.id}
      </p>
    </article>
  )
}
