/**
 * Pieces of the live 紀錄比賽 screen: the scoreboard bar that stays on top while scrolling, the runner sheet (tap a
 * base → one tap for what he did), and the substitution sheet (slot, player and position as chips, no dropdowns).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Flame, Target, Undo2 } from 'lucide-react'
import { Sheet } from '../components/ui/Sheet'
import { Button } from '../components/ui/Button'
import { BOARD, CountLights } from '../components/ui/Scoreboard'
import { usePrefersReducedMotion } from '../hooks/useMediaQuery'
import { cx } from '../lib/format'
import { POSITIONS } from '../data/types'
import { TEAM } from '../config/team'
import { Diamond } from './Diamond'
import { RunnerDiamond } from './RunnerDiamond'
import type { RecordState, Runner, RunnerEvent, Side, SubCandidates } from './model'

/* ------------------------------------------------------------------ scoreboard bar */
function Num({ value, className }: { value: number | string; className?: string }) {
  return (
    <span className={cx('relative inline-grid overflow-hidden', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ y: '-60%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '60%', opacity: 0 }} transition={{ type: 'spring', visualDuration: 0.32, bounce: 0.1 }}>{value}</motion.span>
      </AnimatePresence>
    </span>
  )
}

export interface LiveBarProps {
  state: RecordState
  us: number
  opp: number
  balls: number
  strikes: number
  side: Side
  /** who is up, one line */
  who: ReactNode
  onRunners: () => void
  onUndo: () => void
  canUndo: boolean
  /** in the full-screen overlay the bar sticks to the very top */
  focus: boolean
}

/**
 * Score bug in ballpark colours: both scores, the half-inning, B/S/O, the bases (tap → runner sheet) and 復原.
 * Its second line says what is being recorded (我隊打擊 / 我隊守備) — the colour of that pill changes with the half.
 * Anything that changes the game situation makes the bar flash once, so a mistaken tap is noticed.
 */
export function LiveBar({ state, us, opp, balls, strikes, side, who, onRunners, onUndo, canUndo, focus }: LiveBarProps) {
  const reduced = usePrefersReducedMotion()
  const sig = `${us}:${opp}:${state.outs}:${state.inning}${state.half}:${state.runners.map((r) => `${r.base}${r.row}`).join(',')}:${state.batting.length}/${state.pitching.length}`
  const first = useRef(sig)
  const [flash, setFlash] = useState(0)
  useEffect(() => { if (sig !== first.current) { first.current = sig; setFlash((n) => n + 1) } }, [sig])
  const top = state.half === 'top'
  const weTop = state.game.homeAway === '客'
  const rows = [
    { name: TEAM.short, score: us, bat: side === 'us' },
    { name: state.game.opponent, score: opp, bat: side === 'opp' },
  ]
  if (!weTop) rows.reverse()
  return (
    <div className={cx('sticky z-20', focus ? 'top-2' : 'top-[65px]')}>
      <div className="relative overflow-hidden rounded-[var(--radius)] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.55)] ring-1 ring-black/10" style={{ background: BOARD.bg, color: BOARD.ink }}>
        {flash > 0 && (
          <motion.div key={flash} aria-hidden className="pointer-events-none absolute inset-0" initial={{ opacity: reduced ? 0.18 : 0.42 }} animate={{ opacity: 0 }} transition={{ duration: reduced ? 0.25 : 0.9, ease: [0.2, 0.7, 0.3, 1] }}
            style={{ background: 'radial-gradient(120% 140% at 20% 0%, var(--accent-board, var(--accent)), transparent 70%)' }} />
        )}
        <div className="relative flex items-center gap-2.5 sm:gap-5 px-3 sm:px-5 pt-2.5 pb-2">
          {/* the two teams, away on top like a broadcast bug */}
          <div className="flex flex-col gap-0.5 min-w-0 flex-1 sm:flex-none sm:w-[200px]">
            {rows.map((r) => (
              <div key={r.name} className="flex items-center gap-2 min-w-0">
                <span className={cx('size-1.5 rounded-full shrink-0', r.bat ? 'bg-[var(--accent-board,var(--accent))]' : 'bg-transparent')} aria-hidden />
                <span className="text-[13px] font-medium truncate min-w-0 flex-1" style={{ color: r.bat ? BOARD.ink : BOARD.muted }}>{r.name}</span>
                <Num value={r.score} className="figure text-[24px] font-bold leading-[1.05] tabular-nums min-w-5 text-right" />
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center leading-none shrink-0" aria-label={`第 ${state.inning} 局${top ? '上' : '下'}`}>
            <span className="text-[10px]" style={{ color: top ? BOARD.strike : BOARD.off }}>▲</span>
            <Num value={state.inning} className="figure text-[24px] font-bold my-0.5" />
            <span className="text-[10px]" style={{ color: !top ? BOARD.strike : BOARD.off }}>▼</span>
          </div>
          <CountLights balls={balls} strikes={strikes} outs={state.outs} size="sm" onBoard className="shrink-0" />
          <button type="button" onClick={onRunners} disabled={!state.runners.length} aria-label={state.runners.length ? `壘上跑者：${state.runners.map((r) => `${r.base}B ${r.name}`).join('、')}，點一下記跑壘` : '壘上無人'}
            className="shrink-0 -my-1 rounded-[10px] p-1 enabled:cursor-pointer enabled:hover:bg-white/8 transition-colors">
            <Diamond runners={state.runners} size={44} onBoard />
          </button>
          {/* wide screens: what is being recorded sits in the same row */}
          <div className="hidden sm:flex flex-col gap-1 min-w-0 flex-1 pl-4 border-l text-[13px]" style={{ borderColor: BOARD.line }}>
            <span className={cx('inline-flex self-start items-center gap-1 h-6 px-2 rounded-full text-[12px] font-semibold', side === 'us' ? 'bg-[var(--accent-board,var(--accent))] text-[var(--accent-board-ink,var(--accent-ink))]' : 'ring-1 ring-white/30')}>
              {side === 'us' ? <Target className="size-3.5" /> : <Flame className="size-3.5" style={{ color: BOARD.strike }} />}
              {side === 'us' ? '我隊打擊' : '我隊守備'}
            </span>
            <span className="truncate" style={{ color: BOARD.muted }}>{who}</span>
          </div>
          <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="復原上一步" title="復原上一步"
            className="shrink-0 size-10 max-[380px]:size-9 inline-flex items-center justify-center rounded-full ring-1 ring-white/15 enabled:hover:bg-white/10 enabled:cursor-pointer disabled:opacity-35 transition-colors">
            <Undo2 className="size-[18px]" />
          </button>
        </div>
        <div className="relative sm:hidden flex items-center gap-2 px-3 py-1.5 border-t text-[12px] min-w-0" style={{ borderColor: BOARD.line }}>
          <span role="status" aria-live="polite" className={cx('inline-flex items-center gap-1 h-6 px-2 rounded-full font-semibold shrink-0', side === 'us' ? 'bg-[var(--accent-board,var(--accent))] text-[var(--accent-board-ink,var(--accent-ink))]' : 'ring-1 ring-white/30')}>
            {side === 'us' ? <Target className="size-3.5" /> : <Flame className="size-3.5" style={{ color: BOARD.strike }} />}
            {side === 'us' ? '我隊打擊' : '我隊守備'}
          </span>
          <span className="truncate min-w-0" style={{ color: BOARD.muted }}>{who}</span>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ runner sheet */
export const RUNNER_EVENTS: Array<{ ev: RunnerEvent; label: string; side?: Side; out?: boolean }> = [
  { ev: 'sb', label: '盜壘' }, { ev: 'wp', label: '暴投進壘' }, { ev: 'pb', label: '捕逸進壘' }, { ev: 'err', label: '失誤進壘', side: 'us' }, { ev: 'throw', label: '趁傳進壘' }, { ev: 'advance', label: '進一個壘' },
  { ev: 'score', label: '得分' }, { ev: 'pkSafe', label: '牽制（安全）' }, { ev: 'cs', label: '盜壘失敗', out: true }, { ev: 'pk', label: '牽制出局', out: true }, { ev: 'out', label: '壘死', out: true },
]
const bigBtn = (out?: boolean) => cx('h-12 px-2 rounded-[var(--radius-sm)] border border-border bg-surface text-[14px] font-medium hover:bg-surface-2 active:bg-surface-3 cursor-pointer transition-colors', out && 'text-critical')

export interface RunnerSheetProps {
  open: boolean
  onClose: () => void
  runners: Runner[]
  side: Side
  picked: number | null
  onPick: (row: number) => void
  onEvent: (r: Runner, ev: RunnerEvent) => void
  /** 暴投 / 捕逸 with everyone moving up */
  onAll: (kind: 'wp' | 'pb') => void
  /** 代跑 for our runner: the names that can come in, and whether that runner has a batting slot to take over */
  pinch?: { names: string[]; disabled: Set<string>; tag: (n: string) => string | undefined; can: (r: Runner) => boolean; onPinch: (r: Runner, name: string) => void }
  /** where the plate appearance stands, e.g. 「1 出局・第 3 球後」 */
  context: string
}

/** Tap a base → this sheet: who (the diamond), then one tap for what happened. Everyone moving up on a wild pitch is a single tap. */
export function RunnerSheet({ open, onClose, runners, side, picked, onPick, onEvent, onAll, pinch, context }: RunnerSheetProps) {
  const ours = runners.filter((r) => r.side === side).sort((a, b) => b.base - a.base)
  const r = ours.find((x) => x.row === picked) ?? (ours.length === 1 ? ours[0] : null)
  return (
    <Sheet open={open} onClose={onClose} ariaLabel="壘上跑者" side="bottom" desktopFrom="sm" panelClassName="sm:max-w-lg">
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-2"><h2 className="text-[17px] text-ink">壘上跑者</h2><span className="text-[12px] text-muted tnum">{context}</span></div>
        {ours.length > 1 && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onAll('wp')} className={bigBtn()}>暴投・全部進壘</button>
            <button type="button" onClick={() => onAll('pb')} className={bigBtn()}>捕逸・全部進壘</button>
          </div>
        )}
        <RunnerDiamond runners={ours.map((x) => ({ key: String(x.row), base: x.base, name: x.name }))} picked={r ? String(r.row) : null} onPick={(k) => onPick(Number(k))} className="max-w-[260px]" />
        {r ? (
          <div className="flex flex-col gap-3" role="group" aria-label={`${r.base}B ${r.name} 的動作`}>
            <div className="text-[13px] text-ink-2"><span className="tnum text-muted mr-1">{r.base}B</span><span className="font-semibold text-ink">{r.name}</span> 發生了什麼？</div>
            <div className="grid grid-cols-3 gap-2">
              {RUNNER_EVENTS.filter((e) => !e.side || e.side === r.side).map((e) => <button key={e.ev} type="button" onClick={() => onEvent(r, e.ev)} className={bigBtn(e.out)}>{e.label}</button>)}
            </div>
            {pinch && r.side === 'us' && pinch.can(r) && (
              <div className="flex flex-col gap-2 pt-3 border-t border-border">
                <span className="text-[12px] text-ink-2">代跑：點一位換上 {r.name}</span>
                {pinch.names.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {pinch.names.filter((n) => n !== r.name).map((n) => (
                      <button key={n} type="button" disabled={pinch.disabled.has(n)} onClick={() => pinch.onPinch(r, n)} className="h-10 px-3 rounded-[var(--radius-sm)] border border-border bg-surface text-[13px] font-medium hover:bg-surface-2 cursor-pointer disabled:opacity-40 disabled:cursor-default">
                        {n}{pinch.tag(n) && <span className="text-[11px] text-muted ml-0.5">{pinch.tag(n)}</span>}
                      </button>
                    ))}
                  </div>
                ) : <p className="text-[12px] text-muted">沒有可以上場的人</p>}
              </div>
            )}
          </div>
        ) : <p className="text-[13px] text-muted text-center">點壘包上的跑者</p>}
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ substitution sheet */
const chip = (on: boolean, dim?: boolean) => cx('h-10 px-3 rounded-[var(--radius-sm)] border text-[13px] font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default', on ? 'border-ink bg-ink text-bg' : 'border-border bg-surface text-ink hover:bg-surface-2', dim && !on && 'text-ink-2')

export interface SubSheetProps {
  open: boolean
  onClose: () => void
  mode: 'lineup' | 'pitcher'
  onMode: (m: 'lineup' | 'pitcher') => void
  state: RecordState
  side: Side
  batters: SubCandidates
  pitchers: SubCandidates
  pitchCount: Map<string, number>
  pitchTone: (n: number) => 'ok' | 'warning' | 'critical'
  sub: { slot: number; name: string; pos: string }
  setSub: (s: { slot: number; name: string; pos: string }) => void
  onPickPos: (pos: string) => void
  canSub: boolean
  onConfirmSub: () => void
  newPitcher: string
  setNewPitcher: (n: string) => void
  pitcherHint: string | null
  onConfirmPitcher: () => void
  /** 允許再上場, 報名名單 */
  extras: ReactNode
  fieldPos: (slot: number) => string
}

/** 換人 / 換投 as three rows of chips: which slot, who comes in, which position; then one confirm. */
export function SubSheet(p: SubSheetProps) {
  const { state, sub } = p
  const slot = state.lineup[sub.slot]
  const posOpts = [...(p.side === 'us' ? ['PH', 'PR'] : []), ...POSITIONS.filter((x) => x !== 'PH' && x !== 'PR')]
  const summary = p.mode === 'pitcher'
    ? (p.newPitcher ? `${p.newPitcher} 接替 ${state.pitcher}` : '選一位投手')
    : !slot ? '' : sub.name ? `${sub.name} ${sub.pos === 'PH' ? '代打' : sub.pos === 'PR' ? '代跑' : `換上，守 ${sub.pos || slot.pos}`}（換下第 ${sub.slot + 1} 棒 ${slot.name}）` : sub.pos && sub.pos !== slot.pos ? `第 ${sub.slot + 1} 棒 ${slot.name} 改守 ${sub.pos}` : '選換上的人，或只改守位'
  return (
    <Sheet open={p.open} onClose={p.onClose} ariaLabel={p.mode === 'pitcher' ? '換投' : '換人'} side="bottom" desktopFrom="sm" panelClassName="sm:max-w-xl" contentClassName="max-h-[86vh] overflow-y-auto">
      <div className="p-5 flex flex-col gap-4">
        <div className="inline-flex self-start rounded-[var(--radius-sm)] bg-surface-2 p-0.5" role="tablist" aria-label="換人或換投">
          {(['lineup', 'pitcher'] as const).map((m) => (
            <button key={m} role="tab" type="button" aria-selected={p.mode === m} onClick={() => p.onMode(m)} className={cx('h-9 px-4 rounded-[6px] text-[13px] font-medium cursor-pointer', p.mode === m ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-2 hover:text-ink')}>{m === 'lineup' ? (p.side === 'us' ? '代打／換人' : '換人') : '換投'}</button>
          ))}
        </div>
        {p.mode === 'lineup' ? (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium text-ink-2">換哪一棒</span>
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="換哪一棒">
                {state.lineup.map((l, i) => (
                  <button key={i} type="button" aria-pressed={sub.slot === i} onClick={() => p.setSub({ ...sub, slot: i, pos: p.side === 'us' ? sub.pos : p.fieldPos(i) })} className={cx(chip(sub.slot === i), 'h-12 px-2 flex flex-col items-start justify-center leading-tight text-left')}>
                    <span className="text-[11px] opacity-70 tnum">{i + 1} 棒・{l.pos || '—'}</span>
                    <span className="truncate max-w-full">{l.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium text-ink-2">換成誰<span className="text-muted font-normal">（不選就是只改守位）</span></span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="換成誰">
                {p.batters.names.filter((n) => n !== slot?.name).map((n) => (
                  <button key={n} type="button" aria-pressed={sub.name === n} disabled={p.batters.disabled.has(n)} onClick={() => p.setSub({ ...sub, name: sub.name === n ? '' : n })} className={chip(sub.name === n)}>
                    {n}{p.batters.tag(n) && <span className="text-[11px] opacity-60 ml-0.5">{p.batters.tag(n)}</span>}
                  </button>
                ))}
                {!p.batters.names.length && <span className="text-[12px] text-muted">沒有可以上場的人</span>}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-medium text-ink-2">守位</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="守位">{posOpts.map((x) => <button key={x} type="button" aria-pressed={sub.pos === x} onClick={() => p.onPickPos(x)} className={cx(chip(sub.pos === x), 'min-w-12 px-2.5')}>{x}</button>)}</div>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium text-ink-2">換上投手<span className="text-muted font-normal">（現在 {state.pitcher}，{p.pitchCount.get(state.pitcher) ?? 0} 球）</span></span>
            <div className="flex flex-wrap gap-1.5">
              {p.pitchers.names.filter((n) => n !== state.pitcher).map((n) => {
                const c = p.pitchCount.get(n)
                return (
                  <button key={n} type="button" aria-pressed={p.newPitcher === n} disabled={p.pitchers.disabled.has(n)} onClick={() => p.setNewPitcher(p.newPitcher === n ? '' : n)} className={chip(p.newPitcher === n)}>
                    {n}{p.pitchers.tag(n) && <span className="text-[11px] opacity-60 ml-0.5">{p.pitchers.tag(n)}</span>}
                    {c ? <span className={cx('ml-1 text-[11px] tnum', p.pitchTone(c) === 'critical' ? 'text-critical' : p.pitchTone(c) === 'warning' ? 'text-warning' : 'opacity-60')}>{c} 球</span> : null}
                  </button>
                )
              })}
            </div>
            {p.pitcherHint && <p className="text-[12px] text-ink-2">{p.pitcherHint}</p>}
          </div>
        )}
        <div className="text-[12px] text-muted flex flex-col gap-2">{p.extras}</div>
        <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-3 bg-surface/95 backdrop-blur border-t border-border flex items-center gap-3">
          <span className="text-[13px] text-ink min-w-0 flex-1 line-clamp-2">{summary}</span>
          <Button variant="primary" size="lg" onClick={p.mode === 'pitcher' ? p.onConfirmPitcher : p.onConfirmSub} disabled={p.mode === 'pitcher' ? !p.newPitcher : !p.canSub}>確定</Button>
        </div>
      </div>
    </Sheet>
  )
}
