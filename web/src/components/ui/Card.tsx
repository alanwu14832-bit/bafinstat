import type { ReactNode } from 'react'
import { cx } from '../../lib/format'

export interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
  bodyClassName?: string
  /** Remove body padding (tables and lists run edge to edge). */
  flush?: boolean
}

/** The one container: 1px border, surface background, no shadow. Header and body share the same 20px inset. */
export function Card({ title, subtitle, action, children, className, bodyClassName, flush }: CardProps) {
  const hasHeader = !!(title || subtitle || action)
  return (
    <section className={cx('bg-surface border border-border rounded-[var(--radius)] flex flex-col min-w-0', className)}>
      {hasHeader && (
        <header className={cx('flex items-start justify-between gap-4 px-5 pt-4', flush ? 'pb-4 border-b border-border' : 'pb-3')}>
          <div className="min-w-0">
            {title && <h3 className="text-[14px] font-semibold text-ink leading-5 truncate">{title}</h3>}
            {subtitle && <p className="text-xs text-muted leading-4 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0 flex items-center gap-2 -my-1">{action}</div>}
        </header>
      )}
      <div className={cx(!flush && (hasHeader ? 'px-5 pb-5' : 'p-5'), 'min-w-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  )
}

/** Heading for a group of components that does not need a box around it. */
export function SectionHeading({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink leading-5">{title}</h2>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  )
}
