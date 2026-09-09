import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { formatNumber, signed, type NumberFormat } from '../../lib/format'
import { cx } from '../../lib/format'

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
  /** Smaller value type for long composite displays. */
  compact?: boolean
  className?: string
}

/**
 * One metric. Designed to sit inside <StatGroup>, which draws the hairlines between cells;
 * on its own it renders as a bordered card.
 */
export function StatTile({ label, value, format = 'int', display, delta, deltaFormat, deltaLabel, invertDelta, icon, note, compact, className }: StatTileProps) {
  const text = display ?? formatNumber(value, format)
  const good = delta !== undefined && (invertDelta ? delta < 0 : delta > 0)
  const bad = delta !== undefined && (invertDelta ? delta > 0 : delta < 0)
  const deltaText =
    delta === undefined ? '' : deltaFormat === 'decimal3' ? (delta > 0 ? '+' : '') + formatNumber(delta, 'decimal3') : deltaFormat === 'pct' ? signed(delta, 1) + '%' : signed(delta, deltaFormat === 'ratio' || deltaFormat === 'era' ? 2 : 0)

  return (
    <div className={cx('stat-cell bg-surface p-4 flex flex-col gap-1.5 min-w-0', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted font-medium truncate">{label}</span>
        {icon && <span className="text-muted [&>svg]:size-3.5">{icon}</span>}
      </div>
      <div className={cx('font-semibold leading-none text-ink tracking-[-0.01em] tnum', compact ? 'text-[18px]' : 'text-[24px]')}>{text}</div>
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

/** Strip of StatTiles with 1px hairlines between cells at any column count (incomplete rows stay clean). */
export function StatGroup({ children, className, columns, flush }: { children: ReactNode; className?: string; columns?: string; flush?: boolean }) {
  return (
    <div className={cx('grid overflow-hidden bg-surface', !flush && 'border border-border rounded-[var(--radius)]', '[&>*]:border-l [&>*]:border-t [&>*]:border-border [&>*]:-ml-px [&>*]:-mt-px', columns ?? 'grid-cols-2 md:grid-cols-4', className)}>
      {children}
    </div>
  )
}
