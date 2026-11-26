import { useRef } from 'react'
import { SeamMark } from './HeroGlow'
import { useDepthScroll } from '../../hooks/useDepthScroll'

/**
 * The 球員卡's backdrop, in planes (back to front): the team colour glowing from the top-right corner, the player's
 * jersey number drawn huge and faint, and the ball's seams nearest. As the page scrolls each travels at its own
 * rate (`--hp`, hooks/useDepthScroll), so the card has a little depth; with motion reduced it is a still picture.
 * Put it first inside a `relative overflow-hidden` card; the content after it needs `relative`.
 */
export function PlayerBackdrop({ number }: { number?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useDepthScroll(ref)
  const digits = (number ?? '').trim()
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* far */}
      <div className="absolute -inset-[10%]" style={{ background: 'radial-gradient(110% 90% at 100% 0%, color-mix(in srgb, var(--accent) 15%, transparent), transparent 60%)', translate: '0 calc(var(--hp, 0) * 14px)' }} />
      {/* middle: the number on his back (re-keyed per player so it settles in again when the player changes) */}
      {digits && (
        // (the faintness sits on this wrapper: the settle animation on the number itself ends at full opacity)
        <div className="absolute right-3 md:right-10 -top-5 md:-top-10 opacity-[0.13]" style={{ translate: '0 calc(var(--hp, 0) * -34px)' }}>
          <span key={digits} className="hero-settle block figure font-bold leading-none tracking-[-0.03em] text-accent text-[170px] md:text-[290px] select-none">{digits}</span>
        </div>
      )}
      {/* near */}
      <SeamMark className="absolute text-accent -right-24 -bottom-40 w-[300px] md:w-[420px]" style={{ opacity: 0.12, translate: '0 calc(var(--hp, 0) * -64px)', rotate: 'calc(var(--hp, 0) * 10deg)' }} />
    </div>
  )
}
