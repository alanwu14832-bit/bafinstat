import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Tabs } from '../components/ui/Tabs'
import { Checkbox } from '../components/ui/Input'
import { DemoBanner } from '../components/ui/DemoBanner'
import { BarChartCard } from '../components/charts/BarChartCard'
import { DonutCard } from '../components/charts/DonutCard'
import { StackedBarCard } from '../components/charts/StackedBarCard'
import { useStats } from '../hooks/useStats'
import type { BattingLine } from '../data/stats'
import { f2, f3, pct } from '../lib/fmt'

type View = 'basic' | 'advanced' | 'process'

const MIN_PA_RATIO = 1.5 // qualified = PA ≥ 1.5 × games

function columnsFor(view: View): Column<BattingLine>[] {
  const name: Column<BattingLine> = { key: 'name', header: '球員', className: 'font-medium', sortable: true }
  const n = (key: keyof BattingLine & string, header: string): Column<BattingLine> => ({ key, header, align: 'right', sortable: true })
  const r3 = (key: keyof BattingLine & string, header: string): Column<BattingLine> => ({ key, header, align: 'right', sortable: true, format: (v) => f3(v as number | null) })
  const p = (key: keyof BattingLine & string, header: string): Column<BattingLine> => ({ key, header, align: 'right', sortable: true, format: (v) => pct(v as number | null) })
  if (view === 'basic') return [name, n('g', 'G'), n('pa', 'PA'), n('ab', 'AB'), n('r', 'R'), n('h', 'H'), n('h2', '2B'), n('h3', '3B'), n('hr', 'HR'), n('rbi', 'RBI'), n('bb', 'BB'), n('hbp', 'HBP'), n('so', 'SO'), n('sb', 'SB'), n('cs', 'CS'), r3('avg', 'AVG'), r3('obp', 'OBP'), r3('slg', 'SLG'), r3('ops', 'OPS')]
  if (view === 'advanced') return [name, n('pa', 'PA'), r3('ops', 'OPS'), r3('iso', 'ISO'), r3('babip', 'BABIP'), r3('woba', 'wOBA'), p('kPct', 'K%'), p('bbPct', 'BB%'), { key: 'bbK', header: 'BB/K', align: 'right', sortable: true, format: (v) => f2(v as number | null) }, r3('rispAvg', 'RISP AVG'), n('rispAB', 'RISP AB'), p('qabPct', 'QAB%'), n('tb', 'TB'), n('xbh', 'XBH'), n('gidp', 'GIDP'), n('roe', 'ROE'), p('sbPct', 'SB%')]
  return [name, n('pa', 'PA'), { key: 'pPerPA', header: 'P/PA', align: 'right', sortable: true, format: (v) => f2(v as number | null) }, p('swingPct', 'Swing%'), p('whiffPct', 'Whiff%'), p('contactPct', 'Contact%'), p('fpsPct', '首球揮棒%'), n('bip', 'BIP'), p('gbPct', 'GB%'), p('fbPct', 'FB%'), p('ldPct', 'LD%'), p('hardPct', 'Hard%'), p('pullPct', 'Pull%'), p('centerPct', 'Center%'), p('oppoPct', 'Oppo%')]
}

export function BattingPage() {
  const s = useStats()
  const navigate = useNavigate()
  const [view, setView] = useState<View>('basic')
  const [qualifiedOnly, setQualifiedOnly] = useState(false)
  const minPA = Math.max(1, Math.ceil(s.summary.games * MIN_PA_RATIO))
  const rows = useMemo(() => (qualifiedOnly ? s.batters.filter((b) => b.pa >= minPA) : s.batters), [s.batters, qualifiedOnly, minPA])

  const opsRank = useMemo(() => [...s.batters].filter((b) => b.pa >= minPA && b.ops !== null).sort((a, b) => (b.ops ?? 0) - (a.ops ?? 0)).slice(0, 12).map((b) => ({ name: b.name, ops: Number((b.ops ?? 0).toFixed(3)) })), [s.batters, minPA])
  const bbType = useMemo(() => [{ key: 'gb', label: '滾地球', value: s.team.gb }, { key: 'fb', label: '飛球', value: s.team.fb }, { key: 'ld', label: '平飛球', value: s.team.ld }], [s.team])
  const quality = useMemo(() => [...s.batters].filter((b) => b.bip >= 3).sort((a, b) => (b.hardPct ?? 0) - (a.hardPct ?? 0)).slice(0, 10).map((b) => ({ name: b.name, 強: b.hard, 中弱: b.bip - b.hard })), [s.batters])
  const discipline = useMemo(() => [...s.batters].filter((b) => b.pa >= minPA).sort((a, b) => (a.kPct ?? 0) - (b.kPct ?? 0)).slice(0, 12).map((b) => ({ name: b.name, 'K%': Number(((b.kPct ?? 0) * 100).toFixed(1)), 'BB%': Number(((b.bbPct ?? 0) * 100).toFixed(1)) })), [s.batters, minPA])

  const footer = useMemo(() => {
    const t = s.team
    const f: Partial<Record<keyof BattingLine, string>> = { name: '球隊合計' }
    for (const c of columnsFor(view)) {
      if (c.key === 'name') continue
      const v = t[c.key]
      f[c.key] = c.format ? String(c.format(v, t)) : String(v ?? '')
    }
    return f
  }, [s.team, view])

  return (
    <>
      <PageHeader title="打擊" description={`${s.batters.length} 位打者。排行門檻 PA ≥ ${minPA}（比賽數 × ${MIN_PA_RATIO}）。`}
        actions={<Tabs size="sm" aria-label="欄位組" value={view} onChange={setView} items={[{ value: 'basic', label: '基本' }, { value: 'advanced', label: '進階' }, { value: 'process', label: '過程指標' }]} />} />
      <DemoBanner />
      <Card title="打擊成績" subtitle="點欄位標題排序；點球員開啟個人檔案" flush action={<Checkbox label="只看達門檻" checked={qualifiedOnly} onChange={setQualifiedOnly} />}>
        <DataTable columns={columnsFor(view)} rows={rows} rowKey={(r) => r.name} footer={footer} defaultSort={{ key: view === 'process' ? 'pa' : 'ops', dir: 'desc' }} onRowClick={(r) => navigate(`/players?player=${encodeURIComponent(r.name)}`)} dense maxHeight={520} />
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <BarChartCard title="OPS 排行" subtitle="達門檻打者，前 12 名" data={opsRank} series={[{ key: 'ops', label: 'OPS' }]} layout="horizontal" showLabels formatValue={(v) => f3(v)} categoryWidth={64} />
        <DonutCard title="擊球型態" subtitle="全隊場內球的滾地／飛球／平飛比例" segments={bbType} centerCaption="場內球" />
        <StackedBarCard title="擊球強度" subtitle="強勁擊球與其他，場內球 ≥ 3 的打者" data={quality} series={[{ key: '強', label: '強' }, { key: '中弱', label: '中／弱' }]} layout="horizontal" />
        <BarChartCard title="選球紀律" subtitle="三振率與保送率（%），三振率由低到高" data={discipline} series={[{ key: 'K%', label: 'K%' }, { key: 'BB%', label: 'BB%' }]} formatValue={(v) => `${v.toFixed(1)}%`} />
      </div>
    </>
  )
}
