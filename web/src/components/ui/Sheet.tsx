import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from 'framer-motion'
import { useMediaQuery, usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import { cx } from '../../lib/format'

/**
 * The one overlay. On phones it is a sheet that slides from an edge and can be grabbed at any moment: the
 * pointer takes over the live position, release continues at finger velocity, a flick or a pull past 40 %
 * dismisses, a short pull springs back, pulling the wrong way rubber-bands. On wide screens (`desktopFrom`)
 * it becomes a centred dialog that materialises with a critically damped spring. The scrim's opacity is
 * derived from the sheet position every frame, so the two never drift apart.
 *
 * Springs follow Apple's drawer defaults: response 0.3 s, damping 0.8 (bounce 0.2); momentum releases may
 * bounce a touch more. Reduced motion: a 120 ms crossfade, drag still tracks 1:1 but release resolves instantly.
 */
export interface SheetProps {
  open: boolean
  onClose: () => void
  ariaLabel: string
  /** phone presentation edge */
  side?: 'bottom' | 'left'
  /** from this breakpoint up, present as a centred dialog ('center') or keep the sheet ('sheet') */
  desktopFrom?: 'sm' | 'lg' | 'never'
  /** drag region: rendered above the content with a grabber (bottom sheets) */
  header?: ReactNode
  children: ReactNode
  /** root wrapper classes (e.g. lg:hidden) */
  className?: string
  /** panel classes: max width, background */
  panelClassName?: string
  contentClassName?: string
}

const rubber = (d: number) => (0.55 * d * 120) / (d + 120)
const OPEN_SPRING = { type: 'spring', visualDuration: 0.3, bounce: 0.2 } as const
const SETTLE_SPRING = { type: 'spring', visualDuration: 0.32, bounce: 0 } as const

export function Sheet({ open, onClose, ariaLabel, side = 'bottom', desktopFrom = 'sm', header, children, className, panelClassName, contentClassName }: SheetProps) {
  const reduced = usePrefersReducedMotion()
  const wide = useMediaQuery(desktopFrom === 'sm' ? '(min-width: 640px)' : '(min-width: 1024px)')
  const centered = desktopFrom !== 'never' && wide
  const axis = side === 'bottom' ? 'y' : 'x'
  // keep the last real content while the close animation plays (callers usually null their state on close)
  const lastChildren = useRef(children); const lastHeader = useRef(header)
  if (open) { lastChildren.current = children; lastHeader.current = header }
  const [mounted, setMounted] = useState(open)
  const panelRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef(600)
  const pos = useMotionValue(0)          // px along the axis; 0 = resting open, size = fully out
  const alpha = useMotionValue(1)        // reduced-motion / centred fade
  const scale = useMotionValue(1)
  const anim = useRef<AnimationPlaybackControls | null>(null)
  const closing = useRef(false)
  const scrim = useTransform(pos, (v) => Math.max(0, Math.min(1, 1 - v / Math.max(1, sizeRef.current))))
  const scrimAlpha = useTransform([scrim, alpha], ([s, a]) => (s as number) * (a as number))
  const x = useTransform(pos, (v) => (axis === 'x' ? -v : 0))
  const y = useTransform(pos, (v) => (axis === 'y' ? v : 0))

  const stop = () => { anim.current?.stop(); anim.current = null }
  const measure = () => { const el = panelRef.current; if (el) sizeRef.current = axis === 'y' ? el.offsetHeight : el.offsetWidth; return sizeRef.current }

  const finishClose = useCallback(() => { closing.current = false; setMounted(false) }, [])
  const runClose = useCallback((velocity = 0) => {
    if (closing.current) return
    closing.current = true
    stop()
    if (centered) { anim.current = animate(alpha, 0, { duration: reduced ? 0.12 : 0.18, ease: 'easeOut', onComplete: finishClose }); if (!reduced) animate(scale, 0.97, { duration: 0.18, ease: 'easeOut' }); return }
    if (reduced) { anim.current = animate(alpha, 0, { duration: 0.12, onComplete: finishClose }); return }
    anim.current = animate(pos, measure(), { ...OPEN_SPRING, visualDuration: 0.25, bounce: 0, velocity, restDelta: 1, restSpeed: 20, onComplete: finishClose })
  }, [alpha, centered, finishClose, pos, reduced, scale])

  // open → mount and spring in; close → spring out then unmount
  useEffect(() => {
    if (open) { closing.current = false; setMounted(true) }
    else if (mounted) runClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useLayoutEffect(() => {
    if (!mounted || !open) return
    stop()
    alpha.set(1); scale.set(1)
    if (centered) { pos.set(0); if (!reduced) { alpha.set(0); scale.set(0.96); animate(alpha, 1, { duration: 0.16 }); anim.current = animate(scale, 1, SETTLE_SPRING) } return }
    if (reduced) { pos.set(0); alpha.set(0); anim.current = animate(alpha, 1, { duration: 0.12 }); return }
    pos.set(measure())
    anim.current = animate(pos, 0, OPEN_SPRING)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, centered])

  // links and images inside the panel would start a native HTML drag on mouse-down-and-move, which cancels the
  // pointer stream mid-gesture; block that at the panel (Motion's own onDragStart prop is a different thing)
  useEffect(() => {
    const el = panelRef.current
    if (!el || !mounted) return
    const block = (e: Event) => e.preventDefault()
    el.addEventListener('dragstart', block, { capture: true })
    return () => el.removeEventListener('dragstart', block, { capture: true })
  }, [mounted])

  // body scroll lock, Escape, focus
  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const previouslyFocused = document.activeElement as HTMLElement | null
    // focus the panel itself (keyboard users Tab from here); focusing a button would paint a ring on open
    requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !panelRef.current) return
      const els = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select, input, [tabindex="0"]'))
      if (!els.length) return
      const first = els[0], last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); previouslyFocused?.focus?.({ preventScroll: true }) }
  }, [mounted, onClose])

  // ---- drag: pointer events on the handle / header; the same routine is reused by the content pull-down
  const drag = useRef<{ origin: number; samples: Array<[number, number]>; active: boolean } | null>(null)
  const coord = (e: { clientX: number; clientY: number }) => (axis === 'y' ? e.clientY : -e.clientX)
  const beginDrag = (client: number) => { stop(); closing.current = false; drag.current = { origin: client - pos.get(), samples: [[performance.now(), pos.get()]], active: true } }
  const moveDrag = (client: number) => {
    const d = drag.current; if (!d?.active) return
    let next = client - d.origin
    if (next < 0) next = -rubber(-next)
    next = Math.min(next, sizeRef.current)
    pos.set(next)
    const now = performance.now()
    d.samples.push([now, next]); while (d.samples.length > 2 && now - d.samples[0][0] > 100) d.samples.shift()
  }
  const endDrag = () => {
    const d = drag.current; if (!d?.active) return
    d.active = false
    const [t0, p0] = d.samples[0], [t1, p1] = d.samples[d.samples.length - 1]
    const v = t1 > t0 ? ((p1 - p0) / (t1 - t0)) * 1000 : 0
    const cur = pos.get()
    if (reduced) { if (cur > 0.4 * sizeRef.current) { finishClose(); onClose() } else pos.set(0); return }
    const projected = cur + v * 0.12
    if (projected > 0.4 * sizeRef.current || v > 800) { closing.current = true; anim.current = animate(pos, sizeRef.current, { type: 'spring', visualDuration: 0.25, bounce: 0, velocity: v, restDelta: 1, restSpeed: 20, onComplete: () => { finishClose(); onClose() } }) }
    else anim.current = animate(pos, 0, { type: 'spring', visualDuration: 0.3, bounce: Math.abs(v) > 600 ? 0.25 : 0.1, velocity: v })
  }
  const handleProps = centered ? {} : {
    onPointerDown: (e: ReactPointerEvent) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); beginDrag(coord(e)) },
    onPointerMove: (e: ReactPointerEvent) => moveDrag(coord(e)),
    onPointerUp: endDrag, onPointerCancel: endDrag,
  }
  // content pull-down (bottom sheets): native, non-passive touch listeners so we can win from the scroll only at the top
  useEffect(() => {
    const el = contentRef.current
    if (!el || centered || axis !== 'y' || !mounted) return
    let start: { x: number; y: number } | null = null, claimed = false, declined = false
    const ts = (e: TouchEvent) => { const t = e.touches[0]; start = { x: t.clientX, y: t.clientY }; claimed = false; declined = el.scrollTop > 0 }
    const tm = (e: TouchEvent) => {
      if (!start || declined) return
      const t = e.touches[0]; const dx = t.clientX - start.x, dy = t.clientY - start.y
      if (!claimed) { if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; if (dy > 0 && dy > Math.abs(dx) && el.scrollTop <= 0) { claimed = true; beginDrag(t.clientY) } else { declined = true; return } }
      e.preventDefault(); moveDrag(t.clientY)
    }
    const te = () => { if (claimed) endDrag(); start = null; claimed = false }
    el.addEventListener('touchstart', ts, { passive: true }); el.addEventListener('touchmove', tm, { passive: false }); el.addEventListener('touchend', te); el.addEventListener('touchcancel', te)
    return () => { el.removeEventListener('touchstart', ts); el.removeEventListener('touchmove', tm); el.removeEventListener('touchend', te); el.removeEventListener('touchcancel', te) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, centered, axis])
  // left drawer: horizontal drag anywhere on the panel (vertical stays native scroll via touch-action: pan-y)
  const panelDrag = !centered && axis === 'x' ? {
    onPointerDown: (e: ReactPointerEvent) => { if (e.button !== 0) return; drag.current = { origin: e.clientX, samples: [], active: false }; (e.currentTarget as HTMLElement).dataset.sy = String(e.clientY) },
    onPointerMove: (e: ReactPointerEvent) => {
      const d = drag.current; if (!d) return
      if (!d.active) { const dx = d.origin - e.clientX, dy = Math.abs(e.clientY - Number((e.currentTarget as HTMLElement).dataset.sy)); if (Math.abs(dx) < 10 && dy < 10) return; if (Math.abs(dx) > dy && dx > 0) { e.currentTarget.setPointerCapture(e.pointerId); beginDrag(-e.clientX) } else { drag.current = null; return } }
      moveDrag(-e.clientX)
    },
    onPointerUp: endDrag, onPointerCancel: endDrag,
  } : {}

  if (!mounted || typeof document === 'undefined') return null
  const panelBase = centered
    ? 'relative w-full max-h-[92vh] overflow-y-auto bg-surface rounded-[var(--radius)] shadow-[var(--shadow-modal)] flex flex-col'
    : axis === 'y'
      ? 'absolute inset-x-0 bottom-0 max-h-[92vh] bg-surface rounded-t-[var(--radius)] shadow-[var(--shadow-modal)] flex flex-col pb-[env(safe-area-inset-bottom)]'
      : 'absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-bg flex flex-col shadow-[var(--shadow-modal)]'
  return createPortal(
    <div className={cx('fixed inset-0 z-50 flex', centered ? 'items-center justify-center p-6' : 'items-end', className)} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <motion.button type="button" aria-label="關閉" tabIndex={-1} onClick={() => onClose()} style={{ opacity: scrimAlpha }} className="absolute inset-0 bg-black/45 cursor-default" />
      <motion.div ref={panelRef} tabIndex={-1} style={{ x, y, opacity: alpha, scale, willChange: 'transform' }} className={cx(panelBase, 'outline-none', panelClassName)} {...panelDrag}>
        {!centered && axis === 'y' && (
          <div {...handleProps} className="shrink-0 pt-2 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none select-none" aria-hidden><span className="h-[5px] w-9 rounded-full bg-border-strong" /></div>
        )}
        {lastHeader.current && <div {...(axis === 'y' ? handleProps : {})} className={cx('shrink-0', !centered && axis === 'y' && 'touch-none')}>{lastHeader.current}</div>}
        <div ref={contentRef} className={cx('min-h-0 flex-1 overflow-y-auto [overscroll-behavior:contain]', axis === 'x' && '[touch-action:pan-y]', contentClassName)}>{lastChildren.current}</div>
      </motion.div>
    </div>,
    document.body,
  )
}
