/**
 * 紀錄比賽: the opponent's side of the sheet — who is pitching for them (左投／右投, a name if wanted) and, when the
 * recorder opts in, the names in their batting order, and which side their batter stands on (左打／右打). The pitcher's
 * hand and the batter's side are required (「不知道」 is an answer): the pitch pad waits for them (model needsOppHand /
 * needsOppBats). Names stay optional.
 */
import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../components/ui/Sheet'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { cx } from '../lib/format'
import { OPP_BATS_LABEL, OPP_HAND_LABEL, type OppBats, type OppHand } from '../data/types'
import type { OppPitcher } from './model'
import { chipBtn } from './widgets'

const HANDS: OppHand[] = ['L', 'R']

/** 「對方 右投」 / 「對方 王・右」 / 「對方投手」 (nothing yet, or 不知道 without a name). */
export function oppPitcherLabel(p?: OppPitcher): string {
  if (!p) return '對方投手'
  if (p.name) return `對方 ${p.name}${p.hand ? `・${p.hand === 'L' ? '左' : '右'}` : ''}`
  return p.hand ? `對方 ${OPP_HAND_LABEL[p.hand]}` : '對方投手'
}
const BATS: OppBats[] = ['L', 'R']
/** 「右投 王」, 「左投」, 「王」 */
export function oppPitcherText(p?: { name?: string; hand?: OppHand }): string {
  return [p?.hand ? OPP_HAND_LABEL[p.hand] : '', p?.name ?? ''].filter(Boolean).join(' ')
}

/**
 * The question while we bat, before the first pitch of our first half and after every 對方換投 without a hand: one tap
 * on 左投／右投, or 不知道 (null). Required: the pitch pad waits for it. `name`: the pitcher's name, when he has one.
 */
export function OppPitcherStrip({ onHand, onName, name }: { onHand: (h: OppHand | null) => void; onName: () => void; name?: string }) {
  return (
    <div role="group" aria-label="對方投手左右投" className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-accent-soft px-3 py-2">
      <span className="text-[13px] font-medium text-ink">對方投手{name ? ` ${name}` : ''}是？</span>
      <div className="flex items-center gap-1.5">
        {HANDS.map((h) => <button key={h} type="button" onClick={() => onHand(h)} className={cx(chipBtn(false), 'h-10 min-w-14')}>{OPP_HAND_LABEL[h]}</button>)}
        <button type="button" onClick={() => onHand(null)} className="h-10 px-2 text-[12px] text-ink-2 hover:text-ink underline underline-offset-2 cursor-pointer">不知道</button>
      </div>
      {!name && <Button variant="ghost" size="sm" onClick={onName}>填姓名</Button>}
      <span className="basis-full text-[11px] text-ink-2">選好才能記投球；用來看對左投、對右投的成績</span>
    </div>
  )
}

/**
 * 左打｜右打 (and a small 不知道) for their batter up now, next to 「對方第 N 棒」. `value`: what his slot has this game
 * ('?' = 不知道), undefined = not picked yet (the pitch pad waits: 先選對方打者左打或右打).
 */
export function OppBatsChips({ value, onPick }: { value?: OppBats | '?'; onPick: (b: OppBats) => void }) {
  // (no 不知道: every opponent batter's side is recorded — the batted-ball profile needs it for Pull / Oppo)
  return (
    <div role="group" aria-label="對方打者左打或右打" className="flex items-center gap-1.5">
      <div className="inline-flex rounded-[var(--radius-sm)] bg-surface p-0.5 gap-0.5 border border-border">
        {BATS.map((b) => (
          <button key={b} type="button" aria-pressed={value === b} onClick={() => onPick(b)}
            className={cx('h-9 min-w-12 px-2.5 rounded-[6px] text-[13px] font-medium cursor-pointer', value === b ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink hover:bg-surface-2')}>{OPP_BATS_LABEL[b]}</button>
        ))}
      </div>
    </div>
  )
}

/**
 * 對方投手 sheet. With a pitcher already on the mound it offers two different things: 更正這位投手 (the default — the
 * same man, his name or hand was written down wrong: his stint so far is rewritten and his pitch count goes on) and
 * 對方換投 (a new pitcher from the next plate appearance, his count from 0). The first time it just sets him.
 * Name optional, one-tap chips of pitchers already met, 左投／右投.
 */
export function OppPitcherSheet({ open, onClose, current, options, earlierRows, onConfirm, onCorrect, stintRows = 0, quickChange = false }: {
  open: boolean
  onClose: () => void
  current?: OppPitcher
  options: Array<{ name: string; hand?: OppHand }>
  /** first entry only: this half's plate appearances so far, which get it too */
  earlierRows: number
  /** 對方換投 (or the first entry) */
  onConfirm: (p: OppPitcher) => void
  /** 更正這位投手 (shown with a pitcher on the mound) */
  onCorrect?: (p: OppPitcher) => void
  /** our plate appearances against the pitcher on the mound so far (what 更正 rewrites) */
  stintRows?: number
  /** opened from the 對方換投 button: starts on 對方換投, and a tap on 左投／右投／不知道 finishes it (a name typed first goes with it) */
  quickChange?: boolean
}) {
  const [name, setName] = useState('')
  // 'unknown' = 不知道 (OppPitcher.handUnknown)
  const [hand, setHand] = useState<OppHand | 'unknown' | undefined>(undefined)
  const [mode, setMode] = useState<'correct' | 'change'>('correct')
  const fill = (p?: OppPitcher) => { setName(p?.name ?? ''); setHand(p?.hand ?? (p?.handUnknown ? 'unknown' : undefined)) }
  useEffect(() => { if (open) { if (quickChange && current) { fill(undefined); setMode('change') } else { fill(current); setMode('correct') } } }, [open, quickChange, current?.name, current?.hand, current?.handUnknown]) // eslint-disable-line react-hooks/exhaustive-deps
  const choosing = !!current && !!onCorrect
  const correcting = choosing && mode === 'correct'
  // 左投／右投 or 不知道 is required (the pitch pad waits for it); a name stays optional
  const was = current?.hand ?? (current?.handUnknown ? 'unknown' : undefined)
  const can = !!hand && !(correcting && name.trim() === (current?.name ?? '') && hand === was)
  const picked = (): OppPitcher => ({ name: name.trim() || undefined, ...(hand === 'unknown' ? { handUnknown: true as const } : hand ? { hand } : {}) })
  const pick = (m: 'correct' | 'change') => { if (m === mode) return; setMode(m); fill(m === 'correct' ? current : undefined) }
  const modes: Array<{ v: 'correct' | 'change'; l: string }> = [{ v: 'correct', l: '更正這位投手' }, { v: 'change', l: '對方換投' }]
  // (the quick 對方換投: the hand is the last thing to pick, so the tap on it finishes)
  const tapHand = (h: OppHand | 'unknown') => {
    setHand(h)
    if (quickChange && mode === 'change') { onConfirm({ name: name.trim() || undefined, ...(h === 'unknown' ? { handUnknown: true as const } : { hand: h }) }); onClose() }
  }
  // 更正 with another name typed in: most likely a new pitcher
  const renamed = correcting && !!current?.name && !!name.trim() && name.trim() !== current.name
  return (
    <Sheet open={open} onClose={onClose} ariaLabel="對方投手" side="bottom" desktopFrom="sm" panelClassName="sm:max-w-md" contentClassName="record-zoom max-h-[86vh] overflow-y-auto">
      <div className="p-5 flex flex-col gap-4">
        <div>
          <div className="text-[16px] font-semibold text-ink">對方投手</div>
          {!choosing && <p className="text-[12px] text-muted mt-1">對方換投時改這裡，從下一個打席起都記這位投手</p>}
        </div>
        {choosing && (
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="更正或換投">
              {modes.map((m) => <button key={m.v} type="button" aria-pressed={mode === m.v} onClick={() => pick(m.v)} className={cx(chipBtn(mode === m.v), 'h-11 text-[14px]')}>{m.l}</button>)}
            </div>
            <p className="text-[12px] text-ink-2">
              {correcting
                ? `同一位投手，只是姓名或左右投記錯了：他今天投過的${stintRows ? ` ${stintRows} 個` : ''}打席一起改，球數照算`
                : '換了一位新投手：從下一個打席起記他，球數從 0 算'}
            </p>
          </div>
        )}
        {options.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-2">遇過的投手</span>
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => (
                <button key={o.name} type="button" aria-pressed={name.trim() === o.name && hand === o.hand} onClick={() => { setName(o.name); setHand(o.hand ?? hand) }} className={chipBtn(name.trim() === o.name && hand === o.hand)}>
                  {o.name}{o.hand ? `・${OPP_HAND_LABEL[o.hand]}` : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-2">姓名（選填）</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} list="opp-pitcher-names" placeholder="例如 12號" />
          <datalist id="opp-pitcher-names">{options.map((o) => <option key={o.name} value={o.name} />)}</datalist>
        </label>
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2" role="group" aria-label="左投或右投">
            {HANDS.map((h) => <button key={h} type="button" aria-pressed={hand === h} onClick={() => tapHand(h)} className={cx(chipBtn(hand === h), 'h-12 text-[15px]')}>{OPP_HAND_LABEL[h]}</button>)}
            <button type="button" aria-pressed={hand === 'unknown'} onClick={() => tapHand('unknown')} className={cx(chipBtn(hand === 'unknown'), 'h-12 px-3 text-[13px]')}>不知道</button>
          </div>
          {!hand && <span className="text-[11px] text-muted">一定要選一個（看不出來就選「不知道」）</span>}
        </div>
        {!current && earlierRows > 0 && <p className="text-[12px] text-ink-2">這半局前面 {earlierRows} 個打席也會記成這位投手</p>}
        {renamed && <p role="status" className="text-[12px] text-warning">名字換成 {name.trim()}：如果是換了一位投手，請改選上面的「對方換投」（更正會把 {current!.name} 投過的打席都改成 {name.trim()}）</p>}
        {quickChange && mode === 'change' && <p className="text-[12px] text-muted">點左投／右投／不知道就完成換投（要記名字先填好姓名）</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!can} onClick={() => { const p = picked(); if (correcting) onCorrect!(p); else onConfirm(p); onClose() }}>{correcting ? '更正' : choosing ? '換投' : '確定'}</Button>
        </div>
      </div>
    </Sheet>
  )
}

/** 「帶入上次對 X 的打序（日期）」: a long school name wraps instead of pushing the page sideways on a phone. */
export function LastOppLineupButton({ opponent, date, onClick }: { opponent: string; date: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="self-start max-w-full min-h-9 pointer-fine:min-h-8 px-3 py-1.5 rounded-[var(--radius-sm)] text-left text-[13px] font-medium text-ink-2 [overflow-wrap:anywhere] hover:bg-surface-3/70 hover:text-ink active:bg-surface-3 transition-colors duration-150 motion-reduce:transition-none cursor-pointer">
      帶入上次對 {opponent} 的打序（<span className="tnum">{date}</span>）
    </button>
  )
}

/** 9 rows 「1 棒 [姓名或背號]」 (one column on phones; `cols` sets the wider layout, three from sm by default). */
export function OppLineupFields({ value, onChange, names, current, focusSlot, idPrefix = 'opp-lineup', cols = 'sm:grid-cols-3', count = 9 }: {
  value: string[]
  onChange: (next: string[]) => void
  /** datalist: names seen against this opponent */
  names: string[]
  /** 1-based slot batting now (tagged 現在打擊) */
  current?: number
  /** 1-based slot to focus when shown */
  focusSlot?: number
  idPrefix?: string
  /** grid columns above phone width: pick them for the box this sits in (a narrow card needs fewer) */
  cols?: string
  /** their 打序人數 (7–12; 9 by default) */
  count?: number
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  useEffect(() => { if (focusSlot) refs.current[focusSlot - 1]?.focus() }, [focusSlot])
  const list = `${idPrefix}-names`
  return (
    <div className={cx('grid grid-cols-1 gap-x-4 gap-y-2', cols)}>
      <datalist id={list}>{names.map((n) => <option key={n} value={n} />)}</datalist>
      {Array.from({ length: count }, (_, i) => (
        <label key={i} className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] text-ink-2 tnum w-9 shrink-0">{i + 1} 棒</span>
          <Input ref={(el) => { refs.current[i] = el }} value={value[i] ?? ''} onChange={(e) => onChange(Array.from({ length: count }, (_, k) => (k === i ? e.target.value : value[k] ?? '')))}
            list={list} placeholder="姓名或背號" maxLength={40} aria-label={`對方第 ${i + 1} 棒`} className="flex-1" />
          {current === i + 1 && <span className="text-[11px] text-ink font-medium shrink-0">現在打擊</span>}
        </label>
      ))}
    </div>
  )
}

/** 對方打序 during the game: changes apply once on 完成 (one undo step, one sync). */
export function OppLineupSheet({ open, onClose, lineup, count, current, names, last, opponent, onDone }: {
  open: boolean
  onClose: () => void
  lineup: string[]
  /** their 打序人數 */
  count?: number
  current: number
  names: string[]
  last: { date: string; names: string[] } | null
  opponent: string
  onDone: (names: string[]) => void
}) {
  const [draft, setDraft] = useState<string[]>(lineup)
  // (keyed by the names, not the array: a parent passing a fresh array each render must not wipe what is being typed)
  const key = lineup.join('\u0000')
  useEffect(() => { if (open) setDraft(key.split('\u0000')) }, [open, key])
  const blank = draft.every((n) => !n.trim())
  return (
    <Sheet open={open} onClose={onClose} ariaLabel="對方打序" side="bottom" desktopFrom="sm" panelClassName="sm:max-w-2xl" contentClassName="record-zoom max-h-[86vh] overflow-y-auto">
      <div className="p-5 flex flex-col gap-4">
        <div>
          <div className="text-[16px] font-semibold text-ink">對方打序</div>
          <p className="text-[12px] text-muted mt-1">比賽中改名字＝代打：前面的打席不會變</p>
        </div>
        {blank && last && <LastOppLineupButton opponent={opponent} date={last.date} onClick={() => setDraft(last.names)} />}
        <OppLineupFields value={draft} onChange={setDraft} names={names} current={current} focusSlot={open ? current : undefined} idPrefix="opp-lineup-sheet" count={count} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => { onDone(draft); onClose() }}>完成</Button>
        </div>
      </div>
    </Sheet>
  )
}
