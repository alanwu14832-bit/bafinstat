import type { ReactNode } from 'react'
import { Stitches } from '../ui/Scoreboard'

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
    <div className="flex items-end justify-between gap-x-6 gap-y-3 flex-wrap pt-2 pb-1">
      <div className="min-w-0">
        <span aria-hidden className="block text-ink draw-x motion-reduce:animate-none mb-3" key={`${title}-accent`}><Stitches width={48} /></span>
        <h1 className="text-display text-ink">{title}</h1>
        {description && <p className="text-[15px] text-muted mt-2.5 prose-max leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
