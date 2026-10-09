import { useMemo, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { DataTable, type Column } from './DataTable'
import { useTableView, withFraction } from './jerseyColumn'
import { downloadCsv } from '../../lib/csv'
import { f2, f3, signedInt } from '../../lib/fmt'
import { seasonHeader } from '../../data/seasons'
import type { TeamSeasonRow } from '../../data/history'

export interface TeamSeasonsTableProps {
  title: string
  subtitle?: ReactNode
  rows: TeamSeasonRow[]
  /** the team's AVG / OPS / ERA over every row, for the 合計 line */
  total?: { avg: number | null; ops: number | null; era: number | null }
  /** tapping a season (e.g. set the date filter to it) */
  onPick?: (row: TeamSeasonRow) => void
  /** more buttons next to CSV (e.g. a link to the 紀錄簿) */
  action?: ReactNode
  /** first lines of the CSV (what it covers) */
  csvMeta: string[]
}

/** 逐季戰績: one row per season — record, 勝率 = 勝 ÷（勝＋敗）, runs, the team's AVG / OPS / ERA; 合計 with 2 or more seasons. */
export function TeamSeasonsTable({ title, subtitle, rows, total, onPick, action, csvMeta }: TeamSeasonsTableProps) {
  const view = useTableView()
  const head = seasonHeader()
  const cols: Column<TeamSeasonRow>[] = useMemo(() => [
    { key: 'season', header: head, className: 'font-medium', format: (_, r) => `${r.label}${r.current ? '（進行中）' : ''}`, text: (_, r) => `${r.label}${r.current ? '（進行中）' : ''}` },
    { key: 'games', header: '場', align: 'right' },
    { key: 'w', header: '戰績', align: 'right', format: (_, r) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`, text: (_, r) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}` },
    { key: 'winPct', header: '勝率', align: 'right', format: (v, r) => withFraction(f3(v as number | null), r.w, r.w + r.l), text: (v) => f3(v as number | null) },
    { key: 'rs', header: '得分', align: 'right' },
    { key: 'ra', header: '失分', align: 'right' },
    { key: 'diff', header: '分差', align: 'right', format: (v) => signedInt(v as number), text: (v) => signedInt(v as number) },
    { key: 'avg', header: 'AVG', align: 'right', format: (v) => f3(v as number | null), text: (v) => f3(v as number | null) },
    { key: 'ops', header: 'OPS', align: 'right', format: (v) => f3(v as number | null), text: (v) => f3(v as number | null) },
    { key: 'era', header: 'ERA', align: 'right', format: (v) => f2(v as number | null), text: (v) => f2(v as number | null) },
  ], [head])
  const shown = view.compact ? cols.filter((c) => ['season', 'w', 'winPct', 'diff'].includes(c.key)) : cols
  const footer = useMemo(() => {
    if (rows.length < 2) return undefined
    const sum = (k: 'games' | 'w' | 'l' | 't' | 'rs' | 'ra') => rows.reduce((a, r) => a + r[k], 0)
    const w = sum('w'), l = sum('l'), t = sum('t'), rs = sum('rs'), ra = sum('ra')
    return {
      season: '合計', games: sum('games'), w: `${w}-${l}${t ? `-${t}` : ''}`, winPct: f3(w + l ? w / (w + l) : null), rs, ra, diff: signedInt(rs - ra),
      avg: total ? f3(total.avg) : '', ops: total ? f3(total.ops) : '', era: total ? f2(total.era) : '',
    } as Partial<Record<keyof TeamSeasonRow & string, ReactNode>>
  }, [rows, total])
  const csv = <Button size="sm" variant="ghost" icon={<Download />} title="把逐季戰績下載成 CSV，可用 Excel 開" onClick={() => downloadCsv(`${title}.csv`, cols, rows, csvMeta)}>CSV</Button>
  return (
    <Card title={title} subtitle={subtitle} flush action={<span className="flex items-center gap-2 flex-wrap justify-end">{view.toggle}{csv}{action}</span>}>
      <DataTable columns={shown} rows={[...rows].reverse()} rowKey={(r) => String(r.season)} onRowClick={onPick} footer={footer} dense emptyTitle="沒有比賽" />
    </Card>
  )
}
