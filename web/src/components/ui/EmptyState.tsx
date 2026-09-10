import type { ReactNode } from 'react'
import { IconBaseball } from '../icons/baseball'
import { cx } from '../../lib/format'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({ icon, title, description, action, compact }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center justify-center text-center px-4', compact ? 'py-8' : 'py-14')}>
      <div className="text-muted mb-2 [&>svg]:size-6">{icon ?? <IconBaseball />}</div>
      <div className="text-sm font-medium text-ink">{title}</div>
      {description && <p className="text-[13px] text-muted mt-1 max-w-xs leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
