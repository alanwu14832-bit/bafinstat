import { useLayoutEffect, useRef, useState } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'

export const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Fades and rises its content the first time it scrolls into view. Wrap sections and cards with it;
 * `delay` staggers siblings. Honors prefers-reduced-motion (renders static).
 */
export function Reveal({ delay = 0, y = 12, as = 'div', ...rest }: HTMLMotionProps<'div'> & { delay?: number; y?: number; as?: 'div' | 'section' }) {
  const reduced = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  // Something that mounts above the fold (or that the page has already scrolled past, e.g. after a jump
  // or a restored scroll position) shows immediately; only content below the viewport waits to scroll in.
  const [animated, setAnimated] = useState(true)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const top = el.getBoundingClientRect().top
    if (top < 0 || top < window.innerHeight * 0.85) setAnimated(false)
  }, [])
  const Tag = as === 'section' ? motion.section : motion.div
  if (reduced) return <Tag {...rest} />
  if (!animated) return <Tag ref={ref} initial={{ opacity: 0, y: y * 0.5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay }} {...rest} />
  return (
    <Tag
      ref={ref}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '100000px 0px -8% 0px' }}
      transition={{ duration: 0.55, ease: EASE, delay }}
      {...rest}
    />
  )
}

/** Route-level transition: content fades and rises when the page changes. */
export function PageTransition({ id, children }: { id: string; children: React.ReactNode }) {
  const reduced = usePrefersReducedMotion()
  const cls = 'flex flex-col gap-6 md:gap-8'
  if (reduced) return <div className={cls}>{children}</div>
  return (
    <motion.div key={id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: EASE }} className={cls}>
      {children}
    </motion.div>
  )
}
