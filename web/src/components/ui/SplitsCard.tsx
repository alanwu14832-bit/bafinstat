/**
 * 情境拆分 card: a batter's (or the batters our pitchers faced) numbers by count, outs and runners, inning, batting
 * order, n-th plate appearance / time through the order, and the opponent pitcher's hand (data/splits.ts). The rows
 * passed in are already filtered by the filter bar; the situation of each plate appearance comes from the whole
 * dataset. Rows under 10 plate appearances are greyed out with a 「樣本少」 tag.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { DataTable, type Column } from './DataTable'
import { EmptyState } from './EmptyState'
import { Tabs } from './Tabs'
import { cx } from '../../lib/format'
import { CountGrid } from './CountGrid'
import { useTableView } from './jerseyColumn'
import { useStats } from '../../hooks/useStats'
import { useDataStore } from '../../store/data'
import { scopeText } from '../layout/FilterChips'
import { downloadCsv } from '../../lib/csv'
import { f3, pct } from '../../lib/fmt'
import { availableGroups, paContexts, SPLIT_GROUP_LABEL, SPLIT_MIN_PA, splitTable, type SplitGroup, type SplitSide } from '../../data/splits'
import type { BattingPA, PitchingPA } from '../../data/types'

interface View { id: string; label: string; desc?: string; small: boolean; all?: boolean; pa: number; ab: number; h: number; h2: number; hr: number; bb: number; so: number; avg: number | null; obp: number | null; slg: number | null; ops: number | null; kPct: number | null; bbPct: number | null }

/** `compact` (精簡): a narrower 情境 column and, for pitchers, shorter 被… headers, so 情境 / PA (BF) / AVG / OBP / OPS
 *  fit a 360px phone without swiping */
function columnsFor(side: SplitSide, compact = false): Column<View>[] {
  const bat = side === 'bat'
  const short = compact && !bat
  const dim = (r: View, node: ReactNode) => (r.small ? <span className="text-muted">{node}</span> : node)
  const num = (key: keyof View & string, header: string, fmt: (v: number | null) => string = (v) => String(v ?? '')): Column<View> => ({
    key, header, align: 'right', sortable: false,
    format: (v, r) => (r.pa === 0 ? <span className="text-muted">—</span> : dim(r, fmt(v as number | null))),
    text: (v, r) => (r.pa === 0 ? '' : fmt(v as number | null)),
  })
  const label: Column<View> = {
    key: 'label', header: '情境', sortable: false,
    // phones: long labels wrap so the numbers stay on screen
    className: cx('font-medium whitespace-normal md:max-w-none md:whitespace-nowrap', compact ? 'min-w-[5.5rem] max-w-[8rem]' : 'min-w-[7rem] max-w-[9.5rem]'),
    format: (_, r) => (
      <span className={r.all ? 'font-semibold text-ink' : r.small ? 'text-muted' : undefined}>
        <span className="inline-flex items-center gap-1.5 flex-wrap">{r.label}{r.small && r.pa > 0 && !r.all && <span className="text-[10px] font-medium text-muted border border-border rounded px-1 leading-4 whitespace-nowrap">樣本少</span>}</span>
        {r.desc && <span className="block text-[11px] font-normal text-muted leading-4">{r.desc}</span>}
      </span>
    ),
    text: (_, r) => r.label,
  }
  return [label, num('pa', bat ? 'PA' : 'BF'), num('ab', 'AB'), num('h', 'H'), num('h2', '2B'), num('hr', 'HR'), num('bb', 'BB'), num('so', bat ? 'SO' : 'K'),
    num('avg', bat ? 'AVG' : short ? '被打擊' : '被打擊率', f3), num('obp', bat ? 'OBP' : short ? '被上壘' : '被上壘率', f3), num('slg', bat ? 'SLG' : '被長打率', f3), num('ops', bat ? 'OPS' : '被OPS', f3),
    num('kPct', 'K%', pct), num('bbPct', 'BB%', pct)]
}
const COMPACT = ['label', 'pa', 'avg', 'obp', 'ops']

export function SplitsCard({ side, rows, title, subtitle, who, action, id }: {
  side: SplitSide
  /** the plate appearances to split (already filtered) */
  rows: Array<BattingPA | PitchingPA>
  title?: string
  subtitle?: string
  /** whose rows these are, for the CSV (「全隊」, a name) */
  who: string
  /** e.g. the 「對象」 picker */
  action?: ReactNode
  id?: string
}) {
  const s = useStats()
  const filters = useDataStore((st) => st.filters)
  const ctx = useMemo(() => paContexts(s.dataset, side), [s.dataset, side])
  const groups = useMemo(() => availableGroups(side, s.dataset, ctx), [side, s.dataset, ctx])
  const [picked, setGroup] = useState<SplitGroup>('count')
  const group = groups.includes(picked) ? picked : 'count'
  const roster = s.dataset.roster
  const innings = s.params.inningsPerGame
  const table = useMemo(() => splitTable(rows, ctx, side, group, { roster, innings }), [rows, ctx, side, group, roster, innings])
  const tableView = useTableView()
  const full = useMemo(() => columnsFor(side), [side])
  const columns = useMemo(() => (tableView.compact ? columnsFor(side, true).filter((c) => COMPACT.includes(c.key)) : full), [tableView.compact, side, full])
  const view: View[] = table.rows.map((r) => ({ id: r.key, label: r.label, desc: r.desc, small: r.small, all: r.all, pa: r.line.pa, ab: r.line.ab, h: r.line.h, h2: r.line.h2, hr: r.line.hr, bb: r.line.bb, so: r.line.so, avg: r.line.avg, obp: r.line.obp, slg: r.line.slg, ops: r.line.ops, kPct: r.line.kPct, bbPct: r.line.bbPct }))
  const any = rows.some((r) => ctx.has(r))
  const groupLabel = SPLIT_GROUP_LABEL[group](side)
  const note = (() => {
    if (group === 'count') return `球數由逐球紀錄推算：界外球在兩好球前算一個好球，兩好球後不加。記成『好球（S）』的球當作沒揮。沒記逐球的打席不列入（這段期間有 ${table.missing} 個）。`
    if (group === 'situation') {
      const parts = [table.missingOuts ? `沒記出局 ${table.missingOuts} 個` : '', table.missingBases ? `沒記壘上 ${table.missingBases} 個` : ''].filter(Boolean)
      return parts.length ? `${parts.join('、')}打席不列入` : ''
    }
    if (group === 'order') return table.missing ? `沒記棒次的 ${table.missing} 個打席不列入` : ''
    if (group === 'nth') return side === 'pit' ? '同一場同一位投手第幾次面對對方同一棒；沒記對方棒次的，每 9 位打者算一輪。' : '這位打者在同一場的第幾個打席（全隊時每位打者各自算）。'
    if (group === 'hand') return '記了對方投手左右手的打席才算'
    return ''
  })()
  const csv = () => downloadCsv(`情境拆分-${groupLabel}.csv`, full, view, [`對象：${who}`, scopeText(filters, s.games), `樣本少（打席 < ${SPLIT_MIN_PA}）僅供參考`, `來源：${window.location.href}`])
  const sub = subtitle ?? (side === 'bat'
    ? '依上方篩選。每一列是這個情境下的打席；打席不到 10 個的列變淡，樣本少僅供參考。'
    : '依上方篩選。面對的打者在各情境的表現（被打擊率、被 OPS 越低越好）；打席不到 10 個的列變淡。')
  return (
    <Card id={id} title={title ?? '情境拆分'} subtitle={sub} flush
      action={<span className="flex items-center gap-2 flex-wrap justify-end">{action}{tableView.toggle}<Button size="sm" variant="ghost" icon={<Download />} title="把目前分頁的表下載成 CSV，可用 Excel 開" onClick={csv} disabled={!any}>CSV</Button></span>}>
      {!any ? <EmptyState compact title="目前篩選條件下沒有打席" /> : (
        <>
          <div className="px-5 py-3 border-b border-border">
            <Tabs size="sm" aria-label="情境" value={group} onChange={setGroup} items={groups.map((g) => ({ value: g, label: SPLIT_GROUP_LABEL[g](side) }))} />
          </div>
          {group === 'count' && <div className="px-5 py-4 border-b border-border"><CountGrid rows={rows} ctx={ctx} side={side} roster={roster} /></div>}
          <DataTable columns={columns} rows={view} rowKey={(r) => r.id} dense maxHeight={520} />
          {note && <p className="px-5 py-3 text-[12px] text-muted leading-5 border-t border-border">{note}</p>}
        </>
      )}
    </Card>
  )
}
