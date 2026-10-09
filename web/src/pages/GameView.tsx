import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Camera, CheckCircle2, Download, Info, Maximize2, Pencil, Trash2, X } from 'lucide-react'
import { LineScoreBoard, PlateBadge, Stitches } from '../components/ui/Scoreboard'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Tabs } from '../components/ui/Tabs'
import { BattingPlayByPlay, PitchLegend, PitchingPlayByPlay } from '../components/ui/PlayByPlay'
import { Button } from '../components/ui/Button'
import { DataTable, type Column } from '../components/ui/DataTable'
import { GameEditor } from '../components/ui/GameEditor'
import { rosterNames } from '../components/ui/PlayerSelect'
import { RosterSortToggle, useRosterSort } from '../components/ui/RosterSortToggle'
import { sortNames } from '../data/rosterSort'
import { useDataStore } from '../store/data'
import { extractGame, reconcileFielding } from '../data/edit'
import { applyStealRepairs, stealRepairs } from '../data/stealRepair'
import { applyEarnedRepairs, earnedRepairs } from '../record/earned'
import { auditGame } from '../data/audit'
import { gameAppearances, SUB_KIND_LABEL, type AppearanceRow, type GameAppearances } from '../data/gameRoster'
import { gameRecap } from '../data/recap'
import { gameTimeText } from '../data/gameTime'
import { useStats } from '../hooks/useStats'
import { battingLines, pitchingLines, type BattingLine, type GameSummary, type PitchingLine } from '../data/stats'
import { f2, f3, pct, signedPts } from '../lib/fmt'
import { WinProbChart } from '../components/charts/WinProbChart'
import { KeyPlays } from '../components/ui/KeyPlays'
import { WinModelNote, winRulesText } from '../components/ui/WinModelNote'
import { useWinData } from '../hooks/useWinData'
import { keyPlays, keyRowSets, rowWins, withWinBatting, withWinPitching, WPA_DISCLAIMER, type GameEvent } from '../data/winTimeline'
import { TEAM_NAME } from '../data/seed'
import { cx } from '../lib/format'
import { downloadGameImage } from '../lib/shareImage'

export const resultBadge = (r: 'W' | 'L' | 'T') => (r === 'W' ? <Badge variant="good">勝</Badge> : r === 'L' ? <Badge variant="critical">敗</Badge> : <Badge>和</Badge>)

/** What the game check (data/audit.ts) actually looks at, so 已核對 never claims more than it checked. */
const AUDIT_SCOPE = '出局順序、逐球與結果、得分代碼、打點與得分、盜壘次數與跑壘紀錄'

const posChip = 'inline-flex items-center justify-center h-5 min-w-8 px-1.5 rounded-[6px] bg-surface-2 text-[11px] font-medium text-ink-2 tnum shrink-0'
const nameBtn = 'min-w-0 h-9 pointer-fine:h-7 truncate text-left text-[13px] font-medium text-ink hover:underline underline-offset-2 cursor-pointer'
const halfLabel = (r: AppearanceRow) => (r.inning ? `第${r.inning}局${r.half === 'bottom' ? '下' : '上'}` : '')

/** 當日登錄名單: starters, who came in (with the logged kind / inning / replaced player) and who sat. */
function DayRosterCard({ a, hasRoster, reentry, onPlayer }: { a: GameAppearances; hasRoster: boolean; reentry: boolean; onPlayer: (r: { name: string }) => void }) {
  // without a saved roster the bench is unknown, so 未上場 only shows when there is something to list
  const showBench = !a.inferred || a.bench.length > 0
  const group = (title: string, count: number, body: ReactNode) => (
    <section className="px-5 py-4 min-w-0">
      <h4 className="text-[11px] font-medium text-muted mb-2">{title} <span className="tnum">{count}</span></h4>
      {body}
    </section>
  )
  const none = <p className="text-[12px] text-muted">—</p>
  return (
    <Card title="當日登錄名單" flush
      subtitle={!a.inferred ? '點球員看個人檔案' : hasRoster ? '登錄名單沒有填先發，先發與替補由紀錄推定' : '這場沒有登錄名單，先發與替補由紀錄推定'}
      action={<span className="flex items-center gap-2 flex-wrap justify-end">{reentry && <Badge variant="outline">允許再上場</Badge>}{a.bench.length > 1 && <RosterSortToggle />}</span>}>
      <div className={cx('grid grid-cols-1 divide-y md:divide-y-0 md:divide-x divide-[var(--border)]', showBench ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
        {group('先發', a.starters.length, a.starters.length ? (
          <ul className="flex flex-col">
            {a.starters.map((r) => (
              <li key={r.name} className="flex items-center gap-2.5 min-h-9 pointer-fine:min-h-8">
                <PlateBadge size={22} active={r.order !== undefined}>{r.order ?? 'P'}</PlateBadge>
                <span className={posChip}>{r.pos || '—'}</span>
                <button type="button" className={nameBtn} onClick={() => onPlayer(r)}>{r.name}</button>
              </li>
            ))}
          </ul>
        ) : <p className="text-[12px] text-muted">打席沒有棒次，無法推定先發</p>)}
        {group('替補上場', a.subs.length, a.subs.length ? (
          <ul className="flex flex-col">
            {a.subs.map((r, i) => (
              <li key={`${r.name}-${i}`} className="flex items-center gap-x-2 gap-y-0.5 flex-wrap min-h-9 pointer-fine:min-h-8 py-1">
                <button type="button" className={nameBtn} onClick={() => onPlayer(r)}>{r.name}</button>
                {r.kind ? <Badge variant={r.kind === 'P' ? 'accent' : 'neutral'}>{SUB_KIND_LABEL[r.kind]}</Badge> : r.pos && <span className={posChip}>{r.pos}</span>}
                <span className="text-[12px] text-muted tnum">{[halfLabel(r), r.replaced && `替 ${r.replaced}`, r.kind === 'DEF' && r.pos].filter(Boolean).join('・')}</span>
              </li>
            ))}
          </ul>
        ) : none)}
        {showBench && group('未上場', a.bench.length, a.bench.length ? (
          <div className="flex flex-wrap gap-1.5">
            {a.bench.map((n) => <button key={n} type="button" onClick={() => onPlayer({ name: n })} className="h-9 pointer-fine:h-7 px-2.5 rounded-full border border-border text-[12px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer transition-colors motion-reduce:transition-none">{n}</button>)}
          </div>
        ) : <p className="text-[12px] text-muted">到場的人都上場了</p>)}
      </div>
    </Card>
  )
}

function LineScore({ s }: { s: GameSummary }) {
  const n = Math.max(s.lineUs.length, s.lineOpp.length)
  // each team's E is the errors that team made (ours from our fielding lines, theirs from our batters reaching on 失誤)
  const opp = { name: s.game.opponent, line: s.lineOpp, r: s.runsOpp, h: s.hitsOpp, e: s.errorsOpp }
  const us = { name: TEAM_NAME, line: s.lineUs, r: s.runsUs, h: s.hitsUs, e: s.errorsUs }
  const top = s.game.homeAway === '主' ? opp : us
  const bottom = s.game.homeAway === '主' ? us : opp
  return (
    <LineScoreBoard innings={n} top={{ name: top.name, line: top.line, r: top.r, h: top.h, e: top.e, us: top.name === TEAM_NAME }} bottom={{ name: bottom.name, line: bottom.line, r: bottom.r, h: bottom.h, e: bottom.e, us: bottom.name === TEAM_NAME }} />
  )
}

const boxBat: Column<BattingLine>[] = [
  { key: 'name', header: '打者', className: 'font-medium' }, { key: 'pa', header: 'PA', align: 'right' }, { key: 'ab', header: 'AB', align: 'right' }, { key: 'r', header: 'R', align: 'right' }, { key: 'h', header: 'H', align: 'right' }, { key: 'h2', header: '2B', align: 'right' }, { key: 'hr', header: 'HR', align: 'right' }, { key: 'rbi', header: 'RBI', align: 'right' }, { key: 'bb', header: 'BB', align: 'right' }, { key: 'so', header: 'SO', align: 'right' }, { key: 'sb', header: 'SB', align: 'right' },
  { key: 'pitches', header: '用球', align: 'right' }, { key: 'avg', header: 'AVG', align: 'right', format: (v) => f3(v as number | null) },
  // 獲勝機率增加值 in this game (percentage points)
  { key: 'wpa', header: 'WPA', align: 'right', format: (v) => signedPts(v as number | null) },
]
const boxPit: Column<PitchingLine>[] = [
  { key: 'name', header: '投手', className: 'font-medium' }, { key: 'outs', header: 'IP', align: 'right', format: (_, r) => r.ipDisplay }, { key: 'bf', header: 'BF', align: 'right' }, { key: 'pc', header: 'PC', align: 'right' }, { key: 'strikes', header: '好球', align: 'right' }, { key: 'k', header: 'K', align: 'right' }, { key: 'bb', header: 'BB', align: 'right' }, { key: 'hbp', header: 'HBP', align: 'right' }, { key: 'h', header: 'H', align: 'right' }, { key: 'r', header: 'R', align: 'right' }, { key: 'er', header: 'ER', align: 'right' },
  { key: 'era', header: 'ERA', align: 'right', format: (v) => f2(v as number | null) }, { key: 'cswPct', header: 'CSW%', align: 'right', format: (v) => pct(v as number | null) },
  { key: 'wpa', header: 'WPA', align: 'right', format: (v) => signedPts(v as number | null) },
]

/** Model note under the chart: what it was built from, and when to read it with care. */
function winNotes(trainGames: number, trainPas: number, rules: string, approxHalves: number, halves: number): string[] {
  const out = [trainGames
    ? `模型依本隊 ${trainGames} 場比賽（雙方共 ${trainPas} 個打席）建立，假設兩隊實力相當；${rules}。`
    : `模型還沒有本隊有壘上紀錄的比賽可以用，目前全用業餘比賽的預設值，假設兩隊實力相當；${rules}。`]
  if (approxHalves) out.push(`這場有 ${approxHalves} 個半局沒有完整的壘上紀錄，那幾段依打擊結果推估。`)
  if (halves < 60) out.push('比賽還不多，模型大多用預設值，數字僅供參考。')
  return out
}


export type GameTab = 'summary' | 'box' | 'bat' | 'pit' | 'roster'

/**
 * One game: score, then 摘要 (the recap, checkable), 攻守成績 (box score), 逐球 for each side, and the 當日登錄名單.
 * `sheet` is the quick view over the games list; `page` is the full game page (/games/:id) with the score and the
 * tabs pinned while reading. Recorders can correct the game from either.
 */
export function GameView({ summary: current, mode, onClose, initialTab = 'summary', inning }: { summary: GameSummary; mode: 'sheet' | 'page'; onClose: () => void; initialTab?: GameTab; inning?: number }) {
  const s = useStats()
  const navigate = useNavigate()
  const openPlayer = (r: { name: string }) => navigate(`/players?player=${encodeURIComponent(r.name)}`)
  const openPitcher = (r: { name: string }) => navigate(`/players?player=${encodeURIComponent(r.name)}&tab=pitching`)
  const [tab, setTab] = useState<GameTab>(initialTab)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; lines: string[] } | null>(null)
  const [showIssues, setShowIssues] = useState(false)
  const base = useDataStore((st) => st.base)
  const sortMode = useRosterSort()
  const saveGame = useDataStore((st) => st.saveGame)
  const deleteGame = useDataStore((st) => st.deleteGame)
  const cloud = useDataStore((st) => st.cloud)
  const albums = useDataStore((st) => st.albums)
  // Editing is for signed-in recorders. Without Supabase there is no account system and the data only lives in this browser.
  const canEdit = !cloud.configured || (!!cloud.user && cloud.isEditor)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing && mode === 'sheet') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const id = current.game.id
  const gameAlbums = useMemo(() => albums.filter((a) => a.gameId === id), [albums, id])
  const editable = !current.game.isDemo ? extractGame(base, id) : null
  const boxB = useMemo(() => {
    const pas = s.dataset.batting.filter((p) => p.gameId === id)
    // batting-order slot (a 代跑 who never batted sits in the slot he ran for), then first appearance
    const at = (name: string) => { const i = pas.findIndex((p) => p.batter === name || p.runner === name); return (pas[i]?.order ?? 99) * 1000 + i }
    return battingLines(s.dataset, pas).sort((a, b) => at(a.name) - at(b.name))
  }, [id, s.dataset])
  const pbpBat = useMemo(() => s.dataset.batting.filter((p) => p.gameId === id), [id, s.dataset])
  const pbpPit = useMemo(() => s.dataset.pitching.filter((p) => p.gameId === id), [id, s.dataset])
  // 獲勝機率: this game's events, its key plays, and WPA on the box score and the 逐球 rows
  const win = useWinData()
  const winEvents = useMemo(() => win.events.get(id) ?? [], [win, id])
  const keys = useMemo(() => keyPlays(winEvents, 5), [winEvents])
  const keyRows = useMemo(() => keyRowSets(keys), [keys])
  const winRows = useMemo(() => ({ bat: rowWins(pbpBat, win.bat), pit: rowWins(pbpPit, win.pit) }), [pbpBat, pbpPit, win])
  const [modelNote, setModelNote] = useState(false)
  const boxBatRows = useMemo(() => withWinBatting(boxB, pbpBat, win), [boxB, pbpBat, win])
  const boxP = useMemo(() => withWinPitching(pitchingLines(pbpPit, [current.game]), pbpPit, win), [pbpPit, current.game, win])
  const issues = useMemo(() => auditGame(pbpBat, pbpPit), [pbpBat, pbpPit])
  // from the unfiltered dataset: the 守位 filter would hide substitutes
  const appearances = useMemo(() => gameAppearances(s.dataset, current.game), [current.game, s.dataset])
  const recap = useMemo(() => gameRecap(current, s.dataset, TEAM_NAME), [current, s.dataset])
  // 盜壘 counts higher than the runner plays show (left by an older editor): one confirmed click lowers them
  const repairs = useMemo(() => stealRepairs(pbpBat, pbpPit), [pbpBat, pbpPit])
  const repairSteals = async () => {
    if (!editable || !repairs.length) return
    const list = repairs.map((f) => `第 ${f.inning} 局 ${f.name}：${f.from} → ${f.to}`).join('\n')
    if (!window.confirm(`依跑壘紀錄修正盜壘次數（只會調低、不會調高）：\n\n${list}\n\n確定要儲存嗎？`)) return
    const fixed = applyStealRepairs(editable.batting, editable.pitching, repairs)
    const fielding = reconcileFielding(editable.fielding, editable.game, { batting: editable.batting, pitching: editable.pitching }, fixed)
    try {
      const warnings = await saveGame({ ...editable, ...fixed, fielding })
      setNotice(warnings.length ? { kind: 'warn', lines: ['盜壘次數已修正並儲存。請核對：', ...warnings.map((w) => w.message)] } : { kind: 'ok', lines: [`盜壘次數已依跑壘紀錄修正（${repairs.length} 處），所有統計已重新計算。`] })
    } catch (e) { setNotice({ kind: 'warn', lines: [e instanceof Error ? e.message : String(e)] }) }
  }
  // 自責／非自責 that differ from what the rules say (games recorded before the rules, or calls made by hand): shown to
  // recorders only, since a call by hand can be right (a muffed foul fly…); one confirmed click applies the rules
  const earnedFixes = useMemo(() => (editable && canEdit ? earnedRepairs(pbpPit) : []), [editable, canEdit, pbpPit])
  const earnedLabel = (c: 'R' | 'ER') => (c === 'ER' ? '自責' : '非自責')
  const repairEarned = async () => {
    if (!editable || !earnedFixes.length) return
    const list = earnedFixes.map((f) => `第 ${f.inning} 局 ${f.name}：${earnedLabel(f.from)} → ${earnedLabel(f.to)}${f.why ? `（${f.why}）` : ''}`).join('\n')
    if (!window.confirm(`依規則重新判定自責分：\n\n${list}\n\n確定要儲存嗎？`)) return
    try {
      const warnings = await saveGame({ ...editable, pitching: applyEarnedRepairs(editable.pitching, earnedFixes) })
      setNotice(warnings.length ? { kind: 'warn', lines: ['自責分已重新判定並儲存。請核對：', ...warnings.map((w) => w.message)] } : { kind: 'ok', lines: [`自責分已依規則重新判定（${earnedFixes.length} 分），防禦率等統計已重新計算。`] })
    } catch (e) { setNotice({ kind: 'warn', lines: [e instanceof Error ? e.message : String(e)] }) }
  }
  const flags = useMemo(() => {
    const bat = new Map<number, string[]>(), pit = new Map<number, string[]>()
    for (const i of issues) { const m = i.side === 'bat' ? bat : pit; m.set(i.index, [...(m.get(i.index) ?? []), i.message]) }
    return { bat, pit }
  }, [issues])
  // open a half-inning in its 逐球 tab (from the recap, or a link with ?inning=)
  const [target, setTarget] = useState<number | undefined>(inning)
  const goInning = (side: 'bat' | 'pit', n: number) => { setTab(side); setTarget(n) }
  const pickEvent = (e: GameEvent) => goInning(e.side, e.inning)
  useEffect(() => {
    if (!target || (tab !== 'bat' && tab !== 'pit')) return
    const el = document.getElementById(`inning-${target}`)
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }, [target, tab])
  const shareImage = () => {
    const g = current.game
    downloadGameImage({
      teamName: TEAM_NAME, opponent: g.opponent, date: g.date, meta: [g.date, g.tournament, g.homeAway === '主' ? '主場' : '客場', g.venue].filter(Boolean).join('・'),
      result: current.result, runsUs: current.runsUs, runsOpp: current.runsOpp, lineUs: current.lineUs, lineOpp: current.lineOpp,
      hitsUs: current.hitsUs, hitsOpp: current.hitsOpp, errorsUs: current.errorsUs, errorsOpp: current.errorsOpp, weTop: g.homeAway === '客',
      lines: recap.map((l) => ({ label: l.label, text: l.text })),
      footer: `${TEAM_NAME} 數據平台・單場紀錄 ${g.id}${issues.length ? `・有 ${issues.length} 項待核對` : ''}`,
    })
  }

  const tabs = [
    { value: 'summary' as const, label: '摘要' }, { value: 'box' as const, label: '攻守成績' },
    { value: 'bat' as const, label: '逐球・打擊', count: pbpBat.length }, { value: 'pit' as const, label: '逐球・投球', count: pbpPit.length },
    { value: 'roster' as const, label: '登錄名單' },
  ]
  const page = mode === 'page'
  return (
    <>
      <div className={cx('sticky z-[3] bg-surface border-b border-border px-5 md:px-6 pt-3 sm:pt-5 pb-3 flex flex-col gap-3', page ? 'top-[var(--topbar-h)] -mx-4 md:-mx-10 md:px-10 rounded-none' : 'top-0')}>
        <div className="flex flex-col-reverse sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
          <div className="min-w-0">
            <div className="text-[12px] text-muted tnum">{current.game.date}・{current.game.tournament}・{current.game.homeAway === '主' ? '主場' : '客場'}{current.game.venue ? `・${current.game.venue}` : ''}{gameTimeText(current.game) ? `・${gameTimeText(current.game)}` : ''}</div>
            <h2 className="text-[20px] md:text-[22px] font-semibold tracking-[-0.02em] leading-7 text-ink mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap">
              <span>{TEAM_NAME} <span className="tnum">{current.runsUs}</span><span className="text-muted mx-1.5">:</span><span className="tnum">{current.runsOpp}</span> {current.game.opponent}</span>
              <span className="inline-flex gap-1.5">{resultBadge(current.result)}{current.game.isDemo && <Badge variant="outline">示範</Badge>}</span>
            </h2>
            {(current.game.winningPitcher || current.game.losingPitcher || current.game.savePitcher || current.game.holds?.length || current.game.recorder) && (
              <p className="text-[12px] text-ink-2 mt-1.5 flex flex-wrap gap-x-3">
                {current.game.winningPitcher && <span><span className="text-muted">勝投</span> {current.game.winningPitcher}</span>}
                {current.game.losingPitcher && <span><span className="text-muted">敗投</span> {current.game.losingPitcher}</span>}
                {current.game.savePitcher && <span><span className="text-muted">救援</span> {current.game.savePitcher}</span>}
                {!!current.game.holds?.length && <span><span className="text-muted">中繼</span> {current.game.holds.join('、')}</span>}
                {current.game.recorder && <span><span className="text-muted">紀錄</span> {current.game.recorder}</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end -mr-2 sm:mr-0">
            {!page && <Button variant="ghost" size="sm" icon={<Maximize2 />} to={`/games/${encodeURIComponent(id)}`} title="開啟完整比賽頁（可分享、可直接連到某一局）">完整頁</Button>}
            <Button variant="ghost" size="sm" icon={<Download />} onClick={shareImage} title="下載這場的戰報圖（PNG）">戰報圖</Button>
            {gameAlbums.length === 1 ? <Button variant="ghost" size="sm" icon={<Camera />} href={gameAlbums[0].url} title="開啟這場的相簿">相簿</Button> : gameAlbums.length > 1 ? <Button variant="ghost" size="sm" icon={<Camera />} to="/photos" title="這場有多本相簿">相簿 {gameAlbums.length}</Button> : null}
            {editable && !editing && canEdit && (
              <>
                <Button variant="outline" size="sm" icon={<Pencil />} onClick={() => { setNotice(null); setEditing(true) }} title="修改這場比賽的輸入資料（僅登入的紀錄員）">修改資料</Button>
                <Button variant="ghost" size="sm" icon={<Trash2 />} aria-label="刪除這場比賽" title="刪除這場比賽" className="text-critical hover:text-critical" disabled={cloud.pushing}
                  onClick={() => { if (window.confirm(`確定刪除 ${id}（${current.game.date} vs ${current.game.opponent}）？這會移除這場所有打席與守備紀錄，無法復原。`)) void deleteGame(id).then(onClose).catch((e) => setNotice({ kind: 'warn', lines: [e instanceof Error ? e.message : String(e)] })) }} />
              </>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} aria-label={page ? '回比賽列表' : '關閉'} icon={<X />} />
          </div>
        </div>
        {!editing && (
          <div className="flex items-center gap-3 flex-wrap">
            <Tabs size="sm" aria-label="檢視" value={tab} onChange={(t) => { setTab(t); setTarget(undefined) }} items={tabs} />
            {issues.length > 0 ? (
              <button type="button" onClick={() => setShowIssues((v) => !v)} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-[12px] font-medium bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-ink cursor-pointer"><AlertTriangle className="size-3.5 text-warning" />{issues.length} 項待核對</button>
            ) : <span className="inline-flex items-center gap-1.5 text-[12px] text-muted"><CheckCircle2 className="size-3.5 text-good" />已核對：{AUDIT_SCOPE}</span>}
          </div>
        )}
      </div>
      <div className={cx('flex flex-col gap-5 [&>*]:shrink-0', page ? 'py-5' : 'px-5 md:px-6 py-5')}>
        {notice && (
          <div role="status" className={cx('flex items-start gap-2 rounded-[var(--radius-sm)] border px-3 py-2.5 text-[13px] text-ink', notice.kind === 'ok' ? 'border-[color-mix(in_srgb,var(--good)_35%,transparent)] bg-[color-mix(in_srgb,var(--good)_8%,transparent)]' : 'border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]')}>
            {notice.kind === 'ok' ? <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-good" /> : <AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning" />}
            <ul className="flex flex-col gap-0.5">{notice.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        )}
        {editing && editable ? (
          <GameEditor initial={editable} roster={rosterNames(base.roster, sortMode)} busy={cloud.pushing}
            onCancel={() => setEditing(false)}
            onSave={async (edit) => {
              const warnings = await saveGame(edit)
              setEditing(false)
              setNotice(warnings.length ? { kind: 'warn', lines: ['已儲存。請核對：', ...warnings.map((w) => w.message)] } : { kind: 'ok', lines: ['已儲存，所有統計已重新計算。'] })
            }}
            onDelete={async () => { await deleteGame(id); onClose() }} />
        ) : (
          <>
            {showIssues && issues.length > 0 && (
              <ul className="rounded-[var(--radius-sm)] border border-border divide-y divide-[var(--border)] text-[12px]">
                {issues.map((i, k) => <li key={k} className="px-3 py-2 flex gap-2 items-start"><AlertTriangle className="size-3.5 text-warning shrink-0 mt-0.5" /><button type="button" className="text-left text-ink hover:underline cursor-pointer" onClick={() => setTab(i.side)}>{i.message}</button></li>)}
                {repairs.length > 0 && (
                  <li className="px-3 py-2.5 flex flex-col gap-2 bg-surface-2/50">
                    <span className="text-ink-2">盜壘次數比跑壘紀錄多 {repairs.length} 處：{repairs.map((f) => `${f.name} ${f.from}→${f.to}`).join('、')}。這通常是舊版「修改資料」重複計算造成的。</span>
                    {editable && canEdit
                      ? <Button size="sm" variant="outline" className="self-start" disabled={cloud.pushing} onClick={() => void repairSteals()}>依跑壘紀錄修正盜壘次數</Button>
                      : <span className="text-muted">登入紀錄員帳號後可以一鍵修正。</span>}
                  </li>
                )}
              </ul>
            )}
            {earnedFixes.length > 0 && (
              <div className="rounded-[var(--radius-sm)] border border-border bg-surface-2/50 px-3 py-2.5 flex flex-col gap-2 text-[12px]">
                <span className="font-medium text-ink">自責分判定：有 {earnedFixes.length} 分和規則判定不同</span>
                <ul className="flex flex-col gap-0.5 text-ink-2">
                  {earnedFixes.map((f) => <li key={f.index}>第 {f.inning} 局 {f.name}：目前{earnedLabel(f.from)}，依規則是<span className="font-medium text-ink">{earnedLabel(f.to)}</span>{f.why ? `（${f.why}）` : ''}</li>)}
                </ul>
                <span className="text-muted">系統依失誤、捕逸把這半局重建一次來判定（規則 9.16）。如果是你刻意的判定（例如漏接界外飛球讓打者多了機會），可以不用理會；這段只有紀錄員看得到。</span>
                <Button size="sm" variant="outline" className="self-start" disabled={cloud.pushing} onClick={() => void repairEarned()}>依規則重新判定自責分</Button>
              </div>
            )}
            <LineScore s={current} />
            {tab === 'summary' && (
              <Card title="戰報摘要" subtitle={issues.length ? `這場有 ${issues.length} 項待核對，摘要依目前紀錄產生，僅供參考` : '依這場的紀錄產生；點局數看那半局的逐球、點球員看個人檔案'}>
                {recap.length === 0 ? <p className="text-[13px] text-muted">這場的紀錄還不足以寫摘要。</p> : (
                  <ul className="flex flex-col gap-3.5">
                    {recap.map((l) => (
                      <li key={l.kind} className="flex flex-col gap-1">
                        <span className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-accent"><Stitches width={24} />{l.label}</span>
                        <p className="text-[14px] text-ink leading-relaxed">{l.text}</p>
                        <span className="flex gap-3 text-[12px]">
                          {l.inning && l.side && <button type="button" onClick={() => goInning(l.side!, l.inning!)} className="text-ink-2 underline underline-offset-2 cursor-pointer hover:text-ink">看第 {l.inning} 局逐球</button>}
                          {l.player && <Link to={`/players?player=${encodeURIComponent(l.player)}${l.kind === 'pitch' ? '&tab=pitching' : ''}`} className="text-ink-2 underline underline-offset-2 hover:text-ink">看 {l.player}</Link>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
            {tab === 'summary' && (
              <>
                <Card title="獲勝機率走勢" subtitle={`${TEAM_NAME}每個打席後的獲勝機率。描述這場發生了什麼，不代表預測能力。`}
                  action={<Button variant="ghost" size="sm" icon={<Info />} aria-expanded={modelNote} onClick={() => setModelNote((v) => !v)}>模型說明</Button>}>
                  <div className="flex flex-col gap-3">
                    <WinProbChart events={winEvents} rows={{ bat: pbpBat, pit: pbpPit }} teamName={TEAM_NAME} resultLabel={current.result === 'W' ? '勝' : current.result === 'L' ? '敗' : '和'} onPick={pickEvent} />
                    {winEvents.length > 0 && (
                      <div className="flex flex-col gap-0.5 text-[12px] text-muted">
                        {winNotes(win.coverage.trainGames, win.coverage.trainPas, winRulesText(win.rules), win.approxHalves.get(id) ?? 0, win.model.run.sample.halves).map((t) => <p key={t}>{t}</p>)}
                      </div>
                    )}
                    {modelNote && <div className="border-t border-border pt-4"><WinModelNote win={win} /></div>}
                  </div>
                </Card>
                {keys.length > 0 && (
                  <Card title="本場關鍵 5 打席" subtitle="依獲勝機率變化排序；點一下看那半局的逐球。描述這場發生了什麼，不代表預測能力。">
                    <KeyPlays events={keys} rows={{ bat: pbpBat, pit: pbpPit }} onPick={pickEvent} />
                  </Card>
                )}
              </>
            )}
            {(tab === 'summary' || tab === 'box') && (
              <>
                <Card title="打擊" subtitle="點球員看個人檔案" flush><DataTable columns={boxBat} rows={boxBatRows} rowKey={(r) => r.name} onRowClick={openPlayer} dense /></Card>
                <Card title="投球" flush><DataTable columns={boxPit} rows={boxP} rowKey={(r) => r.name} onRowClick={openPitcher} dense /></Card>
              </>
            )}
            {tab === 'bat' && <Card title="我隊打擊・逐球紀錄" subtitle={`每一列是一個打席，依局數分組${winRows.bat.size ? `；WPA ${WPA_DISCLAIMER}` : ''}`} action={<PitchLegend />} flush><BattingPlayByPlay pas={pbpBat} flags={flags.bat} win={winRows.bat} keyRows={keyRows.bat} /></Card>}
            {tab === 'pit' && <Card title="我隊投手・逐球紀錄" subtitle={`對方每個打席；換投以分隔線標示${winRows.pit.size ? `；WPA ${WPA_DISCLAIMER}` : ''}`} action={<PitchLegend />} flush><PitchingPlayByPlay pas={pbpPit} flags={flags.pit} win={winRows.pit} keyRows={keyRows.pit} /></Card>}
            {tab === 'roster' && <DayRosterCard a={{ ...appearances, bench: sortNames(appearances.bench, base.roster, sortMode) }} hasRoster={!!current.game.dayRoster} reentry={!!current.game.dayRoster?.reentry} onPlayer={openPlayer} />}
            {current.game.note && <p className="text-[12px] text-muted">{current.game.note}</p>}
          </>
        )}
      </div>
    </>
  )
}
