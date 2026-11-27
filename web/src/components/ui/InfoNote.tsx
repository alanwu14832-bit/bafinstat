import { useId, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cx } from '../../lib/format'

/**
 * ⓘ beside a title: the explanation under it stays folded until someone asks for it, so a page of cards reads as
 * titles and numbers first. `button` goes next to the title, `panel` under it. Printing shows every note.
 */
export function useInfoNote(note: ReactNode, opts: { className?: string; what?: string; open?: boolean } = {}): { button: ReactNode; panel: ReactNode; open: boolean } {
  const [open, setOpen] = useState(!!opts.open)
  const id = useId()
  if (note === undefined || note === null || note === false || note === '') return { button: null, panel: null, open: false }
  const label = opts.what ? `${opts.what}的說明` : '說明'
  const button = (
    <button type="button" aria-expanded={open} aria-controls={id} aria-label={open ? `收起${label}` : `看${label}`} title={open ? `收起${label}` : `看${label}`}
      onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
      // a 24px dot with a 44px touch target around it
      className={cx('print:hidden relative shrink-0 inline-flex items-center justify-center size-6 rounded-full cursor-pointer transition-colors motion-reduce:transition-none before:absolute before:-inset-2.5 before:content-[""]',
        open ? 'bg-accent-soft text-ink' : 'text-muted hover:text-ink hover:bg-surface-2')}>
      <Info aria-hidden className="size-[15px]" strokeWidth={1.9} />
    </button>
  )
  const panel = <p id={id} className={cx('text-xs text-muted leading-[1.6] mt-1.5', !open && 'hidden print:block', opts.className)}>{note}</p>
  return { button, panel, open }
}
