import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { StatGroup, StatTile } from '../components/ui/StatTile'
import { DataTable, type Column } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { DemoBanner } from '../components/ui/DemoBanner'
import { RadarCard } from '../components/charts/RadarCard'
import { SprayChart } from '../components/charts/SprayChart'
import { LineChartCard } from '../components/charts/LineChartCard'
import { useStats } from '../hooks/useStats'
import { battingLines, sprayCounts, type BattingLine } from '../data/stats'
import { f2, f3, pct, percentile, posLabel, shortDate } from '../lib/fmt'
import { cx } from '../lib/format'

interface GameLogRow { id: string; date: string; opponent: string; pa: number; ab: number; h: number; hr: number; rbi: number; bb: number; so: number; sb: number; avg: string; isDemo: boolean }

export function PlayersPage() {
  const s = useStats()
  const [params, setParams] = useSearchParams()
  const roster = s.dataset.roster
  const names = useMemo(() => roster.map((p) => p.name), [roster])
  const requested = params.get('player')
  const [selected, setSelected] = useState<string>(requested && names.includes(requested) ? requested : names[0] ?? '')
  useEffect(() => { if (requested && names.includes(requested)) setSelected(requested) }, [requested, names])

  const byName = useMemo(() => new Map(s.batters.map((b) => [b.name, b])), [s.batters])
  const pitchByName = useMemo(() => new Map(s.pitchers.map((p) => [p.name, p])), [s.pitchers])
  const fieldByName = useMemo(() => new Map(s.fielders.map((f) => [f.name, f])), [s.fielders])
  const player = roster.find((p) => p.name === selected)
  const bat = byName.get(selected)
  const pit = pitchByName.get(selected)
  const fld = fieldByName.get(selected)

  const AXES: Array<{ key: keyof BattingLine; label: string; invert?: boolean }> = [
    { key: 'avg', label: '打擊率' }, { key: 'obp', label: '上壘率' }, { key: 'slg', label: '長打率' }, { key: 'kPct', label: '避免三振', invert: true }, { key: 'bbPct', label: '選球' }, { key: 'hardPct', label: '強擊' },
  ]
  const radar = useMemo(() => {
    const pool = s.batters.filter((b) => b.pa >= 3)
    return AXES.map((a) => ({ axis: a.label, player: bat ? percentile(bat[a.key] as number | null, pool.map((b) => b[a.key] as number | null), a.invert) : 0, team: 50 }))
  }, [bat, s.batters])

  const gameLog: GameLogRow[] = useMemo(() => s.summaries.map((g) => {
    const pas = s.batting.filter((p) => p.gameId === g.game.id && p.batter === selected)
    if (!pas.length) return null
    const l = battingLines(s.dataset, pas)[0]
    return { id: g.game.id, date: g.game.date, opponent: g.game.opponent, pa: l.pa, ab: l.ab, h: l.h, hr: l.hr, rbi: l.rbi, bb: l.bb, so: l.so, sb: l.sb, avg: f3(l.avg), isDemo: !!g.game.isDemo }
  }).filter((r): r is GameLogRow => r !== null).reverse(), [s.summaries, s.batting, s.dataset, selected])

  const trend = useMemo(() => {
    const rows = [...gameLog].reverse()
    return rows.map((_, i) => {
      const ids = rows.slice(0, i + 1).map((r) => r.id)
      const l = battingLines(s.dataset, s.batting.filter((p) => ids.includes(p.gameId) && p.batter === selected))[0]
      return { name: shortDate(rows[i].date), AVG: Number((l?.avg ?? 0).toFixed(3)), OPS: Number((l?.ops ?? 0).toFixed(3)) }
    })
  }, [gameLog, s.batting, s.dataset, selected])
  const spray = useMemo(() => sprayCounts(s.batting.filter((p) => p.batter === selected)), [s.batting, selected])

  const logCols: Column<GameLogRow>[] = [
    { key: 'date', header: '日期', format: (v) => shortDate(String(v)) },
    { key: 'opponent', header: '對手', className: 'font-medium', format: (v, r) => <span className="inline-flex items-center gap-1.5">{String(v)}{r.isDemo && <Badge variant="outline">示範</Badge>}</span> },
    { key: 'pa', header: 'PA', align: 'right' }, { key: 'ab', header: 'AB', align: 'right' }, { key: 'h', header: 'H', align: 'right' }, { key: 'hr', header: 'HR', align: 'right' }, { key: 'rbi', header: 'RBI', align: 'right' }, { key: 'bb', header: 'BB', align: 'right' }, { key: 'so', header: 'SO', align: 'right' }, { key: 'sb', header: 'SB', align: 'right' }, { key: 'avg', header: '單場 AVG', align: 'right' },
  ]

  const choose = (name: string) => { setSelected(name); setParams({ player: name }, { replace: true }) }
  const hand = (b?: string) => (b ? (b === 'L' ? '左打' : b === 'S' ? '左右開弓' : '右打') : '')

  return (
    <>
      <PageHeader title="球員" description={`${roster.length} 位球員。個人數據依上方篩選計算；雷達圖為隊內百分位（PA ≥ 3 的打者）。`} />
      <DemoBanner />
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5 items-start">
        <Card className="xl:col-span-4 xl:sticky xl:top-[72px]" title="名單" subtitle={`${roster.length} 人`} flush>
          <ul className="divide-y divide-[var(--border)] max-h-[560px] xl:max-h-[calc(100vh-200px)] overflow-y-auto">
            {roster.map((p) => {
              const b = byName.get(p.name); const pl = pitchByName.get(p.name)
              const active = p.name === selected
              return (
                <li key={p.name}>
                  <button type="button" onClick={() => choose(p.name)} aria-pressed={active}
                    className={cx('w-full text-left flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors motion-reduce:transition-none', active ? 'bg-surface-2' : 'hover:bg-surface-2/60')}>
                    <span className={cx('size-8 rounded-[6px] grid place-items-center text-[12px] font-semibold tnum shrink-0', active ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>{p.number ?? p.name.slice(0, 1)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-ink truncate">{p.name}</span>
                      <span className="block text-[11px] text-muted truncate">{posLabel(p.primaryPos)}{p.bats ? `・${hand(p.bats)}` : ''}</span>
                    </span>
                    <span className="text-right tnum text-[12px] text-ink-2 shrink-0 leading-4">
                      {b ? <span className="block">AVG {f3(b.avg)}</span> : <span className="block text-muted">無打席</span>}
                      {pl && <span className="block text-muted">ERA {f2(pl.era)}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
        <div className="xl:col-span-8 flex flex-col gap-4 md:gap-5 min-w-0">
          {!player ? (
            <Card><EmptyState title="請選擇球員" /></Card>
          ) : (
            <>
              <div className="flex items-end justify-between gap-4 flex-wrap px-1">
                <div className="min-w-0">
                  <h2 className="text-[22px] font-semibold tracking-[-0.02em] leading-7 text-ink">{player.number ? <span className="text-muted font-medium mr-2 tnum">#{player.number}</span> : null}{player.name}</h2>
                  <div className="text-[13px] text-ink-2 mt-1">{posLabel(player.primaryPos)}{player.secondaryPos ? ` / ${player.secondaryPos}` : ''}{player.bats ? `・${hand(player.bats)}` : ''}</div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {bat && <Badge>打者 {bat.g} 場</Badge>}
                  {pit && <Badge>投手 {pit.ipDisplay} 局</Badge>}
                  {fld && <Badge>守備 {fld.positions.join(' / ')}</Badge>}
                </div>
              </div>
              {bat ? (
                <StatGroup>
                  <StatTile label="打擊率 AVG" value={bat.avg ?? 0} format="decimal3" note={`${bat.h} H / ${bat.ab} AB`} />
                  <StatTile label="上壘率 OBP" value={bat.obp ?? 0} format="decimal3" note={`${bat.bb} BB・${bat.hbp} HBP`} />
                  <StatTile label="長打率 SLG" value={bat.slg ?? 0} format="decimal3" note={`${bat.h2} 2B・${bat.h3} 3B・${bat.hr} HR`} />
                  <StatTile label="OPS" value={bat.ops ?? 0} format="decimal3" note={`${bat.pa} PA・${bat.rbi} RBI`} />
                  <StatTile label="wOBA" value={bat.woba ?? 0} format="decimal3" />
                  <StatTile label="K% / BB%" value={(bat.kPct ?? 0) * 100} format="pct" display={`${pct(bat.kPct)} / ${pct(bat.bbPct)}`} compact note={`${bat.so} K / ${bat.bb} BB`} />
                  <StatTile label="Whiff% / Hard%" value={(bat.whiffPct ?? 0) * 100} format="pct" display={`${pct(bat.whiffPct)} / ${pct(bat.hardPct)}`} compact note="揮空率 / 強勁擊球率" />
                  <StatTile label="得點圈 AVG" value={bat.rispAvg ?? 0} format="decimal3" display={f3(bat.rispAvg)} note={`${bat.rispH} / ${bat.rispAB} RISP AB`} />
                </StatGroup>
              ) : (
                <Card><EmptyState compact title="目前篩選條件下沒有打席" /></Card>
              )}
              {pit && (
                <StatGroup>
                  <StatTile label="ERA" value={pit.era ?? 0} format="era" note={`${pit.ipDisplay} IP`} />
                  <StatTile label="FIP" value={pit.fip ?? 0} format="era" />
                  <StatTile label="WHIP" value={pit.whip ?? 0} format="ratio" />
                  <StatTile label="K / BB" value={pit.k} display={`${pit.k} / ${pit.bb}`} note={`CSW% ${pct(pit.cswPct)}`} />
                </StatGroup>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
                <RadarCard title="隊內百分位" subtitle="與同隊打者比較（50 = 隊內中位）" data={radar} series={[{ key: 'player', label: player.name }, { key: 'team', label: '隊內中位' }]} formatValue={(v) => `${Math.round(v)}`} />
                <SprayChart title="落點分佈" subtitle="安打 / 場內球" counts={spray.all} secondary={spray.hits} />
              </div>
              {trend.length > 1 && <LineChartCard title="AVG / OPS 累積走勢" subtitle="賽季至今" data={trend} series={[{ key: 'AVG', label: 'AVG' }, { key: 'OPS', label: 'OPS' }]} formatValue={(v) => f3(v)} yWidth={52} />}
              <Card title="逐場紀錄" flush>
                <DataTable columns={logCols} rows={gameLog} rowKey={(r) => r.id} dense maxHeight={360} emptyTitle="沒有逐場紀錄" />
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  )
}
