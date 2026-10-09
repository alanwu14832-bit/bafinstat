/**
 * 紀錄比賽: the opponent's side of the sheet — who is pitching for them (左投／右投, a name if wanted) and, when the
 * recorder opts in, the names in their batting order. Everything here is optional and never blocks a plate appearance.
 */
import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../components/ui/Sheet'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { cx } from '../lib/format'
import { OPP_HAND_LABEL, type OppHand } from '../data/types'
import type { OppPitcher } from './model'
import { chipBtn } from './widgets'

const HANDS: OppHand[] = ['L', 'R']

/** 「對方 右投」 / 「對方 王・右」 / 「對方投手」 (nothing yet). */
export function oppPitcherLabel(p?: OppPitcher): string {
  if (!p) return '對方投手'
  if (p.name) return `對方 ${p.name}${p.hand ? `・${p.hand === 'L' ? '左' : '右'}` : ''}`
  return `對方 ${p.hand ? OPP_HAND_LABEL[p.hand] : '投手'}`
}
/** 「右投 王」, 「左投」, 「王」 */
export function oppPitcherText(p?: { name?: string; hand?: OppHand }): string {
  return [p?.hand ? OPP_HAND_LABEL[p.hand] : '', p?.name ?? ''].filter(Boolean).join(' ')
}

/** The one-time question while we bat: one tap on 左投／右投, or 不記 for this game. */
export function OppPitcherStrip({ onHand, onName, onSkip }: { onHand: (h: OppHand) => void; onName: () => void; onSkip: () => void }) {
  return (
    <div role="group" aria-label="對方投手" className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-[var(--radius-sm)] border border-border bg-surface-2/60 px-3 py-2">
      <span className="text-[13px] font-medium text-ink">對方投手是？</span>
      <div className="flex items-center gap-1.5">
        {HANDS.map((h) => <button key={h} type="button" onClick={() => onHand(h)} className={cx(chipBtn(false), 'h-10 min-w-14')}>{OPP_HAND_LABEL[h]}</button>)}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onName}>填姓名</Button>
        <Button variant="ghost" size="sm" onClick={onSkip}>不記</Button>
      </div>
      <span className="basis-full text-[11px] text-muted">選填；之後可以看對左投、對右投的成績</span>
    </div>
  )
}

/** 對方換投: name (optional), one-tap chips of pitchers already met, 左投／右投. */
export function OppPitcherSheet({ open, onClose, current, options, earlierRows, onConfirm }: {
  open: boolean
  onClose: () => void
  current?: OppPitcher
  options: Array<{ name: string; hand?: OppHand }>
  /** first entry only: this half's plate appearances so far, which get it too */
  earlierRows: number
  onConfirm: (p: OppPitcher) => void
}) {
  const [name, setName] = useState('')
  const [hand, setHand] = useState<OppHand | undefined>(undefined)
  useEffect(() => { if (open) { setName(current?.name ?? ''); setHand(current?.hand) } }, [open, current?.name, current?.hand])
  const can = !!name.trim() || !!hand
  return (
    <Sheet open={open} onClose={onClose} ariaLabel="對方投手" side="bottom" desktopFrom="sm" panelClassName="sm:max-w-md" contentClassName="record-zoom max-h-[86vh] overflow-y-auto">
      <div className="p-5 flex flex-col gap-4">
        <div>
          <div className="text-[16px] font-semibold text-ink">對方投手</div>
          <p className="text-[12px] text-muted mt-1">對方換投時改這裡，從下一個打席起都記這位投手</p>
        </div>
        {options.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-2">遇過的投手</span>
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => (
                <button key={o.name} type="button" aria-pressed={name.trim() === o.name && hand === o.hand} onClick={() => { setName(o.name); setHand(o.hand) }} className={chipBtn(name.trim() === o.name && hand === o.hand)}>
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
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="左投或右投">
          {HANDS.map((h) => <button key={h} type="button" aria-pressed={hand === h} onClick={() => setHand(hand === h ? undefined : h)} className={cx(chipBtn(hand === h), 'h-12 text-[15px]')}>{OPP_HAND_LABEL[h]}</button>)}
        </div>
        {!current && earlierRows > 0 && <p className="text-[12px] text-ink-2">這半局前面 {earlierRows} 個打席也會記成這位投手</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!can} onClick={() => { onConfirm({ name: name.trim() || undefined, hand }); onClose() }}>確定</Button>
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
export function OppLineupFields({ value, onChange, names, current, focusSlot, idPrefix = 'opp-lineup', cols = 'sm:grid-cols-3' }: {
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
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  useEffect(() => { if (focusSlot) refs.current[focusSlot - 1]?.focus() }, [focusSlot])
  const list = `${idPrefix}-names`
  return (
    <div className={cx('grid grid-cols-1 gap-x-4 gap-y-2', cols)}>
      <datalist id={list}>{names.map((n) => <option key={n} value={n} />)}</datalist>
      {Array.from({ length: 9 }, (_, i) => (
        <label key={i} className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] text-ink-2 tnum w-9 shrink-0">{i + 1} 棒</span>
          <Input ref={(el) => { refs.current[i] = el }} value={value[i] ?? ''} onChange={(e) => onChange(Array.from({ length: 9 }, (_, k) => (k === i ? e.target.value : value[k] ?? '')))}
            list={list} placeholder="姓名或背號" maxLength={40} aria-label={`對方第 ${i + 1} 棒`} className="flex-1" />
          {current === i + 1 && <span className="text-[11px] text-accent-ink font-medium shrink-0">現在打擊</span>}
        </label>
      ))}
    </div>
  )
}

/** 對方打序 during the game: changes apply once on 完成 (one undo step, one sync). */
export function OppLineupSheet({ open, onClose, lineup, current, names, last, opponent, onDone }: {
  open: boolean
  onClose: () => void
  lineup: string[]
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
        <OppLineupFields value={draft} onChange={setDraft} names={names} current={current} focusSlot={open ? current : undefined} idPrefix="opp-lineup-sheet" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => { onDone(draft); onClose() }}>完成</Button>
        </div>
      </div>
    </Sheet>
  )
}
