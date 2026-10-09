import { useMemo, type ReactNode } from 'react'
import { Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom'
import '../styles/print.css'
import { PrintLayout } from '../components/print/PrintLayout'
import { Scoresheet } from '../components/print/Scoresheet'
import { StatsSheet, type StatsSort } from '../components/print/StatsSheet'
import { LineupCard } from '../components/print/LineupCard'
import { buildScoresheet, type Scoresheet as ScoresheetData } from '../data/scoresheet'
import { TEAM } from '../config/team'
import { PageErrorBoundary } from '../components/layout/PageErrorBoundary'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { Tabs } from '../components/ui/Tabs'
import { Checkbox } from '../components/ui/Input'
import { effectiveDataset, useDataStore } from '../store/data'
import { pitchingLines, summarizeGame } from '../data/stats'
import { readLineup } from '../record/lineup'
import { TEAM_NAME } from '../data/seed'

/** A message instead of a sheet (no such game, no lineup on this device), with the way back. */
function PrintEmpty({ title, description, action }: { title: string; description?: string; action: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg p-4 md:p-10">
      <Card className="max-w-xl mx-auto"><EmptyState title={title} description={description} action={action} /></Card>
    </div>
  )
}

type Side = 'both' | 'us' | 'opp'

/** The nine slots are always printed, even one that never came up (a blank line to fill in by hand). */
function withAllSlots(sheet: ScoresheetData): ScoresheetData {
  const lines = [...sheet.lines]
  for (let k = 1; k <= 9; k++) if (!lines.some((l) => l.order === k)) lines.push({ order: k, players: [], cells: {} })
  lines.sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
  return { ...sheet, lines }
}

/** /print/game/:id — 傳統記分表, one A4 landscape page per team (?side=both|us|opp). */
function GameSheets() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const base = useDataStore((s) => s.base)
  const demo = useDataStore((s) => s.demo)
  const rawParams = useDataStore((s) => s.params)
  const ds = useMemo(() => effectiveDataset(base, demo), [base, demo])
  const game = ds.games.find((g) => g.id === id)
  const side: Side = params.get('side') === 'us' || params.get('side') === 'opp' ? (params.get('side') as Side) : 'both'
  const data = useMemo(() => {
    if (!game) return null
    const us = ds.batting.filter((p) => p.gameId === game.id)
    const opp = ds.pitching.filter((p) => p.gameId === game.id)
    const summary = summarizeGame(ds, game)
    const innings = Math.max(game.innings ?? TEAM.innings, summary.lineUs.length, summary.lineOpp.length)
    const sheetUs = withAllSlots(buildScoresheet(us, 'bat', { innings, subs: game.dayRoster?.subs }))
    const sheetOpp = withAllSlots(buildScoresheet(opp, 'pit', { innings }))
    const weHome = game.homeAway === '主'
    const lastPlayed = Math.max(0, ...us.map((r) => r.inning), ...opp.map((r) => r.inning))
    const homeRows = weHome ? us : opp
    const homeAhead = weHome ? summary.runsUs > summary.runsOpp : summary.runsOpp > summary.runsUs
    const homeX = lastPlayed > 0 && homeAhead && !homeRows.some((r) => r.inning === lastPlayed) ? lastPlayed : undefined
    return { summary, sheetUs, sheetOpp, pitchers: pitchingLines(opp, [game], rawParams), weHome, homeX }
  }, [ds, game, rawParams])
  if (!game || !data) {
    return <PrintEmpty title="找不到這場比賽" description="網址可能打錯，或這場比賽已經刪除。" action={<Button variant="primary" to="/games">回到比賽列表</Button>} />
  }
  const us = <Scoresheet key="us" game={game} summary={data.summary} side="us" sheet={data.sheetUs} homeX={data.homeX} />
  const opp = <Scoresheet key="opp" game={game} summary={data.summary} side="opp" sheet={data.sheetOpp} pitchers={data.pitchers} homeX={data.homeX} />
  // the visiting team batted first, so its page comes first
  const pages = side === 'us' ? [us] : side === 'opp' ? [opp] : data.weHome ? [opp, us] : [us, opp]
  const setSide = (v: Side) => setParams((p) => { const n = new URLSearchParams(p); if (v === 'both') n.delete('side'); else n.set('side', v); return n }, { replace: true })
  return (
    <PrintLayout orientation="landscape" back={`/games/${encodeURIComponent(game.id)}`} title={`記分表 ${game.date} ${TEAM_NAME} vs ${game.opponent}`}
      options={<Tabs size="sm" aria-label="印哪一隊" value={side} onChange={setSide} items={[{ value: 'both', label: '兩隊' }, { value: 'us', label: '我隊打擊' }, { value: 'opp', label: '對方打擊' }]} />}>
      {pages}
    </PrintLayout>
  )
}

/** /print/stats — 單頁累計成績表 in the current filter (?sort=number|pa plus the filter parameters). */
function StatsPrint() {
  const [params, setParams] = useSearchParams()
  const { search } = useLocation()
  const sort: StatsSort = params.get('sort') === 'pa' ? 'pa' : 'number'
  const setSort = (v: StatsSort) => setParams((p) => { const n = new URLSearchParams(p); if (v === 'number') n.delete('sort'); else n.set('sort', v); return n }, { replace: true })
  const back = new URLSearchParams(search); back.delete('sort')
  return (
    <PrintLayout orientation="portrait" back={`/batting${back.toString() ? `?${back}` : ''}`} title={`${TEAM_NAME} 累計成績`}
      options={<Tabs size="sm" aria-label="排序" value={sort} onChange={setSort} items={[{ value: 'number', label: '排序：背號' }, { value: 'pa', label: '打席數' }]} />}>
      <StatsSheet sort={sort} />
    </PrintLayout>
  )
}

/** /print/lineup — 陣容卡 from the lineup drawn up on this device (?copies=1|2, ?subs=1 for a blank 替補 column). */
function LineupPrint() {
  const [params, setParams] = useSearchParams()
  const base = useDataStore((s) => s.base)
  const lineup = useMemo(() => readLineup(), [])
  const copies: 1 | 2 = params.get('copies') === '2' ? 2 : 1
  const subs = params.get('subs') === '1'
  const set = (key: string, v: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (v === null) n.delete(key); else n.set(key, v); return n }, { replace: true })
  const hasLineup = !!lineup && (lineup.order.some(Boolean) || Object.values(lineup.field).some(Boolean))
  if (!lineup || !hasLineup) {
    return <PrintEmpty title="這台裝置還沒有排好的陣容" description="陣容卡印的是「先發陣容」頁排好的名單；先在那裡排好，再按「列印陣容卡」。" action={<Button variant="primary" to="/lineup">去排先發陣容</Button>} />
  }
  const game = base.games.find((g) => g.id === lineup.gameId)
  return (
    <PrintLayout orientation="portrait" back="/lineup" title={`先發名單${game ? ` vs ${game.opponent}` : ''}`}
      options={(
        <>
          <Tabs size="sm" aria-label="份數" value={String(copies) as '1' | '2'} onChange={(v) => set('copies', v === '2' ? '2' : null)} items={[{ value: '1', label: '1 份' }, { value: '2', label: '2 份' }]} />
          <Checkbox label="留空白替補欄" checked={subs} onChange={(v) => set('subs', v ? '1' : null)} />
        </>
      )}>
      <LineupCard lineup={lineup} roster={base.roster} game={game} copies={copies} subs={subs} />
    </PrintLayout>
  )
}

/** /print/…: the printable layouts, outside the site's shell (no sidebar or top bar ends up on paper). */
export function PrintPage() {
  const { pathname } = useLocation()
  return (
    <PageErrorBoundary resetKey={pathname}>
      <Routes>
        <Route path="game/:id" element={<GameSheets />} />
        <Route path="stats" element={<StatsPrint />} />
        <Route path="lineup" element={<LineupPrint />} />
        <Route path="*" element={<PrintEmpty title="找不到這個列印頁" description="可以從比賽頁、打擊／投球頁或先發陣容頁的「列印」按鈕進來。" action={<Button variant="primary" to="/">回到總覽</Button>} />} />
      </Routes>
    </PageErrorBoundary>
  )
}
