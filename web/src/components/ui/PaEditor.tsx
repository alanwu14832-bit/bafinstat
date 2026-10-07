/**
 * Post-game editing that looks like 紀錄比賽: every plate appearance is a row; tapping one opens it with the same
 * pitch pad, result chips and batted-ball picker used while recording. Changes stay in the editor until 儲存修改.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, List, Plus, Trash2 } from 'lucide-react'
import { Button } from './Button'
import { Input } from './Input'
import { Select } from './Select'
import { PlayerSelect } from './PlayerSelect'
import { PitchChips, PitchPlays } from './PlayByPlay'
import { cx } from '../../lib/format'
import { POSITIONS, type BattingPA, type PitchingPA } from '../../data/types'
import { count } from '../../record/model'
import { AdvChoice, BattedBallPicker, chipBtn, NO_BATTED_BALL, PitchPad, ResultChips, type ExtraBases } from '../../record/widgets'
import { applyRunEvent, basePath, RUN_EVENTS, runEnding, toggleBase, undoRunStep, withResult, type RunEvent } from '../../record/paEdit'
import { FIELD_POSITIONS } from '../../data/errors'
import { batterEndFor, midOf, OUT_PLAYS, type End, type Step } from '../../record/timeline'
import { playLabel } from '../../data/plays'

export type PaSide = 'bat' | 'pit'
type AnyPA = BattingPA | PitchingPA
const isBat = (side: PaSide, _pa: AnyPA): _pa is BattingPA => side === 'bat'

const CODE_LABEL: Record<string, string> = { I: '1 出局', II: '2 出局', III: '3 出局', L: '殘壘', R: '得分', ER: '自責分' }
const whoOf = (side: PaSide, p: AnyPA) => {
  if (isBat(side, p)) return `${p.order ? `第 ${p.order} 棒 ` : ''}${p.batter || '（未填打者）'}`
  const q = p as PitchingPA
  return `對方 ${q.oppBatter || (q.oppOrder ? `第 ${q.oppOrder} 棒` : '打者')}`
}
const extrasOf = (side: PaSide, p: AnyPA) => (isBat(side, p)
  ? [p.runner && `代跑 ${p.runner}`, p.sb && `盜壘 ${p.sb}`, p.cs && `盜壘失敗 ${p.cs}`, p.advOnError && `失誤進壘 ${p.advOnError}`, p.outOnBase && `壘死 ${p.outOnBase}`, p.rbi && `打點 ${p.rbi}`]
  : [(p as PitchingPA).errors?.length && `失誤 ${(p as PitchingPA).errors!.join('、')}`, (p as PitchingPA).sba && `被盜 ${(p as PitchingPA).sba}`, p.cs && `阻殺 ${p.cs}`, (p as PitchingPA).wp && `暴投 ${(p as PitchingPA).wp}`, (p as PitchingPA).pb && `捕逸 ${(p as PitchingPA).pb}`, (p as PitchingPA).pk && `牽制出局 ${(p as PitchingPA).pk}`]
).filter(Boolean).join('・')

/* ------------------------------------------------------------------ list */
export function PaList({ side, rows, flags, onOpen, onInsert }: { side: PaSide; rows: AnyPA[]; flags: Map<number, string[]>; onOpen: (i: number) => void; onInsert: (at: number) => void }) {
  let last = -1
  return (
    <div className="border border-border rounded-[var(--radius-sm)] overflow-hidden">
      {rows.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-muted">沒有打席</div>}
      <ul>
        {rows.map((p, i) => {
          const header = p.inning !== last
          last = p.inning
          const extra = extrasOf(side, p)
          const pitcher = !isBat(side, p) ? (p as PitchingPA).pitcher : ''
          return (
            <Fragment key={i}>
              {header && <li className="px-3 py-1.5 bg-surface-2/60 text-[11px] font-medium text-muted border-t border-border first:border-t-0 tnum">第 {p.inning || '?'} 局・{side === 'bat' ? '我隊進攻' : '對方進攻'}</li>}
              <li className="border-t border-border first:border-t-0">
                <button type="button" onClick={() => onOpen(i)} className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-surface-2/60 cursor-pointer" aria-label={`修改第 ${i + 1} 個打席：${whoOf(side, p)} ${p.result || '沒有結果'}`}>
                  <span className="w-6 shrink-0 text-[11px] text-muted tnum text-right">{i + 1}</span>
                  <span className="min-w-0 flex-1 flex flex-col gap-1">
                    <span className="flex items-center gap-2 flex-wrap text-[13px]">
                      <span className="font-medium text-ink">{whoOf(side, p)}</span>
                      {isBat(side, p) && p.pos && <span className="text-[11px] text-muted">{p.pos}</span>}
                      {pitcher && <span className="text-[11px] text-muted">投手 {pitcher}</span>}
                      <span className={cx('font-semibold', p.result ? 'text-ink' : 'text-critical')}>{p.result || '沒有結果'}</span>
                      {p.code && <span className="text-[11px] px-1.5 h-5 inline-flex items-center rounded-[4px] bg-surface-2 text-ink-2">{CODE_LABEL[p.code] ?? p.code}</span>}
                      {flags.has(i) && <span title={flags.get(i)!.join('\n')} className="inline-flex items-center gap-1 text-[11px] text-warning"><AlertTriangle className="size-3.5" />{flags.get(i)!.length}</span>}
                    </span>
                    <span className="flex items-center gap-2 flex-wrap text-[11px] text-muted">
                      {(p.outsBefore !== undefined || p.basesBefore) && <span className="tnum">{[p.outsBefore !== undefined && `${p.outsBefore} 出局`, p.basesBefore && `壘上 ${p.basesBefore}`].filter(Boolean).join('・')}</span>}
                      <PitchChips pitches={p.pitches} />
                      {extra && <span>{extra}</span>}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted shrink-0" />
                </button>
              </li>
            </Fragment>
          )
        })}
      </ul>
      <div className="px-2 py-2 border-t border-border">
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => onInsert(rows.length)}>在最後新增一個打席</Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ one plate appearance */
function Stepper({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-[13px]">
      <span className="text-ink-2 min-w-[3.5rem]">{label}</span>
      <button type="button" aria-label={`${label}減一`} onClick={() => onChange(Math.max(0, value - 1))} className="size-9 pointer-fine:size-8 rounded-[6px] border border-border hover:bg-surface-2 cursor-pointer">−</button>
      <span className="tnum font-semibold w-5 text-center" aria-label={`${label} ${value}`}>{value}</span>
      <button type="button" aria-label={`${label}加一`} onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)} className="size-9 pointer-fine:size-8 rounded-[6px] border border-border hover:bg-surface-2 cursor-pointer">＋</button>
    </div>
  )
}
/** Scroll the nearest scrolling ancestor so `el` sits just below that container's sticky header (the sheet title). */
function scrollBelowHeader(el: HTMLElement) {
  let box = el.parentElement
  while (box && !(box.scrollHeight > box.clientHeight && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement
  const target = box ?? document.scrollingElement
  if (!target) return
  const header = box ? [...box.children].find((c) => getComputedStyle(c).position === 'sticky') : null
  const top = header ? header.getBoundingClientRect().bottom : box ? box.getBoundingClientRect().top : 0
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  target.scrollBy?.({ top: el.getBoundingClientRect().top - top - 12, behavior: reduce ? 'auto' : 'smooth' })
}
const Section = ({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) => (
  <section className="flex flex-col gap-2">
    <div className="flex items-start gap-2 min-h-7"><span className="text-[12px] font-medium text-ink-2 whitespace-nowrap leading-7">{title}</span>{aside}</div>
    {children}
  </section>
)

/** 一安 1B → 失誤進壘 2B → 盜壘 3B → 得分 */
function RunPath({ pa }: { pa: BattingPA }) {
  const steps = basePath(pa)
  return (
    <span className="inline-flex items-center gap-1 flex-wrap text-[12px]">
      {steps.map((st, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight className="size-3.5 text-muted" />}
          <span className={cx('inline-flex items-center gap-1 h-6 px-2 rounded-[6px] border', st.end === 'run' ? 'border-[color-mix(in_srgb,var(--good)_45%,transparent)] text-ink' : st.end === 'out' ? 'border-[color-mix(in_srgb,var(--critical)_40%,transparent)] text-critical' : 'border-border text-ink-2')}>
            {st.label}{st.base && st.base < 4 ? <span className="text-muted tnum">{st.base}B</span> : null}
          </span>
        </Fragment>
      ))}
    </span>
  )
}
const runBtn = (out?: boolean, on?: boolean) => cx('h-9 pointer-fine:h-8 px-2.5 rounded-[6px] border text-[12px] font-medium cursor-pointer', on ? 'border-ink bg-ink text-bg' : cx('border-border bg-surface hover:bg-surface-2', out && 'text-critical'))
/** The 紀錄比賽 runner menu, applied to one row. */
function RunButtons({ pa, onChange, label }: { pa: BattingPA; onChange: (pa: BattingPA) => void; label: string }) {
  const ending = runEnding(pa)
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${label} 的跑壘`}>
      {RUN_EVENTS.map((e) => {
        // 牽制出局 and 壘死 are the same out on the bases in the data; it shows as 壘死
        const on = e.ev === ending
        return <button key={e.ev} type="button" aria-pressed={e.ev === 'sb' || e.ev === 'err' ? undefined : on} onClick={() => onChange(applyRunEvent(pa, e.ev as RunEvent))} className={runBtn(e.out, on)}>{e.label}</button>
      })}
      {basePath(pa).length > 1 && <button type="button" onClick={() => onChange(undoRunStep(pa))} className={cx(runBtn(), 'text-ink-2')}>復原上一步</button>}
    </div>
  )
}
/** Tap to add one, − to take one away (暴投 ×2). */
function CountButton({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <span className="inline-flex items-center rounded-[6px] border border-border bg-surface overflow-hidden">
      <button type="button" onClick={() => onChange(value + 1)} className="h-9 pointer-fine:h-8 px-2.5 text-[12px] font-medium hover:bg-surface-2 cursor-pointer">{label}{value > 0 && <span className="ml-1 tnum text-ink">×{value}</span>}</button>
      {value > 0 && <button type="button" aria-label={`${label}減一`} onClick={() => onChange(value - 1)} className="h-9 pointer-fine:h-8 px-2 border-l border-border text-muted hover:text-ink hover:bg-surface-2 cursor-pointer">−</button>}
    </span>
  )
}

/** Runner plays between pitches, as 紀錄比賽 offers them (a wild pitch while we bat is the other team's). */
const PLAY_KINDS: Record<PaSide, string[]> = {
  bat: ['sb', 'wp', 'pb', 'err', 'throw', 'advance', 'cs', 'pk', 'out'],
  pit: ['sb', 'wp', 'pb', 'throw', 'advance', 'cs', 'pk', 'out'],
}
export interface TimelineProps {
  step: Step
  /** 代跑 for one of our runners (from this plate appearance on); absent for the opponent */
  onPinchRunner?: (row: number, name: string) => void
  pinchNames?: string[]
  /** current 代跑 of a runner's row */
  runnerOf?: (row: number) => string | undefined
  /** a new result moves the batter (and forces runners) through the timeline */
  onResult: (result: string) => void
  nameOf: (row: number) => string
  onEnd: (who: number | 'batter', end: End) => void
  /** runner play(s) after `pitch` pitches (0 = before the first): each runner in `rows` moves up one or is out */
  onPlay: (pitch: number, kind: string, rows: number[]) => void
  /** take back the n-th play of this plate appearance */
  onRemovePlay: (n: number) => void
  /** 趁傳進壘／失誤進壘 on the batted ball: whether `who` went further than the result alone gives (can), and how it is marked */
  throwOf: (who: number | 'batter') => { can: boolean; kind: ExtraBases | null }
  onThrow: (who: number | 'batter', kind: ExtraBases | null) => void
  /** one more base on the throw: moves him up one and marks it 趁傳進壘 */
  onThrowUp: (who: number | 'batter') => void
  /** opponent runs: earned (ER) or not (R), on the row of whoever scored */
  earned?: { of: (row: number) => boolean; toggle: (row: number) => void }
  /** why the last change was not made (it would put two runners on a base, or a fourth out) */
  notice: string | null
}
/** One segmented control: where someone was when this plate appearance ended. */
function EndPicker({ value, from, onPick, label }: { value: End; from: number; onPick: (e: End) => void; label: string }) {
  const opts: Array<{ v: End; l: string }> = [{ v: 'out', l: '出局' }, ...([1, 2, 3] as const).filter((b) => b >= Math.max(1, from)).map((b) => ({ v: b as End, l: `${b}B` })), { v: 'home', l: '得分' }]
  return (
    <div className="inline-flex rounded-[var(--radius-sm)] bg-surface p-0.5 gap-0.5 border border-border" role="group" aria-label={`${label} 這打席結束時`}>
      {opts.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={value === o.v} onClick={() => onPick(o.v)}
          className={cx('h-9 pointer-fine:h-8 min-w-11 px-2.5 rounded-[6px] text-[12px] font-medium cursor-pointer', value === o.v ? (o.v === 'out' ? 'bg-critical text-bg' : 'bg-ink text-bg') : cx('text-ink-2 hover:text-ink hover:bg-surface-2', o.v === 'out' && 'text-critical'))}>{o.l}</button>
      ))}
    </div>
  )
}
/**
 * 跑壘（逐球）: pick when (after which pitch), who, and what happened — 第 2 球暴投, everyone moves up; 第 3 球盜壘.
 * The play lands between those pitches; the runners on base are the ones there at that moment.
 */
function PlayBuilder({ side, pitches, tl }: { side: PaSide; pitches: number; tl: TimelineProps }) {
  const { step, nameOf } = tl
  const [when, setWhen] = useState<number | null>(null)
  const [who, setWho] = useState<number[]>([])
  const t = Math.min(when ?? pitches, pitches)
  const on = midOf({ before: step.before, moves: step.moves.filter((m) => m.at <= t) })
  const picked = who.filter((r) => on.some((o) => o.row === r))
  const [hint, setHint] = useState<string | null>(null)
  useEffect(() => { setWho([]); setHint(null) }, [step.index, t])
  if (!step.before.length && !step.moves.length) return null
  const play = (kind: string) => {
    // nobody picked: the only runner, or everyone on a wild pitch / passed ball
    const rows = picked.length ? picked : on.length === 1 || kind === 'wp' || kind === 'pb' ? on.map((o) => o.row) : []
    if (!rows.length) { setHint('先點一位跑者'); return }
    setHint(null)
    tl.onPlay(t, kind, rows)
    setWho([])
  }
  const whenOpts = Array.from({ length: pitches + 1 }, (_, k) => k)
  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
        <span className="text-ink-2 font-medium mr-1">什麼時候</span>
        {whenOpts.map((k) => <button key={k} type="button" aria-pressed={t === k} onClick={() => setWhen(k === pitches ? null : k)} className={cx(chipBtn(t === k), 'h-8 px-2.5 text-[12px]')}>{k === 0 ? '第一球前' : `第 ${k} 球後`}</button>)}
      </div>
      {on.length ? (
        <>
          <div className="flex items-center gap-1.5 flex-wrap text-[12px]" role="group" aria-label="哪位跑者">
            <span className="text-ink-2 font-medium mr-1">誰</span>
            {on.map((o) => {
              const sel = picked.includes(o.row)
              return <button key={o.row} type="button" aria-pressed={sel} onClick={() => setWho(sel ? picked.filter((r) => r !== o.row) : [...picked, o.row])} className={cx(chipBtn(sel), 'h-8 px-2.5 text-[12px]')}><span className="opacity-70 tnum mr-1">{o.base}B</span>{nameOf(o.row)}</button>
            })}
            {on.length > 1 && <span className="text-[11px] text-muted">可以點多位；暴投、捕逸不點就是全部跑者</span>}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="發生了什麼">
            {PLAY_KINDS[side].map((k) => <button key={k} type="button" onClick={() => play(k)} className={runBtn(OUT_PLAYS.has(k))}>{playLabel(k)}</button>)}
          </div>
          {hint && <p role="alert" className="text-[12px] text-critical">{hint}</p>}
        </>
      ) : <p className="text-[12px] text-muted">{t ? `第 ${t} 球後` : '第一球前'}壘上沒有跑者</p>}
    </div>
  )
}

/** An opponent run: 自責分 (ER) or 非自責 (R); tap to switch. */
function EarnedChip({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onToggle} title="點一下切換自責／非自責"
      className={cx('h-9 pointer-fine:h-8 px-2.5 rounded-full border text-[12px] font-medium cursor-pointer', on ? 'border-border bg-surface text-ink' : 'border-[color-mix(in_srgb,var(--warning)_55%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-ink')}>
      {on ? '自責分' : '非自責分'}
    </button>
  )
}

/** 我隊守備失誤 folded into one button; open when the result is an error or errors are already counted. */
function OurErrors({ pa, onChange }: { pa: PitchingPA; onChange: (pa: AnyPA) => void }) {
  const n = pa.errors?.length ?? 0
  // 失誤進壘 on the play: someone of ours erred
  const errPlay = !!pa.events?.some((e) => e.play && e.kind === 'err')
  const [open, setOpen] = useState(n > 0 || pa.result === '失誤' || errPlay)
  useEffect(() => { if (pa.result === '失誤' || errPlay) setOpen(true) }, [pa.result, errPlay])
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="self-start h-9 pointer-fine:h-8 px-3 rounded-[var(--radius-sm)] border border-dashed border-border-strong text-[12px] font-medium text-ink-2 hover:text-ink cursor-pointer">＋ 我隊守備失誤</button>
  return (
    <Section title="我隊守備失誤" aside={<span className="text-[11px] text-muted">例如一安＋左外野漏接 → 點 LF；失誤兩次就點兩下</span>}>
      <div className="flex flex-wrap gap-1.5">
        {FIELD_POSITIONS.map((pos) => {
          const k = (pa.errors ?? []).filter((x) => x === pos).length
          return <CountButton key={pos} label={pos} value={k} onChange={(v) => { const rest = (pa.errors ?? []).filter((x) => x !== pos); const errors = [...rest, ...Array.from({ length: v }, () => pos)]; const nx: PitchingPA = { ...pa, errors }; if (!errors.length) delete nx.errors; onChange(nx) }} />
        })}
      </div>
      {pa.result === '失誤' && !pa.errors?.length && <p className="text-[12px] text-muted">結果是「失誤」：沒點守位時，依落點算一次失誤。</p>}
      {errPlay && pa.result !== '失誤' && !pa.errors?.length && <p role="alert" className="text-[12px] text-critical">有跑者「失誤進壘」：請點是誰失誤</p>}
    </Section>
  )
}

/** 趁傳進壘／失誤進壘 on the batted ball, shown once he ends further than the result alone takes him. */
function ThrowChip({ tl, who, name }: { tl: TimelineProps; who: number | 'batter'; name: string }) {
  const t = tl.throwOf(who)
  if (!t.can) return null
  return <AdvChoice kind={t.kind} onPick={(k) => tl.onThrow(who, k)} name={name} />
}

/** 壘上跑者 for one plate appearance: who was on base, where each of them (and the batter) ended up, and what happened. */
function TimelineRunners({ side, pa, tl, picked }: { side: PaSide; pa: AnyPA; tl: TimelineProps; picked: number | null }) {
  const { step, nameOf } = tl
  const batterName = side === 'bat' ? (pa as BattingPA).batter || '打者' : nameOf(step.index)
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {midOf(step).map((o) => {
          const name = nameOf(o.row)
          return (
            <li key={o.row} id={`tl-runner-${o.row}`} className={cx('rounded-[var(--radius-sm)] border bg-surface px-3 py-2 flex flex-col gap-2 scroll-mt-28 transition-colors motion-reduce:transition-none', picked === o.row ? 'border-ink ring-2 ring-ink/15' : 'border-border')}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-medium text-ink min-w-[7rem]"><span className="text-muted tnum mr-1">{o.base}B</span>{name}</span>
                <EndPicker value={tl.step.dest[o.row] ?? o.base} from={o.base} onPick={(e) => tl.onEnd(o.row, e)} label={name} />
                <ThrowChip tl={tl} who={o.row} name={name} />
                {tl.earned && tl.step.dest[o.row] === 'home' && <EarnedChip on={tl.earned.of(o.row)} onToggle={() => tl.earned!.toggle(o.row)} />}
              </div>
              {tl.onPinchRunner && <label className="flex items-center gap-2 text-[12px] text-ink-2">代跑<PlayerSelect aria-label={`${name} 的代跑`} size="sm" value={tl.runnerOf?.(o.row) ?? ''} onChange={(v) => tl.onPinchRunner!(o.row, v)} names={tl.pinchNames ?? []} placeholder="沒有代跑" className="w-[150px]" /></label>}
            </li>
          )
        })}
        {/* the batter: where his result put him; what he does next is recorded on the following plate appearances */}
        <li className="rounded-[var(--radius-sm)] border border-ink/25 bg-surface px-3 py-2 flex flex-col gap-2 text-[13px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink min-w-[7rem]"><span className="text-muted mr-1">打者</span>{batterName}<span className="text-muted font-normal ml-1">{pa.result ? `（${pa.result}）` : ''}</span></span>
            {/* where the batter ended on his own play: a single that took second on the throw ends on 2B */}
            <EndPicker value={step.batter} from={typeof batterEndFor(pa.result) === 'number' ? (batterEndFor(pa.result) as number) : 1} onPick={(e) => tl.onEnd('batter', e)} label={batterName} />
            <ThrowChip tl={tl} who="batter" name={batterName} />
            {tl.earned && step.batter === 'home' && <EarnedChip on={tl.earned.of(step.index)} onToggle={() => tl.earned!.toggle(step.index)} />}
            {typeof step.batter === 'number' && (
              <button type="button" onClick={() => tl.onThrowUp('batter')} className="h-9 pointer-fine:h-8 px-2.5 rounded-full border border-border bg-surface text-[12px] font-medium text-ink-2 hover:text-ink hover:bg-surface-2 cursor-pointer">
                趁傳上 {step.batter >= 3 ? '本壘' : `${step.batter + 1}B`}
              </button>
            )}
          </div>
          {step.batter !== 'out' && step.batter !== 'home' && <span className="text-[11px] text-muted">他打完停在哪一壘；之後的盜壘、暴投等在下一個打席記</span>}
        </li>
      </ul>
      {tl.notice && <p role="alert" className="text-[12px] text-critical">{tl.notice}</p>}
    </div>
  )
}

export interface PaPanelProps {
  side: PaSide
  pa: AnyPA
  index: number
  total: number
  issues: string[]
  names: string[]
  pitcherNames: string[]
  onChange: (pa: AnyPA) => void
  onNav: (index: number) => void
  onClose: () => void
  onDelete: () => void
  onInsert: (at: number) => void
  onMove: (d: -1 | 1) => void
  /** our half-inning: the rows before this one whose runners may still be on base, editable from here */
  others?: Array<{ index: number; pa: BattingPA }>
  onChangeOther?: (index: number, pa: BattingPA) => void
  /** the inning could be followed: runners shown as they were for this plate appearance */
  timeline?: TimelineProps
  /** the inning's saved bases do not add up: lay its runners out again from the results */
  onRebuild?: () => void
}

export function PaPanel({ side, pa, index, total, issues, names, pitcherNames, onChange, onNav, onClose, onDelete, onInsert, onMove, others = [], onChangeOther, timeline, onRebuild }: PaPanelProps) {
  const set = (patch: Partial<AnyPA>) => onChange({ ...pa, ...patch } as AnyPA)
  // a play after a later pitch now follows the one before it
  const removePitch = (i: number) => set({ pitches: pa.pitches.filter((_, k) => k !== i), ...(pa.events ? { events: pa.events.map((e) => (e.at > i ? { ...e, at: e.at - 1 } : e)) } : {}) })
  const c = count(pa.pitches)
  const bases = new Set((pa.basesBefore ?? '').split(''))
  const codes = side === 'bat' ? ['I', 'II', 'III', 'L', 'R'] : ['I', 'II', 'III', 'L', 'R', 'ER']
  const bat = isBat(side, pa) ? pa : null
  const pit = !bat ? (pa as PitchingPA) : null
  const [picked, setPicked] = useState<number | null>(null)
  const [whoOpen, setWhoOpen] = useState(false)
  useEffect(() => { setPicked(null); setWhoOpen(false) }, [index])
  // opening a plate appearance (or moving to the next) brings it into view
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) scrollBelowHeader(ref.current) }, [index])
  return (
    <div ref={ref} className="flex flex-col gap-4 rounded-[var(--radius-sm)] border border-ink/20 bg-surface-2/40 p-3 md:p-4">
      {/* where am I */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ghost" icon={<List />} onClick={onClose}>回到清單</Button>
        <div className="flex-1 min-w-0 text-center text-[13px] text-ink tnum whitespace-nowrap" aria-label={`第 ${index + 1} / ${total} 個打席`}><span className="hidden sm:inline">第 </span>{index + 1} / {total}<span className="hidden sm:inline"> 個打席</span></div>
        <Button size="sm" variant="outline" icon={<ChevronLeft />} onClick={() => onNav(index - 1)} disabled={index === 0}>上一個</Button>
        <Button size="sm" variant="outline" onClick={() => onNav(index + 1)} disabled={index >= total - 1}>下一個<ChevronRight className="size-4" /></Button>
      </div>

      {/* situation */}
      <Section title="局面">
        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
          {timeline ? (
            // worked out from the plate appearances before it: inning, outs and runners when he came up (change the runners below)
            <span className="text-[14px] text-ink tnum">
              第 {pa.inning} 局・{Math.max(0, (pa.outsBefore ?? 0) - timeline.step.moves.filter((m) => m.to === 'out').length)} 出局・
              {timeline.step.before.length ? [...timeline.step.before].sort((a, z) => a.base - z.base).map((o) => `${o.base}B ${timeline.nameOf(o.row)}`).join('、') : '壘上無人'}
            </span>
          ) : (
            <>
            <Stepper label="局" value={pa.inning} onChange={(v) => set({ inning: Math.max(1, v) })} />
            <>
              <div className="inline-flex items-center gap-1.5 text-[13px]">
                <span className="text-ink-2">出局(前)</span>
                {[0, 1, 2].map((o) => <button key={o} type="button" aria-pressed={pa.outsBefore === o} onClick={() => set({ outsBefore: o })} className={cx(chipBtn(pa.outsBefore === o), 'w-10 px-0 tnum')}>{o}</button>)}
              </div>
              <div className="inline-flex items-center gap-1.5 text-[13px]">
                <span className="text-ink-2">壘上(前)</span>
                {([1, 2, 3] as const).map((b) => <button key={b} type="button" aria-pressed={bases.has(String(b))} onClick={() => set({ basesBefore: toggleBase(pa.basesBefore, b) })} className={cx(chipBtn(bases.has(String(b))), 'w-11 px-0')}>{b}B</button>)}
                <span className="text-[12px] text-muted tnum ml-1">{pa.basesBefore || '—'}</span>
              </div>
            </>
            </>
          )}
        </div>
        {!timeline && onRebuild && (
          <div role="status" className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2.5 text-[12px] text-ink flex flex-col gap-2">
            <span>這局記下的壘上狀況前後對不起來（舊的匯入資料，或之前的錯誤留下的），所以沒辦法顯示壘包圖。</span>
            <Button size="sm" variant="outline" className="self-start" onClick={onRebuild}>依打擊結果重建這局的跑者</Button>
          </div>
        )}
      </Section>

      {/* who: one line; the selects only when changing it (or when nobody is filled in yet) */}
      {!whoOpen && (bat ? bat.batter : pit?.pitcher) ? (
        <div className="flex items-center gap-2 text-[14px] text-ink">
          {bat ? <span><span className="text-muted tnum">{bat.order ? `第 ${bat.order} 棒` : '棒次—'}</span> <span className="font-semibold">{bat.batter}</span> <span className="text-muted">{bat.pos}</span></span>
            : <span>投手 <span className="font-semibold">{pit!.pitcher}</span><span className="text-muted">・對方{pit!.oppOrder ? `第 ${pit!.oppOrder} 棒` : ''}{pit!.oppBatter ? ` ${pit!.oppBatter}` : ''}</span></span>}
          <button type="button" onClick={() => setWhoOpen(true)} className="ml-auto h-9 pointer-fine:h-7 text-[12px] text-ink-2 hover:text-ink underline underline-offset-2 cursor-pointer">修改</button>
        </div>
      ) : bat ? (
        <Section title="打者">
          <div className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col gap-1 text-[12px] text-ink-2">棒次<Select value={bat.order ? String(bat.order) : ''} onChange={(e) => set({ order: e.target.value ? Number(e.target.value) : undefined })} options={[{ value: '', label: '—' }, ...Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: `第 ${i + 1} 棒` }))]} className="w-[104px]" /></label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-2 flex-1 min-w-[160px]">打者<PlayerSelect aria-label="打者" value={bat.batter} onChange={(v) => set({ batter: v })} names={bat.batter && !names.includes(bat.batter) ? [bat.batter, ...names] : names} className="w-full" /></label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-2">守位<Select value={bat.pos ?? ''} onChange={(e) => set({ pos: e.target.value || undefined })} options={[{ value: '', label: '—' }, ...POSITIONS.map((p) => ({ value: p, label: p }))]} className="w-[88px]" /></label>
          </div>
        </Section>
      ) : pit && (
        <Section title="投手與對方打者">
          <div className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col gap-1 text-[12px] text-ink-2 flex-1 min-w-[160px]">我隊投手<PlayerSelect aria-label="投手" value={pit.pitcher} onChange={(v) => set({ pitcher: v })} names={pit.pitcher && !pitcherNames.includes(pit.pitcher) ? [pit.pitcher, ...pitcherNames] : pitcherNames} className="w-full" /></label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-2">對方棒次<Select value={pit.oppOrder ? String(pit.oppOrder) : ''} onChange={(e) => set({ oppOrder: e.target.value ? Number(e.target.value) : undefined })} options={[{ value: '', label: '—' }, ...Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: `第 ${i + 1} 棒` }))]} className="w-[104px]" /></label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-2 w-[140px]">對方打者<Input value={pit.oppBatter ?? ''} onChange={(e) => set({ oppBatter: e.target.value || undefined })} placeholder="可不填" /></label>
          </div>
        </Section>
      )}

      {/* pitches */}
      <Section title="逐球" aside={<span className="text-[12px] text-muted tnum">{c.balls} 壞 {c.strikes} 好・點一顆球或一個跑壘事件可刪除</span>}>
        <div className="flex items-center gap-2 min-h-8 flex-wrap">
          {timeline
            ? <PitchPlays pitches={pa.pitches} events={timeline.step.moves} whoOf={(n) => timeline.nameOf(timeline.step.moves[n]?.row)} onRemovePitch={removePitch} onRemovePlay={timeline.onRemovePlay} />
            : <PitchChips pitches={pa.pitches} onRemove={removePitch} />}
          {pa.pitches.length > 0 && <button type="button" onClick={() => set({ pitches: [], ...(pa.events ? { events: pa.events.map((e) => ({ ...e, at: 0 })) } : {}) })} className="ml-auto h-9 pointer-fine:h-7 text-[12px] text-ink-2 hover:text-ink cursor-pointer underline underline-offset-2">全部清除</button>}
        </div>
        {/* why the last change to the runners did not go through, right where it was tried */}
        {timeline?.notice && <p role="alert" className="text-[12px] text-critical">{timeline.notice}</p>}
        <PitchPad onPitch={(code) => { if (pa.pitches[pa.pitches.length - 1] !== 'IP') set({ pitches: [...pa.pitches, code] }) }} disabled={pa.pitches[pa.pitches.length - 1] === 'IP'} />
        {timeline && <PlayBuilder side={side} pitches={pa.pitches.length} tl={timeline} />}
      </Section>

      {/* result */}
      <Section title="結果">
        <ResultChips value={pa.result} onPick={(r) => (timeline ? timeline.onResult(r) : onChange(withResult(pa, r)))} />
      </Section>
      {pa.result && !NO_BATTED_BALL.has(pa.result) && (
        <BattedBallPicker result={pa.result} value={pa} onChange={(v) => set({ loc: v.loc, traj: v.traj, quality: v.quality })} />
      )}

      {/* running and scoring: the same moves as tapping a runner while recording */}
      {timeline ? (
        <Section title="壘上跑者" aside={<span className="text-[11px] text-muted">打擊結果發生時誰在壘上（逐球跑壘之後）、打完各自到哪；改了之後後面的打席自動跟著變</span>}>
          <TimelineRunners side={side} pa={pa} tl={timeline} picked={picked} />
          {bat && <div className="mt-1"><Stepper label="打點" value={bat.rbi} onChange={(v) => set({ rbi: Math.min(4, v) })} max={4} /></div>}
        </Section>
      ) : null}
      {timeline && pit && !timeline.step.before.length && !timeline.step.moves.length ? (
        // with runners on, 被盜壘／阻殺／暴投／捕逸／牽制出局 are counted from the plays in 逐球; with nobody on, a wild pitch
        // or passed ball has no runner to pick, so it is counted here
        <Section title="壘上無人時的暴投・捕逸" aside={<span className="text-[11px] text-muted">壘上有人時，在上面「逐球」選跑者記，次數會自動算</span>}>
          <div className="flex flex-wrap gap-1.5">
            <CountButton label="暴投" value={pit.wp} onChange={(v) => set({ wp: v })} />
            <CountButton label="捕逸" value={pit.pb} onChange={(v) => set({ pb: v })} />
          </div>
        </Section>
      ) : null}
      {timeline ? (pit && (
        <OurErrors pa={pit} onChange={onChange} />
      )) : bat ? (
        <>
          <Section title="打點">
            <Stepper label="打點" value={bat.rbi} onChange={(v) => set({ rbi: Math.min(4, v) })} max={4} />
          </Section>
          {others.length > 0 && onChangeOther && (
            <Section title="壘上其他跑者" aside={<span className="text-[11px] text-muted">這局在這個打席之前上壘的人；他們在這個打席期間盜壘、失誤進壘、得分，在這裡記</span>}>
              <ul className="flex flex-col gap-2">
                {others.map(({ index: k, pa: o }) => (
                  <li key={k} className="rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap text-[13px]">
                      <span className="font-medium text-ink">{o.runner || o.batter}</span>
                      {o.runner && <span className="text-[11px] text-muted">代跑（{o.batter}）</span>}
                      <span className="text-[11px] text-muted tnum">第 {k + 1} 個打席</span>
                      <RunPath pa={o} />
                    </div>
                    <RunButtons pa={o} onChange={(n) => onChangeOther(k, n)} label={o.runner || o.batter} />
                    <label className="flex items-center gap-2 text-[12px] text-ink-2">代跑<PlayerSelect aria-label={`${o.batter} 的代跑`} size="sm" value={o.runner ?? ''} onChange={(v) => { const n = { ...o, runner: v || undefined }; if (!v) delete n.runner; onChangeOther(k, n) }} names={names.filter((n) => n !== o.batter)} placeholder="沒有代跑" className="w-[150px]" /></label>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      ) : pit && (
        <>
          <Section title="跑壘與失分" aside={<span className="text-[11px] text-muted">這個打席期間發生的；點一下加一次</span>}>
            <div className="flex flex-wrap gap-1.5">
              <CountButton label="被盜壘" value={pit.sba} onChange={(v) => set({ sba: v })} />
              <CountButton label="阻殺（盜壘失敗）" value={pit.cs} onChange={(v) => set({ cs: v })} />
              <CountButton label="暴投" value={pit.wp} onChange={(v) => set({ wp: v })} />
              <CountButton label="捕逸" value={pit.pb} onChange={(v) => set({ pb: v })} />
              <CountButton label="牽制出局" value={pit.pk} onChange={(v) => set({ pk: v })} />
            </div>
          </Section>
          <OurErrors pa={pit} onChange={onChange} />
        </>
      )}

{!timeline && (
      <Section title="結果代碼" aside={<span className="text-[11px] text-muted">I／II／III 這個打席造成第幾個出局；L 殘壘；R 得分{side === 'pit' ? '（非自責）；ER 自責分' : ''}</span>}>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={!pa.code} onClick={() => { const n = { ...pa }; delete n.code; onChange(n) }} className={chipBtn(!pa.code)}>無</button>
          {codes.map((k) => <button key={k} type="button" aria-pressed={pa.code === k} onClick={() => set({ code: k })} className={chipBtn(pa.code === k)}>{k}<span className="ml-1 text-[11px] opacity-70">{CODE_LABEL[k]}</span></button>)}
        </div>
      </Section>
      )}

      <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-2">備註<Input value={pa.note ?? ''} onChange={(e) => set({ note: e.target.value || undefined })} /></label>

      {issues.length > 0 && (
        <div role="status" className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2 text-[12px] text-ink flex flex-col gap-1">
          {issues.map((m) => <div key={m} className="flex items-start gap-1.5"><AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-warning" />{m}</div>)}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-border">
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => onInsert(index)}>在前面插入</Button>
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => onInsert(index + 1)}>在後面插入</Button>
        <Button size="sm" variant="ghost" icon={<ArrowUp />} aria-label="往前移" title="往前移" onClick={() => onMove(-1)} disabled={index === 0} />
        <Button size="sm" variant="ghost" icon={<ArrowDown />} aria-label="往後移" title="往後移" onClick={() => onMove(1)} disabled={index >= total - 1} />
        <Button size="sm" variant="ghost" icon={<Trash2 />} className="ml-auto text-critical hover:text-critical" onClick={() => { if (window.confirm(`刪除第 ${index + 1} 個打席？（按「儲存修改」後才會生效）`)) onDelete() }}>刪除這個打席</Button>
      </div>
    </div>
  )
}
