import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { DataTable, type Column } from '../components/ui/DataTable'
import { StatGroup, StatTile } from '../components/ui/StatTile'
import { DemoBanner } from '../components/ui/DemoBanner'
import { BarChartCard } from '../components/charts/BarChartCard'
import { SprayChart } from '../components/charts/SprayChart'
import { useStats } from '../hooks/useStats'
import type { FieldingStat } from '../data/stats'
import { f2, f3, pct } from '../lib/fmt'

const POS_ORDER = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']
const POS_NUM: Record<string, number> = { P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9 }

export function FieldingPage() {
  const s = useStats()
  const navigate = useNavigate()
  const totals = useMemo(() => s.fielders.reduce((a, f) => ({ po: a.po + f.po, as: a.as + f.a, e: a.e + f.e, dp: a.dp + f.dp, pb: a.pb + f.pb, sb: a.sb + f.sb, cs: a.cs + f.cs }), { po: 0, as: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0 }), [s.fielders])
  const tc = totals.po + totals.as + totals.e
  const byPos = useMemo(() => POS_ORDER.filter((p) => p in s.errorsByPos || s.fielding.some((f) => f.pos === p)).map((p) => ({ name: p, 失誤: s.errorsByPos[p] ?? 0 })), [s.errorsByPos, s.fielding])
  const errCounts = useMemo(() => { const c = Array.from({ length: 10 }, () => 0); for (const [pos, e] of Object.entries(s.errorsByPos)) if (POS_NUM[pos]) c[POS_NUM[pos]] += e; return c }, [s.errorsByPos])
  const catchers = s.fielders.filter((f) => f.positions.includes('C'))

  const columns: Column<FieldingStat>[] = [
    { key: 'name', header: '球員', className: 'font-medium', sortable: true },
    { key: 'positions', header: '守位', className: 'text-ink-2', format: (v) => (v as string[]).join(' / ') },
    { key: 'g', header: 'G', align: 'right', sortable: true },
    { key: 'innings', header: 'Inn', align: 'right', sortable: true },
    { key: 'po', header: 'PO', align: 'right', sortable: true }, { key: 'a', header: 'A', align: 'right', sortable: true }, { key: 'e', header: 'E', align: 'right', sortable: true }, { key: 'dp', header: 'DP', align: 'right', sortable: true }, { key: 'tc', header: 'TC', align: 'right', sortable: true },
    { key: 'fpct', header: 'FPCT', align: 'right', sortable: true, format: (v) => f3(v as number | null) },
    { key: 'rfg', header: 'RF/G', align: 'right', sortable: true, format: (v) => f2(v as number | null) },
    { key: 'pb', header: 'PB', align: 'right', sortable: true }, { key: 'sb', header: '被盜', align: 'right', sortable: true }, { key: 'cs', header: '阻殺', align: 'right', sortable: true },
    { key: 'csPct', header: 'CS%', align: 'right', sortable: true, format: (v) => pct(v as number | null) },
  ]

  return (
    <>
      <PageHeader title="守備" description="守備紀錄以每場每位球員一列；上方的守位篩選會直接套用在此頁。沒填 PO／A 的比賽會由投球紀錄推定（三振歸捕手、滾地歸守位助殺與一壘刺殺、飛球歸守位刺殺）。" />
      <DemoBanner />
      <StatGroup>
        <StatTile label="團隊守備率" value={tc ? (totals.po + totals.as) / tc : 0} format="decimal3" note={`${tc} 次守備機會`} />
        <StatTile label="失誤" value={totals.e} />
        <StatTile label="雙殺" value={totals.dp} />
        <StatTile label="捕手阻殺率" value={totals.sb + totals.cs ? (totals.cs / (totals.sb + totals.cs)) * 100 : 0} format="pct" note={`${totals.cs} 阻殺 / ${totals.sb} 被盜`} />
      </StatGroup>
      <Card title="守備成績" subtitle="點球員開啟個人檔案；PO／A 未記錄時為推定值" flush>
        <DataTable columns={columns} rows={s.fielders} rowKey={(r) => r.name} defaultSort={{ key: 'tc', dir: 'desc' }} onRowClick={(r) => navigate(`/players?player=${encodeURIComponent(r.name)}`)} dense maxHeight={480} emptyTitle="尚無守備紀錄" emptyDescription="在總表的『守備紀錄』填入每場守備數據後匯入。" />
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 md:gap-5">
        <SprayChart className="xl:col-span-2" title="失誤分佈" subtitle="各守位失誤次數" counts={errCounts} unit="次失誤" emptyText="沒有失誤" />
        <BarChartCard className="xl:col-span-3" title="各守位失誤" subtitle="依守位彙總；最多的守位以主色標示" data={byPos} series={[{ key: '失誤', label: '失誤' }]} highlightKey={byPos.reduce((m, p) => (p.失誤 > (byPos.find((x) => x.name === m)?.失誤 ?? -1) ? p.name : m), '')} />
      </div>
      {catchers.length > 0 && (
        <Card title="捕手" subtitle="被盜壘、阻殺與捕逸" flush>
          <StatGroup flush columns="grid-cols-2 md:grid-cols-4">
            {catchers.map((c) => (
              <StatTile key={c.name} label={c.name} value={(c.csPct ?? 0) * 100} format="pct" display={pct(c.csPct)} note={`阻殺率・被盜 ${c.sb}・阻殺 ${c.cs}・捕逸 ${c.pb}`} />
            ))}
          </StatGroup>
        </Card>
      )}
    </>
  )
}
