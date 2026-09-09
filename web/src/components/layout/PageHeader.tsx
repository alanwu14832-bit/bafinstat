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
    <div className="relative flex items-end justify-between gap-x-6 gap-y-3 flex-wrap pb-5">
      <div className="min-w-0">
        <h1 className="text-display text-ink">{title}</h1>
        {description && <p className="text-[13.5px] text-ink-2 mt-2 prose-max leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      {/* the rule under the title draws in from the left on every page change */}
      <span aria-hidden className="absolute left-0 right-0 bottom-0 h-px bg-border draw-x motion-reduce:animate-none" key={title} />
      <span aria-hidden className="absolute left-0 -bottom-[3.5px] text-ink draw-x motion-reduce:animate-none inline-flex bg-bg pr-1.5" key={`${title}-accent`}><Stitches width={56} /></span>
    </div>
  )
}
