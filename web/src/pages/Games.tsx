import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Pencil, Trash2, X } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { LineScoreBoard } from '../components/ui/Scoreboard'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Tabs } from '../components/ui/Tabs'
import { BattingPlayByPlay, PitchLegend, PitchingPlayByPlay } from '../components/ui/PlayByPlay'
import { Button } from '../components/ui/Button'
import { DataTable, type Column } from '../components/ui/DataTable'
import { DemoBanner } from '../components/ui/DemoBanner'
import { GameEditor } from '../components/ui/GameEditor'
import { useDataStore } from '../store/data'
import { extractGame } from '../data/edit'
import { auditGame } from '../data/audit'
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
  return (
    <LineScoreBoard innings={n} top={{ name: top.name, line: top.line, r: top.r, h: top.h, e: top.e, us: top.name === TEAM_NAME }} bottom={{ name: bottom.name, line: bottom.line, r: bottom.r, h: bottom.h, e: bottom.e, us: bottom.name === TEAM_NAME }} />
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
  const [tab, setTab] = useState<'box' | 'bat' | 'pit'>('box')
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; lines: string[] } | null>(null)
  const base = useDataStore((st) => st.base)
  const saveGame = useDataStore((st) => st.saveGame)
  const deleteGame = useDataStore((st) => st.deleteGame)
  const cloud = useDataStore((st) => st.cloud)
  // Editing is for signed-in recorders. Without Supabase there is no account system and the data only lives in this browser.
  const canEdit = !cloud.configured || (!!cloud.user && cloud.isEditor)
  useEffect(() => { const g = params.get('game'); if (g) setOpen(g) }, [params])
  useEffect(() => { setEditing(false); setNotice(null) }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing) close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const close = () => { setOpen(null); setEditing(false); if (params.get('game')) setParams({}, { replace: true }) }

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
  const current = s.summaries.find((g) => g.game.id === open) ?? null
  const editable = current && !current.game.isDemo ? extractGame(base, current.game.id) : null
  const boxB = useMemo(() => (current ? battingLines(s.dataset, s.dataset.batting.filter((p) => p.gameId === current.game.id)).sort((a, b) => (s.dataset.batting.find((p) => p.batter === a.name && p.gameId === current.game.id)?.order ?? 99) - (s.dataset.batting.find((p) => p.batter === b.name && p.gameId === current.game.id)?.order ?? 99)) : []), [current, s.dataset])
  const boxP = useMemo(() => (current ? pitchingLines(s.dataset.pitching.filter((p) => p.gameId === current.game.id), [current.game]) : []), [current, s.dataset])
  const pbpBat = useMemo(() => (current ? s.dataset.batting.filter((p) => p.gameId === current.game.id) : []), [current, s.dataset])
  const pbpPit = useMemo(() => (current ? s.dataset.pitching.filter((p) => p.gameId === current.game.id) : []), [current, s.dataset])
  const issues = useMemo(() => (current ? auditGame(pbpBat, pbpPit) : []), [current, pbpBat, pbpPit])
  const flags = useMemo(() => {
    const bat = new Map<number, string[]>(), pit = new Map<number, string[]>()
    for (const i of issues) { const m = i.side === 'bat' ? bat : pit; m.set(i.index, [...(m.get(i.index) ?? []), i.message]) }
    return { bat, pit }
  }, [issues])
  const [showIssues, setShowIssues] = useState(false)

  return (
    <>
      <PageHeader title="比賽" description={`${s.summaries.length} 場比賽符合篩選。點任一場查看逐局比分、Box Score 與逐打席的逐球紀錄。`} />
      <DemoBanner />
      <Card flush>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => setOpen(r.id)} dense emptyTitle="沒有比賽" emptyDescription="調整篩選條件或匯入資料。" />
      </Card>
      <AnimatePresence>
        {current && (
          <motion.div key="box" role="dialog" aria-modal="true" aria-label="逐場成績" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <div className="absolute inset-0 bg-black/45" onClick={close} />
            <motion.div initial={reduced ? false : { y: 16, opacity: 0.01 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full sm:max-w-5xl max-h-[92vh] overflow-y-auto bg-surface border border-border rounded-t-[14px] sm:rounded-[14px] shadow-[var(--shadow-modal)] flex flex-col [&>*]:shrink-0">
              <div className="sticky top-0 z-[3] bg-surface border-b border-border px-5 md:px-6 pt-5 pb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[12px] text-muted tnum">{current.game.date}・{current.game.tournament}・{current.game.homeAway === '主' ? '主場' : '客場'}{current.game.venue ? `・${current.game.venue}` : ''}</div>
                  <h2 className="text-[20px] md:text-[22px] font-semibold tracking-[-0.02em] leading-7 text-ink mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap">
                    <span>{TEAM_NAME} <span className="tnum">{current.runsUs}</span><span className="text-muted mx-1.5">:</span><span className="tnum">{current.runsOpp}</span> {current.game.opponent}</span>
                    <span className="inline-flex gap-1.5">{resultBadge(current.result)}{current.game.isDemo && <Badge variant="outline">示範</Badge>}</span>
                  </h2>
                  {(current.game.winningPitcher || current.game.losingPitcher || current.game.savePitcher || current.game.recorder) && (
                    <p className="text-[12px] text-ink-2 mt-1.5 flex flex-wrap gap-x-3">
                      {current.game.winningPitcher && <span><span className="text-muted">勝投</span> {current.game.winningPitcher}</span>}
                      {current.game.losingPitcher && <span><span className="text-muted">敗投</span> {current.game.losingPitcher}</span>}
                      {current.game.savePitcher && <span><span className="text-muted">救援</span> {current.game.savePitcher}</span>}
                      {current.game.recorder && <span><span className="text-muted">紀錄</span> {current.game.recorder}</span>}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {editable && !editing && canEdit && (
                    <>
                      <Button variant="outline" size="sm" icon={<Pencil />} onClick={() => { setNotice(null); setEditing(true) }} title="修改這場比賽的輸入資料（僅登入的紀錄員）">修改資料</Button>
                      <Button variant="ghost" size="sm" icon={<Trash2 />} aria-label="刪除這場比賽" title="刪除這場比賽" className="text-critical hover:text-critical" disabled={cloud.pushing}
                        onClick={() => { if (window.confirm(`確定刪除 ${current.game.id}（${current.game.date} vs ${current.game.opponent}）？這會移除這場所有打席與守備紀錄，無法復原。`)) void deleteGame(current.game.id).then(close).catch((e) => setNotice({ kind: 'warn', lines: [e instanceof Error ? e.message : String(e)] })) }} />
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={close} aria-label="關閉" icon={<X />} />
                </div>
              </div>
              <div className="px-5 md:px-6 py-5 flex flex-col gap-5 [&>*]:shrink-0">
                {notice && (
                  <div role="status" className={cx('flex items-start gap-2 rounded-[var(--radius-sm)] border px-3 py-2.5 text-[13px] text-ink', notice.kind === 'ok' ? 'border-[color-mix(in_srgb,var(--good)_35%,transparent)] bg-[color-mix(in_srgb,var(--good)_8%,transparent)]' : 'border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]')}>
                    {notice.kind === 'ok' ? <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-good" /> : <AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning" />}
                    <ul className="flex flex-col gap-0.5">{notice.lines.map((l) => <li key={l}>{l}</li>)}</ul>
                  </div>
                )}
                {editing && editable ? (
                  <GameEditor initial={editable} roster={base.roster.map((p) => p.name)} busy={cloud.pushing}
                    onCancel={() => setEditing(false)}
                    onSave={async (edit) => {
                      const warnings = await saveGame(edit)
                      setEditing(false)
                      setNotice(warnings.length ? { kind: 'warn', lines: ['已儲存。請核對：', ...warnings.map((w) => w.message)] } : { kind: 'ok', lines: ['已儲存，所有統計已重新計算。'] })
                    }}
                    onDelete={async () => { await deleteGame(current.game.id); close() }} />
                ) : (
                  <>
                <LineScore s={current} />
                <div className="flex items-center gap-3 flex-wrap">
                  <Tabs size="sm" aria-label="檢視" value={tab} onChange={setTab} items={[{ value: 'box', label: '攻守成績' }, { value: 'bat', label: '逐打席・打擊', count: pbpBat.length }, { value: 'pit', label: '逐打席・投球', count: pbpPit.length }]} />
                  {issues.length > 0 ? (
                    <button type="button" onClick={() => setShowIssues((v) => !v)} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-[12px] font-medium bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-ink cursor-pointer"><AlertTriangle className="size-3.5 text-warning" />{issues.length} 個可疑打席</button>
                  ) : <span className="inline-flex items-center gap-1.5 text-[12px] text-muted"><CheckCircle2 className="size-3.5 text-good" />記錄檢查通過</span>}
                </div>
                {showIssues && issues.length > 0 && (
                  <ul className="rounded-[var(--radius-sm)] border border-border divide-y divide-[var(--border)] text-[12px]">
                    {issues.map((i, k) => <li key={k} className="px-3 py-2 flex gap-2 items-start"><AlertTriangle className="size-3.5 text-warning shrink-0 mt-0.5" /><button type="button" className="text-left text-ink hover:underline cursor-pointer" onClick={() => setTab(i.side)}>{i.message}</button></li>)}
                  </ul>
                )}
                {tab === 'box' && (
                  <>
                    <Card title="打擊" flush><DataTable columns={boxBat} rows={boxB} rowKey={(r) => r.name} dense /></Card>
                    <Card title="投球" flush><DataTable columns={boxPit} rows={boxP} rowKey={(r) => r.name} dense /></Card>
                  </>
                )}
                {tab === 'bat' && <Card title="我隊打擊・逐球紀錄" subtitle="每一列是一個打席，依局數分組" action={<PitchLegend />} flush><BattingPlayByPlay pas={pbpBat} flags={flags.bat} /></Card>}
                {tab === 'pit' && <Card title="我隊投手・逐球紀錄" subtitle="對方每個打席；換投以分隔線標示" action={<PitchLegend />} flush><PitchingPlayByPlay pas={pbpPit} flags={flags.pit} /></Card>}
                {current.game.note && <p className="text-[12px] text-muted">{current.game.note}</p>}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
