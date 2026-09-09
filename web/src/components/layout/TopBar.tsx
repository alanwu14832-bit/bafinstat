import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, SlidersHorizontal, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { findNavItem } from './nav'
import { activeFilterCount, FilterBar } from './FilterBar'
import { useUiStore } from '../../store/ui'
import { useDataStore } from '../../store/data'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import { cx } from '../../lib/format'

export interface TopBarProps {
  /** Desktop filter row (defaults to the global FilterBar). */
  children?: ReactNode
}

/** Cloud connection state as a dot + word; details on hover. */
function CloudStatus() {
  const cloud = useDataStore((s) => s.cloud)
  if (!cloud.configured) return null
  const ok = cloud.status === 'ready'
  const err = cloud.status === 'error'
  const title = ok ? (cloud.user ? `雲端已連線・${cloud.user.email}` : '雲端已連線（唯讀）') : err ? `雲端連線失敗：${cloud.error ?? ''}` : '雲端載入中'
  return (
    <span title={title} className="hidden md:inline-flex items-center gap-1.5 h-8 px-2 text-xs text-ink-2 whitespace-nowrap">
      <span className={cx('size-1.5 rounded-full', ok ? 'bg-good' : err ? 'bg-critical' : 'bg-muted')} />
      {ok ? (cloud.user ? '雲端・已登入' : '雲端') : err ? '雲端失敗' : '連線中'}
    </span>
  )
}

/** Phone: a "篩選" button that opens the filters in a bottom sheet, with a count of active filters. */
function MobileFilters() {
  const [open, setOpen] = useState(false)
  const filters = useDataStore((s) => s.filters)
  const count = activeFilterCount(filters)
  const reduced = usePrefersReducedMotion()
  const { pathname } = useLocation()
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
        className={cx('lg:hidden inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--radius-sm)] border text-[13px] font-medium cursor-pointer transition-colors motion-reduce:transition-none',
          count ? 'border-ink bg-ink text-bg' : 'border-border bg-surface text-ink hover:bg-surface-2')}>
        <SlidersHorizontal className="size-3.5" />
        篩選{count > 0 && <span className="tnum">・{count}</span>}
      </button>
      {/* Portal: the header's backdrop-filter would otherwise become the containing block for this fixed sheet. */}
      {createPortal(<AnimatePresence>
        {open && (
          <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="篩選">
            <motion.button type="button" aria-label="關閉篩選" className="absolute inset-0 bg-black/40 cursor-default"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.18 }} onClick={() => setOpen(false)} />
            <motion.div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto bg-surface border-t border-border rounded-t-[14px] shadow-[var(--shadow-modal)] pb-[max(16px,env(safe-area-inset-bottom))]"
              initial={{ y: reduced ? 0 : '100%' }} animate={{ y: 0 }} exit={{ y: reduced ? 0 : '100%' }} transition={reduced ? { duration: 0 } : { type: 'tween', duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
              <div className="sticky top-0 bg-surface border-b border-border px-4 h-12 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">篩選{count > 0 && <span className="text-muted font-normal ml-1.5 tnum">{count} 項生效</span>}</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="關閉篩選" className="size-9 -mr-2 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-ink-2 hover:bg-surface-2 cursor-pointer"><X className="size-5" /></button>
              </div>
              <div className="px-4 pt-4">
                <FilterBar layout="stack" />
                <button type="button" onClick={() => setOpen(false)} className="mt-3 w-full h-10 rounded-[var(--radius-sm)] bg-ink text-bg text-sm font-medium cursor-pointer">完成</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>, document.body)}
    </>
  )
}

/**
 * One 56px toolbar. Desktop: the global filters in a single row. Phone: page name + a 篩選 button that opens
 * the same filters as a bottom sheet, so nothing has to be scrolled sideways.
 */
export function TopBar({ children = <FilterBar /> }: TopBarProps) {
  const { pathname } = useLocation()
  const item = findNavItem(pathname)
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen)

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-sm" style={{ WebkitBackdropFilter: 'blur(8px)' }}>
      <div className="max-w-[var(--content-max)] mx-auto px-4 md:px-8 h-14 flex items-center gap-3">
        <button type="button" aria-label="開啟選單" onClick={() => setMobileNavOpen(true)}
          className="lg:hidden size-9 -ml-2 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-ink-2 hover:bg-surface-2 cursor-pointer shrink-0">
          <Menu className="size-5" />
        </button>
        <div className="lg:hidden text-[15px] font-semibold text-ink whitespace-nowrap truncate min-w-0">{item?.label ?? '頁面'}</div>
        {children && <div className="hidden lg:block min-w-0 flex-1 scroll-x -my-2 py-2">{children}</div>}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <MobileFilters />
          <CloudStatus />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
