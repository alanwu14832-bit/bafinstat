import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import { cx } from '../../lib/format'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

// The first screen after the site loads rolls its numbers up once. After that a figure only moves when its
// value changes (a new filter): a dashboard people open all day should not replay an entrance.
let firstLoad = true
if (typeof window !== 'undefined') window.setTimeout(() => { firstLoad = false }, 1500)

/**
 * A figure whose digits roll like an old scoreboard when the value changes. Takes any formatted string:
 * digits roll, everything else (".", "-", "/", "%", "—") stays put. Positions are matched from the right, so
 * ".298" to ".314" rolls three wheels and "9-5-2" to "10-5-2" keeps the "-5-2" still.
 */
export function RollingNumber({ text, className }: { text: string; className?: string }) {
  const reduced = usePrefersReducedMotion()
  const chars = [...text]
  const n = chars.length
  return (
    <span className={cx('inline-flex', className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex items-start">
        {chars.map((c, i) => {
          const fromEnd = n - 1 - i
          if (!/\d/.test(c)) return <span key={`s${fromEnd}${c}`} className="inline-block h-[1em] leading-none">{c}</span>
          return <Wheel key={`d${fromEnd}`} digit={Number(c)} delay={fromEnd * 24} reduced={reduced} />
        })}
      </span>
    </span>
  )
}

function Wheel({ digit, delay, reduced }: { digit: number; delay: number; reduced: boolean }) {
  const [shown, setShown] = useState(() => (firstLoad && !reduced ? 0 : digit))
  useEffect(() => {
    if (shown === digit) return
    const id = requestAnimationFrame(() => setShown(digit))
    return () => cancelAnimationFrame(id)
  }, [digit, shown])
  return (
    <span className="relative inline-block h-[1em] overflow-hidden leading-none">
      <span
        className="flex flex-col"
        style={{
          transform: `translateY(${-shown * 10}%)`,
          transition: reduced ? 'none' : `transform 460ms var(--ease-out) ${delay}ms`,
        }}
      >
        {DIGITS.map((d) => <span key={d} className="h-[1em] leading-none">{d}</span>)}
      </span>
    </span>
  )
}
