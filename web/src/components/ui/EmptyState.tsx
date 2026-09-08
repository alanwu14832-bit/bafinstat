import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({ icon, title, description, action, compact }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-16'} px-4`}>
      <div className="size-10 rounded-full bg-surface-2 text-muted flex items-center justify-center mb-3 [&>svg]:size-5">
        {icon ?? <Inbox />}
      </div>
      <div className="text-sm font-medium text-ink">{title}</div>
      {description && <p className="text-xs text-muted mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
