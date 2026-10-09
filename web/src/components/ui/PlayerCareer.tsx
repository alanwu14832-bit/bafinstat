import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Download } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { EmptyState } from './EmptyState'
import { StatHint } from './StatHint'
import { cx } from '../../lib/format'
import { DataTable, type Column } from './DataTable'
import { useTableView, withFraction } from './jerseyColumn'
import { downloadCsv } from '../../lib/csv'
import { f2, f3, pct } from '../../lib/fmt'
import { hitStreaks, onBaseStreaks, personalBests, scorelessStreaks, type GameRef, type HistoryIndex, type Streak } from '../../data/history'
import { reachedMilestones, upcomingMilestones } from '../../data/milestones'
import { dateRange } from '../../data/records'
import { seasonHeader, seasonNote, seasonRange } from '../../data/seasons'
import { ipDisplay, type BattingLine, type PitchingLine } from '../../data/stats'
import { TEAM_NAME } from '../../data/seed'

type BatRow = BattingLine & { season: number; label: string }
type PitRow = PitchingLine & { season: number; label: string }

const fullDate = (iso: string) => iso.replace(/-/g, '/')
const gameNote = (g: GameRef, times: number) => `${fullDate(g.date)} 對 ${g.opponent}${times > 1 ? `・共 ${times} 次` : ''}`
// (a streak over New Year carries both years: 「2025/12/22–2026/02/15」)
const streakNote = (s: Streak) => `${dateRange(s.from, s.toId !== s.fromId ? s.to : s.from)}${s.active ? '・進行中' : ''}`
const gameLink = (id: string) => `/games?game=${encodeURIComponent(id)}`

/**
 * One 個人最佳 tile, styled like a StatTile but with the label and the note wrapping (a phone's half-width tile has
 * no room for 「單場最多打點」 plus a date and an opponent on one line). The whole tile opens that game.
 */
function BestTile({ label, display, note, to }: { label: string; display: string; note: string; to?: string }) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-1 text-xs text-muted font-medium leading-4">{to ? label : <StatHint label={label}>{label}</StatHint>}{to && <ChevronRight aria-hidden className="size-3.5 shrink-0 opacity-60" />}</span>
      <span className="figure font-semibold leading-none text-ink text-[24px]">{display}</span>
      <span className="text-xs text-muted tnum leading-4 break-words">{note}</span>
    </>
  )
  const cls = 'bg-surface rounded-[var(--radius-sm)] shadow-[var(--shadow-card)] p-4 flex flex-col gap-2 min-w-0'
  return to ? <Link to={to} className={cx(cls, 'lift')} aria-label={`${label} ${display}，${note}，看那一場`}>{body}</Link> : <div className={cls}>{body}</div>
}

/** The subtitle of every 生涯 card: these numbers ignore the filter bar. */
export const careerSubtitle = () => { const note = seasonNote(); return `所有比賽，不受上方篩選影響${note ? `；${note}` : ''}` }

/**
 * 球員 page, 生涯 tab: 個人最佳, 里程碑, and the season-by-season tables with a 生涯合計 line, over every game.
 * Tapping a season sets the filter bar to it (onPickSeason).
 */
export function PlayerCareer({ h, name, onPickSeason }: { h: HistoryIndex; name: string; onPickSeason?: (range: { from: string; to: string }) => void }) {
  const view = useTableView()
  const head = seasonHeader(h.start)
  const batRows: BatRow[] = useMemo(() => (h.batSeasons.get(name) ?? []).map((s) => ({ ...s.line, season: s.season, label: s.label })).reverse(), [h, name])
  const pitRows: PitRow[] = useMemo(() => (h.pitSeasons.get(name) ?? []).map((s) => ({ ...s.line, season: s.season, label: s.label })).reverse(), [h, name])
  const bat = h.batCareer.get(name)
  const pit = h.pitCareer.get(name)
  const bests = useMemo(() => personalBests(h, name), [h, name])
  const hitS = useMemo(() => hitStreaks(h, name).best, [h, name])
  const obS = useMemo(() => onBaseStreaks(h, name).best, [h, name])
  const zeroS = useMemo(() => scorelessStreaks(h, name).best, [h, name])
  const upcoming = useMemo(() => upcomingMilestones(h, name), [h, name])
  const reached = useMemo(() => reachedMilestones(h, name).reverse(), [h, name])

  if (!bat && !pit) return <Card><EmptyState compact title="還沒有比賽紀錄" description="這位球員還沒有出賽紀錄；紀錄簿和生涯數據會從第一場開始累計。" /></Card>

  const best = (key: string) => bests.find((b) => b.key === key)
  const tile = (key: string, label: string, display?: (v: number) => string): ReactNode => {
    const b = best(key)
    if (!b) return null
    return <BestTile key={key} label={label} display={display ? display(b.value) : String(b.value)} note={gameNote(b.game, b.times)} to={gameLink(b.game.id)} />
  }
  const streakTile = (key: string, label: string, s: Streak | null, unit: (n: number) => string): ReactNode =>
    s ? <BestTile key={key} label={label} display={unit(s.n)} note={streakNote(s)} /> : null
  const batTiles = bat ? [
    tile('h', '單場最多安打'), tile('tb', '單場最多壘打'), tile('rbi', '單場最多打點'), tile('hr', '單場最多全壘打'), tile('sb', '單場最多盜壘'),
    streakTile('hitStreak', '最長連續安打', hitS, (n) => `${n} 場`), streakTile('obStreak', '最長連續上壘', obS, (n) => `${n} 場`),
  ].filter(Boolean) : []
  const pitTiles = pit ? [
    tile('k', '單場最多三振'), tile('outs', '單場最長局數', ipDisplay), streakTile('scoreless', '最長連續無失分', zeroS, (n) => `${ipDisplay(n)} 局`),
  ].filter(Boolean) : []

  const pick = (r: { season: number }) => { if (r.season && onPickSeason) onPickSeason(seasonRange(r.season, h.start)) }
  const seasonCol = <T extends { season: number; label: string }>(): Column<T> => ({ key: 'season' as keyof T & string, header: head, className: 'font-medium', format: (_, r) => r.label, text: (_, r) => r.label })
  const n = <T,>(key: keyof T & string, header: string): Column<T> => ({ key, header, align: 'right' })
  const r3 = <T,>(key: keyof T & string, header: string): Column<T> => ({ key, header, align: 'right', format: (v) => f3(v as number | null), text: (v) => f3(v as number | null) })
  const batCols: Column<BatRow>[] = [
    seasonCol<BatRow>(), n('g', 'G'), n('pa', 'PA'), n('ab', 'AB'), n('r', 'R'), n('h', 'H'), n('h2', '2B'), n('h3', '3B'), n('hr', 'HR'), n('rbi', 'RBI'), n('bb', 'BB'), n('so', 'SO'), n('sb', 'SB'),
    { key: 'avg', header: 'AVG', align: 'right', format: (v, r) => withFraction(f3(v as number | null), r.h, r.ab), text: (v) => f3(v as number | null) },
    r3('obp', 'OBP'), r3('slg', 'SLG'), r3('ops', 'OPS'), { key: 'opsPlus', header: 'OPS+', align: 'right', format: (v) => (v === null ? '—' : String(v)) },
  ]
  const pitCols: Column<PitRow>[] = [
    seasonCol<PitRow>(), n('g', 'G'), n('gs', 'GS'), n('w', 'W'), n('l', 'L'), n('sv', 'SV'), n('hld', 'HLD'),
    { key: 'outs', header: 'IP', align: 'right', format: (_, r) => r.ipDisplay, text: (_, r) => r.ipDisplay },
    n('h', 'H'), n('r', 'R'), n('er', 'ER'), n('bb', 'BB'), n('k', 'K'),
    { key: 'era', header: 'ERA', align: 'right', format: (v) => f2(v as number | null), text: (v) => f2(v as number | null) },
    { key: 'whip', header: 'WHIP', align: 'right', format: (v) => f2(v as number | null), text: (v) => f2(v as number | null) },
    { key: 'kPct', header: 'K%', align: 'right', format: (v) => pct(v as number | null), text: (v) => pct(v as number | null) },
  ]
  const compactBat = ['season', 'pa', 'avg', 'ops', 'hr']
  const compactPit = ['season', 'outs', 'era', 'whip', 'k']
  const footerOf = <L extends object,>(l: L | undefined, cols: Column<L & { season: number; label: string }>[]) => {
    if (!l) return undefined
    const f: Record<string, ReactNode> = { season: '生涯合計' }
    for (const c of cols) if (c.key !== 'season') { const v = (l as Record<string, unknown>)[c.key]; f[c.key] = c.text ? c.text(v as never, l as never) : (v === null || v === undefined ? '—' : String(v)) }
    return f
  }
  const csvMeta = (what: string) => [`${TEAM_NAME} ${name} ${what}`, careerSubtitle(), `來源：${window.location.href}`]
  const csv = <T,>(file: string, cols: Column<T>[], rows: T[], what: string) => <Button size="sm" variant="ghost" icon={<Download />} title="下載成 CSV，可用 Excel 開" onClick={() => downloadCsv(file, cols, rows, csvMeta(what))}>CSV</Button>

  return (
    <>
      {(batTiles.length > 0 || pitTiles.length > 0) && (
        <Card title="個人最佳" subtitle={careerSubtitle()}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[...batTiles, ...pitTiles]}</div>
        </Card>
      )}
      {(upcoming.length > 0 || reached.length > 0) && (
        <Card title="里程碑" subtitle={`${careerSubtitle()}；快達成的只列現役球員`}>
          {upcoming.length > 0 && (
            <ul className="flex flex-col gap-2 mb-3" aria-label="快達成的里程碑">
              {upcoming.map((u) => (
                <li key={u.key} className="flex flex-col gap-1">
                  <span className="text-[13px] text-ink">{u.progress}</span>
                  <span className="h-1.5 rounded-full bg-surface-2 overflow-hidden" aria-hidden><span className="block h-full bg-accent rounded-full" style={{ width: `${Math.min(100, Math.round((u.value / u.target) * 100))}%` }} /></span>
                </li>
              ))}
            </ul>
          )}
          {reached.length > 0 && (
            <>
              <h4 className="text-[12px] text-muted font-medium mb-1">已達成</h4>
              <ul className="flex flex-col" aria-label="已達成的里程碑">
                {reached.map((r) => (
                  <li key={`${r.key}-${r.target}`} className="border-t border-border first:border-t-0 text-[13px]">
                    {/* the whole row opens that game (one ≥ 44 px target, not a small date link) */}
                    <Link to={gameLink(r.game.id)} className="group flex items-center justify-between gap-3 min-h-11 py-1">
                      <span className="text-ink">{r.short}</span>
                      <span className="text-muted tnum text-[12px] text-right group-hover:text-ink group-hover:underline underline-offset-2">{fullDate(r.game.date)} 對 {r.game.opponent}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
      {batRows.length > 0 && (
        <Card title="打擊逐季" subtitle={`${careerSubtitle()}；點一列把上方篩選設成那${head === '年' ? '一年' : head === '學年' ? '一學年' : '一季'}，回到打擊頁`} flush
          action={<span className="flex items-center gap-2">{view.toggle}{csv(`${name}_打擊逐季.csv`, batCols, batRows, '打擊逐季')}</span>}>
          <DataTable columns={view.compact ? batCols.filter((c) => compactBat.includes(c.key)) : batCols} rows={batRows} rowKey={(r) => String(r.season)} onRowClick={pick} footer={footerOf(bat, batCols)} dense />
        </Card>
      )}
      {pitRows.length > 0 && (
        <Card title="投球逐季" subtitle={careerSubtitle()} flush
          action={<span className="flex items-center gap-2">{view.toggle}{csv(`${name}_投球逐季.csv`, pitCols, pitRows, '投球逐季')}</span>}>
          <DataTable columns={view.compact ? pitCols.filter((c) => compactPit.includes(c.key)) : pitCols} rows={pitRows} rowKey={(r) => String(r.season)} onRowClick={pick} footer={footerOf(pit, pitCols)} dense />
        </Card>
      )}
    </>
  )
}
