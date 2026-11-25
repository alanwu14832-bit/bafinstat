import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from '../../lib/format'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'

export interface SectionLink { id: string; label: string }

/** Where a section's top has to be to count as 「reading it」: under the top bar (56) and this row (44), with some air. */
const OFFSET = 124

/**
 * 區塊快捷鈕 (phones and tablets): a row of chips pinned under the top bar that jump to the page's sections, with the
 * one being read marked. A long stats page is many screens on a phone; this is its table of contents. Only sections
 * that are on the page right now get a chip (give each target an id and `scroll-mt-28`, or wrap it in <Section>).
 */
export function SectionNav({ items, label = '本頁區塊' }: { items: SectionLink[]; label?: string }) {
  const reduced = usePrefersReducedMotion()
  const [present, setPresent] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const row = useRef<HTMLDivElement>(null)
  const want = items.map((i) => i.id).join('|')

  // which of the sections exist (a card that needs data may not be drawn), checked after every render
  useEffect(() => {
    const now = items.filter((i) => document.getElementById(i.id)).map((i) => i.id)
    setPresent((p) => (p.join('|') === now.join('|') ? p : now))
  })

  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      let cur: string | null = null
      for (const id of want.split('|')) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= OFFSET) cur = id
      }
      // the bottom of the page: the last section may never reach the line
      const doc = document.documentElement
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 2) { const ids = want.split('|').filter((id) => document.getElementById(id)); cur = ids[ids.length - 1] ?? cur }
      setActive(cur)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read) }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame) }
  }, [want, present])

  // keep the marked chip in view inside the row
  useEffect(() => {
    const box = row.current
    const chip = box?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!box || !chip) return
    const left = chip.offsetLeft - 16, right = chip.offsetLeft + chip.offsetWidth + 16
    if (left < box.scrollLeft) box.scrollLeft = left
    else if (right > box.scrollLeft + box.clientWidth) box.scrollLeft = right - box.clientWidth
  }, [active])

  const shown = items.filter((i) => present.includes(i.id))
  if (shown.length < 2) return null
  const go = (id: string) => {
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }
  return (
    <nav aria-label={label} className="lg:hidden print:hidden sticky top-14 z-20 -mx-4 md:-mx-10 -my-2 border-b border-border bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-xl" style={{ WebkitBackdropFilter: 'blur(20px)' }}>
      <div ref={row} className="flex gap-1.5 overflow-x-auto px-4 md:px-10 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shown.map((i) => {
          const on = active === i.id
          return (
            <button key={i.id} type="button" aria-current={on ? 'true' : undefined} onClick={() => go(i.id)}
              className={cx('shrink-0 h-9 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap cursor-pointer transition-colors motion-reduce:transition-none',
                on ? 'bg-ink text-bg' : 'bg-surface text-ink-2 ring-1 ring-[var(--border)] hover:text-ink')}>
              {i.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/** A group of cards the 區塊快捷鈕 can jump to (lands clear of the top bar and the chip row). */
export function Section({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  return <div id={id} className={cx('scroll-mt-28 min-w-0 flex flex-col gap-6 md:gap-8', className)}>{children}</div>
}
