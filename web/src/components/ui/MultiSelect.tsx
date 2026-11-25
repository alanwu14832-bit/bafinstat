import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cx } from '../../lib/format'

export interface MultiOption { value: string; label: string }

export interface MultiSelectProps {
  /** shown inside the control, before the value (杯賽) */
  label: string
  options: MultiOption[]
  /** the values picked; none = 全部 */
  value: string[]
  onChange: (value: string[]) => void
  size?: 'sm' | 'md'
  className?: string
  /** what an empty pick reads as (全部) */
  allLabel?: string
}

/** 「全部」, the one value picked, or 「3 項」 */
export function pickedText(value: string[], options: MultiOption[], allLabel = '全部'): string {
  if (!value.length) return allLabel
  const first = options.find((o) => o.value === value[0])?.label ?? value[0]
  return value.length === 1 ? first : `${value.length} 項`
}

/**
 * A select that takes several values (複選): the control reads like <Select> (label inside the border, then what is
 * picked); it opens a list of checkboxes with 「全部」 on top, which clears the pick. The list is drawn in a portal so a
 * toolbar that scrolls sideways does not cut it off.
 */
export function MultiSelect({ label, options, value, onChange, size = 'md', className, allLabel = '全部' }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const id = useId()
  const picked = new Set(value)
  // values no longer among the options (a renamed tournament) stay picked until cleared
  const shown = [...options, ...value.filter((v) => !options.some((o) => o.value === v)).map((v) => ({ value: v, label: v }))]

  const place = () => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.max(r.width, 220)
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 6, width })
  }
  useLayoutEffect(() => { if (open) place() }, [open])
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => { const t = e.target as Node; if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    const move = () => place()
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', move)
    window.addEventListener('scroll', move, true)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); window.removeEventListener('resize', move); window.removeEventListener('scroll', move, true) }
  }, [open])

  const pick = (next: string[]) => onChange(next)
  // a pick can change the toolbar (its 重設 button): if the row then gives way to the 篩選 button, this control is hidden
  // and its list closes with it
  useEffect(() => {
    if (!open) return
    let frame = 0
    const watch = () => {
      const b = btn.current
      if (!b || !b.offsetParent || getComputedStyle(b).visibility === 'hidden') { setOpen(false); return }
      frame = requestAnimationFrame(watch)
    }
    frame = requestAnimationFrame(watch)
    return () => cancelAnimationFrame(frame)
  }, [open])
  const toggle = (v: string) => pick(picked.has(v) ? value.filter((x) => x !== v) : [...value, v])
  const row = 'w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink rounded-[8px] hover:bg-surface-2 cursor-pointer'
  const box = (on: boolean) => cx('inline-flex items-center justify-center size-4 shrink-0 rounded-[4px] border', on ? 'bg-ink border-ink text-bg' : 'border-[color-mix(in_srgb,var(--ink)_35%,transparent)]')

  return (
    <>
      <button ref={btn} type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={`${label}：${pickedText(value, shown, allLabel)}`}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'press relative inline-flex items-center gap-1.5 bg-surface-3/60 border border-transparent rounded-[10px] text-ink min-w-0 cursor-pointer pl-3 pr-7 whitespace-nowrap',
          'hover:bg-surface-3 focus-visible:bg-surface transition-colors motion-reduce:transition-none',
          value.length > 0 && 'bg-accent-soft hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]',
          size === 'sm' ? 'h-9 pointer-fine:h-8 text-[13px]' : 'h-10 pointer-fine:h-9 text-sm',
          className,
        )}>
        <span className="text-muted shrink-0">{label}</span>
        <span className="truncate font-medium">{pickedText(value, shown, allLabel)}</span>
        <ChevronDown aria-hidden className="absolute right-2 size-4 text-muted" />
      </button>
      {open && pos && createPortal(
        <div ref={panel} id={id} role="listbox" aria-multiselectable="true" aria-label={label}
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width }}
          className="z-[70] max-h-[min(60vh,380px)] overflow-y-auto rounded-[12px] border border-border bg-surface p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
          <button type="button" role="option" aria-selected={!value.length} onClick={() => pick([])} className={row}>
            <span className={box(!value.length)}>{!value.length && <Check className="size-3" strokeWidth={3} />}</span>{allLabel}
          </button>
          <div className="my-1 h-px bg-border" />
          {shown.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={picked.has(o.value)} onClick={() => toggle(o.value)} className={row}>
              <span className={box(picked.has(o.value))}>{picked.has(o.value) && <Check className="size-3" strokeWidth={3} />}</span>
              <span className="truncate">{o.label}</span>
            </button>
          ))}
          {!shown.length && <p className="px-3 py-2 text-[12px] text-muted">沒有可選的項目</p>}
        </div>,
        document.body,
      )}
    </>
  )
}

/** The same choice as a row of chips (the phone's filter sheet): tap to pick or unpick; 「全部」 clears. */
export function MultiChips({ label, options, value, onChange, allLabel = '全部' }: MultiSelectProps) {
  const picked = new Set(value)
  const shown = [...options, ...value.filter((v) => !options.some((o) => o.value === v)).map((v) => ({ value: v, label: v }))]
  const chip = (on: boolean) => cx('inline-flex items-center gap-1 h-9 px-3 rounded-full border text-[13px] font-medium cursor-pointer transition-colors motion-reduce:transition-none',
    on ? 'border-ink bg-ink text-bg' : 'border-border bg-surface text-ink hover:bg-surface-2')
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <span className="text-xs font-medium text-ink-2">{label}{value.length > 0 && <span className="text-muted font-normal">・已選 {value.length}</span>}</span>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={!value.length} onClick={() => onChange([])} className={chip(!value.length)}>{allLabel}</button>
        {shown.map((o) => (
          <button key={o.value} type="button" aria-pressed={picked.has(o.value)} onClick={() => onChange(picked.has(o.value) ? value.filter((x) => x !== o.value) : [...value, o.value])} className={chip(picked.has(o.value))}>
            {picked.has(o.value) && <Check aria-hidden className="size-3.5" strokeWidth={3} />}{o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
