import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatNumber, signed, type NumberFormat } from '../../lib/format'
import { cx } from '../../lib/format'
import { RollingNumber } from '../motion/RollingNumber'
import { Reveal } from '../motion/Reveal'
import { StatHint } from './StatHint'

export interface StatTileProps {
  label: string
  value: number
  format?: NumberFormat
  /** Pre-formatted display string (e.g. "12-6"). */
  display?: string
  /** Delta versus a baseline; sign decides color. */
  delta?: number
  deltaFormat?: NumberFormat
  deltaLabel?: string
  /** For ERA-like stats where lower is better. */
  invertDelta?: boolean
  /** Kept for API compatibility; sparklines are no longer drawn inside tiles. */
  sparkline?: number[]
  icon?: ReactNode
  /** Muted caption under the value (e.g. "101 K / 50 BB"). */
  note?: string
  /** Smaller value type for displays too long to fit at the shared size. */
  compact?: boolean
  /** Where tapping the tile goes (e.g. the batting table sorted by this stat). */
  to?: string
  className?: string
}

/**
 * One metric. Designed to sit inside <StatGroup>, which draws the hairlines between cells;
 * on its own it renders as a bordered card.
 */
export function StatTile({ label, value, format = 'int', display, delta, deltaFormat, deltaLabel, invertDelta, icon, note, compact, to, className }: StatTileProps) {
  const text = display ?? formatNumber(value, format)
  const good = delta !== undefined && (invertDelta ? delta < 0 : delta > 0)
  const bad = delta !== undefined && (invertDelta ? delta > 0 : delta < 0)
  const deltaText =
    delta === undefined ? '' : deltaFormat === 'decimal3' ? (delta > 0 ? '+' : '') + formatNumber(delta, 'decimal3') : deltaFormat === 'pct' ? signed(delta, 1) + '%' : signed(delta, deltaFormat === 'ratio' || deltaFormat === 'era' ? 2 : 0)

  return (
    <div className={cx('stat-cell group relative bg-surface rounded-[var(--radius-sm)] shadow-[var(--shadow-card)] p-4 md:p-5 flex flex-col gap-2 min-w-0', to && 'lift', className)}>
      {/* The whole tile is the link, laid over the content; the label sits above it so tapping the label
          still opens its explanation instead of leaving the page. */}
      {to && <Link to={to} aria-label={`${label} ${text}，看詳細`} className="absolute inset-0 z-[1] rounded-[inherit] focus-visible:outline-offset-2" />}
      <div className="flex items-center justify-between gap-2">
        <span className="relative z-[2] text-xs text-muted font-medium truncate"><StatHint label={label}>{label}</StatHint></span>
        {icon && <span className="text-muted [&>svg]:size-3.5">{icon}</span>}
        {to && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted opacity-60 transition-[translate,opacity] duration-[var(--dur-base)] group-hover:opacity-100 group-hover:translate-x-0.5" />}
      </div>
      <div className={cx('figure font-semibold leading-none text-ink', compact ? 'text-[20px]' : 'text-[24px]')}><RollingNumber text={text} /></div>
      {(note || delta !== undefined) && (
        <div className="flex items-center gap-2 text-xs tnum min-w-0">
          {delta !== undefined && (
            <span className={cx('inline-flex items-center gap-0.5 font-medium whitespace-nowrap', good && 'text-good', bad && 'text-critical', !good && !bad && 'text-muted')}>
              {good ? <ArrowUpRight className="size-3" /> : bad ? <ArrowDownRight className="size-3" /> : null}
              {deltaText}
              {deltaLabel && <span className="text-muted font-normal ml-0.5">{deltaLabel}</span>}
            </span>
          )}
          {note && <span className="text-muted truncate">{note}</span>}
        </div>
      )}
    </div>
  )
}

/** Grid of StatTiles, each its own floating tile. `flush` is kept for API compatibility. */
export function StatGroup({ children, className, columns, still }: { children: ReactNode; className?: string; columns?: string; flush?: boolean; still?: boolean }) {
  const cls = cx('grid gap-3', columns ?? 'grid-cols-2 md:grid-cols-4', className)
  if (still) return <div className={cls}>{children}</div>
  return <Reveal className={cls} y={8}>{children}</Reveal>
}
