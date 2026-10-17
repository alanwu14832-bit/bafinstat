import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Diamond } from '../record/Diamond'
import { AnimatePresence, motion } from 'framer-motion'
import { BOARD, CountLights, LineScoreBoard, type BoardTeam } from '../components/ui/Scoreboard'
import { TeamLogo } from '../components/ui/TeamLogo'
import { oppErrorCount, ourErrorCount } from '../data/errors'
import { OppMark } from '../components/ui/GameCard'
import { Broadcast } from '../components/ui/Broadcast'
import { BoxScore } from '../components/game/BoxScore'
import { Tabs } from '../components/ui/Tabs'
import { liveBoxScore } from '../data/boxScore'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useMediaQuery, usePrefersReducedMotion } from '../hooks/useMediaQuery'
import { RollingNumber } from '../components/motion/RollingNumber'
import { EASE } from '../components/motion/Reveal'
import { count, liveSplit, offense, oppBatterOf, oppPitchCount, score, type RecordState } from '../record/model'
import { oppPitcherText } from '../record/OppParts'
import { hhmm } from '../lib/dates'
import { useLiveGames } from '../hooks/useLiveGames'
import { useDataStore } from '../store/data'
import { TEAM_NAME } from '../data/seed'
import { HIT_BASE_COUNT, OPP_BATS_LABEL, oppBatterName } from '../data/types'
import { cx } from '../lib/format'
import { NON_AB_RESULTS } from '../data/stats'
import { f3 } from '../lib/fmt'
import { TEAM } from '../config/team'
import { gridCell, type GridTone } from '../data/gameText'
import { dueUp, halfPlayed, oppFrom, ourFrom, onDeckOf, type UpBatter } from '../record/upNext'
import { currentHalfCard, halfCardKey, liveContext, seasonLine, type HalfCard } from '../data/liveFacts'
import {
  basesLine, batterRowsToday, boardInning, buildFeed, chipWho, hrCounts, itemText, latestItem, liveSourceOf, oppPitcherToday, oppStintRows, pitcherToday, pitchToken, playsSentence, runnerShort, upList,
} from '../data/broadcast'

const POLL_MS = 5000
/** 全部／得分 of the 文字轉播, per viewer */
const FEED_FILTER_KEY = 'bafin.live.feedFilter'
/** 文字轉播｜Box Score under the board, per viewer (every read and write may fail: private mode) */
type LivePanel = 'feed' | 'box'
const PANEL_KEY = 'bafin.live.panel'
const readPanel = (): LivePanel => { try { return localStorage.getItem(PANEL_KEY) === 'box' ? 'box' : 'feed' } catch { return 'feed' } }
const writePanel = (v: LivePanel) => { try { localStorage.setItem(PANEL_KEY, v) } catch { /* storage unavailable */ } }
const PANELS = [{ value: 'feed' as const, label: '文字轉播' }, { value: 'box' as const, label: 'Box Score' }]
/** wide enough for the board and the 文字轉播 column side by side: the Box Score goes under the board, no switch */
const WIDE = '(min-width: 1280px)'
/** 大螢幕 (the feed is hidden there) wide enough for the Box Score beside the board: a 1920-wide TV or monitor, not a
 *  laptop (narrower, the board's matchup row would cut the batter's name) */
const BIG_WIDE = '(min-width: 1880px)'

/** Public live scoreboard. Reads the in-progress state the recorder's device keeps in sync (cloud), or this device's own draft. */
export function LivePage() {
  // (the shared list of games in progress with their recording states, read every 5 s while this page is open:
  // hooks/useLiveGames.ts)
  const { drafts, error } = useLiveGames({ pollMs: POLL_MS, full: true })
  const base = useDataStore((s) => s.base)
  const live = drafts[0] ?? null
  const lastFinal = useMemo(() => [...base.games].filter((g) => !g.status).sort((a, b) => (a.date < b.date ? 1 : -1))[0], [base.games])
  const today = new Date().toISOString().slice(0, 10)
  const nextGame = useMemo(() => base.games.filter((g) => g.status === 'scheduled' && g.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0], [base.games, today])

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

// the board is always dark: the team colour is lifted toward the board's ink so a navy or a dark amber still glows
const BOARD_ACCENT = 'color-mix(in srgb, var(--accent) 62%, #f3efe7)'
const LED_DOTS = 'radial-gradient(rgba(255,255,255,0.055) 0.9px, transparent 1.3px)'
/** One character per pitch, so a called strike (好) and a whiff (空) differ in words, not only in colour. */
const PITCH_COLOR: Record<string, string> = { B: BOARD.ball, S: BOARD.strike, CS: BOARD.strike, SS: BOARD.out, F: BOARD.strike, IP: BOARD.ink }
/** A runner play between pitches, as one character between the squares (its title is the whole sentence). */
const PLAY_CHAR: Record<string, string> = { sb: '盜', cs: '盜', wp: '暴', pb: '逸', bk: '犯', pk: '牽', err: '失', throw: '傳', advance: '進', score: '進', out: '死' }
/** the matchup's label column (and row 最新's): one axis, 3 characters wide */
const LABEL = 'grid-cols-[36px_minmax(0,1fr)_auto]', LABEL_BIG = 'grid-cols-[42px_minmax(0,1fr)_auto]'
/** a cell of the matchup grid, and the line between its columns */
const CELL = 'min-w-0 px-3 @xl:px-6'
const DIVIDER = { borderColor: 'rgba(243,239,231,0.14)' }
const TONE: Record<GridTone, string> = { hit: BOARD_ACCENT, out: BOARD.muted, on: BOARD.ink, other: BOARD.muted }

/** The pitches of the plate appearance in progress as small lit squares, with its runner plays where they happened. */
function BoardPitches({ pitches, plays, big }: { pitches: string[]; plays: Array<{ at: number; char: string; title: string }>; big: boolean }) {
  if (!pitches.length && !plays.length) return <span style={{ color: BOARD.muted }}>—</span>
  const sq = big ? 'size-8 text-[16px]' : 'size-6 text-[12px]'
  const pill = (p: { char: string; title: string }, k: string) => (
    <span key={k} title={p.title} aria-label={p.title} className={cx('inline-flex items-center justify-center rounded-full px-1.5 font-bold', big ? 'h-8 text-[15px]' : 'h-6 text-[11px]')} style={{ color: BOARD.ink, boxShadow: `inset 0 0 0 1px ${BOARD.line}` }}>{p.char}</span>
  )
  return (
    <span className="inline-flex flex-wrap items-center gap-1" aria-label={`本打席 ${pitches.length} 球`}>
      {plays.filter((p) => p.at <= 0).map((p, i) => pill(p, `p0-${i}`))}
      {pitches.map((p, i) => {
        const color = PITCH_COLOR[p] ?? BOARD.muted
        return (
          <Fragment key={i}>
            <span className={cx('figure inline-flex items-center justify-center rounded-[5px] font-bold', sq)} style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent)` }}>{pitchToken(p)}</span>
            {plays.filter((x) => x.at === i + 1 || (i === pitches.length - 1 && x.at > i + 1)).map((x, k) => pill(x, `p${i}-${k}`))}
          </Fragment>
        )
      })}
    </span>
  )
}

/** One team's row of the scorebug: mark, name, ▶ when at bat, the runs lit up in their own column. */
function TeamRow({ name, mark, runs, us, batting, big, tight }: { name: string; mark: ReactNode; runs: number; us: boolean; batting: boolean; big: boolean; tight: boolean }) {
  return (
    <div className={cx('flex items-center min-w-0', big ? 'gap-3 @xl:gap-4' : 'gap-1.5 @xl:gap-3', big ? '' : 'h-11 @xl:h-[72px]')}>
      {mark}
      <span className={cx('min-w-0 truncate font-semibold', big ? 'text-[28px]' : 'text-[15px] @xl:text-[20px]')} style={{ color: us ? BOARD_ACCENT : BOARD.ink }}>{name}</span>
      <span aria-label={batting ? '進攻中' : undefined} className={cx('shrink-0', big ? 'text-[16px]' : 'text-[10px] @xl:text-[12px]')} style={{ color: BOARD.strike, visibility: batting ? 'visible' : 'hidden' }}>▶</span>
      <span className={cx('figure ml-auto shrink-0 font-bold leading-none tabular-nums text-right', big ? (tight ? 'text-[112px] @xl:text-[136px]' : 'text-[120px] @xl:text-[180px]') : 'min-w-7 pl-1 @xl:min-w-20 text-[40px] @xl:text-[72px]')}
        style={{ color: BOARD.ink, textShadow: us ? `0 0 24px color-mix(in srgb, ${BOARD_ACCENT} 55%, transparent)` : '0 0 18px rgba(243,239,231,0.18)' }}>
        <RollingNumber text={String(runs)} />
      </span>
    </div>
  )
}

/** A row of the matchup grid: muted label | value (truncated) | number on the right; `sub` is its second line. */
function MRow({ label, value, num, sub, subNum, big, wrap = false }: { label: string; value: ReactNode; num?: ReactNode; sub?: ReactNode; subNum?: ReactNode; big: boolean; /** a list that may take two lines instead of losing its last name */ wrap?: boolean }) {
  return (
    <div className={cx('grid gap-x-2 items-baseline', big ? `${LABEL_BIG} text-[18px] @xl:text-[22px]` : `${LABEL} text-[14px] @xl:text-[15px]`)}>
      <span className={cx('whitespace-nowrap', big ? 'text-[14px]' : 'text-[12px]')} style={{ color: BOARD.muted }}>{label}</span>
      <span className={cx('min-w-0 font-semibold', wrap ? 'break-words' : 'truncate')}>{value}</span>
      <span className={cx('figure tabular-nums text-right whitespace-nowrap', big ? 'text-[14px] @xl:text-[18px]' : 'text-[13px]')} style={{ color: BOARD.muted }}>{num}</span>
      {(sub || subNum) && (
        <>
          {/* (without a number of its own the second line takes the number's column too) */}
          <span className={cx('col-start-2 min-w-0 truncate mt-0.5', !subNum && 'col-span-2', big ? 'text-[16px]' : 'text-[12px]')} style={{ color: BOARD.muted }}>{sub}</span>
          {subNum && <span className={cx('figure tabular-nums text-right whitespace-nowrap mt-0.5', big ? 'text-[16px]' : 'text-[12px]')} style={{ color: BOARD.muted }}>{subNum}</span>}
        </>
      )}
    </div>
  )
}

/**
 * 即時比分 as a ballpark video board, in one order of reading: ① the score with the inning, the bases and S/B/O,
 * ② the line score, ③ the matchup (投手, 打者, 本打席, 壘上, 下一棒), ④ the newest play in one sentence, then the
 * 文字轉播 or the Box Score under it (a switch per viewer; on a wide screen the box under the board and the feed beside
 * it). 大螢幕 fills the whole screen (a laptop or TV at the field), the Box Score beside the board when the screen is
 * about 1920 px wide. A run or a home run flashes across the score.
 */
function LiveBoard({ live, error }: { live: { state: RecordState; updatedAt: string; by?: string | null }; error: string | null }) {
  const s = live.state
  const reduced = usePrefersReducedMotion()
  const [big, setBig] = useState(false)
  const [cardOpen, setCardOpen] = useState(false)
  // 大螢幕 on a laptop (1366×768): the scores give up some height so the matchup still fits
  const tight = useMediaQuery('(max-height: 860px)') && big
  const narrow = useMediaQuery('(max-width: 399px)')
  const sc = score(s)
  const side = offense(s)
  const c = count(s.pitches)
  const weTop = s.game.homeAway === '客'
  const n = Math.max(sc.lineUs.length, s.game.innings ?? 0)
  const reg = s.game.innings ?? TEAM.innings
  // (after the game is over the record page has already moved on to the next half until 結束比賽 is tapped:
  // nobody is up next, that half gets no card, and a home half not needed reads X)
  const inPlay = halfPlayed(s, sc, reg)
  const hitsUs = s.batting.filter((p) => p.result in HIT_BASE_COUNT).length
  const hitsOpp = s.pitching.filter((p) => p.result in HIT_BASE_COUNT).length
  // E: each team's own errors, the game page's rule (data/errors.ts), plus those of the plate appearance in progress
  const errorsUs = ourErrorCount(s.pitching) + (side === 'opp' ? s.extras.errors?.length ?? 0 : 0)
  const errorsOpp = oppErrorCount(s.batting) + (side === 'us' ? s.extras.oppErrors?.length ?? 0 : 0)
  // innings not reached yet stay dark instead of showing 0
  const played = (i: number, half: 'top' | 'bottom') => i + 1 < s.inning || (i + 1 === s.inning && (half === 'top' || s.half === 'bottom'))
  const lineOf = (line: number[], half: 'top' | 'bottom'): BoardTeam['line'] => line.map((v, i) => (!inPlay && half === 'bottom' && s.half === 'bottom' && i + 1 === s.inning ? 'X' : played(i, half) ? v : null))
  const usHalf: 'top' | 'bottom' = weTop ? 'top' : 'bottom', oppHalf: 'top' | 'bottom' = weTop ? 'bottom' : 'top'
  const markUs = (size: number) => <TeamLogo size={size} />, markOpp = (size: number) => <OppMark name={s.game.opponent} size={size} />
  const usTeam: BoardTeam = { name: TEAM_NAME, line: lineOf(sc.lineUs, usHalf), r: sc.us, h: hitsUs, e: errorsUs, us: true, mark: markUs(18) }
  const oppTeam: BoardTeam = { name: s.game.opponent, line: lineOf(sc.lineOpp, oppHalf), r: sc.opp, h: hitsOpp, e: errorsOpp, us: false, mark: markOpp(18) }
  const top = weTop ? usTeam : oppTeam, bottom = weTop ? oppTeam : usTeam

  // 本季 (this season's earlier games plus today so far), who is up next, the half-inning's card. The polled state is
  // a new object every 5 s, so the memos key on its fields (and the draft's time), never on `s` itself.
  const base = useDataStore((st) => st.base)
  const params = useDataStore((st) => st.params)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => liveContext(base, s.game, params), [base, params, s.game.id, s.game.date, s.game.opponent, s.game.innings])
  const slot = s.lineup[s.slot]
  const season = useMemo(() => (side === 'us' && slot ? seasonLine(ctx, s.batting, slot.name) : null), [ctx, slot?.name, s.batting.length, side]) // eslint-disable-line react-hooks/exhaustive-deps
  const up = inPlay ? onDeckOf(s) : { onDeck: null, inHole: null }
  const upKey = [up.onDeck, up.inHole].map((b) => (b ? `${b.us ? 'us' : 'opp'}${b.order}:${b.name}` : '')).join('|')
  const nextText = useMemo(() => upList([up.onDeck, up.inHole].filter((b): b is UpBatter => !!b).map((b) => {
    // (our batters: the 本季 AVG once he has an at bat this season)
    const line = b.us && b.name ? seasonLine(ctx, s.batting, b.name) : null
    return { ...b, avg: line && line.ab >= 1 ? f3(line.avg) : '' }
  })), [ctx, upKey, s.batting.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const due = dueUp(s, sc, reg)
  const halfCard = useMemo(() => currentHalfCard(s, ctx), [ctx, halfCardKey(s)]) // eslint-disable-line react-hooks/exhaustive-deps
  // 大螢幕 stays lean: no team win-streak card (連勝中) there
  const card: HalfCard | null = inPlay && !(big && halfCard?.id === 'wstreak:team') ? halfCard : null

  // 文字轉播: the whole game, both sides; between halves the batting team's first three go on the new half's header
  const fresh = s.outs === 0 && !s.pitches.length && !s.plays?.length && !(side === 'us' ? s.batting : s.pitching).some((r) => r.inning === s.inning)
  const leadoff = fresh && inPlay ? upList(side === 'us' ? ourFrom(s, s.slot, 3) : oppFrom(s, s.oppOrder, 3), { opp: side === 'opp' }) : ''
  const priorHr = useMemo(() => hrCounts([...ctx.battingBy.values()].flat()), [ctx])
  const feed = useMemo(() => buildFeed({ homeAway: s.game.homeAway, opponent: s.game.opponent, batting: s.batting, pitching: s.pitching, subs: s.subs, priorHr, ...(inPlay ? { live: liveSourceOf(s, leadoff) } : {}) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live.updatedAt, s.batting.length, s.pitching.length, s.pitches.length, s.plays?.length, s.subs?.length, s.inning, s.half, inPlay, leadoff, priorHr])
  const latest = latestItem(feed)
  // Box Score (data/boxScore.ts): the same lines as the game page, from the draft's rows; the pitches of the plate
  // appearance in progress count in 用球數. Only built while it is on screen.
  const wide = useMediaQuery(WIDE)
  const [panel, setPanel] = useState<LivePanel>(readPanel)
  const pickPanel = (v: LivePanel) => { setPanel(v); writePanel(v) }
  const bigWide = useMediaQuery(BIG_WIDE)
  const showBox = big ? bigWide : wide || panel === 'box'
  const box = useMemo(() => (showBox ? liveBoxScore(s, { inPlay, roster: base.roster, params }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showBox, live.updatedAt, s.updatedAt, s.batting.length, s.pitching.length, s.pitches.length, s.slot, s.oppOrder, s.oppBatter, s.pitcher, s.inning, s.half, s.subs?.length, inPlay, base.roster, params])
  const liveItem = feed.at(-1)?.items.at(-1)
  const livePlays = liveItem?.kind === 'live' ? liveItem.plays : []
  // the pills between the pitch squares: one per play (grouped like the feed's lines, whose sentence is the title)
  const pills = useMemo(() => {
    const out: Array<{ at: number; char: string; title: string }> = []
    const list = s.plays ?? []
    let i = 0
    while (i < list.length) {
      let j = i + 1
      while (j < list.length && list[j].at === list[i].at && list[j].kind === list[i].kind) j++
      out.push({ at: list[i].at, char: PLAY_CHAR[list[i].kind] ?? '跑', title: livePlays[out.length] ?? playsSentence(list[i].kind, list.slice(i, j).map((e) => ({ name: '跑者', to: e.to }))) })
      i = j
    }
    return out
  }, [s.plays, livePlays])

  // the matchup: the pitcher defending, then the batter
  const ourP = pitcherToday(s.pitching, s.pitcher, side === 'opp' ? liveSplit(s).current : 0, side === 'opp' ? s.priorPitchers : undefined)
  const pitcherName = side === 'opp' ? s.pitcher || '投手' : oppPitcherText(s.oppPitcher) || '對方投手'
  const pitchCount = side === 'opp' ? ourP.pc : oppPitchCount(s)
  const pitcherLine = side === 'opp' ? ourP.line : oppPitcherToday(oppStintRows(s.batting, s.oppPitcher, s.oppPitcherFrom))
  const mine = batterRowsToday(s)
  const ab = mine.filter((p) => !NON_AB_RESULTS.has(p.result)).length, hits = mine.filter((p) => p.result in HIT_BASE_COUNT).length
  const batterName = side === 'us' ? slot?.name ?? '' : oppBatterName(oppBatterOf(s)) || `對方第 ${s.oppOrder} 棒`
  // 對方打者左打／右打 (when the recorder picked one for him)
  const oppSide = side === 'opp' ? s.oppBatsBySlot?.[s.oppOrder] : undefined
  const batsTag = oppSide === 'L' || oppSide === 'R' ? OPP_BATS_LABEL[oppSide] : ''
  const order = side === 'us' ? s.slot + 1 : s.oppOrder
  const runnersText = basesLine(s.runners.map((r) => ({ base: r.base, name: r.side === 'us' ? r.name : runnerShort(s.pitching[r.row], 'opp', r.name) })))
  const dueText = s.outs === 2 && due.length ? upList(due, { opp: !due[0].us }) : ''

  // a run or a home run flashes across the score for a few seconds
  const [flash, setFlash] = useState<{ text: string; us: boolean; key: number } | null>(null)
  const prev = useRef<{ us: number; opp: number; rows: number } | null>(null)
  useEffect(() => {
    const rows = s.batting.length + s.pitching.length
    const p = prev.current
    prev.current = { us: sc.us, opp: sc.opp, rows }
    if (!p) return
    // (the newest play of either side: in the bottom half that is theirs, also when we are the away team)
    const hr = rows > p.rows && latest?.kind === 'pa' && latest.hr
    const text = hr ? '全壘打！' : sc.us > p.us ? `得分！${TEAM_NAME}` : sc.opp > p.opp ? `${s.game.opponent} 得分` : null
    if (!text) return
    setFlash({ text, us: hr ? latest?.side === 'us' : sc.us > p.us, key: Date.now() })
    const id = window.setTimeout(() => setFlash(null), 3600)
    return () => window.clearTimeout(id)
  }, [sc.us, sc.opp, s.batting.length, s.pitching.length]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const line = BOARD.line
  const meta = [s.game.tournament, s.game.venue, live.by && `紀錄 ${live.by}`, s.firstPitchAt && `${hhmm(s.firstPitchAt)} 開賽`].filter(Boolean).join('・')
  const markSize = big ? 34 : 22
  const board = (
    <div className={cx('@container relative overflow-hidden', big ? 'rounded-[22px] min-h-full flex flex-col' : 'rounded-[var(--radius)]')}
      style={{ background: `linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 30%), ${BOARD.bg}`, color: BOARD.ink, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.06), 0 22px 50px -20px rgba(0,0,0,0.55)' }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: LED_DOTS, backgroundSize: '4px 4px' }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40" style={{ background: `radial-gradient(60% 100% at 50% 0%, color-mix(in srgb, ${BOARD_ACCENT} 14%, transparent), transparent 70%)` }} />
      {/* A: LIVE, the inning, the last update, 大螢幕 */}
      <div className={cx('relative flex items-center gap-3 px-3 @xl:px-6 border-b', big ? 'h-14' : 'h-12')} style={{ borderColor: line }}>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-[0.14em] shrink-0" style={{ color: BOARD.out }}>
          <span className="relative inline-flex size-2"><span className={cx('absolute inset-0 rounded-full', !reduced && 'animate-ping')} style={{ background: BOARD.out, opacity: 0.6 }} /><span className="relative size-2 rounded-full" style={{ background: BOARD.out }} /></span>LIVE
        </span>
        <span className={cx('figure font-bold whitespace-nowrap tabular-nums', big ? 'text-[26px]' : 'text-[15px]')} aria-label={`第 ${s.inning} 局${s.half === 'top' ? '上' : '下'}`}>
          <span style={{ color: BOARD.strike }}>{s.half === 'top' ? '▲' : '▼'}</span>{boardInning(s.inning, s.half)}
        </span>
        <span className="ml-auto figure text-[12px] tabular-nums whitespace-nowrap" style={{ color: BOARD.muted }}>{error ? '重新連線中…' : `${hhmm(live.updatedAt)} 更新`}</span>
        <button type="button" onClick={big ? closeBig : openBig} aria-label={big ? '離開大螢幕' : '大螢幕'} title={big ? '離開大螢幕（Esc）' : '全螢幕投影在球場'}
          className="inline-flex items-center justify-center gap-1.5 h-9 min-w-9 px-2 rounded-[8px] text-[12px] font-medium cursor-pointer transition-colors hover:bg-white/10 shrink-0" style={{ color: BOARD.ink, boxShadow: `inset 0 0 0 1px ${line}` }}>
          {big ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}{!narrow && <span>{big ? '離開大螢幕' : '大螢幕'}</span>}
        </button>
      </div>
      {/* B: the scorebug — away team on top, then home; the bases and S/B/O on the right */}
      <div className={cx('relative grid items-center gap-x-2 px-3 @xl:px-6', big ? 'grid-cols-1 @xl:grid-cols-[minmax(0,1fr)_auto] gap-y-3 @xl:gap-x-10' : 'grid-cols-[minmax(0,1fr)_120px] @xl:grid-cols-[minmax(0,1fr)_200px] @xl:gap-x-8', big ? (tight ? 'py-3 flex-1' : 'py-6 @xl:py-10 flex-1') : 'py-2 @xl:py-4')}>
        <div className={cx('min-w-0 flex flex-col', big ? 'gap-2 @xl:gap-4 w-full max-w-[52rem] justify-self-center' : '')}>
          <TeamRow name={top.name} mark={top.us ? markUs(markSize) : markOpp(markSize)} runs={top.r} us={!!top.us} batting={s.half === 'top'} big={big} tight={tight} />
          <TeamRow name={bottom.name} mark={bottom.us ? markUs(markSize) : markOpp(markSize)} runs={bottom.r} us={!!bottom.us} batting={s.half === 'bottom'} big={big} tight={tight} />
        </div>
        <div className={cx('flex items-center justify-end', big ? 'justify-center gap-6' : 'gap-2 @xl:gap-4')}>
          {big ? (
            <>
              <Diamond runners={s.runners} size={tight ? 96 : 150} onBoard />
              <CountLights balls={c.balls} strikes={c.strikes} outs={s.outs} order="SBO" size="lg" onBoard />
            </>
          ) : (
            <>
              <span className="inline-flex @xl:hidden items-center gap-1.5"><Diamond runners={s.runners} size={56} onBoard /><CountLights balls={c.balls} strikes={c.strikes} outs={s.outs} order="SBO" size="sm" onBoard /></span>
              <span className="hidden @xl:inline-flex items-center gap-4"><Diamond runners={s.runners} size={88} onBoard /><CountLights balls={c.balls} strikes={c.strikes} outs={s.outs} order="SBO" size="lg" onBoard /></span>
            </>
          )}
        </div>
        <AnimatePresence>
          {flash && (
            <motion.div key={flash.key} role="status" className="absolute inset-0 grid place-items-center pointer-events-none"
              initial={reduced ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}
              style={{ background: 'radial-gradient(closest-side, rgba(20,21,23,0.94), rgba(20,21,23,0.6))' }}>
              <span className={cx('figure font-bold tracking-[0.04em] px-6 text-center', big ? 'text-[88px] @xl:text-[140px]' : 'text-[34px] @xl:text-[64px]')}
                style={{ color: flash.us ? BOARD_ACCENT : BOARD.ink, textShadow: `0 0 34px ${flash.us ? `color-mix(in srgb, ${BOARD_ACCENT} 70%, transparent)` : 'rgba(243,239,231,0.35)'}` }}>{flash.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* C: the line score — marks instead of names, R H E always on screen */}
      <LineScoreBoard bare compact className="relative border-t" innings={n} current={{ inning: s.inning, half: s.half }} top={top} bottom={bottom} />
      {/* D: the matchup */}
      <div className="relative border-t" style={{ borderColor: line }}>
        {!inPlay ? (
          <p className={cx('px-3 @xl:px-6 py-3', big ? 'text-[20px]' : 'text-[13px]')} style={{ color: BOARD.muted }}>比賽結束，等待紀錄員確認</p>
        ) : (
          // one cell per row, placed by the board's width (not the screen's: beside the sidebar or the 文字轉播 column the
          // board is narrower than the window): one column on a phone; from 480 px two (the batter's a little wider), [投手 打者] | [本打席 壘上 下一棒],
          // so neither side is left empty; from 1024 px (a wide screen, 大螢幕) three, [投手] | [打者 本打席] | [壘上 下一棒]
          <div className="grid grid-cols-1 @min-[480px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] @5xl:grid-cols-3 py-2">
            <div className={cx(CELL, big ? 'py-2' : 'py-1', '@min-[480px]:col-start-1 @min-[480px]:row-start-1 @5xl:row-span-2')}>
              <MRow big={big} label="投手" value={pitcherName} num={`${pitchCount} 球`} sub={pitcherLine} />
            </div>
            <div className={cx(CELL, big ? 'py-2' : 'py-1', '@min-[480px]:col-start-1 @min-[480px]:row-start-2 @min-[480px]:row-span-2 @5xl:col-start-2 @5xl:row-start-1 @5xl:row-span-1 @5xl:border-l')} style={DIVIDER}>
              <MRow big={big} label="打者"
                value={<span className="inline-flex items-center gap-1.5 min-w-0 max-w-full"><span className={cx('figure inline-flex items-center justify-center shrink-0 rounded-[5px] font-bold', big ? 'size-8 text-[16px]' : 'size-5 text-[12px]')} style={{ background: BOARD_ACCENT, color: BOARD.bg }}>{order}</span><span className="truncate">{chipWho(batterName, order)}</span>{side === 'us' && slot?.pos && <span className={cx('shrink-0 font-normal', big ? 'text-[16px]' : 'text-[12px]')} style={{ color: BOARD.muted }}>{slot.pos}</span>}{batsTag && <span className={cx('shrink-0 font-normal', big ? 'text-[16px]' : 'text-[12px]')} style={{ color: BOARD.muted }}>{batsTag}</span>}</span>}
                num={mine.length ? `今日 ${ab} 打數 ${hits} 安` : '今日首打席'}
                sub={mine.length ? <span className="inline-flex flex-wrap gap-1">{mine.map((p, i) => { const g = gridCell(p); return <span key={i} title={g.title} className="figure font-semibold" style={{ color: TONE[g.tone] }}>{g.text}</span> })}</span> : undefined}
                subNum={season && season.ab >= 1 ? `本季 ${f3(season.avg)} OPS ${f3(season.ops)}` : undefined} />
            </div>
            <div className={cx(CELL, big ? 'py-2' : 'py-1', '@min-[480px]:col-start-2 @min-[480px]:row-start-1 @min-[480px]:border-l @5xl:row-start-2')} style={DIVIDER}>
              <MRow big={big} label="本打席" value={<BoardPitches pitches={s.pitches} plays={pills} big={big} />} />
            </div>
            <div className={cx(CELL, big ? 'py-2' : 'py-1', '@min-[480px]:col-start-2 @min-[480px]:row-start-2 @min-[480px]:border-l @5xl:col-start-3 @5xl:row-start-1')} style={DIVIDER}>
              <MRow big={big} wrap label="壘上" value={<span className={cx(!s.runners.length && 'font-normal')} style={s.runners.length ? undefined : { color: BOARD.muted }}>{runnersText.split('・').map((x, i) => <Fragment key={i}>{i > 0 && '・'}<span className="whitespace-nowrap">{x}</span></Fragment>)}</span>} />
            </div>
            <div className={cx(CELL, big ? 'py-2' : 'py-1', '@min-[480px]:col-start-2 @min-[480px]:row-start-3 @min-[480px]:border-l @5xl:col-start-3 @5xl:row-start-2')} style={DIVIDER}>
              <MRow big={big} wrap label="下一棒" value={<span className="font-medium">{nextText ? nextText.split('・').map((x, i) => <Fragment key={i}>{i > 0 && '・'}<span className="whitespace-nowrap">{x}</span></Fragment>) : '—'}</span>} />
            </div>
          </div>
        )}
      </div>
      {/* E: the newest play, either side, in the feed's words */}
      <div className={cx('relative border-t px-3 @xl:px-6 grid gap-x-2 items-baseline', big ? `${LABEL_BIG} py-4` : `${LABEL} py-2.5`)} style={{ borderColor: line }}>
        <span className={cx(big ? 'text-[14px]' : 'text-[12px]')} style={{ color: BOARD.muted }}>最新</span>
        {/* (two lines where one does not hold a whole sentence: a phone cannot show the title) */}
        <span className={cx('min-w-0 break-words leading-snug', big ? 'text-[24px] font-semibold line-clamp-3 @xl:line-clamp-2' : 'text-[14px] line-clamp-2 @xl:line-clamp-1')} title={latest ? itemText(latest) : undefined}>{latest ? itemText(latest) : '比賽開始'}</span>
      </div>
      {/* F: the half-inning's card (fixed rules, data/liveFacts.ts) and, at two outs, who leads off after the side is retired */}
      {(card || dueText) && (
        <div className={cx('relative border-t px-3 @xl:px-6 py-1.5 flex flex-col gap-1', big ? 'text-[18px]' : 'text-[13px]')} style={{ borderColor: line }}>
          {card && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.button key={card.id} type="button" onClick={() => setCardOpen((o) => !o)} aria-expanded={cardOpen} title={card.text}
                className={cx('flex gap-2 min-w-0 text-left cursor-pointer min-h-9', cardOpen ? 'items-start' : 'items-center')}
                initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}>
                {/* the figure inside the chip, so it does not run into the sentence (「全壘打 2」, then 「8 棒 劉品辰…」) */}
                <span className={cx('shrink-0 inline-flex items-baseline gap-1 font-semibold px-1.5 py-0.5 rounded-[4px] whitespace-nowrap', big ? 'text-[13px]' : 'text-[11px]')} style={{ color: BOARD.bg, background: BOARD_ACCENT }}>
                  {card.kicker}{card.figure && <span className={cx('figure font-bold tabular-nums', big ? 'text-[15px]' : 'text-[13px]')}>{card.figure}</span>}
                </span>
                <span className={cx('min-w-0 leading-snug', cardOpen ? 'line-clamp-2' : 'line-clamp-1')}>{card.text}</span>
              </motion.button>
            </AnimatePresence>
          )}
          {dueText && <div className="min-w-0 truncate"><span style={{ color: BOARD.muted }}>攻守交換後 </span><span className="font-medium">{dueText}</span></div>}
        </div>
      )}
      {/* G: the game */}
      {meta && <div className="relative border-t px-3 @xl:px-6 py-2 text-[11px] truncate" style={{ borderColor: line, color: BOARD.muted }}>{meta}</div>}
    </div>
  )

  const boxCard = box && <Card title="Box Score" subtitle="今天這場到目前為止；底色是打擊中的打者" still flush><BoxScore box={box} /></Card>
  if (big) {
    // a TV or a big monitor: the Box Score beside the board (it scrolls on its own; the board keeps the full height and
    // about 1290 px of width, where its matchup row has room for the names)
    return (
      <div role="dialog" aria-label="即時比分大螢幕" className={cx('fixed inset-0 z-[80] bg-black p-3 overflow-auto', !tight && 'md:p-6')}>
        {boxCard
          ? <div className="grid min-h-full gap-6 grid-cols-[minmax(0,1fr)_min(560px,calc(100vw_-_1360px))]">
              <div className="min-w-0 flex flex-col [&>*]:flex-1">{board}</div>
              <div className="min-w-0 self-start sticky top-0 max-h-[calc(100dvh-48px)] overflow-y-auto rounded-[var(--radius)]">{boxCard}</div>
            </div>
          : board}
      </div>
    )
  }
  // a phone or a tablet: 文字轉播｜Box Score under the board; a wide screen: the box under the board, the feed beside it
  // (大螢幕 hides the feed and puts the box beside the board when the screen is wide enough)
  return (
    <>
      <PageHeader title="即時比分" />
      <div className="grid gap-4 xl:gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
        <div className="min-w-0 flex flex-col gap-4 xl:gap-6">{board}{wide && boxCard}</div>
        <div className="min-w-0 flex flex-col gap-3 xl:sticky xl:top-[68px]">
          {!wide && <Tabs aria-label="看文字轉播或 Box Score" value={panel} onChange={pickPanel} items={PANELS} className="self-start" />}
          {wide || panel === 'feed'
            ? <Broadcast halves={feed} weTop={weTop} opponent={s.game.opponent} storageKey={FEED_FILTER_KEY}
                className="xl:max-h-[calc(100dvh-80px)]" bodyClassName="xl:overflow-y-auto xl:min-h-0" />
            : boxCard}
        </div>
      </div>
    </>
  )
}
