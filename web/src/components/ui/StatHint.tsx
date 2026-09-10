import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { hintFor, type Hint } from '../../data/glossary'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import { cx } from '../../lib/format'

/**
 * Floating explanation that follows a stat name: appears when the pointer rests on it (or it is focused),
 * disappears when the pointer leaves. Rendered in a portal with fixed positioning so it never gets clipped
 * by scrolling tables, and flips below the label when there is no room above.
 */
export function HintCard({ hint, anchor, open }: { hint: Hint; anchor: HTMLElement | null; open: boolean }) {
  const reduced = usePrefersReducedMotion()
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null)
  useLayoutEffect(() => {
    if (!open || !anchor) return
    const r = anchor.getBoundingClientRect()
    const below = r.top < 88
    setPos({ x: Math.min(Math.max(r.left + r.width / 2, 140), window.innerWidth - 140), y: below ? r.bottom + 8 : r.top - 8, below })
  }, [open, anchor])
  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && pos && (
        <div role="tooltip" className={cx('pointer-events-none fixed z-[80] -translate-x-1/2', !pos.below && '-translate-y-full')} style={{ left: pos.x, top: pos.y }}>
          <motion.div initial={reduced ? false : { opacity: 0, y: pos.below ? -4 : 4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduced ? undefined : { opacity: 0, y: pos.below ? -3 : 3 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="w-[260px] max-w-[calc(100vw-24px)] rounded-[8px] bg-ink text-bg px-3 py-2.5 shadow-[var(--shadow-modal)] text-left whitespace-normal">
            <div className="text-[12px] font-semibold leading-4 mb-0.5">{hint.title}</div>
            <div className="text-[12px] leading-[1.55] opacity-85">{hint.text}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/**
 * Wraps a stat label. If the glossary knows the label (or `hint` is given), hovering shows the card and the
 * label gets a faint dotted underline as the affordance. Unknown labels render unchanged.
 */
export function StatHint({ label, hint, children, className }: { label?: unknown; hint?: Hint | null; children?: ReactNode; className?: string }) {
  const h = hint ?? hintFor(label ?? children)
  const ref = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const id = useId()
  const show = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), 90) }
  const hide = () => { window.clearTimeout(timer.current); setOpen(false) }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  if (!h) return <>{children ?? (typeof label === 'string' ? label : null)}</>
  return (
    <>
      <span ref={ref} tabIndex={0} aria-describedby={open ? id : undefined} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onTouchStart={() => (open ? hide() : show())}
        className={cx('underline decoration-dotted decoration-[color-mix(in_srgb,currentColor_45%,transparent)] underline-offset-[3px] cursor-help rounded-[2px] outline-none focus-visible:decoration-solid', className)}>
        {children ?? (typeof label === 'string' ? label : null)}
      </span>
      <HintCard hint={h} anchor={ref.current} open={open} />
    </>
  )
}
