import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Tabs } from '../components/ui/Tabs'
import { Checkbox } from '../components/ui/Input'
import { EmptyState } from '../components/ui/EmptyState'
import { DemoBanner } from '../components/ui/DemoBanner'
import { RecordCard } from '../components/ui/RecordCard'
import { TeamSeasonsTable } from '../components/ui/TeamSeasonsTable'
import { useNavigateWithFilters } from '../components/layout/FilterChips'
import { useHistory } from '../hooks/useHistory'
import { careerRecords, gameRecords, recordsCsv, seasonRecords, teamRecords, type RecordCsvRow, type RecordList } from '../data/records'
import { teamSeasons } from '../data/history'
import { seasonHeader, seasonNote } from '../data/seasons'
import { teamBatting, teamPitching } from '../data/stats'
import { TEAM_NAME } from '../data/seed'
import { effectiveDataset, useDataStore } from '../store/data'
import { downloadCsv } from '../lib/csv'
import type { Column } from '../components/ui/DataTable'

type View = 'game' | 'season' | 'career' | 'team'
type Side = 'bat' | 'pit'
const VIEWS: Array<{ value: View; label: string }> = [{ value: 'game', label: '單場' }, { value: 'season', label: '單季' }, { value: 'career', label: '生涯' }, { value: 'team', label: '球隊' }]
const SIDES: Array<{ value: Side; label: string }> = [{ value: 'bat', label: '打擊' }, { value: 'pit', label: '投球' }]

const csvColumns = (): Column<RecordCsvRow>[] => [
  { key: 'cat', header: '類別' }, { key: 'item', header: '項目' }, { key: 'rank', header: '名次' }, { key: 'player', header: '球員' },
  { key: 'value', header: '數值' }, { key: 'when', header: `${seasonHeader()}／日期` }, { key: 'opponent', header: '對手' }, { key: 'sample', header: '樣本' },
]

/** 紀錄簿: the best single games, seasons and careers over every recorded game, not the filter bar's slice. */
export function RecordsPage() {
  const h = useHistory()
  const [params, setParams] = useSearchParams()
  const goWithFilters = useNavigateWithFilters()
  const base = useDataStore((s) => s.base)
  const demo = useDataStore((s) => s.demo)
  const view: View = (['game', 'season', 'career', 'team'] as const).find((v) => v === params.get('view')) ?? 'game'
  const side: Side = params.get('side') === 'pit' ? 'pit' : 'bat'
  const activeOnly = params.get('active') === '1'
  const set = (k: string, v: string | null) => setParams((prev) => { const n = new URLSearchParams(prev); if (v === null) n.delete(k); else n.set(k, v); return n }, { replace: true })

  const lists: RecordList[] = useMemo(() => {
    if (!h.games.length) return []
    if (view === 'team') { const t = teamRecords(h); return [...t.game, ...t.season, ...t.streak] }
    const r = view === 'game' ? gameRecords(h) : view === 'season' ? seasonRecords(h, { activeOnly }) : careerRecords(h, { activeOnly })
    return side === 'pit' ? r.pit : r.bat
  }, [h, view, side, activeOnly])
  const seasons = useMemo(() => {
    if (view !== 'team') return []
    const ds = effectiveDataset(base, demo)
    const ids = new Set(h.games.map((g) => g.id))
    return teamSeasons(h.summaries, ds.batting.filter((p) => ids.has(p.gameId)), ds.pitching.filter((p) => ids.has(p.gameId)), ds, h.params, { start: h.start })
  }, [view, base, demo, h])
  const total = useMemo(() => {
    if (view !== 'team') return undefined
    const ds = effectiveDataset(base, demo)
    const ids = new Set(h.games.map((g) => g.id))
    const bat = teamBatting(ds, ds.batting.filter((p) => ids.has(p.gameId)), h.params)
    return { avg: bat.avg, ops: bat.ops, era: teamPitching(ds.pitching.filter((p) => ids.has(p.gameId)), h.params).era }
  }, [view, base, demo, h])

  const first = h.games[0]
  const note = seasonNote(h.start)
  const description = first
    ? `自 ${first.date.replace(/-/g, '/')} 起 ${h.games.length} 場有逐打席紀錄的比賽，不受上方篩選影響；更早的比賽沒有紀錄，不在這裡。${note ? `${note}。` : ''}`
    : '隊上每場比賽的單場、單季、生涯最佳，不受上方篩選影響。'
  const viewLabel = VIEWS.find((v) => v.value === view)!.label
  const sideLabel = view === 'team' ? '' : SIDES.find((x) => x.value === side)!.label
  const exportCsv = () => downloadCsv(`紀錄簿_${viewLabel}${sideLabel ? `_${sideLabel}` : ''}.csv`, csvColumns(), recordsCsv(lists), [`${TEAM_NAME} 紀錄簿・${viewLabel}${sideLabel ? `・${sideLabel}` : ''}${activeOnly && (view === 'season' || view === 'career') ? '・只看現役' : ''}`, description, `來源：${window.location.href}`])

  if (!first) {
    return (
      <>
        <PageHeader title="紀錄簿" description={description} />
        <Card><EmptyState title="還沒有比賽紀錄" description="紀錄比賽或匯入總表之後，這裡會列出單場、單季、生涯的最佳紀錄。" /></Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title="紀錄簿" description={description} />
      <DemoBanner />
      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
        <Tabs aria-label="紀錄類別" value={view} onChange={(v) => set('view', v === 'game' ? null : v)} items={VIEWS} />
        {view !== 'team' && <Tabs aria-label="打擊或投球" value={side} onChange={(v) => set('side', v === 'bat' ? null : v)} items={SIDES} />}
        {(view === 'season' || view === 'career') && <Checkbox label="只看現役" checked={activeOnly} onChange={(v) => set('active', v ? '1' : null)} className="min-h-9" />}
        <Button size="sm" variant="ghost" icon={<Download />} className="ml-auto" title="把畫面上的紀錄下載成 CSV，可用 Excel 開" onClick={exportCsv}>CSV</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
        {lists.map((l) => <RecordCard key={l.id} list={l} roster={h.roster} />)}
      </div>
      {view === 'team' && (
        <TeamSeasonsTable title="逐季戰績" subtitle={`所有比賽；勝率 = 勝 ÷（勝＋敗）${note ? `；${note}` : ''}。點一列把上方篩選設成那一季，看總覽`} rows={seasons} total={total}
          onPick={(r) => { if (r.from) goWithFilters('/', { from: r.from, to: r.to }) }}
          csvMeta={[`${TEAM_NAME} 逐季戰績（所有比賽）`, `來源：${window.location.href}`]} />
      )}
    </>
  )
}
