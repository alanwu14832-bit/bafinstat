import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { useOpenGame } from '../hooks/useOpenGame'
import { median, previousSeason, sameGroup } from '../data/radar'
import { filterGames } from '../data/filters'
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Pencil, Search, X } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { StoryRow } from '../components/ui/SeasonHero'
import { Stitches } from '../components/ui/Scoreboard'
import { playerStories } from '../data/stories'
import { PlateBadge } from '../components/ui/Scoreboard'
import { StatHint } from '../components/ui/StatHint'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { RosterEditor } from '../components/ui/RosterEditor'
import { RegistrationEditor } from '../components/ui/RegistrationEditor'
import { Tabs } from '../components/ui/Tabs'
import { seasonOf } from '../data/registrations'
import { useDataStore } from '../store/data'
import { StatGroup, StatTile } from '../components/ui/StatTile'
import { DataTable, type Column } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { DemoBanner } from '../components/ui/DemoBanner'
import { RadarCard } from '../components/charts/RadarCard'
import { SprayChart } from '../components/charts/SprayChart'
import { LineChartCard } from '../components/charts/LineChartCard'
import { useStats } from '../hooks/useStats'
import { usePrefersReducedMotion } from '../hooks/useMediaQuery'
import type { BattingPA } from '../data/types'
import { battingLines, pitchingLines, sprayCounts, type BattingLine, type PitchingLine } from '../data/stats'
import { f2, f3, pct, pct0, percentile, posLabel, shortDate, signedPct } from '../lib/fmt'
import { cx } from '../lib/format'

/** His plate appearances, plus the ones he ran for (代跑: the run and steals are his). */
const ranOrBatted = (p: BattingPA, name: string) => p.batter === name || p.runner === name

interface GameLogRow { id: string; date: string; opponent: string; pa: number; ab: number; h: number; hr: number; rbi: number; bb: number; so: number; sb: number; avg: string; isDemo: boolean }
/** One game on the mound: that game's line, with the season ERA after it. */
interface PitchLogRow { id: string; date: string; opponent: string; dec: string; outs: number; ip: string; bf: number; h: number; r: number; er: number; bb: number; k: number; pc: number; era: string; isDemo: boolean }
type PlayerTab = 'batting' | 'pitching'

const hand = (b?: string) => (b ? (b === 'L' ? '左打' : b === 'S' ? '左右開弓' : '右打') : '')

type Metric<T> = { label: string; get: (l: T) => number | null | undefined; fmt: (v: number) => string; lowerBetter?: boolean; min?: (l: T) => boolean }
const BAT_METRICS: Metric<BattingLine>[] = [
  { label: 'G', get: (l) => l.g, fmt: String }, { label: 'PA', get: (l) => l.pa, fmt: String }, { label: 'H', get: (l) => l.h, fmt: String }, { label: 'HR', get: (l) => l.hr, fmt: String }, { label: 'RBI', get: (l) => l.rbi, fmt: String }, { label: 'SB', get: (l) => l.sb, fmt: String },
  { label: 'AVG', get: (l) => l.avg, fmt: f3 }, { label: 'OBP', get: (l) => l.obp, fmt: f3 }, { label: 'SLG', get: (l) => l.slg, fmt: f3 }, { label: 'OPS', get: (l) => l.ops, fmt: f3 }, { label: 'OPS+', get: (l) => l.opsPlus, fmt: String }, { label: 'wRC+', get: (l) => l.wrcPlus, fmt: String }, { label: 'wOBA', get: (l) => l.woba, fmt: f3 },
  { label: 'K%', get: (l) => l.kPct, fmt: pct, lowerBetter: true }, { label: 'BB%', get: (l) => l.bbPct, fmt: pct }, { label: 'Whiff%', get: (l) => l.whiffPct, fmt: pct, lowerBetter: true }, { label: 'sSeager', get: (l) => l.sSeager, fmt: signedPct }, { label: 'IFFB%', get: (l) => l.iffbPct, fmt: pct, lowerBetter: true }, { label: '壘死', get: (l) => l.baserunningOuts, fmt: String, lowerBetter: true }, { label: 'Hard%', get: (l) => l.hardPct, fmt: pct }, { label: 'RISP AVG', get: (l) => l.rispAvg, fmt: f3 }, { label: 'QAB%', get: (l) => l.qabPct, fmt: pct },
]
const PIT_METRICS: Metric<PitchingLine>[] = [
  { label: 'IP', get: (l) => l.ip, fmt: (v) => v.toFixed(1) }, { label: 'ERA', get: (l) => l.era, fmt: f2, lowerBetter: true }, { label: 'FIP', get: (l) => l.fip, fmt: f2, lowerBetter: true }, { label: 'WHIP', get: (l) => l.whip, fmt: f2, lowerBetter: true },
  { label: 'K/7', get: (l) => l.k7, fmt: f2 }, { label: 'K/9', get: (l) => l.k9, fmt: f2 }, { label: 'BB/9', get: (l) => l.bb9, fmt: f2, lowerBetter: true }, { label: 'K%', get: (l) => l.kPct, fmt: pct }, { label: 'CSW%', get: (l) => l.cswPct, fmt: pct }, { label: 'IFFB%', get: (l) => l.iffbPct, fmt: pct }, { label: '被打擊率', get: (l) => l.oppAvg, fmt: f3, lowerBetter: true },
]

/** One side of a comparison row: the better number stands out (accent pill, bold, ▲ towards the label), the other fades. */
function CompareValue({ text, state, side }: { text: string; state: 'win' | 'lose' | 'tie'; side: 'a' | 'b' }) {
  if (state === 'win') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 tnum font-semibold text-ink bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]">
        {side === 'b' && <span aria-hidden className="text-[10px] text-accent">◀</span>}{text}{side === 'a' && <span aria-hidden className="text-[10px] text-accent">▶</span>}
        <span className="sr-only">（較佳）</span>
      </span>
    )
  }
  return <span className={cx('inline-block px-2.5 py-0.5 tnum', state === 'lose' ? 'text-muted' : 'text-ink-2')}>{text}</span>
}

function CompareRows<T>({ a, b, metrics }: { a?: T; b?: T; metrics: Metric<T>[] }) {
  return (
    <>
      {metrics.map((m) => {
        const va = a ? m.get(a) : null, vb = b ? m.get(b) : null
        const na = va ?? null, nb = vb ?? null
        const better = na !== null && nb !== null && na !== nb ? (m.lowerBetter ? (na < nb ? 'a' : 'b') : (na > nb ? 'a' : 'b')) : null
        return (
          <tr key={m.label} className="border-t border-border">
            <td className="px-3 py-1 text-right"><CompareValue text={na === null ? '—' : m.fmt(na)} state={better === null ? 'tie' : better === 'a' ? 'win' : 'lose'} side="a" /></td>
            <td className="px-2 py-1.5 text-center text-[12px] text-muted whitespace-nowrap"><StatHint label={m.label}>{m.label}</StatHint></td>
            <td className="px-3 py-1 text-left"><CompareValue text={nb === null ? '—' : m.fmt(nb)} state={better === null ? 'tie' : better === 'b' ? 'win' : 'lose'} side="b" /></td>
          </tr>
        )
      })}
    </>
  )
}

function CompareTable({ a, b, pa, pb, names, only }: { a?: BattingLine; b?: BattingLine; pa?: PitchingLine; pb?: PitchingLine; names: [string, string]; only: PlayerTab }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] border-collapse">
        <thead><tr className="text-[12px] text-muted"><th className="px-4 h-9 text-right font-medium">{names[0]}</th><th className="px-3 h-9 font-medium" /><th className="px-4 h-9 text-left font-medium">{names[1]}</th></tr></thead>
        <tbody>
          {only === 'batting' ? <CompareRows a={a} b={b} metrics={BAT_METRICS} /> : <CompareRows a={pa} b={pb} metrics={PIT_METRICS} />}
        </tbody>
      </table>
    </div>
  )
}

export function PlayersPage() {
  const s = useStats()
  const reduced = usePrefersReducedMotion()
  const [params, setParams] = useSearchParams()
  const openGame = useOpenGame()
  const roster = useMemo(() => [...s.dataset.roster].sort((a, b) => Number(!!b.status && b.status !== '現役' ? 0 : 1) - Number(!!a.status && a.status !== '現役' ? 0 : 1)), [s.dataset.roster])
  const names = useMemo(() => roster.map((p) => p.name), [roster])
  const requested = params.get('player')
  const [selected, setSelected] = useState<string>(requested && names.includes(requested) ? requested : names[0] ?? '')
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [compare, setCompare] = useState<string>('')
  const [editingRoster, setEditingRoster] = useState(false)
  const [showRegs, setShowRegs] = useState(false)
  const [rosterView, setRosterView] = useState<'all' | 'reg'>('all')
  const base = useDataStore((st) => st.base)
  const filters = useDataStore((st) => st.filters)
  const statParams = useDataStore((st) => st.params)
  const cloud = useDataStore((st) => st.cloud)
  const saveRoster = useDataStore((st) => st.saveRoster)
  const registrations = useDataStore((st) => st.registrations)
  const registrationsSupported = useDataStore((st) => st.registrationsSupported)
  const saveRegistration = useDataStore((st) => st.saveRegistration)
  const deleteRegistration = useDataStore((st) => st.deleteRegistration)
  const canEdit = !cloud.configured || (!!cloud.user && cloud.isEditor)
  useEffect(() => { if (requested && names.includes(requested)) setSelected(requested) }, [requested, names])

  const byName = useMemo(() => new Map(s.batters.map((b) => [b.name, b])), [s.batters])
  const pitchByName = useMemo(() => new Map(s.pitchers.map((p) => [p.name, p])), [s.pitchers])
  const fieldByName = useMemo(() => new Map(s.fielders.map((f) => [f.name, f])), [s.fielders])
  const player = roster.find((p) => p.name === selected)
  const bat = byName.get(selected)
  const pit = pitchByName.get(selected)
  const fld = fieldByName.get(selected)
  const index = names.indexOf(selected)
  const cmpBat = compare ? byName.get(compare) : undefined
  const cmpPit = compare ? pitchByName.get(compare) : undefined
  const cmpPlayer = compare ? roster.find((p) => p.name === compare) : undefined

  const gameLog: GameLogRow[] = useMemo(() => s.summaries.map((g) => {
    const pas = s.batting.filter((p) => p.gameId === g.game.id && ranOrBatted(p, selected))
    const l = battingLines(s.dataset, pas).find((x) => x.name === selected)
    if (!l) return null
    return { id: g.game.id, date: g.game.date, opponent: g.game.opponent, pa: l.pa, ab: l.ab, h: l.h, hr: l.hr, rbi: l.rbi, bb: l.bb, so: l.so, sb: l.sb, avg: f3(l.avg), isDemo: !!g.game.isDemo }
  }).filter((r): r is GameLogRow => r !== null).reverse(), [s.summaries, s.batting, s.dataset, selected])

  // Radar: this player's team percentile on six axes. The second shape is someone or something to compare
  // with — never a flat 50; the median is the dashed ring. Every shape sits on the same ruler: PR against the
  // qualified teammates in the current filter, so moving outward always means better than more of the team.
  const AXES: Array<{ key: keyof BattingLine; label: string; invert?: boolean; fmt: (v: number | null) => string }> = [
    { key: 'avg', label: '打擊率', fmt: f3 }, { key: 'obp', label: '上壘率', fmt: f3 }, { key: 'slg', label: '長打率', fmt: f3 },
    { key: 'kPct', label: '避免三振', invert: true, fmt: (v) => `K% ${pct0(v)}` }, { key: 'bbPct', label: '選球', fmt: (v) => `BB% ${pct0(v)}` }, { key: 'hardPct', label: '強擊', fmt: (v) => `Hard% ${pct0(v)}` },
  ]
  const RECENT = 5
  const pool = useMemo(() => s.batters.filter((b) => b.pa >= 3), [s.batters])
  const recentBat = useMemo(() => {
    if (gameLog.length <= RECENT) return undefined
    const ids = gameLog.slice(0, RECENT).map((g) => g.id)
    const l = battingLines(s.dataset, s.batting.filter((p) => ids.includes(p.gameId) && ranOrBatted(p, selected)), statParams).find((x) => x.name === selected)
    return l && l.pa >= 3 ? l : undefined
  }, [gameLog, s.dataset, s.batting, selected, statParams])
  const group = useMemo(() => sameGroup(s.dataset.roster, selected), [s.dataset.roster, selected])
  const groupPool = useMemo(() => (group ? pool.filter((b) => group.names.has(b.name)) : []), [group, pool])
  const prev = useMemo(() => previousSeason(s.games[s.games.length - 1]?.date), [s.games])
  // When the filter already covers that year (e.g. 全部), "last season" would overlap what is on screen.
  const spansPrev = !!prev && s.games.some((g) => g.date.startsWith(String(prev.year)))
  const lastBat = useMemo(() => {
    if (!prev || spansPrev) return undefined
    // same filters as the page, with the date range moved to the season before
    const ids = new Set(filterGames(s.dataset, { ...filters, from: prev.from, to: prev.to }).games.map((g) => g.id))
    const pas = s.dataset.batting.filter((p) => ids.has(p.gameId) && ranOrBatted(p, selected) && (filters.position === 'all' || (p.pos ?? '') === filters.position))
    const l = battingLines(s.dataset, pas, statParams).find((x) => x.name === selected)
    return l && l.pa >= 3 ? l : undefined
  }, [prev, spansPrev, s.dataset, filters, selected, statParams])

  type Basis = 'recent' | 'pos' | 'last' | 'team'
  const bases: Array<{ value: Basis; label: string; short: string; line?: Partial<Record<keyof BattingLine, unknown>>; why: string; note: (v: string) => string }> = [
    { value: 'recent', label: `近 ${RECENT} 場`, short: `近 ${RECENT} 場`, line: recentBat, why: `出賽不到 ${RECENT + 1} 場`, note: (v) => v },
    {
      value: 'pos', label: group ? `同守位（${group.group}中位）` : '同守位中位', short: group ? `${group.group}中位` : '同守位',
      line: group && groupPool.length >= 3 ? Object.fromEntries(AXES.map((a) => [a.key, median(groupPool.map((b) => b[a.key] as number | null))])) : undefined,
      why: group ? `${group.group}不到 3 人達 3 打席` : '名單沒填主守位', note: (v) => `${v}（${groupPool.length} 人中位）`,
    },
    { value: 'last', label: prev ? `上一季（${prev.year} 年）` : '上一季', short: prev ? `${prev.year} 年` : '上一季', line: lastBat, why: spansPrev ? '篩選跨年，先在上方選單一年份' : '沒有上一季的資料', note: (v) => `${v}（${prev?.year} 年）` },
    { value: 'team', label: '全隊平均', short: '全隊平均', line: s.team, why: '', note: (v) => `全隊 ${v}` },
  ]
  const [basisPick, setBasisPick] = useState<Basis | ''>('')
  const basis = bases.find((b) => b.value === basisPick && b.line) ?? bases.find((b) => b.line)
  const radar = (() => {
    const vals = (a: (typeof AXES)[number]) => pool.map((x) => x[a.key] as number | null)
    const pr = (v: number | null | undefined, a: (typeof AXES)[number]) => (v === undefined ? 0 : percentile(v, vals(a), a.invert))
    // rank among qualified teammates, 1 = best
    const rank = (v: number | null, a: (typeof AXES)[number]) => {
      const xs = vals(a).filter((x): x is number => x !== null)
      return v === null ? '' : `隊內第 ${xs.filter((x) => (a.invert ? x < v : x > v)).length + 1}／${xs.length}`
    }
    const second = cmpBat ?? basis?.line
    return AXES.map((a) => {
      const mine = bat ? (bat[a.key] as number | null) : null
      const theirs = second ? ((second[a.key] as number | null | undefined) ?? null) : null
      return {
        axis: a.label, player: bat ? pr(mine, a) : 0, other: second ? pr(theirs, a) : 0,
        playerDetail: `${a.fmt(mine)}（${rank(mine, a)}）`,
        otherDetail: cmpBat ? `${a.fmt(theirs)}（${rank(theirs, a)}）` : basis ? basis.note(a.fmt(theirs)) : '',
      }
    })
  })()

  const trend = useMemo(() => {
    const rows = [...gameLog].reverse()
    return rows.map((_, i) => {
      const ids = rows.slice(0, i + 1).map((r) => r.id)
      const l = battingLines(s.dataset, s.batting.filter((p) => ids.includes(p.gameId) && ranOrBatted(p, selected))).find((x) => x.name === selected)
      return { id: rows[i].id, name: shortDate(rows[i].date), AVG: Number((l?.avg ?? 0).toFixed(3)), OPS: Number((l?.ops ?? 0).toFixed(3)) }
    })
  }, [gameLog, s.batting, s.dataset, selected])
  const spray = useMemo(() => sprayCounts(s.batting.filter((p) => p.batter === selected)), [s.batting, selected])

  // 投球: his games on the mound, newest first, each with the ERA he had after it
  const pitchLog: PitchLogRow[] = useMemo(() => {
    const mine = s.pitching.filter((p) => p.pitcher === selected)
    const out: PitchLogRow[] = []
    const upTo: string[] = []
    for (const g of s.summaries) {
      const pas = mine.filter((p) => p.gameId === g.game.id)
      if (!pas.length) continue
      upTo.push(g.game.id)
      // decisions (勝・敗・救援・中繼) come from the games passed in: just this one
      const l = pitchingLines(pas, [g.game], statParams).find((x) => x.name === selected)
      const season = pitchingLines(mine.filter((p) => upTo.includes(p.gameId)), [], statParams).find((x) => x.name === selected)
      if (!l) continue
      const dec = l.w ? '勝' : l.l ? '敗' : l.sv ? '救援' : l.hld ? '中繼' : ''
      out.push({ id: g.game.id, date: g.game.date, opponent: g.game.opponent, dec, outs: l.outs, ip: l.ipDisplay, bf: l.bf, h: l.h, r: l.r, er: l.er, bb: l.bb, k: l.k, pc: l.pc, era: f2(season?.era ?? null), isDemo: !!g.game.isDemo })
    }
    return out.reverse()
  }, [s.pitching, s.summaries, selected, statParams])
  const pitchTrend = useMemo(() => {
    const mine = s.pitching.filter((p) => p.pitcher === selected)
    const rows = [...pitchLog].reverse()
    return rows.map((_, i) => {
      const ids = rows.slice(0, i + 1).map((r) => r.id)
      const l = pitchingLines(mine.filter((p) => ids.includes(p.gameId)), [], statParams).find((x) => x.name === selected)
      return { id: rows[i].id, name: shortDate(rows[i].date), ERA: Number((l?.era ?? 0).toFixed(2)), WHIP: Number((l?.whip ?? 0).toFixed(2)) }
    })
  }, [pitchLog, s.pitching, selected, statParams])
  // where the batters he faced hit the ball
  const pitchSpray = useMemo(() => sprayCounts(s.pitching.filter((p) => p.pitcher === selected)), [s.pitching, selected])
  // 打擊／投球 tabs: from the link (?tab=pitching from the 投球 page), else what he has numbers for
  const tabParam = params.get('tab')
  const tab: PlayerTab = tabParam === 'pitching' || tabParam === 'batting' ? tabParam : !bat && pit ? 'pitching' : 'batting'
  const setTab = (t: PlayerTab) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('tab', t); if (selected) n.set('player', selected); return n }, { replace: true })
  const stories = useMemo(() => (selected ? playerStories(selected, { dataset: s.dataset, summaries: s.summaries, batting: s.batting, pitching: s.pitching, params: statParams }) : []), [selected, s.dataset, s.summaries, s.batting, s.pitching, statParams])

  const pitchCols: Column<PitchLogRow>[] = [
    { key: 'date', header: '日期', format: (v) => shortDate(String(v)) },
    { key: 'opponent', header: '對手', className: 'font-medium', format: (v, r) => <span className="inline-flex items-center gap-1.5">{String(v)}{r.isDemo && <Badge variant="outline">示範</Badge>}</span> },
    { key: 'dec', header: '勝敗', format: (v) => (v ? <Badge variant={v === '敗' ? 'outline' : 'accent'}>{String(v)}</Badge> : '') },
    { key: 'outs', header: 'IP', align: 'right', format: (_, r) => r.ip }, { key: 'bf', header: 'BF', align: 'right' }, { key: 'h', header: 'H', align: 'right' }, { key: 'r', header: 'R', align: 'right' }, { key: 'er', header: 'ER', align: 'right' },
    { key: 'bb', header: 'BB', align: 'right' }, { key: 'k', header: 'K', align: 'right' }, { key: 'pc', header: '用球數', align: 'right' }, { key: 'era', header: 'ERA（累計）', align: 'right' },
  ]
  const logCols: Column<GameLogRow>[] = [
    { key: 'date', header: '日期', format: (v) => shortDate(String(v)) },
    { key: 'opponent', header: '對手', className: 'font-medium', format: (v, r) => <span className="inline-flex items-center gap-1.5">{String(v)}{r.isDemo && <Badge variant="outline">示範</Badge>}</span> },
    { key: 'pa', header: 'PA', align: 'right' }, { key: 'ab', header: 'AB', align: 'right' }, { key: 'h', header: 'H', align: 'right' }, { key: 'hr', header: 'HR', align: 'right' }, { key: 'rbi', header: 'RBI', align: 'right' }, { key: 'bb', header: 'BB', align: 'right' }, { key: 'so', header: 'SO', align: 'right' }, { key: 'sb', header: 'SB', align: 'right' }, { key: 'avg', header: '單場 AVG', align: 'right' },
  ]

  // switching players keeps the tab the reader is on
  const choose = (name: string) => { setSelected(name); setParams(tabParam ? { player: name, tab: tabParam } : { player: name }, { replace: true }); setOpen(false); setQ('') }
  const step = (d: number) => { const n = names[(index + d + names.length) % names.length]; if (n) choose(n) }
  // 報名名單 of the tournament picked in the 杯賽 filter, for the years the filtered games are in (every year when no game
  // matches yet). null = no filter or no list, and then the panel shows nothing extra.
  const registered = useMemo(() => {
    const t = filters.tournament === 'all' ? '' : filters.tournament.trim()
    const lists = t ? registrations.filter((r) => r.tournament === t) : []
    const seasons = new Set(s.games.map((g) => seasonOf(g.date)))
    const used = seasons.size ? lists.filter((r) => seasons.has(r.season)) : lists
    const names = new Set(used.flatMap((r) => r.players))
    return names.size ? { names, label: `${[...new Set(used.map((r) => r.season))].sort().join('・')} ${t}` } : null
  }, [filters.tournament, registrations, s.games])
  const onlyRegistered = rosterView === 'reg' && !!registered
  const filtered = useMemo(() => roster.filter((p) => (!q || p.name.includes(q) || (p.number ?? '').includes(q)) && (!onlyRegistered || registered!.names.has(p.name))), [roster, q, onlyRegistered, registered])

  return (
    <>
      <PageHeader title="球員" description={`${roster.length} 位球員。個人數據依上方篩選計算，分打擊、投球兩頁；雷達圖為隊內百分位（PA ≥ 3 的打者）。`} />
      <DemoBanner />

      {/* Player switcher: collapsed by default so the numbers come first; expand to pick someone else. */}
      <Card className="overflow-hidden" bodyClassName="p-0">
        <div className="flex items-center gap-3 px-4 md:px-5 py-3">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="roster-panel"
            className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-[var(--radius-sm)] -ml-1 pl-1 pr-2 py-1 hover:bg-surface-2 cursor-pointer transition-colors motion-reduce:transition-none">
            <PlateBadge size={36}>{player?.number ?? player?.name.slice(0, 1) ?? '–'}</PlateBadge>
            <span className="min-w-0">
              <span className="block text-[16px] font-semibold text-ink leading-5 truncate">{player?.name ?? '請選擇球員'}</span>
              <span className="block text-[12px] text-ink-2 truncate">{player ? `${posLabel(player.primaryPos)}${player.secondaryPos ? ` / ${player.secondaryPos}` : ''}${player.bats ? `・${hand(player.bats)}` : ''}` : ''}</span>
            </span>
            <span className="ml-1 inline-flex items-center gap-1 text-[12px] text-ink-2 shrink-0"><span className="hidden sm:inline">{open ? '收合名單' : '更換球員'}</span><ChevronDown className={cx('size-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')} /></span>
          </button>
          <div className="hidden sm:flex gap-1.5 flex-wrap justify-end">
            {bat && <Badge>打者 {bat.g} 場</Badge>}
            {pit && <Badge>投手 {pit.ipDisplay} 局</Badge>}
            {fld && <Badge>守備 {fld.positions.join(' / ')}</Badge>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" aria-label="上一位" className="size-10 pointer-fine:size-9" icon={<ChevronLeft />} onClick={() => step(-1)} disabled={names.length < 2} />
            <Button variant="ghost" aria-label="下一位" className="size-10 pointer-fine:size-9" icon={<ChevronRight />} onClick={() => step(1)} disabled={names.length < 2} />
          </div>
        </div>
        <div className="px-4 md:px-5 pb-3 -mt-1 flex items-center gap-2 flex-wrap">
          <Select label="比較" value={compare} onChange={(e) => setCompare(e.target.value)} className="w-full sm:w-auto sm:max-w-[240px]"
            options={[{ value: '', label: '無' }, ...roster.filter((p) => p.name !== selected).map((p) => ({ value: p.name, label: p.name }))]} />
          <div className="flex gap-1.5 flex-wrap sm:hidden">
            {bat && <Badge>打者 {bat.g} 場</Badge>}
            {pit && <Badge>投手 {pit.ipDisplay} 局</Badge>}
            {fld && <Badge>守備 {fld.positions.join(' / ')}</Badge>}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div id="roster-panel" key="roster" initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduced ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden border-t border-border">
              <div className="px-4 md:px-5 py-3 flex items-center gap-x-3 gap-y-2 flex-wrap">
                <Input icon={<Search />} size="sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋姓名或背號" aria-label="搜尋球員" className="w-full sm:w-[240px]" autoFocus />
                <span className="text-xs text-muted tnum whitespace-nowrap">{filtered.length} / {roster.length} 人</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Button size="sm" variant="outline" icon={<ClipboardList />} onClick={() => { setShowRegs(true); setOpen(false) }} title="各杯賽每年的報名名單">報名名單</Button>
                  {canEdit && <Button size="sm" variant="outline" icon={<Pencil />} onClick={() => { setEditingRoster(true); setOpen(false) }}>編輯名單</Button>}
                </div>
              </div>
              {registered && (
                <div className="px-4 md:px-5 pb-3 -mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap">
                  <Tabs size="sm" aria-label="名單範圍" value={rosterView} onChange={setRosterView} items={[{ value: 'all', label: '全部球員' }, { value: 'reg', label: '報名名單' }]} />
                  <span className="text-xs text-muted">{registered.label} 報名 {registered.names.size} 人</span>
                </div>
              )}
              <ul className="px-4 md:px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 max-h-[52vh] overflow-y-auto" role="listbox" aria-label="球員名單">
                {filtered.map((p) => {
                  const b = byName.get(p.name); const pl = pitchByName.get(p.name)
                  const active = p.name === selected
                  return (
                    <li key={p.name}>
                      <button type="button" role="option" aria-selected={active} onClick={() => choose(p.name)}
                        className={cx('lift w-full text-left flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] border cursor-pointer bg-surface',
                          active ? 'border-ink bg-surface-2' : 'border-border')}>
                        <PlateBadge size={30} active={active}>{p.number ?? p.name.slice(0, 1)}</PlateBadge>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 min-w-0"><span className="text-[13px] font-medium text-ink truncate">{p.name}</span>{registered?.names.has(p.name) && <Badge variant="accent" className="shrink-0">已報名</Badge>}</span>
                          <span className="block text-[11px] text-muted truncate">{posLabel(p.primaryPos)}{p.bats ? `・${hand(p.bats)}` : ''}{p.status && p.status !== '現役' ? `・${p.status}` : ''}</span>
                        </span>
                        <span className="text-right tnum text-[11px] text-ink-2 shrink-0 leading-4">
                          {b ? <span className="block">AVG {f3(b.avg)}</span> : <span className="block text-muted">無打席</span>}
                          {pl && <span className="block text-muted">ERA {f2(pl.era)}</span>}
                        </span>
                      </button>
                    </li>
                  )
                })}
                {filtered.length === 0 && <li className="col-span-full text-[13px] text-muted text-center py-6">{onlyRegistered && !q ? '報名名單上的人都不在球員名單' : '沒有符合的球員'}</li>}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {editingRoster && (
        <Card title="編輯球員名單" subtitle="背號、姓名、守位、慣用手、狀態；儲存後全站更新">
          <RosterEditor base={base} busy={cloud.pushing} onCancel={() => setEditingRoster(false)} onSave={async (c) => { await saveRoster(c); setEditingRoster(false) }} />
        </Card>
      )}
      {showRegs && (
        <Card title="報名名單" subtitle="每個杯賽每年一份；先發陣容與紀錄比賽選到那個杯賽的比賽時，只列出名單上的人" action={<Button variant="ghost" size="sm" icon={<X />} onClick={() => setShowRegs(false)}>關閉</Button>}>
          <RegistrationEditor registrations={registrations} roster={base.roster} games={base.games} supported={registrationsSupported} canEdit={canEdit}
            focusTournament={filters.tournament === 'all' ? undefined : filters.tournament} onSave={saveRegistration} onDelete={deleteRegistration} />
        </Card>
      )}
      {!player ? (
        <Card><EmptyState title="請選擇球員" /></Card>
      ) : (
        <>
          {stories.length > 0 && (
            <section aria-label={`${player.name} 的看點`} className="relative overflow-hidden rounded-[var(--radius)] bg-surface shadow-[var(--shadow-card)] p-5">
              <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(90% 120% at 100% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 60%)' }} />
              <div className="relative flex items-center gap-3 text-[11px] text-muted mb-3"><Stitches width={40} /><span className="tracking-[0.08em]">{player.name} 的看點</span></div>
              <StoryRow stories={stories} link={false} className="relative" />
            </section>
          )}
          {/* 打擊 and 投球 each get their own page of numbers */}
          <div className="flex items-center gap-3 flex-wrap">
            <Tabs aria-label="數據類別" value={tab} onChange={setTab} items={[{ value: 'batting', label: bat ? `打擊・${bat.pa} 打席` : '打擊' }, { value: 'pitching', label: pit ? `投球・${pit.ipDisplay} 局` : '投球' }]} />
          </div>
          {tab === 'batting' ? (
            !bat ? <Card><EmptyState compact title="目前篩選條件下沒有打席" description={pit ? '這位球員有投球紀錄：點上面的「投球」看' : undefined} /></Card> : (
              <>
            <StatGroup columns="grid-cols-2 md:grid-cols-4 xl:grid-cols-5">
              <StatTile label="打擊率 AVG" to="/batting?sort=avg" value={bat.avg ?? 0} format="decimal3" note={`${bat.h} H / ${bat.ab} AB`} />
              <StatTile label="上壘率 OBP" to="/batting?sort=obp" value={bat.obp ?? 0} format="decimal3" note={`${bat.bb} BB・${bat.hbp} HBP`} />
              <StatTile label="長打率 SLG" to="/batting?sort=slg" value={bat.slg ?? 0} format="decimal3" note={`${bat.h2} 2B・${bat.h3} 3B・${bat.hr} HR`} />
              <StatTile label="OPS" to="/batting?sort=ops" value={bat.ops ?? 0} format="decimal3" note={bat.opsPlus === null ? `${bat.pa} PA・${bat.rbi} RBI` : `OPS+ ${bat.opsPlus}・${bat.pa} PA`} />
              <StatTile label="wOBA" to="/batting?view=advanced&sort=woba" value={bat.woba ?? 0} format="decimal3" />
              <StatTile label="wRC+" to="/batting?view=advanced&sort=wrcPlus" value={bat.wrcPlus ?? 0} display={bat.wrcPlus === null ? '—' : String(bat.wrcPlus)} note="隊平均 = 100" />
              <StatTile label="K% / BB%" to="/batting?view=advanced&sort=kPct&dir=asc" value={(bat.kPct ?? 0) * 100} format="pct" display={`${pct0(bat.kPct)}/${pct0(bat.bbPct)}`} note={`${bat.so} K / ${bat.bb} BB`} />
              <StatTile label="得點圈 AVG" to="/batting?view=advanced&sort=rispAvg" value={bat.rispAvg ?? 0} format="decimal3" display={f3(bat.rispAvg)} note={`${bat.rispH} / ${bat.rispAB} RISP AB`} />
              <StatTile label="Whiff% / Hard%" to="/batting?view=process&sort=whiffPct&dir=asc" value={(bat.whiffPct ?? 0) * 100} format="pct" display={`${pct0(bat.whiffPct)}/${pct0(bat.hardPct)}`} note="揮空率 / 強勁擊球率" />
              <StatTile label="sSeager" to="/batting?view=process&sort=sSeager" value={(bat.sSeager ?? 0) * 100} display={signedPct(bat.sSeager)} note="好球敢打、壞球忍得住" />
            </StatGroup>
          {compare && cmpPlayer && (
            <Card title={`${player.name} vs ${cmpPlayer.name}`} subtitle="打擊・同一篩選範圍；較佳的一方以深色標示（率的門檻 PA ≥ 3）" action={<Button variant="ghost" size="sm" icon={<X />} onClick={() => setCompare('')}>關閉比較</Button>} flush>
              <CompareTable a={bat} b={cmpBat} pa={pit} pb={cmpPit} names={[player.name, cmpPlayer.name]} only="batting" />
            </Card>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            {bat && bat.pa < 3 ? <Card title="隊內百分位" subtitle="與同隊打者比較"><EmptyState compact title="有 3 個打席後會出現隊內百分位" description={`目前 ${bat.pa} 個打席`} /></Card> : <RadarCard title="隊內百分位" data={radar} reference={50}
              subtitle={compare ? `與 ${compare} 比較；越外圈越好，虛線 = 隊內中位` : '越外圈越好；虛線 = 隊內中位（PR 50）'}
              action={!compare && (
                <Select size="sm" label="比較" aria-label="雷達圖比較對象" value={basis?.value ?? ''} onChange={(e) => setBasisPick(e.target.value as Basis)}
                  options={bases.map((b) => ({ value: b.value, label: b.line ? b.label : `${b.label}・${b.why}`, disabled: !b.line }))} />
              )}
              series={compare ? [{ key: 'player', label: player.name }, { key: 'other', label: compare }] : basis ? [{ key: 'player', label: player.name }, { key: 'other', label: basis.short }] : [{ key: 'player', label: player.name }]}
              formatValue={(v) => `PR ${Math.round(v)}`} detail={(d, k) => String(d[k === 'player' ? 'playerDetail' : 'otherDetail'] ?? '')} />}
            <SprayChart title="落點分佈" subtitle="安打 / 場內球" counts={spray.all} secondary={spray.hits} />
          </div>
          {trend.length > 1 && <LineChartCard title="AVG / OPS 累積走勢" subtitle="賽季至今；點一下看那一場" onPointClick={openGame} data={trend} series={[{ key: 'AVG', label: 'AVG' }, { key: 'OPS', label: 'OPS' }]} formatValue={(v) => f3(v)} yWidth={52} />}
          <Card title="逐場紀錄" subtitle="點欄位標題排序" flush>
            <DataTable columns={logCols} rows={gameLog} rowKey={(r) => r.id} onRowClick={openGame} dense maxHeight={360} emptyTitle="沒有逐場紀錄" />
          </Card>
              </>
            )
          ) : (
            !pit ? <Card><EmptyState compact title="目前篩選條件下沒有投球紀錄" description={bat ? '這位球員有打擊紀錄：點上面的「打擊」看' : undefined} /></Card> : (
              <>
            <StatGroup>
              <StatTile label="防禦率 ERA" to="/pitching?view=basic&sort=era&dir=asc" value={pit.era ?? 0} format="era" note={`${pit.ipDisplay} IP・${pit.w} 勝 ${pit.l} 敗${pit.sv ? `・${pit.sv} 救援` : ''}`} />
              <StatTile label="FIP" to="/pitching?view=advanced&sort=fip&dir=asc" value={pit.fip ?? 0} format="era" note="只看三振、保送、全壘打" />
              <StatTile label="WHIP" to="/pitching?view=basic&sort=whip&dir=asc" value={pit.whip ?? 0} format="ratio" note={`${pit.h} H + ${pit.bb} BB`} />
              <StatTile label="K / BB" to="/pitching?view=advanced&sort=kbb" value={pit.k} display={`${pit.k} / ${pit.bb}`} note={`K/7 ${f2(pit.k7)}・K/9 ${f2(pit.k9)}・BB/9 ${f2(pit.bb9)}`} />
              <StatTile label="K% / BB%" to="/pitching?view=advanced&sort=kPct" value={(pit.kPct ?? 0) * 100} format="pct" display={`${pct0(pit.kPct)}/${pct0(pit.bbPct)}`} note={`面對 ${pit.bf} 位打者`} />
              <StatTile label="被打擊率" to="/pitching?view=advanced&sort=oppAvg&dir=asc" value={pit.oppAvg ?? 0} format="decimal3" display={f3(pit.oppAvg)} note={`${pit.h} H / ${pit.ab} AB・${pit.hr} HR`} />
              <StatTile label="好球率 / 首球好球" to="/pitching?view=process&sort=strikePct" value={(pit.strikePct ?? 0) * 100} format="pct" display={`${pct0(pit.strikePct)}/${pct0(pit.fStrikePct)}`} note={`${pit.pc} 球・每局 ${pit.pPerIP === null ? '—' : pit.pPerIP.toFixed(1)} 球`} />
              <StatTile label="Whiff% / CSW%" to="/pitching?view=process&sort=cswPct" value={(pit.cswPct ?? 0) * 100} format="pct" display={`${pct0(pit.whiffPct)}/${pct0(pit.cswPct)}`} note="揮空率 / 好球＋揮空占比" />
            </StatGroup>
          {compare && cmpPlayer && (
            <Card title={`${player.name} vs ${cmpPlayer.name}`} subtitle="投球・同一篩選範圍；較佳的一方以深色標示" action={<Button variant="ghost" size="sm" icon={<X />} onClick={() => setCompare('')}>關閉比較</Button>} flush>
              <CompareTable a={bat} b={cmpBat} pa={pit} pb={cmpPit} names={[player.name, cmpPlayer.name]} only="pitching" />
            </Card>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            {pitchTrend.length > 1 ? <LineChartCard title="ERA / WHIP 累積走勢" subtitle="賽季至今；點一下看那一場" onPointClick={openGame} data={pitchTrend} series={[{ key: 'ERA', label: 'ERA' }, { key: 'WHIP', label: 'WHIP' }]} formatValue={(v) => f2(v)} yWidth={44} />
              : <Card title="ERA / WHIP 累積走勢"><EmptyState compact title="投第二場之後會出現走勢" /></Card>}
            <SprayChart title="被擊球落點" subtitle="面對的打者：安打 / 場內球" counts={pitchSpray.all} secondary={pitchSpray.hits} />
          </div>
          <Card title="逐場投球" subtitle="點一列看那一場" flush>
            <DataTable columns={pitchCols} rows={pitchLog} rowKey={(r) => r.id} onRowClick={openGame} dense maxHeight={360} emptyTitle="沒有逐場紀錄" />
          </Card>
              </>
            )
          )}
        </>
      )}
    </>
  )
}
