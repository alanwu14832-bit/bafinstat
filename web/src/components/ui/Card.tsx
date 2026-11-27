import type { ReactNode } from 'react'
import { cx } from '../../lib/format'
import { Reveal } from '../motion/Reveal'
import { useInfoNote } from './InfoNote'

export interface CardProps {
  title?: ReactNode
  /** What the card shows and how to read it: folded behind the ⓘ next to the title (shown as is when there is no title). */
  subtitle?: ReactNode
  /** Open with the explanation showing (it says something the reader must not miss, e.g. 「這場有 2 項待核對」). */
  noteOpen?: boolean
  action?: ReactNode
  children?: ReactNode
  className?: string
  bodyClassName?: string
  /** Remove body padding (tables and lists run edge to edge). */
  flush?: boolean
  /** Skip the scroll-in reveal (for cards inside dialogs or live views). */
  still?: boolean
  /** Anchor for links such as /pitching?sort=era#stats; clears the sticky top bar when scrolled to. */
  id?: string
}

/** The one container: white surface floating on the gray ground with a soft shadow, no border. Header and body share the same 20px inset. */
export function Card({ title, subtitle, noteOpen, action, children, className, bodyClassName, flush, still, id }: CardProps) {
  const hasHeader = !!(title || subtitle || action)
  const info = useInfoNote(title ? subtitle : null, { what: typeof title === 'string' ? title : undefined, open: noteOpen })
  const cls = cx('bg-surface rounded-[var(--radius)] shadow-[var(--shadow-card)] flex flex-col min-w-0', id && 'scroll-mt-28', className)
  const body = (
    <>
      {hasHeader && (
        <header className={cx('flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-2 sm:gap-x-4 px-5 pt-5', flush ? 'pb-4 border-b border-border' : 'pb-3')}>
          <div className="min-w-0 sm:flex-1 sm:min-w-[9rem]">
            {title && <div className="flex items-center gap-1.5 min-w-0"><h2 className="text-[16px] text-ink leading-6 truncate">{title}</h2>{info.button}</div>}
            {title ? info.panel : subtitle && <p className="text-xs text-muted leading-4 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="min-w-0 max-w-full flex items-center sm:justify-end gap-2 flex-wrap sm:-my-1">{action}</div>}
        </header>
      )}
      <div className={cx(!flush && (hasHeader ? 'px-5 pb-5' : 'p-5'), 'min-w-0 flex-1', bodyClassName)}>{children}</div>
    </>
  )
  if (still) return <section id={id} className={cls}>{body}</section>
  return <Reveal as="section" id={id} className={cls}>{body}</Reveal>
}

/** Heading for a group of components that does not need a box around it. */
export function SectionHeading({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[17px] text-ink leading-6">{title}</h2>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  )
}
