import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Sheet } from '../components/ui/Sheet'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Tabs } from '../components/ui/Tabs'
import { DataTable, type Column } from '../components/ui/DataTable'
import { DemoBanner } from '../components/ui/DemoBanner'
import { GameCard, gameStar } from '../components/ui/GameCard'
import { ScheduleSection, daysToNextGame } from './Schedule'
import { GameView, resultBadge } from './GameView'
import { useDataStore } from '../store/data'
import { auditGame } from '../data/audit'
import { useStats } from '../hooks/useStats'
import { summarizeGame } from '../data/stats'
import { TEAM_NAME } from '../data/seed'

interface GameRow { id: string; date: string; tournament: string; opponent: string; homeAway: string; venue: string; result: 'W' | 'L' | 'T'; score: string; hitsUs: number; hitsOpp: number; errorsUs: number; lob: number; pitches: number; isDemo: boolean }

export function GamesPage() {
  const s = useStats()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState<string | null>(params.get('game'))
  const [view, setViewState] = useState<'schedule' | 'results'>('results')
  const base = useDataStore((st) => st.base)
  // Open on whichever half is live: the schedule when a game is within a week, the results table otherwise.
  const [viewDecided, setViewDecided] = useState(false)
  useEffect(() => {
    if (viewDecided) return
    const q = params.get('view')
    if (q === 'schedule' || q === 'results') { setViewState(q); setViewDecided(true); return }
    if (params.get('game')) { setViewState('results'); setViewDecided(true); return }
    if (!base.games.length) return
    const n = daysToNextGame(base.games)
    setViewState(n !== null && n <= 7 ? 'schedule' : 'results')
    setViewDecided(true)
  }, [base.games, params, viewDecided])
  const setView = (v: 'schedule' | 'results') => {
    setViewState(v); setViewDecided(true); setOpen(null)
    const next = new URLSearchParams(params); next.set('view', v); next.delete('game'); setParams(next, { replace: true })
  }
  useEffect(() => { const g = params.get('game'); if (g) setOpen(g) }, [params])
  const close = () => { setOpen(null); if (params.get('game')) { const next = new URLSearchParams(params); next.delete('game'); setParams(next, { replace: true }) } }

  const rows: GameRow[] = useMemo(() => [...s.summaries].reverse().map((g) => ({
    id: g.game.id, date: g.game.date, tournament: g.game.tournament, opponent: g.game.opponent, homeAway: g.game.homeAway, venue: g.game.venue ?? '', result: g.result, score: `${g.runsUs}–${g.runsOpp}`,
    hitsUs: g.hitsUs, hitsOpp: g.hitsOpp, errorsUs: g.errorsUs, lob: g.lobUs, pitches: g.pitchesUs, isDemo: !!g.game.isDemo,
  })), [s.summaries])
  const columns: Column<GameRow>[] = [
    { key: 'date', header: '日期', sortable: true },
    { key: 'tournament', header: '杯賽', sortable: true, className: 'text-ink-2' },
    { key: 'opponent', header: '對手', className: 'font-medium', format: (v, r) => <span className="inline-flex items-center gap-1.5">{String(v)}{r.isDemo && <Badge variant="outline">示範</Badge>}</span> },
    { key: 'homeAway', header: '主客', align: 'center', className: 'text-ink-2' }, { key: 'venue', header: '場地', className: 'text-ink-2' },
    { key: 'result', header: '結果', align: 'center', format: (v) => resultBadge(v as GameRow['result']) },
    { key: 'score', header: '比分', align: 'right', className: 'font-medium' }, { key: 'hitsUs', header: '安打', align: 'right', sortable: true }, { key: 'hitsOpp', header: '被安打', align: 'right', sortable: true }, { key: 'errorsUs', header: '失誤', align: 'right', sortable: true }, { key: 'lob', header: '殘壘', align: 'right', sortable: true }, { key: 'pitches', header: '投手用球', align: 'right', sortable: true },
  ]
  // 卡片 (scoreboard cards, the default) or 表格 (the sortable table), kept in the address as ?layout=table
  const layout = params.get('layout') === 'table' ? 'table' : 'cards'
  const setLayout = (v: 'cards' | 'table') => { const next = new URLSearchParams(params); if (v === 'table') next.set('layout', 'table'); else next.delete('layout'); setParams(next, { replace: true }) }
  // each game's 本場焦點
  const stars = useMemo(() => new Map(s.summaries.map((g) => [g.game.id, gameStar(s.dataset, g.game.id)])), [s.summaries, s.dataset])
  // 待核對 per game (the same check as inside the game), so the games that need correcting stand out in the list
  const issueCounts = useMemo(() => new Map(s.summaries.map((g) => [g.game.id, auditGame(s.dataset.batting.filter((p) => p.gameId === g.game.id), s.dataset.pitching.filter((p) => p.gameId === g.game.id)).length])), [s.summaries, s.dataset])
  // a game outside the filter can still be opened from a link
  const current = useMemo(() => { const g = s.dataset.games.find((x) => x.id === open); return g ? s.summaries.find((x) => x.game.id === g.id) ?? summarizeGame(s.dataset, g) : null }, [open, s.dataset, s.summaries])
  return (
    <>
      <PageHeader scoped title="比賽"
        description={view === 'schedule' ? '接下來的比賽、還沒補記的場次與已取消的場次。' : `${s.summaries.length} 場比賽符合篩選。點任一場查看逐局比分、Box Score 與逐打席的逐球紀錄。`}
        actions={<Tabs size="sm" aria-label="比賽頁分頁" value={view} onChange={setView} items={[{ value: 'schedule', label: '賽程' }, { value: 'results', label: '成績' }]} />} />
      {view === 'schedule' ? <ScheduleSection /> : (<>
        <DemoBanner />
        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 -mb-1">
            <span className="text-[12px] text-muted">新的在前；點一場看逐局比分與 Box Score</span>
            <Tabs size="sm" aria-label="比賽排列方式" value={layout} onChange={setLayout} items={[{ value: 'cards', label: '卡片' }, { value: 'table', label: '表格' }]} />
          </div>
        )}
        {layout === 'cards' && rows.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
            {[...s.summaries].reverse().map((g) => <GameCard key={g.game.id} s={g} teamName={TEAM_NAME} star={stars.get(g.game.id)} issues={issueCounts.get(g.game.id)} onOpen={() => setOpen(g.game.id)} />)}
          </div>
        ) : (
          <Card flush>
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => setOpen(r.id)} dense emptyTitle="沒有比賽" emptyDescription="調整篩選條件或匯入資料。" />
          </Card>
        )}
      </>)}
      <Sheet open={!!current} onClose={close} ariaLabel="逐場成績" side="bottom" desktopFrom="sm" panelClassName="sm:max-w-5xl">
        {current && <GameView key={current.game.id} summary={current} mode="sheet" onClose={close} />}
      </Sheet>
    </>
  )
}
