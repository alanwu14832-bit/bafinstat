import { cx } from '../../lib/format'

export interface SkeletonProps {
  className?: string
  /** Render N stacked line skeletons. */
  lines?: number
}

export function Skeleton({ className, lines }: SkeletonProps) {
  if (lines) {
    return (
      <div className="flex flex-col gap-2" aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={cx('h-3 rounded bg-surface-3 animate-pulse motion-reduce:animate-none', className)}
            style={{ width: `${100 - (i % 3) * 18}%` }}
          />
        ))}
      </div>
    )
  }
  return <div className={cx('rounded bg-surface-3 animate-pulse motion-reduce:animate-none', className)} aria-hidden />
}
