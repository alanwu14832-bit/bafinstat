import { FilterChips } from './FilterChips'
import type { ReactNode } from 'react'
import { Stitches } from '../ui/Scoreboard'
import { useInfoNote } from '../ui/InfoNote'

export interface PageHeaderProps {
  /** stats pages: show what the numbers cover (games, 資料截至) and the active filters as removable chips */
  scoped?: boolean
  /** Kept for API compatibility; no longer rendered (the page title alone is enough). */
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
}

/** Page title row: title on the left (its description folded behind the ⓘ beside it, like a Card's — 2026-11-27 audit:
 *  every stats page spent its opening on a paragraph before any number), page-level controls on the right. */
export function PageHeader({ title, description, actions, scoped }: PageHeaderProps) {
  const info = useInfoNote(description, { what: title, className: 'text-[14px] mt-2 prose-max' })
  const head = (
    <div className="flex items-end justify-between gap-x-6 gap-y-3 flex-wrap pt-2 pb-1">
      <div className="min-w-0">
        <span aria-hidden className="block text-ink draw-x motion-reduce:animate-none mb-3" key={`${title}-accent`}><Stitches width={48} /></span>
        <div className="flex items-center gap-2 min-w-0"><h1 className="text-display text-ink">{title}</h1>{info.button}</div>
        {info.panel}
      </div>
      {/* max-w-full: on a phone a wide action row wraps inside the page instead of pushing it sideways */}
      {actions && <div className="flex items-center gap-2 shrink-0 max-w-full">{actions}</div>}
    </div>
  )
  if (!scoped) return head
  return <>{head}<FilterChips /></>
}
