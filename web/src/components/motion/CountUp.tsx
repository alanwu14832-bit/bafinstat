import { useEffect, useRef, useState } from 'react'
import { animate } from 'framer-motion'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import { EASE } from './Reveal'

/**
 * Renders `format(value)` and, when the value changes (or first mounts), counts from the previous value
 * to the new one over ~0.9s so a stat tile reads as "settling" rather than popping.
 */
export function CountUp({ value, format, duration = 0.9 }: { value: number; format: (v: number) => string; duration?: number }) {
  const reduced = usePrefersReducedMotion()
  const [text, setText] = useState(() => format(value))
  const from = useRef(0)
  useEffect(() => {
    if (reduced || !Number.isFinite(value)) { setText(format(value)); from.current = value; return }
    const controls = animate(from.current, value, { duration, ease: EASE, onUpdate: (v) => setText(format(v)) })
    from.current = value
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced])
  return <>{text}</>
}
