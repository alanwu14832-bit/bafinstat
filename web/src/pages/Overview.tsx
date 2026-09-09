import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { StatGroup, StatTile } from '../components/ui/StatTile'
import { Card } from '../components/ui/Card'
import { DataTable, type Column } from '../components/ui/DataTable'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { DemoBanner } from '../components/ui/DemoBanner'
import { BarChartCard } from '../components/charts/BarChartCard'
import { AreaChartCard } from '../components/charts/AreaChartCard'
import { LineChartCard } from '../components/charts/LineChartCard'
import { SprayChart } from '../components/charts/SprayChart'
import { useStats } from '../hooks/useStats'
import { sprayCounts, teamBatting } from '../data/stats'
import { f2, f3, shortDate, signedInt } from '../lib/fmt'
import { TEAM_NAME } from '../data/seed'
import { useDataStore } from '../store/data'

interface RecentRow { id: string; date: string; tournament: string; opponent: string; homeAway: string; result: 'W' | 'L' | 'T'; score: string; hits: number; errors: number; isDemo: boolean }

export const resultBadge = (r: 'W' | 'L' | 'T') => (r === 'W' ? <Badge variant="good">勝</Badge> : r === 'L' ? <Badge variant="critical">敗</Badge> : <Badge>和</Badge>)

export function OverviewPage() {
  const s = useStats()
  const navigate = useNavigate()
  const { summary, team, teamPitch, summaries } = s
  const opponentFilter = useDataStore((st) => st.filters.opponent)
  // When the filter narrows to one opponent, name it; otherwise each game names its own opponent.
  const oppLabel = opponentFilter !== 'all' ? opponentFilter : '對手'

  const perGame = useMemo(() => summaries.map((g, i) => ({ name: `${shortDate(g.game.date)}`, idx: i, us: g.runsUs, opp: g.runsOpp, opponent: g.game.opponent })), [summaries])
  const cumulative = useMemo(() => {
    let acc = 0
    return summaries.map((g) => ({ name: shortDate(g.game.date), diff: (acc += g.runsUs - g.runsOpp) }))
  }, [summaries])
  const opsTrend = useMemo(() => summaries.map((_, i) => {
    const window = summaries.slice(Math.max(0, i - 4), i + 1).map((g) => g.game.id)
    const t = teamBatting(s.dataset, s.batting.filter((p) => window.includes(p.gameId)))
    return { name: shortDate(summaries[i].game.date), ops: Number((t.ops ?? 0).toFixed(3)), obp: Number((t.obp ?? 0).toFixed(3)) }
  }), [summaries, s.batting, s.dataset])
  const innings = useMemo(() => summary.runsByInningUs.map((v, i) => ({ name: `${i + 1}`, us: v, opp: summary.runsByInningOpp[i] ?? 0 })).filter((_, i) => i < 9), [summary])
  const spray = useMemo(() => sprayCounts(s.batting), [s.batting])
  const recent: RecentRow[] = useMemo(() => [...summaries].reverse().slice(0, 8).map((g) => ({
    id: g.game.id, date: g.game.date, tournament: g.game.tournament, opponent: g.game.opponent, homeAway: g.game.homeAway, result: g.result,
    score: `${g.runsUs}–${g.runsOpp}`, hits: g.hitsUs, errors: g.errorsUs, isDemo: !!g.game.isDemo,
  })), [summaries])

  const columns: Column<RecentRow>[] = [
    { key: 'date', header: '日期', sortable: true, format: (v) => shortDate(String(v)) },
    { key: 'tournament', header: '杯賽', className: 'text-ink-2' },
    { key: 'opponent', header: '對手', className: 'font-medium', format: (v, row) => <span className="inline-flex items-center gap-1.5">{String(v)}{row.isDemo && <Badge variant="outline">示範</Badge>}</span> },
    { key: 'homeAway', header: '主客', align: 'center', className: 'text-ink-2' },
    { key: 'result', header: '結果', align: 'center', format: (v) => resultBadge(v as RecentRow['result']) },
    { key: 'score', header: '比分', align: 'right', className: 'font-medium' },
    { key: 'hits', header: '安打', align: 'right', sortable: true },
    { key: 'errors', header: '失誤', align: 'right', sortable: true },
  ]

  if (summaries.length === 0) {
    return (
      <>
        <PageHeader title="總覽" description={`${TEAM_NAME} 的全時期表現。`} />
        <Card><EmptyState title="目前篩選條件下沒有比賽" description="調整上方篩選，或到「資料匯入」上傳總表。" /></Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title="總覽" description={`${TEAM_NAME}・${summary.games} 場比賽，依上方篩選即時計算。`} />
      <DemoBanner />
      <StatGroup columns="grid-cols-2 md:grid-cols-5">
        <StatTile label="戰績（勝-敗-和）" value={summary.w} display={`${summary.w}-${summary.l}${summary.t ? `-${summary.t}` : ''}`} />
        <StatTile label="勝率" value={summary.winPct ?? 0} format="decimal3" delta={summary.pythag !== null && summary.winPct !== null ? Number((summary.winPct - summary.pythag).toFixed(3)) : undefined} deltaFormat="decimal3" deltaLabel="vs 畢氏期望" />
        <StatTile label="得失分差" value={summary.diff} display={signedInt(summary.diff)} note={`${summary.rs} 得・${summary.ra} 失`} />
        <StatTile label="每場得分" value={summary.runsPerGame ?? 0} format="ratio" display={f2(summary.runsPerGame)} />
        <StatTile label="畢氏期望勝率" value={summary.pythag ?? 0} format="decimal3" />
        <StatTile label="團隊打擊率" value={team.avg ?? 0} format="decimal3" note={`${team.h} H / ${team.ab} AB`} />
        <StatTile label="團隊 OPS" value={team.ops ?? 0} format="decimal3" note={`OBP ${f3(team.obp)}・SLG ${f3(team.slg)}`} />
        <StatTile label="團隊防禦率" value={teamPitch.era ?? 0} format="era" note={`FIP ${f2(teamPitch.fip)}`} />
        <StatTile label="團隊 WHIP" value={teamPitch.whip ?? 0} format="ratio" />
        <StatTile label="團隊 K / BB" value={teamPitch.kbb ?? 0} format="ratio" note={`${teamPitch.k} K / ${teamPitch.bb} BB`} />
      </StatGroup>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <BarChartCard title="逐場得失分" subtitle="每場比賽我隊與對手得分；橫軸標示對手" data={perGame} series={[{ key: 'us', label: TEAM_NAME }, { key: 'opp', label: oppLabel }]}
          xSubKey="opponent" nameFor={(k, d) => (k === 'opp' ? String(d.opponent) : TEAM_NAME)} />
        <AreaChartCard title="累積得失分差" subtitle="賽季走勢；零線以上代表淨勝分" data={cumulative} series={{ key: 'diff', label: '累積得失分差' }} zeroLine formatValue={(v) => signedInt(Math.round(v))} />
        <LineChartCard title="OPS / OBP 走勢" subtitle="近 5 場滾動平均" data={opsTrend} series={[{ key: 'ops', label: 'OPS' }, { key: 'obp', label: 'OBP' }]} formatValue={(v) => f3(v)} yWidth={52} />
        <BarChartCard title="逐局得失分" subtitle={opponentFilter !== 'all' ? `對 ${opponentFilter} 各局合計` : '所有比賽各局合計；篩選單一對手時會顯示其隊名'} data={innings} series={[{ key: 'us', label: TEAM_NAME }, { key: 'opp', label: oppLabel }]} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 md:gap-5">
        <SprayChart className="xl:col-span-2" title="打線落點分佈" subtitle="場內球落點（安打／場內球）" counts={spray.all} secondary={spray.hits} />
        <Card className="xl:col-span-3" title="近期比賽" subtitle="點選任一列查看逐場攻守成績" flush>
          <DataTable columns={columns} rows={recent} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/games?game=${encodeURIComponent(r.id)}`)} dense />
        </Card>
      </div>
    </>
  )
}
