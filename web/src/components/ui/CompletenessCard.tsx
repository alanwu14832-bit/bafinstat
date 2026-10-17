/**
 * 資料完整度 card (球員頁「編輯球員名單」下方): how much of each detail the formulas need is filled in over all games
 * (data/completeness.ts), which numbers a gap shrinks, and the batters whose 打擊慣用 is missing from the 球員名單.
 */
import { useMemo } from 'react'
import { Card } from './Card'
import { completeness, type Share } from '../../data/completeness'
import type { Dataset } from '../../data/types'

const cell = (s?: Share) => {
  if (!s || !s.d) return <span className="text-muted">—</span>
  const p = s.n / s.d
  return <span className={p < 0.9 ? 'text-warning font-medium' : p < 1 ? 'text-ink' : 'text-ink-2'}>{Math.round(p * 100)}%<span className="ml-1.5 text-[11px] text-muted font-normal">{s.n}/{s.d}</span></span>
}

export function CompletenessCard({ ds }: { ds: Pick<Dataset, 'batting' | 'pitching' | 'roster'> }) {
  const c = useMemo(() => completeness(ds), [ds])
  return (
    <Card title="資料完整度" subtitle="全部比賽。公式需要的欄位沒填，那個打席（擊球）就不進那一項的分母，樣本會變少；低於 90% 的用橘色標出" flush>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] tnum">
          <thead>
            <tr className="text-[11px] text-muted">
              <th className="text-left font-medium px-5 py-2">項目</th>
              <th className="text-right font-medium px-3 py-2">我隊打擊</th>
              <th className="text-right font-medium px-3 py-2">我隊投球</th>
              <th className="text-left font-medium px-3 py-2">缺了會讓這些數字的樣本變少</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="text-left px-5 py-2 whitespace-nowrap font-medium">{r.label}</td>
                <td className="text-right px-3 py-2 whitespace-nowrap">{cell(r.bat)}</td>
                <td className="text-right px-3 py-2 whitespace-nowrap">{cell(r.pit)}</td>
                <td className="text-left px-3 py-2 text-[12px] text-ink-2 min-w-[14rem]">{r.affects}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-[12px] text-muted leading-5 border-t border-border">
        軌跡、落點、強度的比例是看「打進場內的球」；其餘是看所有打席。對方左右手只有近期紀錄的比賽才有。
      </p>
      {c.noBats.length > 0 && (
        <div className="px-5 pb-4 text-[12px] text-ink-2 leading-5">
          <p className="font-medium text-ink">沒填打擊慣用的打者（他們的 Pull／Center／Oppo 不會算，不會當成右打）：</p>
          <p>{c.noBats.slice(0, 12).map((x) => `${x.name}（${x.bip} 個擊球）`).join('、')}{c.noBats.length > 12 ? ` 等 ${c.noBats.length} 位` : ''}。到上面「編輯球員名單」把慣用手（左／右／左右開弓）補上。</p>
        </div>
      )}
    </Card>
  )
}
