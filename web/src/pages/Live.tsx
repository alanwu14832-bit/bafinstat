import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Badge } from '../components/ui/Badge'
import { Diamond } from '../record/Diamond'
import { AnimatePresence, motion } from 'framer-motion'
import { BOARD, CountLights, LineScoreBoard } from '../components/ui/Scoreboard'
import { TeamLogo } from '../components/ui/TeamLogo'
import { OppMark } from '../components/ui/GameCard'
import { Maximize2, Minimize2 } from 'lucide-react'
import { usePrefersReducedMotion } from '../hooks/useMediaQuery'
import { RollingNumber } from '../components/motion/RollingNumber'
import { EASE } from '../components/motion/Reveal'
import { readDraft } from '../record/draft'
import { count, offense, score, type RecordState } from '../record/model'
import { cloudConfigured, listCloudDrafts } from '../data/supabase'
import { useDataStore } from '../store/data'
import { TEAM_NAME } from '../data/seed'
import { HIT_BASE_COUNT } from '../data/types'
import { cx } from '../lib/format'

const POLL_MS = 5000

/** Public live scoreboard. Reads the in-progress state the recorder's device keeps in sync (cloud), or this device's own draft. */
export function LivePage() {
  const [drafts, setDrafts] = useState<Array<{ state: RecordState; updatedAt: string; by?: string | null }>>([])
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const base = useDataStore((s) => s.base)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        if (cloudConfigured) {
          const d = await listCloudDrafts<RecordState>()
          if (!alive) return
          if (d === null) { setError('雲端尚未建立 record_drafts 表，無法顯示即時比分'); return }
          setDrafts(d.map((x) => ({ state: x.state, updatedAt: x.updated_at, by: x.updated_by })))
        } else {
          const local = readDraft()
          setDrafts(local ? [{ state: local, updatedAt: local.updatedAt ?? local.startedAt }] : [])
        }
        setError(null)
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : String(e)) }
    }
    void load()
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') { void load(); setTick((t) => t + 1) } }, POLL_MS)
    return () => { alive = false; window.clearInterval(id) }
  }, [])

  const live = useMemo(() => drafts.filter((d) => !d.state.finished).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0] ?? null, [drafts])
  const lastFinal = useMemo(() => [...base.games].filter((g) => !g.status).sort((a, b) => (a.date < b.date ? 1 : -1))[0], [base.games])
  const today = new Date().toISOString().slice(0, 10)
  const nextGame = useMemo(() => base.games.filter((g) => g.status === 'scheduled' && g.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0], [base.games, today])
  void tick

  if (!live) {
    return (
      <>
        <PageHeader title="即時比分" description="紀錄員在「紀錄比賽」逐球輸入時，這一頁會每 5 秒自動更新，不需登入。" />
        <Card>
          <EmptyState title="目前沒有進行中的比賽" description={error ?? (nextGame ? `下一場：${nextGame.date}${nextGame.time ? ` ${nextGame.time}` : ''} vs ${nextGame.opponent}${nextGame.venue ? `・${nextGame.venue}` : ''}` : lastFinal ? `最近一場：${lastFinal.date} vs ${lastFinal.opponent}，到「比賽」頁查看完整成績。` : undefined)}
            action={<span className="inline-flex gap-4 text-[13px]">{nextGame && <Link to="/games?view=schedule" className="underline underline-offset-2 text-ink">看賽程</Link>}{lastFinal && <Link to={`/games?game=${encodeURIComponent(lastFinal.id)}`} className="underline underline-offset-2 text-ink">看最近一場</Link>}</span>} />
        </Card>
      </>
    )
  }

  return <LiveBoard live={live} error={error} />
}

const NON_AB = new Set(['保送', '故四', '觸身', '犧觸', '犧牲', '犧飛', '妨礙'])
// the board is always dark: the team colour is lifted toward the board's ink so a navy or a dark amber still glows
const BOARD_ACCENT = 'color-mix(in srgb, var(--accent) 62%, #f3efe7)'
const LED_DOTS = 'radial-gradient(rgba(255,255,255,0.055) 0.9px, transparent 1.3px)'
const PITCH_LED: Record<string, { label: string; color: string }> = {
  B: { label: 'B', color: BOARD.ball }, S: { label: 'S', color: BOARD.strike }, CS: { label: 'S', color: BOARD.strike }, SS: { label: 'S', color: BOARD.out }, F: { label: 'F', color: BOARD.strike }, IP: { label: 'X', color: BOARD.ink },
}

/** The pitches of the plate appearance in progress as small lit squares, like the count panel on a stadium board. */
function BoardPitches({ pitches }: { pitches: string[] }) {
  if (!pitches.length) return <span style={{ color: BOARD.muted }}>第一球</span>
  return (
    <span className="inline-flex flex-wrap gap-1" aria-label={`本打席 ${pitches.length} 球`}>
      {pitches.map((p, i) => {
        const l = PITCH_LED[p] ?? { label: p, color: BOARD.muted }
        return <span key={i} className="figure inline-flex items-center justify-center size-6 rounded-[5px] text-[12px] font-bold" style={{ color: l.color, background: `color-mix(in srgb, ${l.color} 16%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${l.color} 45%, transparent)` }}>{l.label}</span>
      })}
    </span>
  )
}

/** One team's side of the board: mark, name, the big lit score, hits and errors; an arrow marks the team at bat. */
function TeamPanel({ name, mark, runs, h, e, us, batting, big, align }: { name: string; mark: ReactNode; runs: number; h: number; e: number; us: boolean; batting: boolean; big: boolean; align: 'left' | 'right' }) {
  return (
    <div className={cx('min-w-0 flex flex-col gap-2', align === 'right' ? 'items-end text-right' : 'items-start text-left')}>
      <div className={cx('flex items-center gap-2 min-w-0 max-w-full', align === 'right' && 'flex-row-reverse')}>
        {mark}
        <span className={cx('truncate font-semibold', big ? 'text-[20px] md:text-[28px]' : 'text-[14px] md:text-[17px]')} style={{ color: us ? BOARD_ACCENT : BOARD.ink }}>{name}</span>
        {batting && <span aria-label="進攻中" className="shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded-[4px]" style={{ color: BOARD.bg, background: BOARD.strike, boxShadow: `0 0 10px ${BOARD.strike}88` }}>攻</span>}
      </div>
      <div className={cx('figure font-bold leading-[0.82] tabular-nums', big ? 'text-[120px] md:text-[200px]' : 'text-[76px] md:text-[120px]')}
        style={{ color: BOARD.ink, textShadow: us ? `0 0 28px color-mix(in srgb, ${BOARD_ACCENT} 55%, transparent)` : '0 0 22px rgba(243,239,231,0.18)' }}>
        <RollingNumber text={String(runs)} />
      </div>
      <div className={cx('figure tabular-nums flex gap-3', big ? 'text-[18px]' : 'text-[13px]')} style={{ color: BOARD.muted }}>
        <span>H <b style={{ color: BOARD.ink }}>{h}</b></span><span>E <b style={{ color: BOARD.ink }}>{e}</b></span>
      </div>
    </div>
  )
}

/** A labelled panel in the board's bottom row (打擊 / 投手 / 上一個打席). */
function InfoPanel({ label, children, big }: { label: string; children: ReactNode; big: boolean }) {
  return (
    <div className="min-w-0 px-4 md:px-5 py-3 md:py-4 flex flex-col gap-1.5">
      <div className={cx('font-semibold tracking-[0.12em]', big ? 'text-[13px]' : 'text-[11px]')} style={{ color: BOARD.muted }}>{label}</div>
      {children}
    </div>
  )
}

/**
 * 即時比分 as a ballpark video board: the two scores lit up large, the inning with its arrow, bases and B/S/O in
 * the middle, the line score, then who is up, who is pitching and the last play. 大螢幕 fills the whole screen
 * (for a laptop or TV at the field). A run or a home run flashes across the board.
 */
function LiveBoard({ live, error }: { live: { state: RecordState; updatedAt: string; by?: string | null }; error: string | null }) {
  const s = live.state
  const reduced = usePrefersReducedMotion()
  const [big, setBig] = useState(false)
  const sc = score(s)
  const side = offense(s)
  const c = count(s.pitches)
  const weTop = s.game.homeAway === '客'
  const n = Math.max(sc.lineUs.length, s.game.innings ?? 0)
  const hitsUs = s.batting.filter((p) => p.result in HIT_BASE_COUNT).length
  const hitsOpp = s.pitching.filter((p) => p.result in HIT_BASE_COUNT).length
  // E: each team's own errors (ours on the opponent's plate appearances, theirs when our batter reached on one)
  const errorsUs = s.pitching.reduce((a, p) => a + (p.errors?.length ?? 0), 0) + (side === 'opp' ? s.extras.errors?.length ?? 0 : 0)
  const errorsOpp = s.batting.filter((p) => p.result === '失誤').length
  // innings not reached yet stay dark instead of showing 0
  const played = (i: number, half: 'top' | 'bottom') => i + 1 < s.inning || (i + 1 === s.inning && (half === 'top' || s.half === 'bottom'))
  const lineOf = (line: number[], half: 'top' | 'bottom') => line.map((v, i) => (played(i, half) ? v : null))
  const usHalf: 'top' | 'bottom' = weTop ? 'top' : 'bottom', oppHalf: 'top' | 'bottom' = weTop ? 'bottom' : 'top'
  const usTeam = { name: TEAM_NAME, line: lineOf(sc.lineUs, usHalf), r: sc.us, h: hitsUs, e: errorsUs, us: true }
  const oppTeam = { name: s.game.opponent, line: lineOf(sc.lineOpp, oppHalf), r: sc.opp, h: hitsOpp, e: errorsOpp, us: false }

  // who is up, with his line so far today
  const slot = s.lineup[s.slot]
  const mine = slot ? s.batting.filter((p) => p.batter === slot.name) : []
  const ab = mine.filter((p) => !NON_AB.has(p.result)).length, hits = mine.filter((p) => p.result in HIT_BASE_COUNT).length, rbi = mine.reduce((a, p) => a + (p.rbi ?? 0), 0)
  // our pitcher's pitch count (finished plate appearances plus the one in progress)
  const pitcherRows = s.pitching.filter((p) => p.pitcher === s.pitcher)
  const pc = pitcherRows.reduce((a, p) => a + p.pitches.filter((x) => x !== 'IP').length, 0) + (side === 'opp' ? s.pitches.length : 0)
  const ks = pitcherRows.filter((p) => p.result === '三振').length
  // the last finished plate appearance (either side)
  const lastBat = s.batting[s.batting.length - 1], lastPit = s.pitching[s.pitching.length - 1]
  const last = !lastPit || (lastBat && (lastBat.inning > lastPit.inning || (lastBat.inning === lastPit.inning && (weTop ? side === 'opp' : side === 'us')))) ? (lastBat ? { who: lastBat.batter, result: lastBat.result, rbi: lastBat.rbi, us: true } : null) : { who: lastPit.oppBatter || `對方 ${lastPit.oppOrder ?? ''} 棒`, result: lastPit.result, rbi: 0, us: false }

  // a run or a home run flashes across the board for a few seconds
  const [flash, setFlash] = useState<{ text: string; us: boolean; key: number } | null>(null)
  const prev = useRef<{ us: number; opp: number; rows: number } | null>(null)
  useEffect(() => {
    const rows = s.batting.length + s.pitching.length
    const p = prev.current
    prev.current = { us: sc.us, opp: sc.opp, rows }
    if (!p) return
    const hr = rows > p.rows && last?.result === '全壘打'
    const text = hr ? '全壘打！' : sc.us > p.us ? `得分！${TEAM_NAME}` : sc.opp > p.opp ? `${s.game.opponent} 得分` : null
    if (!text) return
    setFlash({ text, us: hr ? !!last?.us : sc.us > p.us, key: Date.now() })
    const id = window.setTimeout(() => setFlash(null), 3600)
    return () => window.clearTimeout(id)
  }, [sc.us, sc.opp, s.batting.length, s.pitching.length])

  // 大螢幕: the board alone, filling the screen (and the real full screen where the browser allows it)
  useEffect(() => {
    if (!big) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBig(false) }
    const onFs = () => { if (!document.fullscreenElement) setBig(false) }
    window.addEventListener('keydown', onKey); document.addEventListener('fullscreenchange', onFs)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFs) }
  }, [big])
  const openBig = () => { setBig(true); void document.documentElement.requestFullscreen?.().catch(() => undefined) }
  const closeBig = () => { setBig(false); if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined) }

  const updated = new Date(live.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  const top = weTop ? usTeam : oppTeam, bottom = weTop ? oppTeam : usTeam
  const board = (
    <div className={cx('relative overflow-hidden', big ? 'rounded-[22px] min-h-full flex flex-col' : 'rounded-[var(--radius)]')}
      style={{ background: `linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 30%), ${BOARD.bg}`, color: BOARD.ink, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.06), 0 22px 50px -20px rgba(0,0,0,0.55)' }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: LED_DOTS, backgroundSize: '4px 4px' }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40" style={{ background: `radial-gradient(60% 100% at 50% 0%, color-mix(in srgb, ${BOARD_ACCENT} 14%, transparent), transparent 70%)` }} />
      {/* top strip: LIVE, the game, last update, 大螢幕 */}
      <div className="relative flex items-center gap-3 px-4 md:px-6 py-3 border-b flex-wrap" style={{ borderColor: BOARD.line }}>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-[0.14em]" style={{ color: BOARD.out }}>
          <span className="relative inline-flex size-2"><span className={cx('absolute inset-0 rounded-full', !reduced && 'animate-ping')} style={{ background: BOARD.out, opacity: 0.6 }} /><span className="relative size-2 rounded-full" style={{ background: BOARD.out }} /></span>LIVE
        </span>
        <span className={cx('truncate min-w-0 flex-1', big ? 'text-[15px]' : 'text-[12px] md:text-[13px]')} style={{ color: BOARD.muted }}>{[s.game.tournament, s.game.venue, live.by && `紀錄 ${live.by}`].filter(Boolean).join('・')}</span>
        <span className="figure text-[12px] tabular-nums" style={{ color: BOARD.muted }}>{error ? '重新連線中…' : `更新 ${updated}`}</span>
        <button type="button" onClick={big ? closeBig : openBig} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] text-[12px] font-medium cursor-pointer transition-colors hover:bg-white/10" style={{ color: BOARD.ink, boxShadow: `inset 0 0 0 1px ${BOARD.line}` }}>
          {big ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}{big ? '離開大螢幕' : '大螢幕'}
        </button>
      </div>
      {/* the scores and the state of play */}
      <div className={cx('relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-8 px-4 md:px-10', big ? 'py-8 md:py-12 flex-1' : 'py-5 md:py-8')}>
        <TeamPanel name={top.name} mark={top.us ? <TeamLogo size={big ? 34 : 24} /> : <OppMark name={top.name} size={big ? 34 : 24} />} runs={top.r} h={top.h} e={top.e} us={!!top.us} batting={s.half === 'top'} big={big} align="left" />
        <div className="flex flex-col items-center gap-2 md:gap-3">
          <div className="flex items-center gap-1.5" aria-label={`第 ${s.inning} 局${s.half === 'top' ? '上' : '下'}`}>
            <span className={cx('leading-none', big ? 'text-[26px]' : 'text-[16px] md:text-[20px]')} style={{ color: BOARD.strike }}>{s.half === 'top' ? '▲' : '▼'}</span>
            <span className={cx('figure font-bold leading-none tabular-nums', big ? 'text-[64px] md:text-[88px]' : 'text-[40px] md:text-[56px]')}>{s.inning}</span>
          </div>
          <span className={cx('tracking-[0.2em]', big ? 'text-[14px]' : 'text-[11px]')} style={{ color: BOARD.muted }}>{s.half === 'top' ? '上半局' : '下半局'}</span>
          <Diamond runners={s.runners} size={big ? 150 : 96} onBoard />
          <CountLights balls={c.balls} strikes={c.strikes} outs={s.outs} size="lg" onBoard />
        </div>
        <TeamPanel name={bottom.name} mark={bottom.us ? <TeamLogo size={big ? 34 : 24} /> : <OppMark name={bottom.name} size={big ? 34 : 24} />} runs={bottom.r} h={bottom.h} e={bottom.e} us={!!bottom.us} batting={s.half === 'bottom'} big={big} align="right" />
        <AnimatePresence>
          {flash && (
            <motion.div key={flash.key} role="status" className="absolute inset-0 grid place-items-center pointer-events-none"
              initial={reduced ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}
              style={{ background: 'radial-gradient(closest-side, rgba(20,21,23,0.92), rgba(20,21,23,0.55))' }}>
              <span className={cx('figure font-bold tracking-[0.04em] px-6 text-center', big ? 'text-[88px] md:text-[140px]' : 'text-[44px] md:text-[80px]')}
                style={{ color: flash.us ? BOARD_ACCENT : BOARD.ink, textShadow: `0 0 34px ${flash.us ? `color-mix(in srgb, ${BOARD_ACCENT} 70%, transparent)` : 'rgba(243,239,231,0.35)'}` }}>{flash.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <LineScoreBoard bare className="relative border-t" innings={n} current={{ inning: s.inning, half: s.half }} top={top} bottom={bottom} />
      {/* who is up, who is pitching, what just happened */}
      <div className="relative grid grid-cols-1 md:grid-cols-3 border-t divide-y md:divide-y-0 md:divide-x divide-[rgba(243,239,231,0.14)]" style={{ borderColor: BOARD.line }}>
        <InfoPanel label={side === 'us' ? '打擊' : '對方打擊'} big={big}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="figure inline-flex items-center justify-center shrink-0 size-7 rounded-[6px] text-[14px] font-bold" style={{ background: BOARD_ACCENT, color: BOARD.bg }}>{side === 'us' ? s.slot + 1 : s.oppOrder}</span>
            <span className={cx('font-semibold truncate', big ? 'text-[26px]' : 'text-[18px]')}>{side === 'us' ? slot?.name ?? '' : s.oppBatter || `第 ${s.oppOrder} 棒`}</span>
            {side === 'us' && slot?.pos && <span className="text-[12px] shrink-0" style={{ color: BOARD.muted }}>{slot.pos}</span>}
          </div>
          {side === 'us' && <div className="figure text-[13px] tabular-nums" style={{ color: BOARD.muted }}>{mine.length ? `今日 ${ab} 打數 ${hits} 安${rbi ? `・${rbi} 打點` : ''}` : '今日第一個打席'}</div>}
          <div className="text-[12px] mt-0.5"><BoardPitches pitches={s.pitches} /></div>
        </InfoPanel>
        <InfoPanel label={side === 'opp' ? '我隊投手' : '壘上'} big={big}>
          {side === 'opp' ? (
            <>
              <span className={cx('font-semibold truncate', big ? 'text-[26px]' : 'text-[18px]')}>{s.pitcher}</span>
              <span className="figure text-[13px] tabular-nums" style={{ color: BOARD.muted }}>用球數 <b style={{ color: BOARD.ink }}>{pc}</b>・三振 <b style={{ color: BOARD.ink }}>{ks}</b></span>
            </>
          ) : s.runners.length ? (
            <ul className="flex flex-col gap-0.5">{[...s.runners].sort((a, b) => b.base - a.base).map((r) => <li key={r.row} className={cx('flex items-center gap-2', big ? 'text-[18px]' : 'text-[14px]')}><span className="figure font-bold w-6" style={{ color: BOARD.strike }}>{r.base}B</span><span className="font-medium truncate">{r.name ?? ''}</span></li>)}</ul>
          ) : <span className={cx(big ? 'text-[18px]' : 'text-[14px]')} style={{ color: BOARD.muted }}>壘上無人</span>}
        </InfoPanel>
        <InfoPanel label="上一個打席" big={big}>
          {last ? (
            <>
              <span className={cx('font-semibold truncate', big ? 'text-[22px]' : 'text-[16px]')}>{last.who}</span>
              <span className={cx('figure font-bold', big ? 'text-[26px]' : 'text-[18px]')} style={{ color: last.result in HIT_BASE_COUNT ? (last.us ? BOARD_ACCENT : BOARD.ink) : BOARD.muted }}>{last.result || '—'}{last.rbi ? <span className="text-[13px] font-medium ml-2" style={{ color: BOARD.ink }}>{last.rbi} 分打點</span> : null}</span>
            </>
          ) : <span style={{ color: BOARD.muted }}>比賽剛開始</span>}
        </InfoPanel>
      </div>
    </div>
  )

  if (big) {
    return (
      <div role="dialog" aria-label="即時比分大螢幕" className="fixed inset-0 z-[80] bg-black p-3 md:p-6 overflow-auto">{board}</div>
    )
  }
  return (
    <>
      <PageHeader title="即時比分" description={`${s.game.date}・${TEAM_NAME} vs ${s.game.opponent}・每 5 秒自動更新，不需登入。按「大螢幕」可以全螢幕投影在球場。`}
        actions={<Badge variant="good"><span className="inline-block size-1.5 rounded-full bg-good mr-1 animate-pulse" />進行中</Badge>} />
      {board}
      <RecentPlays s={s} side={side} />
    </>
  )
}

/** The half-inning's latest plate appearances, newest first (a new one slides in at the top). */
function RecentPlays({ s, side }: { s: RecordState; side: 'us' | 'opp' }) {
  const rows = side === 'us' ? s.batting : s.pitching
  const recent = rows.slice(-6).reverse()
  return (
    <Card title={side === 'us' ? '我隊最近打席' : '對方最近打席'} flush>
      <ul className="divide-y divide-[var(--border)] text-[13px]">
        {recent.length === 0 && <li className="px-4 py-6 text-center text-muted">這個半局還沒有打席</li>}
        <AnimatePresence initial={false}>
        {recent.map((p, i) => (
          <motion.li key={rows.length - i} layout="position" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: EASE }}
            className="px-4 py-2 flex items-center gap-3">
            <span className="text-muted tnum w-8 shrink-0">{p.inning}局</span>
            <span className="font-medium text-ink truncate flex-1">{'batter' in p ? p.batter : (p.oppBatter || `對方 ${p.oppOrder} 棒`)}</span>
            <span className={cx(p.result in HIT_BASE_COUNT ? 'font-semibold text-ink' : 'text-ink-2')}>{p.result || '—'}</span>
            {p.code && <Badge variant={p.code === 'R' || p.code === 'ER' ? 'good' : 'neutral'}>{p.code}</Badge>}
          </motion.li>
        ))}
        </AnimatePresence>
      </ul>
    </Card>
  )
}
