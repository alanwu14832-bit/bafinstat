import type React from 'react'
import { cx } from '../../lib/format'

/** A baseball drawn large and faint behind the hero: the ball's outline and its two seams with their stitching. */
export function SeamMark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const seam = (p0: [number, number], p1: [number, number], p2: [number, number], side: 1 | -1) => {
    const marks = Array.from({ length: 12 }, (_, i) => {
      const t = (i + 0.5) / 12, u = 1 - t
      const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
      const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
      const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
      const len = Math.hypot(dx, dy), tx = dx / len, ty = dy / len, nx = -ty * side, ny = tx * side
      // a V of thread across the seam, pointing along it
      return <path key={i} d={`M${(x - nx * 9 - tx * 4).toFixed(1)} ${(y - ny * 9 - ty * 4).toFixed(1)}L${(x + tx * 3).toFixed(1)} ${(y + ty * 3).toFixed(1)}L${(x + nx * 9 - tx * 4).toFixed(1)} ${(y + ny * 9 - ty * 4).toFixed(1)}`} />
    })
    return <g><path d={`M${p0[0]} ${p0[1]}Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`} strokeWidth="1.6" />{marks}</g>
  }
  return (
    <svg viewBox="0 0 320 320" aria-hidden className={className} style={style} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <circle cx="160" cy="160" r="152" strokeWidth="1.6" />
      {seam([92, 26], [182, 160], [92, 294], 1)}
      {seam([228, 26], [138, 160], [228, 294], -1)}
    </svg>
  )
}

/**
 * The homepage hero's backdrop, for any card that is a page's main character (the season, a player, a won game):
 * a warm glow of the team colour from the top-right corner and a large faint baseball behind it.
 * Put it first inside a `relative overflow-hidden` card; the content after it needs `relative`.
 */
export function HeroGlow({ size = 'lg', strength = 1, className }: { size?: 'sm' | 'lg'; strength?: number; className?: string }) {
  return (
    <>
      <div aria-hidden className={cx('pointer-events-none absolute inset-0', className)} style={{ background: `radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--accent) ${Math.round(14 * strength)}%, transparent), transparent 60%)` }} />
      <SeamMark className={cx('pointer-events-none absolute text-accent', size === 'lg' ? '-right-16 -top-20 w-[340px] md:w-[420px]' : '-right-14 -top-16 w-[200px]')} style={{ opacity: 0.14 * strength }} />
    </>
  )
}
