import { useMemo, type ReactNode } from 'react'
import { Card } from '../ui/Card'
import { DataTable, type Column } from '../ui/DataTable'
import { scoutLines, scoutSummary, type ScoutLine } from '../../data/opponent'
import type { Dataset } from '../../data/types'
import { f3, pct0, shortDate } from '../../lib/fmt'
import { cx } from '../../lib/format'

const SMALL = 5
const dim = (r: ScoutLine, v: ReactNode) => <span className={cx(r.pa < SMALL && 'opacity-50')}>{v}</span>

const columns: Column<ScoutLine>[] = [
  { key: 'label', header: '對方打者', className: 'font-medium', format: (v, r) => dim(r, String(v)) },
  { key: 'g', header: '場', align: 'right', format: (v, r) => dim(r, v as number) },
  { key: 'pa', header: 'PA', align: 'right', format: (v, r) => dim(r, v as number) },
  { key: 'avg', header: 'AVG', align: 'right', format: (v, r) => dim(r, f3(v as number | null)) },
  { key: 'obp', header: 'OBP', align: 'right', format: (v, r) => dim(r, f3(v as number | null)) },
  { key: 'slg', header: 'SLG', align: 'right', format: (v, r) => dim(r, f3(v as number | null)) },
  { key: 'hr', header: 'HR', align: 'right', format: (v, r) => dim(r, v as number) },
  { key: 'bb', header: 'BB', align: 'right', format: (v, r) => dim(r, v as number) },
  { key: 'so', header: 'SO', align: 'right', format: (v, r) => dim(r, v as number) },
  { key: 'field', header: '落點 左/中/右', align: 'right', sortable: false, format: (_, r) => dim(r, `${r.field.left}/${r.field.center}/${r.field.right}`), text: (_, r) => `${r.field.left}/${r.field.center}/${r.field.right}` },
  { key: 'lastDate', header: '最近', align: 'right', format: (v, r) => dim(r, shortDate(String(v))) },
]

/**
 * 對手情蒐: how each opponent batter did against us in every game so far (name when recorded, else the slot).
 * On the game page's 攻守成績 tab and under the 先發陣容 editor when the lineup is for a game against them.
 */
export function OpponentScoutCard({ ds, opponent, title }: { ds: Dataset; opponent: string; title?: string }) {
  const lines = useMemo(() => scoutLines(ds, opponent), [ds, opponent])
  const sum = useMemo(() => scoutSummary(ds, opponent), [ds, opponent])
  const heading = title ?? `對手情蒐：${opponent}`
  if (!sum.games) return <Card title={heading}><p className="text-[13px] text-muted">還沒有和 {opponent} 的比賽紀錄</p></Card>
  const t = sum.team
  return (
    <Card title={heading} flush
      subtitle={`歷來對戰 ${sum.games} 場（${sum.w} 勝 ${sum.l} 敗${sum.t ? ` ${sum.t} 和` : ''}）・有記姓名的打者分開列，沒記的以棒次代替；打席少於 ${SMALL} 變淡`}>
      <DataTable columns={columns} rows={lines} rowKey={(r) => r.label} dense />
      <p className="px-5 py-3 border-t border-border text-[12px] text-ink-2">對方全隊：打擊率 {f3(t.avg)}、三振率 {pct0(t.kPct)}、保送率 {pct0(t.bbPct)}</p>
    </Card>
  )
}
