import type { WinData } from '../../data/winTimeline'
import { stateOf, type WinRules } from '../../data/winModel'
import { basesLabel } from '../../record/tiebreak'
import { cx } from '../../lib/format'

/** The eight base situations in the order people read them. */
const ROWS: Array<[number, string]> = [[0, '無人'], [1, '一壘'], [2, '二壘'], [4, '三壘'], [3, '一二壘'], [5, '一三壘'], [6, '二三壘'], [7, '滿壘']]
const dist = (d: number[]) => `0 分 ${Math.round(d[0] * 100)}%・1 分 ${Math.round(d[1] * 100)}%・2 分 ${Math.round(d[2] * 100)}%・3 分以上 ${Math.round(d[3] * 100)}%`

/** 「7 局制，第 8 局起一、二壘有人開始」 / 「7 局制，不採用突破僵局」 */
export function winRulesText(r: WinRules): string {
  return `${r.innings} 局制，${r.tiebreakFrom && r.tiebreakBases.length ? `第 ${r.tiebreakFrom} 局起${basesLabel(r.tiebreakBases as Array<1 | 2 | 3>)}${r.tiebreakBases.length === 3 ? '' : '有人'}開始` : '不採用突破僵局'}`
}

/** 模型說明: how the win-probability model works, in plain words, with its RE24 table and how well it fits. */
export function WinModelNote({ win }: { win: WinData }) {
  const { run } = win.model
  const s = run.sample
  return (
    <div className="flex flex-col gap-4 text-[13px] text-ink-2 leading-relaxed">
      <ul className="list-disc pl-5 flex flex-col gap-1">
        <li>把每個打席前的局面分成 24 種（壘上 8 種 × 0、1、2 出局），統計本隊比賽（雙方進攻都算）從每種局面接下來會怎樣。</li>
        <li>比賽還少、某種局面很少出現時，數字會向業餘比賽的預設值靠攏，比賽越多越接近本隊的實際情況。</li>
        <li>從最後一局一局一局往回推，算出每個局數、比分、出局、壘上狀況下我隊最後贏球的機率。</li>
        <li>假設兩隊實力相當：不看打者、投手是誰，也不算時間限制和提前結束（{winRulesText(win.rules)}）。</li>
        <li>每多一場比賽模型就會更新，舊比賽的數字可能小幅變動；系隊、校隊各自用自己的比賽建模型，兩站的數字不能直接比較。</li>
      </ul>
      <div className="flex flex-col gap-2">
        <h4 className="text-[12px] font-medium text-ink">各局面這半局預期還能得幾分</h4>
        <table className="w-full max-w-[420px] text-[12px] border-collapse tnum">
          <thead>
            <tr className="border-b border-border text-muted"><th className="text-left font-medium py-1.5 pr-2">壘上</th>{[0, 1, 2].map((o) => <th key={o} className="text-right font-medium py-1.5 px-1">{o} 出局</th>)}</tr>
          </thead>
          <tbody>
            {ROWS.map(([b, label]) => (
              <tr key={b} className="border-b border-border last:border-b-0">
                <td className="py-1.5 pr-2 text-ink-2 whitespace-nowrap">{label}</td>
                {[0, 1, 2].map((o) => {
                  const st = stateOf(o, b)
                  const n = s.n[st]
                  return (
                    <td key={o} className={cx('py-1.5 px-1 text-right whitespace-nowrap', n < 10 ? 'text-muted' : 'text-ink')} title={`這個局面有 ${n} 個打席${s.empiricalRe[st] !== null ? `；實際平均 ${s.empiricalRe[st]!.toFixed(2)} 分` : ''}`}>
                      {run.re[st].toFixed(2)}<span className="ml-1 text-[10px] text-muted">n{n}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-muted">小字 n 是這個局面的打席數；少於 10 個的格子是灰色，大多是預設值。</p>
      </div>
      <div className="flex flex-col gap-1">
        <p>每半局平均得分：模型 {s.runsPerHalfModel.toFixed(2)}、{s.runsPerHalfActual === null ? '實際還沒有完整的半局' : `實際 ${s.runsPerHalfActual.toFixed(2)}（${s.halves} 個完整半局）`}</p>
        <p>每半局得分分佈（模型）：{dist(s.runDist.model)}</p>
        {s.runDist.actual && <p>每半局得分分佈（實際）：{dist(s.runDist.actual)}</p>}
      </div>
    </div>
  )
}
