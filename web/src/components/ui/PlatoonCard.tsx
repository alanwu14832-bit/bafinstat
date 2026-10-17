/**
 * 對左右打／對左右投: one row per player, the numbers against left- and right-handed opponents side by side — our pitchers
 * against the batters who stood left / right (對左打・對右打), our batters against left / right-handed pitchers (對左投・
 * 對右投). The side comes from what the recorder picked for each plate appearance (data/splits.ts); plate appearances
 * without it are counted under the table, not in either column. Rows under 10 plate appearances are greyed out.
 */
import { useMemo, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { DataTable, type Column } from './DataTable'
import { EmptyState } from './EmptyState'
import { cx } from '../../lib/format'
import { useStats } from '../../hooks/useStats'
import { useDataStore } from '../../store/data'
import { scopeText } from '../layout/FilterChips'
import { downloadCsv } from '../../lib/csv'
import { f3, pct } from '../../lib/fmt'
import { paContexts, platoonRows, SPLIT_MIN_PA, type SplitSide } from '../../data/splits'
import type { BattingPA, PitchingPA } from '../../data/types'

interface View { id: string; name: string; all: boolean; lPa: number; lAvg: number | null; lObp: number | null; lOps: number | null; lK: number | null; rPa: number; rAvg: number | null; rObp: number | null; rOps: number | null; rK: number | null; diff: number | null }

export function PlatoonCard({ side, rows, id, who }: { side: SplitSide; rows: Array<BattingPA | PitchingPA>; id?: string; who?: string }) {
  const s = useStats()
  const filters = useDataStore((st) => st.filters)
  const ctx = useMemo(() => paContexts(s.dataset, side), [s.dataset, side])
  const table = useMemo(() => platoonRows(rows, ctx, side, s.dataset.roster), [rows, ctx, side, s.dataset.roster])
  const pit = side === 'pit'
  const total = table[0]
  const view: View[] = table.map((r) => ({
    id: r.name, name: r.name, all: r === total,
    lPa: r.L.pa, lAvg: r.L.avg, lObp: r.L.obp, lOps: r.L.ops, lK: r.L.kPct, rPa: r.R.pa, rAvg: r.R.avg, rObp: r.R.obp, rOps: r.R.ops, rK: r.R.kPct,
    diff: r.L.ops !== null && r.R.ops !== null ? r.L.ops - r.R.ops : null,
  }))
  const small = (n: number) => n < SPLIT_MIN_PA
  const num = (key: keyof View & string, header: string, fmt: (v: number | null) => string, paKey?: 'lPa' | 'rPa'): Column<View> => ({
    key, header, align: 'right', sortable: false,
    format: (v, r) => {
      const n = paKey ? r[paKey] : 1
      return n === 0 ? <span className="text-muted">—</span> : (paKey && small(n) ? <span className="text-muted">{fmt(v as number | null)}</span> : fmt(v as number | null))
    },
    text: (v, r) => ((paKey ? r[paKey] : 1) === 0 ? '' : fmt(v as number | null)),
  })
  const signed = (v: number | null) => (v === null ? '' : `${v > 0 ? '+' : ''}${f3(v)}`)
  const L = pit ? '對左打' : '對左投', R = pit ? '對右打' : '對右投'
  const o = pit ? '被' : ''
  const columns: Column<View>[] = [
    { key: 'name', header: pit ? '投手' : '打者', sortable: false, className: 'font-medium whitespace-nowrap',
      format: (_, r) => <span className={r.all ? 'font-semibold text-ink' : undefined}>{r.name}</span>, text: (_, r) => r.name },
    num('lPa', `${L} ${pit ? 'BF' : 'PA'}`, String), num('lAvg', `${L} ${o}打擊率`, f3, 'lPa'), num('lObp', `${L} ${o}上壘率`, f3, 'lPa'), num('lOps', `${L} ${pit ? '被OPS' : 'OPS'}`, f3, 'lPa'), num('lK', `${L} K%`, pct, 'lPa'),
    num('rPa', `${R} ${pit ? 'BF' : 'PA'}`, String), num('rAvg', `${R} ${o}打擊率`, f3, 'rPa'), num('rObp', `${R} ${o}上壘率`, f3, 'rPa'), num('rOps', `${R} ${pit ? '被OPS' : 'OPS'}`, f3, 'rPa'), num('rK', `${R} K%`, pct, 'rPa'),
    num('diff', pit ? '被OPS 左−右' : 'OPS 左−右', signed),
  ]
  const csv = () => downloadCsv(`${pit ? '對左右打' : '對左右投'}.csv`, columns, view, [`對象：${who ?? '全隊與每位球員'}`, scopeText(filters, s.games), `樣本少（打席 < ${SPLIT_MIN_PA}）僅供參考`, `來源：${window.location.href}`])
  const title = pit ? '對左打・對右打' : '對左投・對右投'
  const sub = pit
    ? '每位投手面對左打者、右打者的成績（被打擊率、被OPS 越低越好）；打席不到 10 個的數字變淡。'
    : '每位打者面對左投、右投的成績；打席不到 10 個的數字變淡。'
  const action = <Button size="sm" variant="ghost" icon={<Download />} title="下載成 CSV，可用 Excel 開" onClick={csv} disabled={!total.known}>CSV</Button>
  const note: ReactNode = (
    <p className={cx('px-5 py-3 text-[12px] text-muted leading-5 border-t border-border')}>
      {pit ? '依紀錄比賽時選的對方打者左打／右打（左右開弓的打者算他那次站的那邊）' : '依紀錄比賽時選的對方投手左投／右投'}
      {total.unknown ? `；有 ${total.unknown} 個打席沒記到，不在左右兩邊的數字裡。` : '。'}
    </p>
  )
  return (
    <Card id={id} title={title} subtitle={sub} flush action={action}>
      {!total.known ? (
        <EmptyState compact title={pit ? '目前篩選條件下，還沒有記對方打者左右打的打席' : '目前篩選條件下，還沒有記對方投手左右投的打席'}
          description={pit ? '紀錄比賽時每個打席都要選對方打者左打或右打，記了才會出現。' : '紀錄比賽時要選對方投手左投或右投，記了才會出現。'} />
      ) : (
        <>
          <DataTable columns={columns} rows={view} rowKey={(r) => r.id} dense maxHeight={480} />
          {note}
        </>
      )}
    </Card>
  )
}
