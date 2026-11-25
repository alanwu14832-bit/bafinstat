import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cx } from '../../lib/format'

/** Whether a sideways-scrolling box still has content past its right edge (follows scrolling and resizing). */
export function useMoreRight(ref: RefObject<HTMLElement | null>): boolean {
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4)
    check()
    el.addEventListener('scroll', check, { passive: true })
    // the table inside changes width with its columns (a tab of other columns, 精簡／完整)
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(check) : null
    ro?.observe(el)
    if (el.firstElementChild) ro?.observe(el.firstElementChild)
    return () => { el.removeEventListener('scroll', check); ro?.disconnect() }
  })
  return more
}

/**
 * The hint that a table goes on to the right: the surface colour fading in over its right edge, gone once the last
 * column is in view. Put it after the scrolling box, inside a `relative` parent.
 */
export function EdgeFade({ show, className }: { show: boolean; className?: string }) {
  return <span aria-hidden data-edge-fade={show ? 'on' : 'off'} className={cx('print:hidden pointer-events-none absolute right-0 top-0 bottom-0 z-[3] w-10 bg-gradient-to-l from-[var(--surface)] via-[color-mix(in_srgb,var(--surface)_70%,transparent)] to-transparent transition-opacity duration-[var(--dur-base)] motion-reduce:transition-none',
    show ? 'opacity-100' : 'opacity-0', className)} />
}

/** A box that scrolls sideways and says so (the fade on its right edge while there is more). */
export function ScrollX({ className, wrapClassName, children }: { className?: string; wrapClassName?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const more = useMoreRight(ref)
  return (
    <div className={cx('relative min-w-0', wrapClassName)}>
      <div ref={ref} className={cx('overflow-x-auto', className)}>{children}</div>
      <EdgeFade show={more} />
    </div>
  )
}
