import { useState, type ReactNode } from 'react'
import { cx } from '../../lib/format'

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom'
  className?: string
}

const sideCls: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
}

/** Minimal hover/focus tooltip. Wraps children in an inline-flex span. */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [open, setOpen] = useState(false)
  return (
    <span
      className={cx('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cx(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-[6px] bg-ink text-bg text-xs px-2 py-1 shadow-[var(--shadow-hover)]',
            sideCls[side],
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}
