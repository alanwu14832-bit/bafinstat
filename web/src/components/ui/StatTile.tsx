import { animate, useMotionValue } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { Sparkline } from '../charts/Sparkline'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import { formatNumber, signed, type NumberFormat } from '../../lib/format'
import { cx } from '../../lib/format'

export interface StatTileProps {
  label: string
  value: number
  format?: NumberFormat
  /** Pre-formatted display string (e.g. "12-6"); skips count-up. */
  display?: string
  /** Delta versus a baseline; sign decides color. */
  delta?: number
  deltaFormat?: NumberFormat
  deltaLabel?: string
  /** For ERA-like stats where lower is better. */
  invertDelta?: boolean
  sparkline?: number[]
  icon?: ReactNode
  /** Muted caption under the value (e.g. "101 K / 50 BB"). */
  note?: string
  /** Smaller value type for long composite displays. */
  compact?: boolean
  className?: string
}

/** Count-up from 0 using a framer-motion motion value; respects reduced motion. */
function useCountUp(target: number, enabled: boolean): number {
  const mv = useMotionValue(enabled ? 0 : target)
  const [display, setDisplay] = useState(enabled ? 0 : target)
  useEffect(() => {
    if (!enabled) {
      setDisplay(target)
      return
    }
    const unsub = mv.on('change', (v) => setDisplay(v))
    const controls = animate(mv, target, { duration: 1.1, ease: [0.22, 1, 0.36, 1] })
    return () => {
      unsub()
      controls.stop()
    }
  }, [target, enabled, mv])
  return display
}

export function StatTile({
  label, value, format = 'int', display, delta, deltaFormat, deltaLabel, invertDelta, sparkline, icon, note, compact, className,
}: StatTileProps) {
  const reduced = usePrefersReducedMotion()
  const current = useCountUp(value, !reduced && display === undefined)
  const text = display ?? formatNumber(current, format)

  const good = delta !== undefined && (invertDelta ? delta < 0 : delta > 0)
  const bad = delta !== undefined && (invertDelta ? delta > 0 : delta < 0)
  const deltaText =
    delta === undefined
      ? ''
      : deltaFormat === 'decimal3'
        ? (delta > 0 ? '+' : '') + formatNumber(delta, 'decimal3')
        : deltaFormat === 'pct'
          ? signed(delta, 1) + '%'
          : signed(delta, deltaFormat === 'ratio' || deltaFormat === 'era' ? 2 : 0)

  return (
    <div className={cx('bg-surface border border-border rounded-[var(--radius)] p-4 flex flex-col gap-2 min-w-0', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted font-medium truncate">{label}</span>
        {icon && <span className="text-muted [&>svg]:size-4">{icon}</span>}
      </div>
      <div className={cx('font-display font-bold leading-none text-ink tracking-tight', compact ? 'text-[24px]' : 'text-[34px]')}>{text}</div>
      {note && <div className="text-xs text-muted tnum -mt-1">{note}</div>}
      {(delta !== undefined || sparkline) && (
        <div className="flex items-end justify-between gap-3 mt-auto">
          {delta !== undefined ? (
            <span
              className={cx(
                'inline-flex items-center gap-0.5 text-xs font-medium tnum whitespace-nowrap',
                good && 'text-good',
                bad && 'text-critical',
                !good && !bad && 'text-muted',
              )}
            >
              {good ? <ArrowUpRight className="size-3.5" /> : bad ? <ArrowDownRight className="size-3.5" /> : <Minus className="size-3.5" />}
              {deltaText}
              {deltaLabel && <span className="text-muted font-normal ml-1">{deltaLabel}</span>}
            </span>
          ) : (
            <span />
          )}
          {sparkline && (
            <div className="w-20 shrink-0 min-w-0">
              <Sparkline data={sparkline} height={28} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
