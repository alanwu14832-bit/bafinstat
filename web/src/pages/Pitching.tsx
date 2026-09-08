import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Tabs } from '../components/ui/Tabs'
import { StatTile } from '../components/ui/StatTile'
import { DemoBanner } from '../components/ui/DemoBanner'
import { BarChartCard } from '../components/charts/BarChartCard'
import { StackedBarCard } from '../components/charts/StackedBarCard'
import { LineChartCard } from '../components/charts/LineChartCard'
import { useStats } from '../hooks/useStats'
import { pitchingLines, type PitchingLine } from '../data/stats'
import { f1, f2, f3, pct, shortDate } from '../lib/fmt'
import { useDataStore } from '../store/data'

type View = 'basic' | 'advanced' | 'process'

function columnsFor(view: View): Column<PitchingLine>[] {
  const name: Column<PitchingLine> = { key: 'name', header: '投手', className: 'font-medium', sortable: true }
  const n = (key: keyof PitchingLine & string, header: string): Column<PitchingLine> => ({ key, header, align: 'right', sortable: true })
  const r2 = (key: keyof PitchingLine & string, header: string): Column<PitchingLine> => ({ key, header, align: 'right', sortable: true, format: (v) => f2(v as number | null) })
  const r3 = (key: keyof PitchingLine & string, header: string): Column<PitchingLine> => ({ key, header, align: 'right', sortable: true, format: (v) => f3(v as number | null) })
  const p = (key: keyof PitchingLine & string, header: string): Column<PitchingLine> => ({ key, header, align: 'right', sortable: true, format: (v) => pct(v as number | null) })
  const ip: Column<PitchingLine> = { key: 'outs', header: 'IP', align: 'right', sortable: true, format: (_, row) => row.ipDisplay }
  if (view === 'basic') return [name, n('g', 'G'), n('gs', 'GS'), n('w', 'W'), n('l', 'L'), n('sv', 'SV'), n('hld', 'HLD'), ip, n('bf', 'BF'), n('pc', 'PC'), n('k', 'K'), n('bb', 'BB'), n('hbp', 'HBP'), n('h', 'H'), n('hr', 'HR'), n('r', 'R'), n('er', 'ER'), r2('era', 'ERA'), r2('whip', 'WHIP')]
  if (view === 'advanced') return [name, ip, r2('era', 'ERA'), r2('fip', 'FIP'), r2('whip', 'WHIP'), r2('k9', 'K/9'), r2('bb9', 'BB/9'), r2('h9', 'H/9'), r2('kbb', 'K/BB'), p('kPct', 'K%'), p('bbPct', 'BB%'), r3('oppAvg', '被打擊率'), r3('oppObp', '被上壘率'), r3('babip', 'BABIP'), p('lobPct', 'LOB%'), n('wp', 'WP'), n('sba', 'SBA'), n('cs', 'CS'), n('pk', 'PK')]
  return [name, n('bf', 'BF'), n('pc', 'PC'), p('strikePct', 'Strike%'), p('fStrikePct', 'F-Strike%'), p('cswPct', 'CSW%'), p('whiffPct', 'Whiff%'), { key: 'pPerIP', header: 'P/IP', align: 'right', sortable: true, format: (v) => f1(v as number | null) }, { key: 'pPerBF', header: 'P/BF', align: 'right', sortable: true, format: (v) => f2(v as number | null) }, n('bip', 'BIP'), p('gbPct', 'GB%'), p('fbPct', 'FB%'), p('ldPct', 'LD%'), p('hardPct', 'Hard%')]
}

export function PitchingPage() {
  const s = useStats()
  const navigate = useNavigate()
  const params = useDataStore((st) => st.params)
  const [view, setView] = useState<View>('basic')
  const minIP = Math.max(1, Math.ceil(s.summary.games * 0.7))

  const eraFip = useMemo(() => s.pitchers.filter((p) => p.ip >= minIP).map((p) => ({ name: p.name, ERA: Number((p.era ?? 0).toFixed(2)), FIP: Number((p.fip ?? 0).toFixed(2)) })), [s.pitchers, minIP])
  const mix = useMemo(() => s.pitchers.filter((p) => p.pc > 0).slice(0, 10).map((p) => ({ name: p.name, 好球: p.strikes, 壞球: p.balls })), [s.pitchers])
  const csw = useMemo(() => [...s.pitchers].filter((p) => p.pc >= 20).sort((a, b) => (b.cswPct ?? 0) - (a.cswPct ?? 0)).map((p) => ({ name: p.name, csw: Number(((p.cswPct ?? 0) * 100).toFixed(1)) })), [s.pitchers])
  const trend = useMemo(() => s.summaries.map((g, i) => {
    const window = s.summaries.slice(Math.max(0, i - 4), i + 1).map((x) => x.game.id)
    const line = pitchingLines(s.pitching.filter((p) => window.includes(p.gameId)), [], params)
    const outs = line.reduce((a, l) => a + l.outs, 0), er = line.reduce((a, l) => a + l.er, 0), bb = line.reduce((a, l) => a + l.bb, 0), h = line.reduce((a, l) => a + l.h, 0)
    return { name: shortDate(g.game.date), ERA: outs ? Number(((er * params.inningsPerGame) / (outs / 3)).toFixed(2)) : 0, WHIP: outs ? Number(((bb + h) / (outs / 3)).toFixed(2)) : 0 }
  }), [s.summaries, s.pitching, params])

  const footer = useMemo(() => {
    const t = s.teamPitch
    const f: Partial<Record<keyof PitchingLine, string>> = { name: '球隊合計' }
    for (const c of columnsFor(view)) { if (c.key === 'name') continue; f[c.key] = c.format ? String(c.format(t[c.key], t)) : String(t[c.key] ?? '') }
    return f
  }, [s.teamPitch, view])

  return (
    <>
      <PageHeader eyebrow="Pitching" title="投球" description={`ERA 以每場 ${params.inningsPerGame} 局換算；K/9、BB/9 以 9 局為基準。圖表門檻：IP ≥ ${minIP}。`}
        actions={<Tabs size="sm" aria-label="欄位組" value={view} onChange={setView} items={[{ value: 'basic', label: '基本' }, { value: 'advanced', label: '進階' }, { value: 'process', label: '過程指標' }]} />} />
      <DemoBanner />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="團隊 ERA" value={s.teamPitch.era ?? 0} format="era" />
        <StatTile label="團隊 FIP" value={s.teamPitch.fip ?? 0} format="era" />
        <StatTile label="CSW%" value={(s.teamPitch.cswPct ?? 0) * 100} format="pct" note="未揮棒好球＋揮空 ÷ 用球數" />
        <StatTile label="首球好球率" value={(s.teamPitch.fStrikePct ?? 0) * 100} format="pct" />
      </div>
      <Card title="投手成績" subtitle="點選投手開啟個人檔案" flush>
        <DataTable columns={columnsFor(view)} rows={s.pitchers} rowKey={(r) => r.name} footer={footer} defaultSort={{ key: 'outs', dir: 'desc' }} onRowClick={(r) => navigate(`/players?player=${encodeURIComponent(r.name)}`)} dense maxHeight={480} />
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChartCard title="ERA vs FIP" subtitle="差距大代表守備／運氣影響明顯" data={eraFip} series={[{ key: 'ERA', label: 'ERA' }, { key: 'FIP', label: 'FIP' }]} formatValue={(v) => v.toFixed(2)} />
        <StackedBarCard title="好壞球分佈" subtitle="每位投手的好球（含界外）與壞球數" data={mix} series={[{ key: '好球', label: '好球' }, { key: '壞球', label: '壞球' }]} layout="horizontal" />
        <BarChartCard title="CSW% 排行" subtitle="用球數 ≥ 20；未揮棒好球＋揮空 ÷ 用球數" data={csw} series={[{ key: 'csw', label: 'CSW%' }]} layout="horizontal" showLabels formatValue={(v) => `${v.toFixed(1)}%`} categoryWidth={64} />
        <LineChartCard title="ERA / WHIP 走勢" subtitle="近 5 場滾動" data={trend} series={[{ key: 'ERA', label: 'ERA' }, { key: 'WHIP', label: 'WHIP' }]} formatValue={(v) => v.toFixed(2)} />
      </div>
    </>
  )
}
