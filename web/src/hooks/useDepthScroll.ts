import { useEffect, type RefObject } from 'react'
import { usePrefersReducedMotion } from './useMediaQuery'

/**
 * Sets `--hp` on an element: 0 while it rests where the page puts it, 1 once it has scrolled its own height away.
 * The planes drawn inside read it, each at its own rate (far things drift a little, near things travel more), which
 * is where the depth of 總覽's opening and of the 球員卡 comes from. One requestAnimationFrame per scroll burst,
 * and nothing at all when the visitor asked for reduced motion (`--hp` stays 0: a still picture).
 */
export function useDepthScroll(ref: RefObject<HTMLElement | null>) {
  const reduced = usePrefersReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el || reduced) { el?.style.setProperty('--hp', '0'); return }
    let frame = 0, last = -1
    const read = () => {
      frame = 0
      const r = el.getBoundingClientRect()
      const h = r.height || 1
      // an element lower on the page starts moving once its top has come up to 60% of the screen
      const start = Math.min(r.top + window.scrollY, window.innerHeight * 0.6)
      const p = Math.min(1, Math.max(0, (start - r.top) / h))
      if (p === last) return
      last = p
      el.style.setProperty('--hp', p.toFixed(4))
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read) }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame) }
  }, [ref, reduced])
}
