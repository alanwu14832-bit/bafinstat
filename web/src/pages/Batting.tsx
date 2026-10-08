import { useMemo, useState, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { downloadCsv } from '../lib/csv'
import { scopeText } from '../components/layout/FilterChips'
import { useDataStore } from '../store/data'
import { TEAM_NAME } from '../data/seed'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLinkedSort } from '../hooks/useLinkedSort'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Tabs } from '../components/ui/Tabs'
import { Checkbox } from '../components/ui/Input'
import { DemoBanner } from '../components/ui/DemoBanner'
import { BelowMinimum, compactColumns, tagNameColumn, useTableView, withFraction, withJerseyColumn } from '../components/ui/jerseyColumn'
import { withNumbers } from '../data/rosterSort'
import { LeaderStrip, leaderOf, type Leader } from '../components/ui/Leaders'
import { BarChartCard } from '../components/charts/BarChartCard'
import { DonutCard } from '../components/charts/DonutCard'
import { StackedBarCard } from '../components/charts/StackedBarCard'
import { useStats } from '../hooks/useStats'
import type { BattingLine } from '../data/stats'
import { f2, f3, pct, signedPct } from '../lib/fmt'

type View = 'basic' | 'advanced' | 'process'

// 排行門檻: one plate appearance is enough to be ranked (the team asked for it); a small sample still shows its
// numerator / denominator next to every rate
const MIN_PA = 1

function columnsFor(view: View): Column<BattingLine>[] {
  const name: Column<BattingLine> = { key: 'name', header: '球員', className: 'font-medium', sortable: true }
  const n = (key: keyof BattingLine & string, header: string): Column<BattingLine> => ({ key, header, align: 'right', sortable: true })
  const r3 = (key: keyof BattingLine & string, header: string): Column<BattingLine> => ({ key, header, align: 'right', sortable: true, format: (v) => f3(v as number | null) })
  const p = (key: keyof BattingLine & string, header: string): Column<BattingLine> => ({ key, header, align: 'right', sortable: true, format: (v) => pct(v as number | null) })
  // rates with their numerator / denominator next to them (a .500 on 2 at-bats should look like one)
  const frac = (key: keyof BattingLine & string, header: string, parts: (r: BattingLine) => [number, number], fmt: (v: number | null) => string): Column<BattingLine> => ({ key, header, align: 'right', sortable: true, format: (v, r) => withFraction(fmt(v as number | null), ...parts(r)), text: (v) => fmt(v as number | null) })
  const plus: Column<BattingLine> = { key: 'opsPlus', header: 'OPS+', align: 'right', sortable: true, format: (v) => (v === null || v === undefined ? '—' : String(v)) }
  const wrc: Column<BattingLine> = { key: 'wrcPlus', header: 'wRC+', align: 'right', sortable: true, format: (v) => (v === null || v === undefined ? '—' : String(v)) }
  const seager: Column<BattingLine> = { key: 'sSeager', header: 'sSeager', align: 'right', sortable: true, format: (v) => signedPct(v as number | null) }
  if (view === 'basic') return [name, n('g', 'G'), n('pa', 'PA'), n('ab', 'AB'), n('r', 'R'), n('h', 'H'), n('h2', '2B'), n('h3', '3B'), n('hr', 'HR'), n('rbi', 'RBI'), n('bb', 'BB'), n('hbp', 'HBP'), n('so', 'SO'), n('sb', 'SB'), n('cs', 'CS'), n('baserunningOuts', '壘死'), frac('avg', 'AVG', (r) => [r.h, r.ab], f3), r3('obp', 'OBP'), r3('slg', 'SLG'), r3('ops', 'OPS'), plus]
  if (view === 'advanced') return [name, n('pa', 'PA'), r3('ops', 'OPS'), plus, r3('iso', 'ISO'), r3('babip', 'BABIP'), r3('woba', 'wOBA'), wrc, frac('kPct', 'K%', (r) => [r.so, r.pa], pct), frac('bbPct', 'BB%', (r) => [r.bb, r.pa], pct), { key: 'bbK', header: 'BB/K', align: 'right', sortable: true, format: (v) => f2(v as number | null) }, r3('rispAvg', 'RISP AVG'), n('rispAB', 'RISP AB'), p('qabPct', 'QAB%'), n('tb', 'TB'), n('xbh', 'XBH'), n('gidp', 'GIDP'), n('roe', 'ROE'), frac('sbPct', 'SB%', (r) => [r.sb, r.sb + r.cs], pct)]
  return [name, n('pa', 'PA'), { key: 'pPerPA', header: 'P/PA', align: 'right', sortable: true, format: (v) => f2(v as number | null) }, p('swingPct', 'Swing%'), p('whiffPct', 'Whiff%'), p('contactPct', 'Contact%'), seager, p('fpsPct', '首球揮棒%'), n('bip', 'BIP'), frac('gbPct', 'GB%', (r) => [r.gb, r.bip], pct), p('fbPct', 'FB%'), p('iffbPct', 'IFFB%'), p('ldPct', 'LD%'), frac('hardPct', 'Hard%（判讀）', (r) => [r.hard, r.bip], pct), p('pullPct', 'Pull%'), p('centerPct', 'Center%'), p('oppoPct', 'Oppo%')]
}


export function BattingPage() {
  const s = useStats()
  const navigate = useNavigate()
  const linked = useLinkedSort<View>(['basic', 'advanced', 'process'], 'basic')
  const { view, setView } = linked
  // a player's tile linked here (球員頁「全隊排行」): mark his row
  const hl = new URLSearchParams(useLocation().search).get('hl') ?? undefined
  const openPlayer = (d: { name: string }) => navigate(`/players?player=${encodeURIComponent(d.name)}&tab=batting`)
  const [qualifiedOnly, setQualifiedOnly] = useState(false)
  const minPA = MIN_PA
  const rows = useMemo(() => (qualifiedOnly ? s.batters.filter((b) => b.pa >= minPA) : s.batters), [s.batters, qualifiedOnly, minPA])

  const opsRank = useMemo(() => [...s.batters].filter((b) => b.pa >= minPA && b.ops !== null).sort((a, b) => (b.ops ?? 0) - (a.ops ?? 0)).slice(0, 12).map((b) => ({ name: b.name, ops: Number((b.ops ?? 0).toFixed(3)) })), [s.batters, minPA])
  const bbType = useMemo(() => [{ key: 'gb', label: '滾地球', value: s.team.gb }, { key: 'fb', label: '飛球', value: s.team.fb }, { key: 'ld', label: '平飛球', value: s.team.ld }], [s.team])
  const quality = useMemo(() => [...s.batters].filter((b) => b.bip >= 3).sort((a, b) => (b.hardPct ?? 0) - (a.hardPct ?? 0)).slice(0, 10).map((b) => ({ name: b.name, 強: b.hard, 中弱: b.bip - b.hard })), [s.batters])
  const discipline = useMemo(() => [...s.batters].filter((b) => b.pa >= minPA).sort((a, b) => (a.kPct ?? 0) - (b.kPct ?? 0)).slice(0, 12).map((b) => ({ name: b.name, 'K%': Number(((b.kPct ?? 0) * 100).toFixed(1)), 'BB%': Number(((b.bbPct ?? 0) * 100).toFixed(1)) })), [s.batters, minPA])

  const numbers = useMemo(() => new Map(s.dataset.roster.map((p) => [p.name, p.number])), [s.dataset.roster])
  const leaders = useMemo(() => {
    const q = (b: BattingLine) => b.pa >= minPA
    const to = (n: string) => `/players?player=${encodeURIComponent(n)}&tab=batting`
    const out: Leader[] = []
    const add = (label: string, l: { value: number; names: string[] } | null, fmt: (v: number) => string, note?: (n: string) => string | undefined) => {
      if (l) out.push({ label, value: fmt(l.value), names: l.names, to: to(l.names[0]), note: note?.(l.names[0]) })
    }
    const line = (n: string) => s.batters.find((b) => b.name === n)
    add('打擊率', leaderOf(s.batters, (b) => b.avg, { qualifies: q }), f3, (n) => `${line(n)?.h} 安 / ${line(n)?.ab} 打數`)
    add('OPS', leaderOf(s.batters, (b) => b.ops, { qualifies: q }), f3, (n) => `${line(n)?.pa} 打席`)
    add('全壘打', leaderOf(s.batters, (b) => b.hr), String)
    add('安打', leaderOf(s.batters, (b) => b.h), String, (n) => `${line(n)?.ab} 打數`)
    add('打點', leaderOf(s.batters, (b) => b.rbi), String)
    add('盜壘', leaderOf(s.batters, (b) => b.sb), String, (n) => `失敗 ${line(n)?.cs ?? 0}`)
    return out.slice(0, 5)
  }, [s.batters, minPA])

  // phones: 精簡 shows the name and four columns of the tab being read; 完整 is the whole table
  const tableView = useTableView()
  const below = (r: BattingLine) => (r.pa < minPA ? <BelowMinimum /> : null)
  const COMPACT: Record<View, string[]> = { basic: ['pa', 'avg', 'obp', 'ops'], advanced: ['pa', 'ops', 'wrcPlus', 'woba'], process: ['pa', 'whiffPct', 'hardPct', 'gbPct'] }
  const full = withJerseyColumn(columnsFor(view))
  const tableColumns = tableView.compact ? compactColumns(full, COMPACT[view], below) : tagNameColumn(full, below)
  // 匯出 CSV: the full table of this tab (every column), with what it covers on top
  const csvFilters = useDataStore((st) => st.filters)
  const csvButton = <Button size="sm" variant="ghost" icon={<Download />} title="把目前的表格（全部欄位）下載成 CSV，可用 Excel 開" onClick={() => downloadCsv(`打擊成績.csv`, full, withNumbers(rows, s.dataset.roster), [`${TEAM_NAME} 打擊成績`, scopeText(csvFilters, s.games), `OPS+、wRC+ 以篩選範圍的全隊為 100；未達門檻：PA < ${minPA}`, `來源：${window.location.href}`])}>CSV</Button>

  const footer = useMemo(() => {
    const t = s.team
    const f: Partial<Record<keyof BattingLine, ReactNode>> = { name: '球隊合計' }
    for (const c of columnsFor(view)) {
      if (c.key === 'name') continue
      const v = t[c.key]
      f[c.key] = c.format ? c.format(v, t) : String(v ?? '')
    }
    return f
  }, [s.team, view])

  return (
    <>
      <PageHeader scoped title="打擊" description={`${s.batters.length} 位打者。排行門檻 PA ≥ ${minPA}。`} />
      <DemoBanner />
      <LeaderStrip leaders={leaders} numbers={numbers} caption={`・依上方篩選；打擊率、OPS 需 PA ≥ ${minPA}`} />
      <Card id="stats" title="打擊成績" subtitle={`點欄位標題排序；點球員開啟個人檔案。OPS+、wRC+ 以目前篩選範圍的全隊為 100${minPA > 1 ? `；PA < ${minPA} 標「未達門檻」，不列入領先者` : '；率值旁的小字是分子／分母，樣本少時請一起看'}`} flush action={<span className="flex items-center gap-3 flex-wrap justify-end">{tableView.toggle}{csvButton}<Checkbox label="只看達門檻" checked={qualifiedOnly} onChange={setQualifiedOnly} /></span>}>
        {/* the column set sits right on the table it changes (on a phone the table is screens below the page title) */}
        <div className="px-5 py-3 border-b border-border"><Tabs size="sm" aria-label="欄位組" value={view} onChange={setView} items={[{ value: 'basic', label: '基本' }, { value: 'advanced', label: '進階' }, { value: 'process', label: '過程指標' }]} /></div>
        <DataTable columns={tableColumns} rows={withNumbers(rows, s.dataset.roster)} rowKey={(r) => r.name} footer={footer} key={linked.tableKey} revealSort={!!linked.sortKey} defaultSort={linked.sortKey && columnsFor(view).some((c) => c.key === linked.sortKey) ? { key: linked.sortKey as never, dir: linked.dir } : { key: view === 'process' ? 'pa' : 'ops', dir: 'desc' }} highlightKey={hl} onRowClick={openPlayer} dense maxHeight={520} />
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <BarChartCard title="OPS 排行" subtitle="達門檻打者，前 12 名；點長條看那位球員" data={opsRank} onBarClick={openPlayer} series={[{ key: 'ops', label: 'OPS' }]} layout="horizontal" showLabels formatValue={(v) => f3(v)} categoryWidth={64} />
        <DonutCard title="擊球型態" subtitle="全隊場內球的滾地／飛球／平飛比例" segments={bbType} centerCaption="場內球" />
        <StackedBarCard title="擊球強度" subtitle="強勁擊球與其他，場內球 ≥ 3 的打者" data={quality} onBarClick={openPlayer} series={[{ key: '強', label: '強' }, { key: '中弱', label: '中／弱' }]} layout="horizontal" />
        <BarChartCard title="選球紀律" subtitle="三振率與保送率（%），三振率由低到高" data={discipline} onBarClick={openPlayer} series={[{ key: 'K%', label: 'K%' }, { key: 'BB%', label: 'BB%' }]} layout="horizontal" categoryWidth={64} formatValue={(v) => `${v.toFixed(1)}%`} />
      </div>
    </>
  )
}
