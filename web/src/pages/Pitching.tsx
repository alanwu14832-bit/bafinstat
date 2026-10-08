import { useMemo, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { downloadCsv } from '../lib/csv'
import { scopeText } from '../components/layout/FilterChips'
import { useDataStore } from '../store/data'
import { TEAM_NAME } from '../data/seed'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLinkedSort } from '../hooks/useLinkedSort'
import { useOpenGame } from '../hooks/useOpenGame'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Tabs } from '../components/ui/Tabs'
import { StatGroup, StatTile } from '../components/ui/StatTile'
import { DemoBanner } from '../components/ui/DemoBanner'
import { BelowMinimum, compactColumns, tagNameColumn, useTableView, withFraction, withJerseyColumn } from '../components/ui/jerseyColumn'
import { withNumbers } from '../data/rosterSort'
import { LeaderStrip, leaderOf, type Leader } from '../components/ui/Leaders'
import { BarChartCard } from '../components/charts/BarChartCard'
import { StackedBarCard } from '../components/charts/StackedBarCard'
import { LineChartCard } from '../components/charts/LineChartCard'
import { useStats } from '../hooks/useStats'
import { pitchingLines, type PitchingLine } from '../data/stats'
import { f1, f2, f3, pct, shortDate } from '../lib/fmt'

type View = 'basic' | 'advanced' | 'process'

function columnsFor(view: View): Column<PitchingLine>[] {
  const name: Column<PitchingLine> = { key: 'name', header: '投手', className: 'font-medium', sortable: true }
  const n = (key: keyof PitchingLine & string, header: string): Column<PitchingLine> => ({ key, header, align: 'right', sortable: true })
  const r2 = (key: keyof PitchingLine & string, header: string): Column<PitchingLine> => ({ key, header, align: 'right', sortable: true, format: (v) => f2(v as number | null) })
  const r3 = (key: keyof PitchingLine & string, header: string): Column<PitchingLine> => ({ key, header, align: 'right', sortable: true, format: (v) => f3(v as number | null) })
  const p = (key: keyof PitchingLine & string, header: string): Column<PitchingLine> => ({ key, header, align: 'right', sortable: true, format: (v) => pct(v as number | null) })
  const frac = (key: keyof PitchingLine & string, header: string, parts: (r: PitchingLine) => [number, number]): Column<PitchingLine> => ({ key, header, align: 'right', sortable: true, format: (v, r) => withFraction(pct(v as number | null), ...parts(r)), text: (v) => pct(v as number | null) })
  const ip: Column<PitchingLine> = { key: 'outs', header: 'IP', align: 'right', sortable: true, format: (_, row) => row.ipDisplay }
  if (view === 'basic') return [name, n('g', 'G'), n('gs', 'GS'), n('w', 'W'), n('l', 'L'), n('sv', 'SV'), n('hld', 'HLD'), ip, n('bf', 'BF'), n('pc', 'PC'), n('k', 'K'), n('bb', 'BB'), n('hbp', 'HBP'), n('h', 'H'), n('hr', 'HR'), n('r', 'R'), n('er', 'ER'), r2('era', 'ERA'), r2('whip', 'WHIP')]
  if (view === 'advanced') return [name, ip, r2('era', 'ERA'), r2('fip', 'FIP'), r2('whip', 'WHIP'), r2('k7', 'K/7'), r2('k9', 'K/9'), r2('bb9', 'BB/9'), r2('h9', 'H/9'), r2('kbb', 'K/BB'), frac('kPct', 'K%', (r) => [r.k, r.bf]), frac('bbPct', 'BB%', (r) => [r.bb, r.bf]), r3('oppAvg', '被打擊率'), r3('oppObp', '被上壘率'), r3('babip', 'BABIP'), p('lobPct', 'LOB%'), n('wp', 'WP'), n('sba', 'SBA'), n('cs', 'CS'), n('pk', 'PK')]
  return [name, n('bf', 'BF'), n('pc', 'PC'), frac('strikePct', 'Strike%', (r) => [r.strikes, r.pc]), p('fStrikePct', 'F-Strike%'), p('cswPct', 'CSW%'), p('whiffPct', 'Whiff%'), { key: 'pPerIP', header: 'P/IP', align: 'right', sortable: true, format: (v) => f1(v as number | null) }, { key: 'pPerBF', header: 'P/BF', align: 'right', sortable: true, format: (v) => f2(v as number | null) }, n('bip', 'BIP'), p('gbPct', 'GB%'), p('fbPct', 'FB%'), p('iffbPct', 'IFFB%'), p('ldPct', 'LD%'), p('hardPct', 'Hard%')]
}


export function PitchingPage() {
  const s = useStats()
  const navigate = useNavigate()
  const openGame = useOpenGame()
  const params = s.params
  const linked = useLinkedSort<View>(['basic', 'advanced', 'process'], 'basic')
  const { view, setView } = linked
  // a player's tile linked here (球員頁「全隊排行」): mark his row
  const hl = new URLSearchParams(useLocation().search).get('hl') ?? undefined
  const openPlayer = (d: { name: string }) => navigate(`/players?player=${encodeURIComponent(d.name)}&tab=pitching`)
  const minIP = Math.max(1, Math.ceil(s.summary.games * 0.7))

  const eraFip = useMemo(() => s.pitchers.filter((p) => p.ip >= minIP).map((p) => ({ name: p.name, ERA: Number((p.era ?? 0).toFixed(2)), FIP: Number((p.fip ?? 0).toFixed(2)) })), [s.pitchers, minIP])
  const mix = useMemo(() => s.pitchers.filter((p) => p.pc > 0).slice(0, 10).map((p) => ({ name: p.name, 好球: p.strikes, 壞球: p.balls })), [s.pitchers])
  const csw = useMemo(() => [...s.pitchers].filter((p) => p.pc >= 20).sort((a, b) => (b.cswPct ?? 0) - (a.cswPct ?? 0)).map((p) => ({ name: p.name, csw: Number(((p.cswPct ?? 0) * 100).toFixed(1)) })), [s.pitchers])
  const trend = useMemo(() => s.summaries.map((g, i) => {
    const window = s.summaries.slice(Math.max(0, i - 4), i + 1).map((x) => x.game.id)
    const line = pitchingLines(s.pitching.filter((p) => window.includes(p.gameId)), [], params)
    const outs = line.reduce((a, l) => a + l.outs, 0), er = line.reduce((a, l) => a + l.er, 0), bb = line.reduce((a, l) => a + l.bb, 0), h = line.reduce((a, l) => a + l.h, 0)
    return { id: g.game.id, name: shortDate(g.game.date), ERA: outs ? Number(((er * params.inningsPerGame) / (outs / 3)).toFixed(2)) : 0, WHIP: outs ? Number(((bb + h) / (outs / 3)).toFixed(2)) : 0 }
  }), [s.summaries, s.pitching, params])

  const numbers = useMemo(() => new Map(s.dataset.roster.map((p) => [p.name, p.number])), [s.dataset.roster])
  const leaders = useMemo(() => {
    const q = (p: PitchingLine) => p.ip >= minIP
    const to = (n: string) => `/players?player=${encodeURIComponent(n)}&tab=pitching`
    const line = (n: string) => s.pitchers.find((p) => p.name === n)
    const out: Leader[] = []
    const add = (label: string, l: { value: number; names: string[] } | null, fmt: (v: number) => string, note?: (n: string) => string | undefined) => {
      if (l) out.push({ label, value: fmt(l.value), names: l.names, to: to(l.names[0]), note: note?.(l.names[0]) })
    }
    add('防禦率', leaderOf(s.pitchers, (p) => p.era, { low: true, qualifies: q }), (v) => f2(v), (n) => `${line(n)?.ipDisplay} 局`)
    add('WHIP', leaderOf(s.pitchers, (p) => p.whip, { low: true, qualifies: q }), (v) => f2(v), (n) => `${line(n)?.ipDisplay} 局`)
    add('三振', leaderOf(s.pitchers, (p) => p.k), String, (n) => `${line(n)?.bf} 名打者`)
    add('投球局數', leaderOf(s.pitchers, (p) => p.outs), (v) => `${Math.floor(v / 3)}.${v % 3}`, (n) => `${line(n)?.g} 場`)
    add('勝投', leaderOf(s.pitchers, (p) => p.w), String, (n) => `${line(n)?.w} 勝 ${line(n)?.l} 敗`)
    return out.slice(0, 5)
  }, [s.pitchers, minIP])

  const tableView = useTableView()
  const below = (r: PitchingLine) => (r.ip < minIP ? <BelowMinimum /> : null)
  const COMPACT: Record<View, string[]> = { basic: ['outs', 'era', 'whip', 'k'], advanced: ['outs', 'era', 'fip', 'k7'], process: ['pc', 'strikePct', 'cswPct', 'whiffPct'] }
  const full = withJerseyColumn(columnsFor(view))
  const tableColumns = tableView.compact ? compactColumns(full, COMPACT[view], below) : tagNameColumn(full, below)
  // 匯出 CSV: the full table of this tab (every column), with what it covers on top
  const csvFilters = useDataStore((st) => st.filters)
  const csvButton = <Button size="sm" variant="ghost" icon={<Download />} title="把目前的表格（全部欄位）下載成 CSV，可用 Excel 開" onClick={() => downloadCsv(`投手成績.csv`, full, withNumbers(s.pitchers, s.dataset.roster), [`${TEAM_NAME} 投手成績`, scopeText(csvFilters, s.games), `ERA、FIP 以每場 ${params.inningsPerGame} 局換算；FIP 常數 ${params.fipConstant.toFixed(3)}；未達門檻：IP < ${minIP}`, `來源：${window.location.href}`])}>CSV</Button>

  const footer = useMemo(() => {
    const t = s.teamPitch
    const f: Partial<Record<keyof PitchingLine, ReactNode>> = { name: '球隊合計' }
    for (const c of columnsFor(view)) { if (c.key === 'name') continue; f[c.key] = c.format ? c.format(t[c.key], t) : String(t[c.key] ?? '') }
    return f
  }, [s.teamPitch, view])

  return (
    <>
      <PageHeader scoped title="投球" description={`ERA、FIP 以每場 ${params.inningsPerGame} 局換算（FIP 常數由本隊所有比賽推算，全隊 FIP＝全隊 ERA）；K/9、BB/9 以 9 局為基準。圖表門檻 IP ≥ ${minIP}。`} />
      <DemoBanner />
      <LeaderStrip leaders={leaders} numbers={numbers} caption={`・依上方篩選；防禦率、WHIP 需 IP ≥ ${minIP}`} />
      <StatGroup>
        <StatTile label="團隊 ERA" to="?view=basic&sort=era&dir=asc#stats" value={s.teamPitch.era ?? 0} format="era" note={`${s.teamPitch.ipDisplay} IP`} />
        <StatTile label="團隊 FIP" to="?view=advanced&sort=fip&dir=asc#stats" value={s.teamPitch.fip ?? 0} format="era" />
        <StatTile label="CSW%" to="?view=process&sort=cswPct#stats" value={(s.teamPitch.cswPct ?? 0) * 100} format="pct" note="未揮棒好球＋揮空 ÷ 用球數" />
        <StatTile label="首球好球率" to="?view=process&sort=fStrikePct#stats" value={(s.teamPitch.fStrikePct ?? 0) * 100} format="pct" />
      </StatGroup>
      <Card id="stats" title="投手成績" subtitle={`點投手開啟個人檔案；IP < ${minIP} 標「未達門檻」，不列入領先者與圖表`} flush action={<span className="flex items-center gap-3 flex-wrap justify-end">{tableView.toggle}{csvButton}</span>}>
        {/* the column set sits right on the table it changes (on a phone the table is screens below the page title) */}
        <div className="px-5 py-3 border-b border-border"><Tabs size="sm" aria-label="欄位組" value={view} onChange={setView} items={[{ value: 'basic', label: '基本' }, { value: 'advanced', label: '進階' }, { value: 'process', label: '過程指標' }]} /></div>
        <DataTable columns={tableColumns} rows={withNumbers(s.pitchers, s.dataset.roster)} rowKey={(r) => r.name} footer={footer} key={linked.tableKey} revealSort={!!linked.sortKey} defaultSort={linked.sortKey && columnsFor(view).some((c) => c.key === linked.sortKey) ? { key: linked.sortKey as never, dir: linked.dir } : { key: 'outs', dir: 'desc' }} highlightKey={hl} onRowClick={openPlayer} dense maxHeight={480} />
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <BarChartCard title="ERA 與 FIP" subtitle="差距可能來自守備、事件順序或樣本太少，場數少時僅供參考；點長條看那位投手" data={eraFip} onBarClick={openPlayer} series={[{ key: 'ERA', label: 'ERA' }, { key: 'FIP', label: 'FIP' }]} formatValue={(v) => v.toFixed(2)} />
        <StackedBarCard title="好壞球分佈" subtitle="每位投手的好球（含界外）與壞球數" data={mix} onBarClick={openPlayer} series={[{ key: '好球', label: '好球' }, { key: '壞球', label: '壞球' }]} layout="horizontal" />
        <BarChartCard title="CSW% 排行" subtitle="用球數 ≥ 20；未揮棒好球＋揮空 ÷ 用球數" data={csw} onBarClick={openPlayer} series={[{ key: 'csw', label: 'CSW%' }]} layout="horizontal" showLabels formatValue={(v) => `${v.toFixed(1)}%`} categoryWidth={64} />
        <LineChartCard title="ERA / WHIP 走勢" subtitle={s.summaries.length >= 5 ? '近 5 場滾動；點一下看那一場' : `目前 ${s.summaries.length} 場，為累計（滿 5 場後改為近 5 場滾動）；點一下看那一場`} onPointClick={openGame} data={trend} series={[{ key: 'ERA', label: 'ERA' }, { key: 'WHIP', label: 'WHIP' }]} formatValue={(v) => v.toFixed(2)} />
      </div>
    </>
  )
}
