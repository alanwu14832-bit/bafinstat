import type { ReactNode } from 'react'

export interface PageHeaderProps {
  /** Kept for API compatibility; no longer rendered (the page title alone is enough). */
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
}

/** Page title row: title + one-line context on the left, page-level controls on the right. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-x-6 gap-y-3 flex-wrap pb-5 border-b border-border">
      <div className="min-w-0">
        <h1 className="text-display text-ink">{title}</h1>
        {description && <p className="text-[13px] text-ink-2 mt-1.5 prose-max leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
