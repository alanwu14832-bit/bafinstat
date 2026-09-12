import { useEffect, useState, type ReactNode } from 'react'
import { Menu, SlidersHorizontal, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { FontToggle, ThemeToggle } from './ThemeToggle'
import { findNavItem } from './nav'
import { activeFilterCount, FilterBar } from './FilterBar'
import { useUiStore } from '../../store/ui'
import { useDataStore } from '../../store/data'
import { cx } from '../../lib/format'
import { Sheet } from '../ui/Sheet'
import { IconBaseball } from '../icons/baseball'

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
      {ok || err ? <span className={cx('size-1.5 rounded-full', ok ? 'bg-good' : 'bg-critical')} /> : <IconBaseball className="size-3.5 text-muted animate-spin [animation-duration:1.6s]" />}
      {ok ? (cloud.user ? '雲端・已登入' : '雲端') : err ? '雲端失敗' : '連線中'}
    </span>
  )
}

/** Phone: a "篩選" button that opens the filters in a bottom sheet, with a count of active filters. */
function MobileFilters() {
  const [open, setOpen] = useState(false)
  const filters = useDataStore((s) => s.filters)
  const count = activeFilterCount(filters)
  const { pathname } = useLocation()
  useEffect(() => { setOpen(false) }, [pathname])
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
        className={cx('lg:hidden inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-[13px] font-medium cursor-pointer transition-colors motion-reduce:transition-none',
          count ? 'border-ink bg-ink text-bg' : 'border-border bg-surface text-ink hover:bg-surface-2')}>
        <SlidersHorizontal className="size-3.5" />
        篩選{count > 0 && <span className="tnum">・{count}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} ariaLabel="篩選" side="bottom" desktopFrom="never" className="lg:hidden" panelClassName="max-h-[88vh]"
        header={<div className="px-4 h-11 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">篩選{count > 0 && <span className="text-muted font-normal ml-1.5 tnum">{count} 項生效</span>}</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="關閉篩選" className="size-9 -mr-2 inline-flex items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 active:bg-surface-3 cursor-pointer"><X className="size-5" /></button>
        </div>}>
        <div className="px-4 pt-2 pb-4">
          <FilterBar layout="stack" />
          <button type="button" onClick={() => setOpen(false)} className="mt-3 w-full h-11 rounded-full bg-ink text-bg text-sm font-medium cursor-pointer active:scale-[0.98]">完成</button>
        </div>
      </Sheet>
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
    <header className="sticky top-0 z-30 border-b border-border bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] backdrop-blur-xl backdrop-saturate-150" style={{ WebkitBackdropFilter: 'blur(20px) saturate(150%)' }}>
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
          <div className="hidden lg:flex items-center gap-2"><FontToggle /><ThemeToggle /></div>
        </div>
      </div>
    </header>
  )
}
