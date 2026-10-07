import { useMemo } from 'react'
import { useOpenGame } from '../hooks/useOpenGame'
import { PageHeader } from '../components/layout/PageHeader'
import { StatGroup, StatTile } from '../components/ui/StatTile'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { DemoBanner } from '../components/ui/DemoBanner'
import { BarChartCard } from '../components/charts/BarChartCard'
import { AreaChartCard } from '../components/charts/AreaChartCard'
import { LineChartCard } from '../components/charts/LineChartCard'
import { SprayChart } from '../components/charts/SprayChart'
import { useStats } from '../hooks/useStats'
import { sprayCounts, teamBatting } from '../data/stats'
import { f2, f3, pct, pct0, shortDate, signedInt } from '../lib/fmt'
import { TEAM_NAME } from '../data/seed'
import { useDataStore } from '../store/data'
import { SeasonHero } from '../components/ui/SeasonHero'
import { GameCard, gameStar } from '../components/ui/GameCard'
import { teamStories } from '../data/stories'
import { scheduledGames } from '../data/schedule'
import { TEAM } from '../config/team'

export const resultBadge = (r: 'W' | 'L' | 'T') => (r === 'W' ? <Badge variant="good">勝</Badge> : r === 'L' ? <Badge variant="critical">敗</Badge> : <Badge>和</Badge>)

function SummaryHead({ title, to }: { title: string; to: string }) {
  return (
    <div className="flex items-end justify-between gap-3 px-1 -mb-1">
      <h3 className="text-[16px] text-ink leading-6">{title}</h3>
      <Button variant="ghost" size="sm" to={to}>完整數據 →</Button>
    </div>
  )
}

export function OverviewPage() {
  const s = useStats()
  const openGame = useOpenGame()
  const { summary, team, teamPitch, summaries } = s
  const opponentFilter = useDataStore((st) => st.filters.opponent)
  const tournamentFilter = useDataStore((st) => st.filters.tournament)
  const params = s.params
  const stories = useMemo(() => teamStories({ dataset: s.dataset, summaries, batting: s.batting, pitching: s.pitching, params }), [s.dataset, summaries, s.batting, s.pitching, params])
  const next = useMemo(() => { const today = new Date().toISOString().slice(0, 10); return scheduledGames(s.dataset.games).find((g) => g.date >= today) }, [s.dataset.games])
  const resetFilters = useDataStore((st) => st.resetFilters)
  // When the filter narrows to one opponent, name it; otherwise each game names its own opponent.
  const oppLabel = opponentFilter !== 'all' ? opponentFilter : '對手'

  const perGame = useMemo(() => summaries.map((g, i) => ({ name: `${shortDate(g.game.date)}`, idx: i, id: g.game.id, us: g.runsUs, opp: g.runsOpp, opponent: g.game.opponent })), [summaries])
  const cumulative = useMemo(() => {
    let acc = 0
    return summaries.map((g) => ({ id: g.game.id, name: shortDate(g.game.date), diff: (acc += g.runsUs - g.runsOpp) }))
  }, [summaries])
  const opsTrend = useMemo(() => summaries.map((_, i) => {
    const window = summaries.slice(Math.max(0, i - 4), i + 1).map((g) => g.game.id)
    const t = teamBatting(s.dataset, s.batting.filter((p) => window.includes(p.gameId)))
    return { id: summaries[i].game.id, name: shortDate(summaries[i].game.date), ops: Number((t.ops ?? 0).toFixed(3)), obp: Number((t.obp ?? 0).toFixed(3)) }
  }), [summaries, s.batting, s.dataset])
  const innings = useMemo(() => summary.runsByInningUs.map((v, i) => ({ name: `${i + 1}`, us: v, opp: summary.runsByInningOpp[i] ?? 0 })).filter((_, i) => i < 9), [summary])
  const spray = useMemo(() => sprayCounts(s.batting), [s.batting])
  // defense: amateur games turn on errors more than anything else
  const errors = useMemo(() => {
    const total = summaries.reduce((a, g) => a + g.errorsUs, 0)
    const po = s.fielders.reduce((a, f) => a + f.po + f.a, 0)
    return { total, chances: po + total, perGame: summaries.length ? total / summaries.length : 0, fpct: po + total > 0 ? po / (po + total) : null }
  }, [summaries, s.fielders])
  const recentGames = useMemo(() => [...summaries].reverse().slice(0, 4), [summaries])
  if (summaries.length === 0) {
    return (
      <>
        <PageHeader scoped title="總覽" description={`${TEAM_NAME} 的全時期表現。`} />
        <Card><EmptyState title="目前篩選條件下沒有比賽" description="調整上方篩選，或到「資料匯入」上傳總表。" action={<Button variant="outline" size="sm" onClick={resetFilters}>重設篩選</Button>} /></Card>
      </>
    )
  }

  return (
    <>
      <PageHeader scoped title="總覽" description={`${TEAM_NAME}・${summary.games} 場比賽，依上方篩選即時計算。`} />
      <DemoBanner />
      <SeasonHero summary={summary} summaries={summaries} stories={stories} next={next} title={tournamentFilter !== 'all' ? `${TEAM.org}・${tournamentFilter}` : TEAM.org} />
      {/* the team's numbers in two labelled groups (打擊 / 投球與守備), each with a way into the full tables */}
      <SummaryHead title="打擊摘要" to="/batting" />
      <StatGroup columns="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="每場得失分" to="/games?view=results" value={summary.runsPerGame ?? 0} display={`${f2(summary.runsPerGame)}/${f2(summary.runsAllowedPerGame)}`} note={`${summary.rs} 得・${summary.ra} 失`} />
        <StatTile label="團隊打擊率" to="/batting?view=basic&sort=avg" value={team.avg ?? 0} format="decimal3" note={`${team.h} H / ${team.ab} AB`} />
        <StatTile label="團隊 OPS" to="/batting?view=basic&sort=ops" value={team.ops ?? 0} format="decimal3" note={`OBP ${f3(team.obp)}・SLG ${f3(team.slg)}`} />
        <StatTile label="得點圈 AVG" to="/batting?view=advanced&sort=rispAvg" value={team.rispAvg ?? 0} format="decimal3" display={f3(team.rispAvg)} note={team.rispAB ? `${team.rispH} H / ${team.rispAB} AB` : '需有「壘上(前)」資料'} />
        <StatTile label="BB% / K%" to="/batting?view=advanced&sort=bbPct" value={team.bbPct ?? 0} display={`${pct0(team.bbPct)}/${pct0(team.kPct)}`} note={`${team.bb} BB・${team.so} K`} />
        <StatTile label="盜壘" to="/batting?view=basic&sort=sb" value={team.sb} note={team.sb + team.cs > 0 ? `成功率 ${pct(team.sbPct)}・失敗 ${team.cs}` : '尚無盜壘'} />
      </StatGroup>
      <SummaryHead title="投球與守備摘要" to="/pitching" />
      <StatGroup columns="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="團隊防禦率" to="/pitching?view=basic&sort=era&dir=asc" value={teamPitch.era ?? 0} format="era" note={`FIP ${f2(teamPitch.fip)}`} />
        <StatTile label="團隊 WHIP" to="/pitching?view=basic&sort=whip&dir=asc" value={teamPitch.whip ?? 0} format="ratio" />
        <StatTile label="團隊 K / BB" to="/pitching?view=advanced&sort=kbb" value={teamPitch.kbb ?? 0} format="ratio" note={`${teamPitch.k} K / ${teamPitch.bb} BB`} />
        <StatTile label="BB/9" to="/pitching?view=advanced&sort=bb9&dir=asc" value={teamPitch.bb9 ?? 0} format="ratio" display={f2(teamPitch.bb9)} note="每九局保送" />
        <StatTile label="守備率" to="/fielding" value={errors.fpct ?? 0} display={f3(errors.fpct)} note={`${errors.total} 次失誤／${errors.chances} 次機會・每場 ${f2(errors.perGame)} 失誤`} />
        <StatTile label="K/9" to="/pitching?view=advanced&sort=k9" value={teamPitch.k9 ?? 0} format="ratio" display={f2(teamPitch.k9)} note="每九局三振" />
      </StatGroup>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <BarChartCard title="逐場得失分" subtitle="每場比賽我隊與對手得分；點長條看那一場" data={perGame} onBarClick={openGame} series={[{ key: 'us', label: TEAM_NAME }, { key: 'opp', label: oppLabel }]}
          xSubKey="opponent" nameFor={(k, d) => (k === 'opp' ? String(d.opponent) : TEAM_NAME)} />
        <AreaChartCard title="累積得失分差" subtitle="賽季走勢；零線以上代表淨勝分；點一下看那一場" onPointClick={openGame} data={cumulative} series={{ key: 'diff', label: '累積得失分差' }} zeroLine formatValue={(v) => signedInt(Math.round(v))} />
        <LineChartCard title="OPS / OBP 走勢" subtitle={summaries.length >= 5 ? '近 5 場滾動平均；點一下看那一場' : `目前 ${summaries.length} 場，為累計平均（滿 5 場後改為近 5 場滾動）；點一下看那一場`} onPointClick={openGame} data={opsTrend} series={[{ key: 'ops', label: 'OPS' }, { key: 'obp', label: 'OBP' }]} formatValue={(v) => f3(v)} yWidth={52} />
        <BarChartCard title="逐局得失分" subtitle={opponentFilter !== 'all' ? `對 ${opponentFilter} 各局合計` : '所有比賽各局合計；篩選單一對手時會顯示其隊名'} data={innings} series={[{ key: 'us', label: TEAM_NAME }, { key: 'opp', label: oppLabel }]} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 md:gap-5">
        <SprayChart className="xl:col-span-2" title="打線落點分佈" subtitle="場內球落點（安打／場內球）" counts={spray.all} secondary={spray.hits} />
        {/* 近期比賽: the newest games as the same scoreboard cards as the 比賽 page (three on a phone, four elsewhere) */}
        <section aria-label="近期比賽" className="xl:col-span-3 flex flex-col gap-3 min-w-0">
          <div className="flex items-end justify-between gap-3 px-1">
            <div className="min-w-0">
              <h3 className="text-[16px] text-ink leading-6">近期比賽</h3>
              <p className="text-xs text-muted leading-4 mt-0.5">新的在前；點一場看逐局比分與攻守成績</p>
            </div>
            <Button variant="ghost" size="sm" to="/games?view=results">全部比賽 →</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
            {recentGames.map((g, i) => <GameCard key={g.game.id} s={g} teamName={TEAM_NAME} star={gameStar(s.dataset, g.game.id)} onOpen={() => openGame({ id: g.game.id })} className={i === 3 ? 'hidden sm:flex' : undefined} />)}
          </div>
        </section>
      </div>
    </>
  )
}
