import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { StatTile } from '../components/ui/StatTile'
import { DataTable, type Column } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { DemoBanner } from '../components/ui/DemoBanner'
import { RadarCard } from '../components/charts/RadarCard'
import { SprayChart } from '../components/charts/SprayChart'
import { LineChartCard } from '../components/charts/LineChartCard'
import { useStats } from '../hooks/useStats'
import { usePrefersReducedMotion } from '../hooks/useMediaQuery'
import { battingLines, sprayCounts, type BattingLine } from '../data/stats'
import { f2, f3, pct, percentile, posLabel, shortDate } from '../lib/fmt'
import { cx } from '../lib/format'

interface GameLogRow { id: string; date: string; opponent: string; pa: number; ab: number; h: number; hr: number; rbi: number; bb: number; so: number; sb: number; avg: string; isDemo: boolean }

export function PlayersPage() {
  const s = useStats()
  const reduced = usePrefersReducedMotion()
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
    { key: 'opponent', header: '對手', format: (v, r) => <span className="inline-flex items-center gap-1.5">{String(v)}{r.isDemo && <Badge variant="accent">示範</Badge>}</span> },
    { key: 'pa', header: 'PA', align: 'right' }, { key: 'ab', header: 'AB', align: 'right' }, { key: 'h', header: 'H', align: 'right' }, { key: 'hr', header: 'HR', align: 'right' }, { key: 'rbi', header: 'RBI', align: 'right' }, { key: 'bb', header: 'BB', align: 'right' }, { key: 'so', header: 'SO', align: 'right' }, { key: 'sb', header: 'SB', align: 'right' }, { key: 'avg', header: '單場 AVG', align: 'right' },
  ]

  const choose = (name: string) => { setSelected(name); setParams({ player: name }, { replace: true }) }

  return (
    <>
      <PageHeader eyebrow="Roster" title="球員" description={`${roster.length} 位球員。個人數據依上方篩選條件計算；雷達圖為隊內百分位（PA ≥ 3 的打者）。`} />
      <DemoBanner />
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <Card className="xl:col-span-4" title="名單" flush>
          <ul className="divide-y divide-[var(--border)] max-h-[560px] overflow-y-auto">
            {roster.map((p, i) => {
              const b = byName.get(p.name); const pl = pitchByName.get(p.name)
              const active = p.name === selected
              return (
                <motion.li key={p.name} initial={reduced ? false : { opacity: 0.01, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03, duration: 0.35 }}>
                  <button type="button" onClick={() => choose(p.name)} aria-pressed={active}
                    className={cx('w-full text-left flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors motion-reduce:transition-none', active ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
                    <span className={cx('size-9 rounded-full grid place-items-center font-display font-bold text-[15px] shrink-0', active ? 'bg-accent text-accent-ink' : 'bg-surface-3 text-ink-2')}>{p.number ?? p.name.slice(0, 1)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink truncate">{p.name}</span>
                      <span className="block text-[11px] text-muted truncate">{posLabel(p.primaryPos)}{p.bats ? `・${p.bats === 'L' ? '左打' : p.bats === 'S' ? '左右開弓' : '右打'}` : ''}</span>
                    </span>
                    <span className="text-right tnum text-xs text-ink-2 shrink-0">
                      {b ? <span className="block">AVG {f3(b.avg)}</span> : <span className="block text-muted">無打席</span>}
                      {pl && <span className="block text-muted">ERA {f2(pl.era)}</span>}
                    </span>
                  </button>
                </motion.li>
              )
            })}
          </ul>
        </Card>
        <div className="xl:col-span-8 flex flex-col gap-6 min-w-0">
          {!player ? (
            <Card><EmptyState title="請選擇球員" /></Card>
          ) : (
            <>
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <div className="eyebrow">{posLabel(player.primaryPos)}{player.secondaryPos ? ` / ${player.secondaryPos}` : ''}</div>
                  <h2 className="font-display font-bold text-[32px] leading-none text-ink mt-1">{player.number ? `#${player.number} ` : ''}{player.name}</h2>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {bat && <Badge>打者 {bat.g} 場</Badge>}
                  {pit && <Badge variant="accent">投手 {pit.ipDisplay} 局</Badge>}
                  {fld && <Badge>守備 {fld.positions.join('/')}</Badge>}
                </div>
              </div>
              {bat ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatTile label="打擊率 AVG" value={bat.avg ?? 0} format="decimal3" note={`${bat.h} H / ${bat.ab} AB`} />
                  <StatTile label="上壘率 OBP" value={bat.obp ?? 0} format="decimal3" note={`${bat.bb} BB・${bat.hbp} HBP`} />
                  <StatTile label="長打率 SLG" value={bat.slg ?? 0} format="decimal3" note={`${bat.h2} 2B・${bat.h3} 3B・${bat.hr} HR`} />
                  <StatTile label="OPS" value={bat.ops ?? 0} format="decimal3" sparkline={trend.length > 1 ? trend.map((t) => t.OPS) : undefined} />
                  <StatTile label="wOBA" value={bat.woba ?? 0} format="decimal3" note={`${bat.pa} PA・${bat.rbi} RBI`} />
                  <StatTile label="K% / BB%" value={(bat.kPct ?? 0) * 100} format="pct" display={`${pct(bat.kPct)} / ${pct(bat.bbPct)}`} compact note={`${bat.so} K / ${bat.bb} BB`} />
                  <StatTile label="Whiff%・Hard%" value={(bat.whiffPct ?? 0) * 100} format="pct" display={`${pct(bat.whiffPct)} / ${pct(bat.hardPct)}`} compact note="揮空率 / 強勁擊球率" />
                  <StatTile label="得點圈 AVG" value={bat.rispAvg ?? 0} format="decimal3" display={f3(bat.rispAvg)} note={`${bat.rispH} / ${bat.rispAB} RISP AB`} />
                </div>
              ) : (
                <Card><EmptyState compact title="目前篩選條件下沒有打席" /></Card>
              )}
              {pit && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatTile label="ERA" value={pit.era ?? 0} format="era" />
                  <StatTile label="FIP" value={pit.fip ?? 0} format="era" />
                  <StatTile label="WHIP" value={pit.whip ?? 0} format="ratio" />
                  <StatTile label="K / BB" value={pit.k} display={`${pit.k} / ${pit.bb}`} note={`CSW% ${pct(pit.cswPct)}・${pit.ipDisplay} IP`} />
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
