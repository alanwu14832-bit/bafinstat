import type { ReactNode } from 'react'

export interface SectionHeaderProps {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}

export function SectionHeader({ eyebrow, title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="text-[15px] font-semibold text-ink leading-5">{title}</h2>
        {description && <p className="text-sm text-ink-2 mt-1.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
