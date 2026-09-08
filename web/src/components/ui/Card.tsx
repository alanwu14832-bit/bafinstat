import type { ReactNode } from 'react'
import { cx } from '../../lib/format'

export interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
  bodyClassName?: string
  /** Remove body padding (e.g. for tables that need edge-to-edge scroll). */
  flush?: boolean
}

export function Card({ title, subtitle, action, children, className, bodyClassName, flush }: CardProps) {
  const hasHeader = title || subtitle || action
  return (
    <section
      className={cx(
        'bg-surface border border-border rounded-[var(--radius)] flex flex-col min-w-0',
        'transition-shadow duration-200 motion-reduce:transition-none',
        className,
      )}
    >
      {hasHeader && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-semibold text-ink leading-tight truncate">{title}</h3>}
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cx(!flush && (hasHeader ? 'px-5 pb-5' : 'p-5'), 'min-w-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  )
}
