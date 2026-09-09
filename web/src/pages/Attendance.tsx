import { useMemo } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { DataTable, type Column } from '../components/ui/DataTable'
import { StatGroup, StatTile } from '../components/ui/StatTile'
import { DemoBanner } from '../components/ui/DemoBanner'
import { useStats } from '../hooks/useStats'
import { shortDate } from '../lib/fmt'
import { cx } from '../lib/format'

interface Row { name: string; number: string; games: number; starts: number; subs: number; pitched: number; pa: number; missed: number; rate: number; last: string }
type Mark = '先' | '替' | '投' | '先/投' | '替/投' | ''

/** Who played how much, per game, plus who kept score. */
export function AttendancePage() {
  const s = useStats()
  const games = useMemo(() => s.summaries.map((g) => g.game), [s.summaries])
  const roster = s.dataset.roster

  const matrix = useMemo(() => {
    const m = new Map<string, Map<string, Mark>>()
    const set = (name: string, gid: string, mark: '先' | '替' | '投') => {
      if (!name) return
      if (!m.has(name)) m.set(name, new Map())
      const row = m.get(name)!
      const cur = row.get(gid) ?? ''
      if (mark === '投') row.set(gid, cur === '先' ? '先/投' : cur === '替' ? '替/投' : cur.includes('投') ? cur : '投')
      else if (!cur || cur === '投') row.set(gid, cur === '投' ? (`${mark}/投` as Mark) : mark)
    }
    // starter = first row of a batting-order slot in that game (not PH / PR)
    const seen = new Set<string>()
    for (const p of s.batting) {
      const key = `${p.gameId}#${p.order ?? p.batter}`
      const first = !seen.has(key); seen.add(key)
      set(p.batter, p.gameId, first && p.pos !== 'PH' && p.pos !== 'PR' ? '先' : '替')
    }
    for (const p of s.pitching) set(p.pitcher, p.gameId, '投')
    return m
  }, [s.batting, s.pitching])

  const rows: Row[] = useMemo(() => roster.map((p) => {
    const marks = matrix.get(p.name) ?? new Map<string, Mark>()
    const played = games.filter((g) => marks.has(g.id))
    const starts = played.filter((g) => marks.get(g.id)!.startsWith('先')).length
    const pitched = played.filter((g) => marks.get(g.id)!.includes('投')).length
    const pa = s.batting.filter((b) => b.batter === p.name).length
    const last = played.reduce((m, g) => (g.date > m ? g.date : m), '')
    return { name: p.name, number: p.number ?? '', games: played.length, starts, subs: played.length - starts, pitched, pa, missed: games.length - played.length, rate: games.length ? played.length / games.length : 0, last }
  }).sort((a, b) => b.games - a.games || b.starts - a.starts), [roster, matrix, games, s.batting])

  const recorders = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of games) m.set(g.recorder?.trim() || '（未填）', (m.get(g.recorder?.trim() || '（未填）') ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [games])
  const avgPlayers = games.length ? rows.reduce((a, r) => a + r.games, 0) / games.length : 0

  const columns: Column<Row>[] = [
    { key: 'name', header: '球員', className: 'font-medium' }, { key: 'number', header: '背號', align: 'center', className: 'text-ink-2' },
    { key: 'games', header: '出賽', align: 'right' }, { key: 'starts', header: '先發', align: 'right' }, { key: 'subs', header: '替補', align: 'right' }, { key: 'pitched', header: '投球場', align: 'right' },
    { key: 'pa', header: '打席', align: 'right' }, { key: 'missed', header: '缺席', align: 'right', format: (v) => <span className={cx(Number(v) > 0 && 'text-ink-2')}>{String(v)}</span> },
    { key: 'rate', header: '出賽率', align: 'right', format: (v) => `${Math.round(Number(v) * 100)}%` },
    { key: 'last', header: '最近出賽', align: 'right', format: (v) => (v ? shortDate(String(v)) : '—') },
  ]

  return (
    <>
      <PageHeader title="出賽" description="每位球員在目前篩選範圍內的出賽場次與先發／替補／投球，以及各場的紀錄員。先發＝該場打序的第一個打席（代打、代跑算替補）。" />
      <DemoBanner />
      <StatGroup>
        <StatTile label="比賽場次" value={games.length} />
        <StatTile label="平均每場出賽人數" value={avgPlayers} format="ratio" display={avgPlayers.toFixed(1)} />
        <StatTile label="全勤" value={rows.filter((r) => r.games === games.length && games.length > 0).length} note="每場都有出賽的人數" />
        <StatTile label="紀錄員" value={recorders.filter(([n]) => n !== '（未填）').length} note={recorders.slice(0, 3).map(([n, c]) => `${n} ${c}`).join('・') || '—'} />
      </StatGroup>
      <Card title="出賽統計" subtitle="點欄位標題排序" flush>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.name} dense maxHeight={520} defaultSort={{ key: 'games', dir: 'desc' }} />
      </Card>
      <Card title="逐場出賽" subtitle="先 = 先發・替 = 替補・投 = 投球；最後一列為紀錄員" flush>
        <div className="overflow-x-auto scroll-x">
          <table className="text-[12px] tnum border-collapse min-w-full">
            <thead className="sticky top-0 bg-surface z-[2]">
              <tr className="border-b border-border">
                <th className="sticky left-0 bg-surface z-[3] text-left pl-4 pr-3 h-9 font-medium text-muted">球員</th>
                {games.map((g) => <th key={g.id} className="px-1.5 h-9 font-medium text-muted whitespace-nowrap text-center min-w-[56px]"><div>{shortDate(g.date)}</div><div className="text-[10px] font-normal text-ink-2 truncate max-w-[72px]">{g.opponent}</div></th>)}
                <th className="px-3 h-9 font-medium text-muted text-right pr-4">合計</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-border hover:bg-surface-2/60">
                  <th scope="row" className="sticky left-0 bg-surface z-[1] text-left pl-4 pr-3 py-1.5 font-medium whitespace-nowrap">{r.name}</th>
                  {games.map((g) => { const m = matrix.get(r.name)?.get(g.id) ?? ''; return <td key={g.id} className={cx('px-1.5 py-1.5 text-center', m ? (m.startsWith('先') ? 'text-ink font-medium' : 'text-ink-2') : 'text-muted/50')}>{m || '·'}</td> })}
                  <td className="px-3 py-1.5 text-right pr-4 font-medium">{r.games}</td>
                </tr>
              ))}
              <tr className="bg-surface-2/60">
                <th scope="row" className="sticky left-0 bg-surface-2 z-[1] text-left pl-4 pr-3 py-1.5 font-medium whitespace-nowrap">紀錄員</th>
                {games.map((g) => <td key={g.id} className="px-1.5 py-1.5 text-center text-ink-2 whitespace-nowrap">{g.recorder || '—'}</td>)}
                <td className="pr-4" />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
