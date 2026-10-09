import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { useOpenGame } from '../hooks/useOpenGame'
import { median, previousSeason, sameGroup } from '../data/radar'
import { filterGames } from '../data/filters'
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Download, Pencil, Search, X } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { activeFilterCount } from '../components/layout/FilterBar'
import { scopeText } from '../components/layout/FilterChips'
import { downloadCompareImage, downloadPercentileImage, downloadPlayerImage } from '../lib/shareImage'
import { TEAM_NAME } from '../data/seed'
import { StoryRow } from '../components/ui/SeasonHero'
import { HeroGlow } from '../components/ui/HeroGlow'
import { RosterSortToggle, useRosterSort } from '../components/ui/RosterSortToggle'
import { sortRoster } from '../data/rosterSort'
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
import { PercentileCard } from '../components/charts/PercentileBars'
import { ComparePicker } from '../components/ui/ComparePicker'
import { CompareGrid, type ComparePlayer } from '../components/ui/CompareGrid'
import { BAT_METRICS, BAT_PCT, BAT_SAMPLE_LIKE, comparePr, compareRows, PCT_POOL_MIN, percentileRows, PIT_METRICS, PIT_PCT, PIT_SAMPLE_LIKE, teamPool, type Metric } from '../data/playerMetrics'
import { SprayChart } from '../components/charts/SprayChart'
import { LineChartCard } from '../components/charts/LineChartCard'
import { useStats } from '../hooks/useStats'
import { usePrefersReducedMotion } from '../hooks/useMediaQuery'
import { isPA, type BattingPA } from '../data/types'
import { battingLines, pitchingLines, sprayCounts, type BattingLine, type PitchingLine } from '../data/stats'
import { f2, f3, pct0, percentile, posLabel, shortDate, signedPct } from '../lib/fmt'
import { cx } from '../lib/format'

/** His plate appearances, plus the ones he ran for (代跑: the run and steals are his). */
const ranOrBatted = (p: BattingPA, name: string) => p.batter === name || p.runner === name

interface GameLogRow { id: string; date: string; opponent: string; pa: number; ab: number; h: number; hr: number; rbi: number; bb: number; so: number; sb: number; avg: string; isDemo: boolean }
/** One game on the mound: that game's line, with the season ERA after it. */
interface PitchLogRow { id: string; date: string; opponent: string; dec: string; outs: number; ip: string; bf: number; h: number; r: number; er: number; bb: number; k: number; pc: number; era: string; isDemo: boolean }
type PlayerTab = 'batting' | 'pitching'

const hand = (b?: string) => (b ? (b === 'L' ? '左打' : b === 'S' ? '左右開弓' : '右打') : '')

/** 隊內百分位 as bars (default) or the radar: each reader's own choice, remembered on this device */
type PctView = 'bars' | 'radar'
const PCT_VIEW_KEY = 'bafin.players.pctView'
const readPctView = (): PctView => { try { return localStorage.getItem(PCT_VIEW_KEY) === 'radar' ? 'radar' : 'bars' } catch { return 'bars' } }
const writePctView = (v: PctView) => { try { localStorage.setItem(PCT_VIEW_KEY, v) } catch { /* private mode: just this visit */ } }
/** the most teammates compared with the main player (9 in all) */
const MAX_COMPARE = 8

/** One side of a comparison row: the better number stands out (accent pill, bold, ▲ towards the label), the other fades. */
function CompareValue({ text, state, side }: { text: string; state: 'win' | 'lose' | 'tie' | 'more'; side: 'a' | 'b' }) {
  // more chances (G / PA / IP) is not better: just bolder, without the pill
  if (state === 'more') return <span className="inline-block px-2.5 py-0.5 tnum font-semibold text-ink">{text}<span className="sr-only">（較多）</span></span>
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
            <td className="px-3 py-1 text-right"><CompareValue text={na === null ? '—' : m.fmt(na)} state={better === null ? 'tie' : better === 'a' ? (m.volume ? 'more' : 'win') : 'lose'} side="a" /></td>
            <td className="px-2 py-1.5 text-center text-[12px] text-muted whitespace-nowrap"><StatHint label={m.label}>{m.label}</StatHint></td>
            <td className="px-3 py-1 text-left"><CompareValue text={nb === null ? '—' : m.fmt(nb)} state={better === null ? 'tie' : better === 'b' ? (m.volume ? 'more' : 'win') : 'lose'} side="b" /></td>
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
  // current players first, then the 球員排序 (背號 or 姓氏) chosen on the site; 上一位／下一位 follow it too
  const sortMode = useRosterSort()
  const roster = useMemo(() => sortRoster(s.dataset.roster, sortMode), [s.dataset.roster, sortMode])
  const names = useMemo(() => roster.map((p) => p.name), [roster])
  const requested = params.get('player')
  // without a player in the link, open on the one with the most plate appearances (or batters faced) in the
  // filtered games, not on whoever is first on the roster and may have no numbers at all
  const busiest = useMemo(() => {
    const n = new Map<string, number>()
    for (const p of s.batting) if (p.batter && isPA(p)) n.set(p.batter, (n.get(p.batter) ?? 0) + 1)
    for (const p of s.pitching) if (p.pitcher && isPA(p)) n.set(p.pitcher, (n.get(p.pitcher) ?? 0) + 1)
    return [...n.entries()].filter(([name]) => names.includes(name)).sort((a, b) => b[1] - a[1])[0]?.[0]
  }, [s.batting, s.pitching, names])
  const [selected, setSelected] = useState<string>(requested && names.includes(requested) ? requested : busiest ?? names[0] ?? '')
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  // 比較: teammates in the link (?cmp=A&cmp=B), known names only, never the main player, at most 8. One of them = the
  // two-column table and the radar overlay as before; two or more = the comparison grid.
  const cmpParams = params.getAll('cmp')
  const compareList = useMemo(() => [...new Set(cmpParams)].filter((n) => names.includes(n) && n !== selected).slice(0, MAX_COMPARE),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cmpParams.join('\u0000'), names, selected])
  const compare = compareList.length === 1 ? compareList[0] : ''
  const multi = compareList.length >= 2
  const setCompareList = (list: string[]) => setParams((prev) => {
    const n = new URLSearchParams(prev)
    n.delete('cmp'); for (const c of list.slice(0, MAX_COMPARE)) n.append('cmp', c)
    if (selected) n.set('player', selected)
    return n
  }, { replace: true })
  const setCompare = (name: string) => setCompareList(name ? [name] : [])
  const [pctView, setPctViewState] = useState<PctView>(readPctView)
  const setPctView = (v: PctView) => { setPctViewState(v); writePctView(v) }
  const [editingRoster, setEditingRoster] = useState(false)
  const [showRegs, setShowRegs] = useState(false)
  const [rosterView, setRosterView] = useState<'all' | 'reg'>('all')
  const base = useDataStore((st) => st.base)
  const filters = useDataStore((st) => st.filters)
  const resetFilters = useDataStore((st) => st.resetFilters)
  const statParams = s.params
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
  const pool = useMemo(() => s.batters.filter((b) => b.pa >= 1), [s.batters])
  const recentBat = useMemo(() => {
    if (gameLog.length <= RECENT) return undefined
    const ids = gameLog.slice(0, RECENT).map((g) => g.id)
    const l = battingLines(s.dataset, s.batting.filter((p) => ids.includes(p.gameId) && ranOrBatted(p, selected)), statParams).find((x) => x.name === selected)
    return l && l.pa >= 1 ? l : undefined
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
    return l && l.pa >= 1 ? l : undefined
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

  // 隊內百分位 (bars): against the teammates with PA ≥ 10 / BF ≥ 10 in the filtered games (everyone who played when
  // fewer than 5 qualify)
  const batPool = useMemo(() => teamPool(s.batters, (l) => l.pa, PCT_POOL_MIN.bat), [s.batters])
  const pitPool = useMemo(() => teamPool(s.pitchers, (l) => l.bf, PCT_POOL_MIN.pit), [s.pitchers])
  const batPct = useMemo(() => (bat ? percentileRows(bat, batPool.pool, BAT_PCT) : []), [bat, batPool])
  const pitPct = useMemo(() => (pit ? percentileRows(pit, pitPool.pool, PIT_PCT) : []), [pit, pitPool])
  // one head count everywhere (the percentile card, its image and the comparison): the whole pool, the player included,
  // the same N as 「隊內第 3／N」
  const batPoolNote = batPool.relaxed
    ? `這段期間不到 5 位隊友達 ${PCT_POOL_MIN.bat} 打席，改和所有有打席的 ${batPool.pool.length} 位打者比；圓圈裡是 PR（100＝隊內最佳）`
    : `和這段期間 PA ≥ ${PCT_POOL_MIN.bat} 的 ${batPool.pool.length} 位打者比；圓圈裡是 PR（100＝隊內最佳），不是和其他球隊比`
  const pitPoolNote = pitPool.relaxed
    ? `這段期間不到 5 位投手面對 ${PCT_POOL_MIN.pit} 位打者，改和所有有投球的 ${pitPool.pool.length} 位投手比；圓圈裡是 PR（100＝隊內最佳）`
    : `和這段期間面對 ${PCT_POOL_MIN.pit} 位以上打者的 ${pitPool.pool.length} 位投手比；圓圈裡是 PR（100＝隊內最佳），不是和其他球隊比`
  const PCT_FOOTNOTE = '灰色＝這一項樣本太少（例如揮棒不到 15 次）。描述這段期間的表現，不代表穩定能力。'

  // 多人比較 (and the two-player table's image): the main player first, then the chosen teammates
  const comparePlayers = (kind: PlayerTab): ComparePlayer[] => [selected, ...compareList].map((n) => {
    const p = roster.find((x) => x.name === n)
    const b = byName.get(n), pl = pitchByName.get(n)
    return kind === 'batting'
      ? { name: n, number: p?.number, note: b ? `${b.pa} 打席` : '', none: b ? undefined : '無打擊紀錄', small: !!b && b.pa < PCT_POOL_MIN.bat }
      : { name: n, number: p?.number, note: pl ? `${pl.ipDisplay} 局` : '', none: pl ? undefined : '無投球紀錄', small: !!pl && pl.bf < PCT_POOL_MIN.pit }
  })
  const compareTableRows = (kind: PlayerTab) => (kind === 'batting'
    ? compareRows([selected, ...compareList].map((n) => byName.get(n)), BAT_METRICS, comparePr(batPool.pool, BAT_PCT, BAT_SAMPLE_LIKE))
    : compareRows([selected, ...compareList].map((n) => pitchByName.get(n)), PIT_METRICS, comparePr(pitPool.pool, PIT_PCT, PIT_SAMPLE_LIKE)))
  const comparePoolNote = (kind: PlayerTab) => (kind === 'batting'
    ? `隊內百分位：和這段期間${batPool.relaxed ? '所有有打席' : ` PA ≥ ${PCT_POOL_MIN.bat} `}的 ${batPool.pool.length} 位打者比`
    : `隊內百分位：和這段期間${pitPool.relaxed ? '所有有投球' : `面對 ${PCT_POOL_MIN.pit} 位以上打者`}的 ${pitPool.pool.length} 位投手比`)
  // the names the comparison picker offers: those with numbers on this tab, in the site's order
  const comparable = (kind: PlayerTab) => names.filter((n) => (kind === 'batting' ? (byName.get(n)?.pa ?? 0) >= 1 : (pitchByName.get(n)?.bf ?? 0) + (pitchByName.get(n)?.outs ?? 0) > 0))

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

  // 成績卡: a share image of the numbers on screen, with the period and sample written on it
  const sharePlayer = () => {
    if (!player) return
    const lines: string[] = []
    if (bat) lines.push(`打擊：${bat.g} 場 ${bat.pa} 打席、${bat.ab} 打數 ${bat.h} 安，${bat.hr} 全壘打、${bat.rbi} 打點、${bat.sb} 盜壘`, `OBP ${f3(bat.obp)}・SLG ${f3(bat.slg)}・OPS ${f3(bat.ops)}${bat.wrcPlus === null ? '' : `・wRC+ ${Math.round(bat.wrcPlus)}`}`)
    if (pit) lines.push(`投球：${pit.g} 場 ${pit.ipDisplay} 局，${pit.k} 三振、${pit.bb} 保送，ERA ${f2(pit.era)}・WHIP ${f2(pit.whip)}`)
    downloadPlayerImage({
      name: player.name, number: player.number, meta: playerMeta(),
      period: scopeText(filters, s.games), big: headline, lines,
      footer: `${TEAM_NAME} 數據平台・wRC+ 以同期間全隊為 100・樣本少時僅供參考`,
    })
  }
  const playerMeta = () => (player ? [posLabel(player.primaryPos), player.bats && hand(player.bats)].filter(Boolean).join('・') : '')
  // 百分位圖: the bars of the tab being read
  const sharePercentile = (kind: PlayerTab) => {
    if (!player) return
    downloadPercentileImage({
      name: player.name, number: player.number, meta: playerMeta(), period: scopeText(filters, s.games),
      rows: kind === 'batting' ? batPct : pitPct, poolNote: kind === 'batting' ? batPoolNote : pitPoolNote,
      footer: `${TEAM_NAME} 數據平台・隊內百分位（PR）・樣本少的項目為灰色`,
    })
  }
  // 比較圖 of the two-player table (the grid has its own button)
  const shareCompare = (kind: PlayerTab) => downloadCompareImage({
    title: `${selected} vs ${compareList[0] ?? ''}・${kind === 'batting' ? '打擊' : '投球'}`,
    subtitle: `${scopeText(filters, s.games)}・${comparePoolNote(kind)}`,
    players: comparePlayers(kind).map((p) => ({ name: p.name, number: p.number, note: p.none ?? p.note })),
    rows: compareTableRows(kind), footer: `${TEAM_NAME} 數據平台・底色是隊內百分位（紅好藍差），白框＝這一列最佳`,
  })
  // a player without numbers in the filtered games: widen the period, or pick someone else
  const noDataActions = (
    <span className="inline-flex gap-2 flex-wrap justify-center">
      {activeFilterCount(filters) > 0 && <Button size="sm" variant="outline" onClick={resetFilters}>看全部期間</Button>}
      <Button size="sm" variant="ghost" onClick={() => { setOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>換球員</Button>
    </span>
  )
  // a tile opens the team ranking of that stat with this player marked (?hl=), which its label says
  const rank = (path: string) => `${path}&hl=${encodeURIComponent(selected)}`
  // the three numbers on the 球員卡, for the tab being read
  const headline = tab === 'pitching'
    ? (pit ? [{ label: 'ERA', value: f2(pit.era) }, { label: 'WHIP', value: f2(pit.whip) }, { label: '三振', value: String(pit.k) }] : [])
    : (bat ? [{ label: 'AVG', value: f3(bat.avg) }, { label: 'OPS', value: f3(bat.ops) }, { label: 'wRC+', value: bat.wrcPlus === null ? '—' : String(Math.round(bat.wrcPlus)) }] : [])

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
  // switching players keeps the comparison list (the new main player leaves it); `keep` puts the old one in his place
  const choose = (name: string, keep?: string) => {
    setSelected(name)
    setParams((prev) => {
      const n = new URLSearchParams(tabParam ? { player: name, tab: tabParam } : { player: name })
      const list = prev.getAll('cmp').map((c) => (c === name && keep ? keep : c)).filter((c) => c !== name)
      for (const c of [...new Set(list)].slice(0, MAX_COMPARE)) n.append('cmp', c)
      return n
    }, { replace: true })
    setOpen(false); setQ('')
  }
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

  const pctToggle = <Tabs size="sm" aria-label="百分位的畫法" value={pctView} onChange={setPctView} items={[{ value: 'bars', label: '長條' }, { value: 'radar', label: '雷達' }]} />

  return (
    <>
      <PageHeader scoped title="球員" description={`${roster.length} 位球員。個人數據依上方篩選計算，分打擊、投球兩頁；百分位是隊內排名（PA ≥ ${PCT_POOL_MIN.bat} 的打者、面對 ${PCT_POOL_MIN.pit} 位以上打者的投手）。`} />
      <DemoBanner />

      {/* 球員卡: the player as the page's main character (jersey number, name, the three numbers that matter, his
          看點), with the homepage hero's glow. The name is the switcher: tap it to pick someone else. */}
      <Card className="overflow-hidden relative" bodyClassName="p-0">
        <HeroGlow />
        <div className="relative px-5 md:px-7 pt-4 md:pt-6 pb-4 md:pb-6 flex flex-col gap-4 md:gap-5">
          <div className="flex flex-col-reverse sm:flex-row sm:items-start gap-1 sm:gap-3">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="roster-panel"
              className="group flex items-center gap-3.5 md:gap-5 min-w-0 flex-1 text-left rounded-[var(--radius-sm)] -ml-1.5 pl-1.5 pr-2 py-1.5 hover:bg-[color-mix(in_srgb,var(--surface-2)_70%,transparent)] cursor-pointer transition-colors motion-reduce:transition-none">
              <span className="md:hidden flex"><PlateBadge size={56} className="figure">{player?.number ?? player?.name.slice(0, 1) ?? '–'}</PlateBadge></span>
              <span className="hidden md:flex"><PlateBadge size={76} className="figure">{player?.number ?? player?.name.slice(0, 1) ?? '–'}</PlateBadge></span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="font-display text-[26px] md:text-[34px] font-bold text-ink leading-tight truncate">{player?.name ?? '請選擇球員'}</span>
                  <ChevronDown aria-hidden className={cx('size-5 text-muted shrink-0 transition-transform motion-reduce:transition-none group-hover:text-ink', open && 'rotate-180')} />
                </span>
                <span className="block text-[13px] text-ink-2 truncate mt-0.5">{player ? [`${posLabel(player.primaryPos)}${player.secondaryPos ? ` / ${player.secondaryPos}` : ''}`, player.bats && hand(player.bats), player.status && player.status !== '現役' ? player.status : ''].filter(Boolean).join('・') : ''}</span>
                <span className="block text-[11px] text-muted mt-1">{open ? '點這裡收合名單' : '點名字換球員'}</span>
              </span>
            </button>
            <div className="flex items-center justify-end gap-1 shrink-0 -mr-2 -mt-1 sm:m-0">
              {player && (bat || pit) && <Button variant="ghost" size="sm" icon={<Download />} onClick={sharePlayer} title="下載這位球員的成績卡（PNG），標明期間與樣本">成績卡</Button>}
              <Button variant="ghost" aria-label="上一位" className="size-10 pointer-fine:size-9" icon={<ChevronLeft />} onClick={() => step(-1)} disabled={names.length < 2} />
              <Button variant="ghost" aria-label="下一位" className="size-10 pointer-fine:size-9" icon={<ChevronRight />} onClick={() => step(1)} disabled={names.length < 2} />
            </div>
          </div>
          {player && (headline.length > 0 || bat || pit || fld) && (
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              {headline.length > 0 && (
                <dl className="flex gap-6 md:gap-9">
                  {headline.map((h) => (
                    <div key={h.label} className="min-w-0">
                      <dt className="text-[11px] text-muted">{h.label}</dt>
                      <dd className="figure text-[30px] md:text-[40px] font-bold text-ink leading-none mt-1">{h.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="flex gap-1.5 flex-wrap md:justify-end">
                {bat && <Badge>打者 {bat.g} 場・{bat.pa} 打席</Badge>}
                {pit && <Badge>投手 {pit.ipDisplay} 局</Badge>}
                {fld && <Badge>守備 {fld.positions.join(' / ')}</Badge>}
              </div>
            </div>
          )}
          {player && stories.length > 0 && (
            <>
              <div className="flex items-center gap-3 text-[11px] text-muted -mb-1"><Stitches width={40} /><span className="tracking-[0.08em]">{player.name} 的看點</span></div>
              <StoryRow stories={stories} link={false} className="relative" />
            </>
          )}
          {player && <ComparePicker names={comparable(tab)} selected={compareList} main={selected} onChange={setCompareList} max={MAX_COMPARE} roster={roster} />}
        </div>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div id="roster-panel" key="roster" initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduced ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden border-t border-border">
              <div className="px-4 md:px-5 py-3 flex items-center gap-x-3 gap-y-2 flex-wrap">
                <Input icon={<Search />} size="sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋姓名或背號" aria-label="搜尋球員" className="w-full sm:w-[240px]" autoFocus />
                <span className="text-xs text-muted tnum whitespace-nowrap">{filtered.length} / {roster.length} 人</span>
                <RosterSortToggle />
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
          {/* 打擊 and 投球 each get their own page of numbers */}
          <div className="flex items-center gap-3 flex-wrap">
            <Tabs aria-label="數據類別" value={tab} onChange={setTab} items={[{ value: 'batting', label: bat ? `打擊・${bat.pa} 打席` : '打擊' }, { value: 'pitching', label: pit ? `投球・${pit.ipDisplay} 局` : '投球' }]} />
          </div>
          {tab === 'batting' ? (
            !bat ? <Card><EmptyState compact title="目前篩選條件下沒有打席" description={pit ? '這位球員有投球紀錄：點上面的「投球」看' : undefined} action={noDataActions} /></Card> : (
              <>
            <StatGroup columns="grid-cols-2 md:grid-cols-4 xl:grid-cols-5">
              <StatTile label="打擊率 AVG" to={rank('/batting?sort=avg')} toLabel="全隊排行" value={bat.avg ?? 0} format="decimal3" note={`${bat.h} H / ${bat.ab} AB`} />
              <StatTile label="上壘率 OBP" to={rank('/batting?sort=obp')} toLabel="全隊排行" value={bat.obp ?? 0} format="decimal3" note={`${bat.bb} BB・${bat.hbp} HBP`} />
              <StatTile label="長打率 SLG" to={rank('/batting?sort=slg')} toLabel="全隊排行" value={bat.slg ?? 0} format="decimal3" note={`${bat.h2} 2B・${bat.h3} 3B・${bat.hr} HR`} />
              <StatTile label="OPS" to={rank('/batting?sort=ops')} toLabel="全隊排行" value={bat.ops ?? 0} format="decimal3" note={bat.opsPlus === null ? `${bat.pa} PA・${bat.rbi} RBI` : `OPS+ ${bat.opsPlus}・${bat.pa} PA`} />
              <StatTile label="wOBA" to={rank('/batting?view=advanced&sort=woba')} toLabel="全隊排行" value={bat.woba ?? 0} format="decimal3" />
              <StatTile label="wRC+" to={rank('/batting?view=advanced&sort=wrcPlus')} toLabel="全隊排行" value={bat.wrcPlus ?? 0} display={bat.wrcPlus === null ? '—' : String(bat.wrcPlus)} note="隊平均 = 100" />
              <StatTile label="K% / BB%" to={rank('/batting?view=advanced&sort=kPct&dir=asc')} toLabel="全隊排行" value={(bat.kPct ?? 0) * 100} format="pct" display={`${pct0(bat.kPct)}/${pct0(bat.bbPct)}`} note={`${bat.so} K / ${bat.bb} BB`} />
              <StatTile label="得點圈 AVG" to={rank('/batting?view=advanced&sort=rispAvg')} toLabel="全隊排行" value={bat.rispAvg ?? 0} format="decimal3" display={f3(bat.rispAvg)} note={`${bat.rispH} / ${bat.rispAB} RISP AB`} />
              <StatTile label="Whiff% / Hard%" to={rank('/batting?view=process&sort=whiffPct&dir=asc')} toLabel="全隊排行" value={(bat.whiffPct ?? 0) * 100} format="pct" display={`${pct0(bat.whiffPct)}/${pct0(bat.hardPct)}`} note={`揮空 ${bat.whiffs}/${bat.swings} 揮・強勁 ${bat.hard}/${bat.bip} 球（判讀）`} />
              <StatTile label="sSeager" to={rank('/batting?view=process&sort=sSeager')} toLabel="全隊排行" value={(bat.sSeager ?? 0) * 100} display={signedPct(bat.sSeager)} note="好球敢打、壞球忍得住" />
            </StatGroup>
          {compare && cmpPlayer && (
            <Card title={`${player.name} vs ${cmpPlayer.name}`} subtitle="打擊・同一篩選範圍；較佳的一方以強調色標示，出賽／打席數只標「較多」（率的門檻 PA ≥ 1）" flush
              action={<><Button variant="ghost" size="sm" icon={<Download />} onClick={() => shareCompare('batting')} title="把這張比較表存成 PNG 圖片">存成圖片</Button><Button variant="ghost" size="sm" icon={<X />} onClick={() => setCompare('')}>關閉比較</Button></>}>
              <CompareTable a={bat} b={cmpBat} pa={pit} pb={cmpPit} names={[player.name, cmpPlayer.name]} only="batting" />
            </Card>
          )}
          {multi && <CompareGrid kind="batting" players={comparePlayers('batting')} rows={compareTableRows('batting')} onPick={(n) => choose(n, selected)}
            scope={scopeText(filters, s.games)} poolNote={comparePoolNote('batting')} footer={`${TEAM_NAME} 數據平台・底色是隊內百分位（紅好藍差），白框＝這一列最佳`} />}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            {bat && bat.pa < 1 ? <Card title="隊內百分位" subtitle="與同隊打者比較"><EmptyState compact title="有打席後會出現隊內百分位" description={`目前 ${bat.pa} 個打席`} /></Card> : pctView === 'bars' ? (
              <PercentileCard title="隊內百分位" rows={batPct} poolNote={batPoolNote} footnote={PCT_FOOTNOTE} toggle={pctToggle}
                action={<Button variant="ghost" size="sm" icon={<Download />} onClick={() => sharePercentile('batting')} title="把隊內百分位存成 PNG 圖片">存成圖片</Button>} />
            ) : <RadarCard title="隊內百分位" data={radar} reference={50}
              subtitle={`${compare ? `與 ${compare} 比較；` : multi ? '多人比較看下方表格；' : ''}越外圈越好，虛線 = 隊內中位（PR 50）；參照 ${pool.length} 位打者、${s.summary.games} 場，描述這段期間的表現，不代表穩定能力`}
              action={<>{pctToggle}{!compare && (
                <Select size="sm" label="比較" aria-label="雷達圖比較對象" value={basis?.value ?? ''} onChange={(e) => setBasisPick(e.target.value as Basis)}
                  options={bases.map((b) => ({ value: b.value, label: b.line ? b.label : `${b.label}・${b.why}`, disabled: !b.line }))} />
              )}</>}
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
            !pit ? <Card><EmptyState compact title="目前篩選條件下沒有投球紀錄" description={bat ? '這位球員有打擊紀錄：點上面的「打擊」看' : undefined} action={noDataActions} /></Card> : (
              <>
            <StatGroup>
              <StatTile label="防禦率 ERA" to={rank('/pitching?view=basic&sort=era&dir=asc')} toLabel="全隊排行" value={pit.era ?? 0} format="era" note={`${pit.ipDisplay} IP・${pit.w} 勝 ${pit.l} 敗${pit.sv ? `・${pit.sv} 救援` : ''}`} />
              <StatTile label="FIP" to={rank('/pitching?view=advanced&sort=fip&dir=asc')} toLabel="全隊排行" value={pit.fip ?? 0} format="era" note="只看三振、保送、全壘打" />
              <StatTile label="WHIP" to={rank('/pitching?view=basic&sort=whip&dir=asc')} toLabel="全隊排行" value={pit.whip ?? 0} format="ratio" note={`${pit.h} H + ${pit.bb} BB`} />
              <StatTile label="K / BB" to={rank('/pitching?view=advanced&sort=kbb')} toLabel="全隊排行" value={pit.k} display={`${pit.k} / ${pit.bb}`} note={`K/7 ${f2(pit.k7)}・K/9 ${f2(pit.k9)}・BB/9 ${f2(pit.bb9)}`} />
              <StatTile label="K% / BB%" to={rank('/pitching?view=advanced&sort=kPct')} toLabel="全隊排行" value={(pit.kPct ?? 0) * 100} format="pct" display={`${pct0(pit.kPct)}/${pct0(pit.bbPct)}`} note={`面對 ${pit.bf} 位打者`} />
              <StatTile label="被打擊率" to={rank('/pitching?view=advanced&sort=oppAvg&dir=asc')} toLabel="全隊排行" value={pit.oppAvg ?? 0} format="decimal3" display={f3(pit.oppAvg)} note={`${pit.h} H / ${pit.ab} AB・${pit.hr} HR`} />
              <StatTile label="好球率 / 首球好球" to={rank('/pitching?view=process&sort=strikePct')} toLabel="全隊排行" value={(pit.strikePct ?? 0) * 100} format="pct" display={`${pct0(pit.strikePct)}/${pct0(pit.fStrikePct)}`} note={`${pit.pc} 球・每局 ${pit.pPerIP === null ? '—' : pit.pPerIP.toFixed(1)} 球`} />
              <StatTile label="Whiff% / CSW%" to={rank('/pitching?view=process&sort=cswPct')} toLabel="全隊排行" value={(pit.cswPct ?? 0) * 100} format="pct" display={`${pct0(pit.whiffPct)}/${pct0(pit.cswPct)}`} note="揮空率 / 好球＋揮空占比" />
            </StatGroup>
          {compare && cmpPlayer && (
            <Card title={`${player.name} vs ${cmpPlayer.name}`} subtitle="投球・同一篩選範圍；較佳的一方以深色標示" flush
              action={<><Button variant="ghost" size="sm" icon={<Download />} onClick={() => shareCompare('pitching')} title="把這張比較表存成 PNG 圖片">存成圖片</Button><Button variant="ghost" size="sm" icon={<X />} onClick={() => setCompare('')}>關閉比較</Button></>}>
              <CompareTable a={bat} b={cmpBat} pa={pit} pb={cmpPit} names={[player.name, cmpPlayer.name]} only="pitching" />
            </Card>
          )}
          {multi && <CompareGrid kind="pitching" players={comparePlayers('pitching')} rows={compareTableRows('pitching')} onPick={(n) => choose(n, selected)}
            scope={scopeText(filters, s.games)} poolNote={comparePoolNote('pitching')} footer={`${TEAM_NAME} 數據平台・底色是隊內百分位（紅好藍差），白框＝這一列最佳`} />}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            <PercentileCard title="隊內百分位" rows={pitPct} poolNote={pitPoolNote} footnote={PCT_FOOTNOTE}
              action={<Button variant="ghost" size="sm" icon={<Download />} onClick={() => sharePercentile('pitching')} title="把隊內百分位存成 PNG 圖片">存成圖片</Button>} />
            <SprayChart title="被擊球落點" subtitle="面對的打者：安打 / 場內球" counts={pitchSpray.all} secondary={pitchSpray.hits} />
          </div>
          {pitchTrend.length > 1 ? <LineChartCard title="ERA / WHIP 累積走勢" subtitle="賽季至今；點一下看那一場" onPointClick={openGame} data={pitchTrend} series={[{ key: 'ERA', label: 'ERA' }, { key: 'WHIP', label: 'WHIP' }]} formatValue={(v) => f2(v)} yWidth={44} />
            : <Card title="ERA / WHIP 累積走勢"><EmptyState compact title="投第二場之後會出現走勢" /></Card>}
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
