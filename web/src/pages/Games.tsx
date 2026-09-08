import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { DataTable, type Column } from '../components/ui/DataTable'
import { DemoBanner } from '../components/ui/DemoBanner'
import { useStats } from '../hooks/useStats'
import { usePrefersReducedMotion } from '../hooks/useMediaQuery'
import { battingLines, pitchingLines, type BattingLine, type GameSummary, type PitchingLine } from '../data/stats'
import { f2, f3, pct } from '../lib/fmt'
import { TEAM_NAME } from '../data/seed'
import { cx } from '../lib/format'

interface GameRow { id: string; date: string; tournament: string; opponent: string; homeAway: string; venue: string; result: 'W' | 'L' | 'T'; score: string; hitsUs: number; hitsOpp: number; errorsUs: number; lob: number; pitches: number; isDemo: boolean }

const resultBadge = (r: GameRow['result']) => (r === 'W' ? <Badge variant="good">勝</Badge> : r === 'L' ? <Badge variant="critical">敗</Badge> : <Badge>和</Badge>)

function LineScore({ s }: { s: GameSummary }) {
  const n = Math.max(s.lineUs.length, s.lineOpp.length)
  const top = s.game.homeAway === '主' ? { name: s.game.opponent, line: s.lineOpp, r: s.runsOpp, h: s.hitsOpp, e: s.errorsUs } : { name: TEAM_NAME, line: s.lineUs, r: s.runsUs, h: s.hitsUs, e: s.errorsOpp }
  const bottom = s.game.homeAway === '主' ? { name: TEAM_NAME, line: s.lineUs, r: s.runsUs, h: s.hitsUs, e: s.errorsOpp } : { name: s.game.opponent, line: s.lineOpp, r: s.runsOpp, h: s.hitsOpp, e: s.errorsUs }
  const row = (t: typeof top, us: boolean) => (
    <tr className={cx(us && 'font-medium text-ink')}>
      <th scope="row" className="text-left px-3 py-1.5 font-medium whitespace-nowrap">{t.name}</th>
      {Array.from({ length: n }, (_, i) => <td key={i} className="px-2 py-1.5 text-center">{t.line[i] ?? (i >= t.line.length ? '' : 0)}</td>)}
      <td className="px-3 py-1.5 text-center font-semibold border-l border-border">{t.r}</td><td className="px-3 py-1.5 text-center">{t.h}</td><td className="px-3 py-1.5 text-center">{t.e}</td>
    </tr>
  )
  return (
    <div className="overflow-x-auto">
      <table className="text-sm tnum border-collapse">
        <thead><tr className="text-xs text-muted"><th className="px-3 py-1 text-left font-medium">隊伍</th>{Array.from({ length: n }, (_, i) => <th key={i} className="px-2 py-1 font-medium">{i + 1}</th>)}<th className="px-3 py-1 font-medium border-l border-border">R</th><th className="px-3 py-1 font-medium">H</th><th className="px-3 py-1 font-medium">E</th></tr></thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-border">{row(top, top.name === TEAM_NAME)}{row(bottom, bottom.name === TEAM_NAME)}</tbody>
      </table>
    </div>
  )
}

const boxBat: Column<BattingLine>[] = [
  { key: 'name', header: '打者', className: 'font-medium' }, { key: 'pa', header: 'PA', align: 'right' }, { key: 'ab', header: 'AB', align: 'right' }, { key: 'r', header: 'R', align: 'right' }, { key: 'h', header: 'H', align: 'right' }, { key: 'h2', header: '2B', align: 'right' }, { key: 'hr', header: 'HR', align: 'right' }, { key: 'rbi', header: 'RBI', align: 'right' }, { key: 'bb', header: 'BB', align: 'right' }, { key: 'so', header: 'SO', align: 'right' }, { key: 'sb', header: 'SB', align: 'right' },
  { key: 'pitches', header: '用球', align: 'right' }, { key: 'avg', header: 'AVG', align: 'right', format: (v) => f3(v as number | null) },
]
const boxPit: Column<PitchingLine>[] = [
  { key: 'name', header: '投手', className: 'font-medium' }, { key: 'outs', header: 'IP', align: 'right', format: (_, r) => r.ipDisplay }, { key: 'bf', header: 'BF', align: 'right' }, { key: 'pc', header: 'PC', align: 'right' }, { key: 'strikes', header: '好球', align: 'right' }, { key: 'k', header: 'K', align: 'right' }, { key: 'bb', header: 'BB', align: 'right' }, { key: 'hbp', header: 'HBP', align: 'right' }, { key: 'h', header: 'H', align: 'right' }, { key: 'r', header: 'R', align: 'right' }, { key: 'er', header: 'ER', align: 'right' },
  { key: 'era', header: 'ERA', align: 'right', format: (v) => f2(v as number | null) }, { key: 'cswPct', header: 'CSW%', align: 'right', format: (v) => pct(v as number | null) },
]

export function GamesPage() {
  const s = useStats()
  const reduced = usePrefersReducedMotion()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState<string | null>(params.get('game'))
  useEffect(() => { const g = params.get('game'); if (g) setOpen(g) }, [params])
  const close = () => { setOpen(null); if (params.get('game')) setParams({}, { replace: true }) }

  const rows: GameRow[] = useMemo(() => [...s.summaries].reverse().map((g) => ({
    id: g.game.id, date: g.game.date, tournament: g.game.tournament, opponent: g.game.opponent, homeAway: g.game.homeAway, venue: g.game.venue ?? '', result: g.result, score: `${g.runsUs}–${g.runsOpp}`,
    hitsUs: g.hitsUs, hitsOpp: g.hitsOpp, errorsUs: g.errorsUs, lob: g.lobUs, pitches: g.pitchesUs, isDemo: !!g.game.isDemo,
  })), [s.summaries])
  const columns: Column<GameRow>[] = [
    { key: 'date', header: '日期', sortable: true },
    { key: 'tournament', header: '杯賽', sortable: true },
    { key: 'opponent', header: '對手', className: 'font-medium', format: (v, r) => <span className="inline-flex items-center gap-1.5">{String(v)}{r.isDemo && <Badge variant="accent">示範</Badge>}</span> },
    { key: 'homeAway', header: '主客', align: 'center' }, { key: 'venue', header: '場地' },
    { key: 'result', header: '結果', align: 'center', format: (v) => resultBadge(v as GameRow['result']) },
    { key: 'score', header: '比分', align: 'right' }, { key: 'hitsUs', header: '安打', align: 'right', sortable: true }, { key: 'hitsOpp', header: '被安打', align: 'right', sortable: true }, { key: 'errorsUs', header: '失誤', align: 'right', sortable: true }, { key: 'lob', header: '殘壘', align: 'right', sortable: true }, { key: 'pitches', header: '投手用球', align: 'right', sortable: true },
  ]
  const current = s.summaries.find((g) => g.game.id === open) ?? null
  const boxB = useMemo(() => (current ? battingLines(s.dataset, s.dataset.batting.filter((p) => p.gameId === current.game.id)).sort((a, b) => (s.dataset.batting.find((p) => p.batter === a.name && p.gameId === current.game.id)?.order ?? 99) - (s.dataset.batting.find((p) => p.batter === b.name && p.gameId === current.game.id)?.order ?? 99)) : []), [current, s.dataset])
  const boxP = useMemo(() => (current ? pitchingLines(s.dataset.pitching.filter((p) => p.gameId === current.game.id), [current.game]) : []), [current, s.dataset])

  return (
    <>
      <PageHeader eyebrow="Schedule" title="比賽" description={`${s.summaries.length} 場比賽符合篩選。點選任一場查看逐場攻守成績（Box Score）。`} />
      <DemoBanner />
      <Card flush>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => setOpen(r.id)} dense emptyTitle="沒有比賽" emptyDescription="調整篩選條件或匯入資料。" />
      </Card>
      <AnimatePresence>
        {current && (
          <motion.div key="box" role="dialog" aria-modal="true" aria-label="逐場成績" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[rgba(0,0,0,0.45)] backdrop-blur-sm" onClick={close} />
            <motion.div initial={reduced ? false : { y: 24, opacity: 0.01 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full sm:max-w-5xl max-h-[92vh] overflow-y-auto bg-surface border border-border rounded-t-[var(--radius)] sm:rounded-[var(--radius)] shadow-[var(--shadow-hover)] p-5 md:p-6 flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="eyebrow">{current.game.date}・{current.game.tournament}・{current.game.homeAway === '主' ? '主場' : '客場'}{current.game.venue ? `・${current.game.venue}` : ''}</div>
                  <h2 className="font-display font-bold text-[28px] leading-none text-ink mt-1 flex items-center gap-3">
                    {TEAM_NAME} <span className="tnum">{current.runsUs}</span> : <span className="tnum">{current.runsOpp}</span> {current.game.opponent}
                    {resultBadge(current.result)}{current.game.isDemo && <Badge variant="accent">示範</Badge>}
                  </h2>
                  {(current.game.winningPitcher || current.game.losingPitcher || current.game.savePitcher) && (
                    <p className="text-xs text-muted mt-2">{current.game.winningPitcher && `勝投 ${current.game.winningPitcher}`}{current.game.losingPitcher && `　敗投 ${current.game.losingPitcher}`}{current.game.savePitcher && `　救援 ${current.game.savePitcher}`}{current.game.recorder && `　紀錄 ${current.game.recorder}`}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={close} aria-label="關閉" className="w-9 px-0"><X /></Button>
              </div>
              <LineScore s={current} />
              <Card title="打擊" flush><DataTable columns={boxBat} rows={boxB} rowKey={(r) => r.name} dense /></Card>
              <Card title="投球" flush><DataTable columns={boxPit} rows={boxP} rowKey={(r) => r.name} dense /></Card>
              {current.game.note && <p className="text-xs text-muted">{current.game.note}</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
