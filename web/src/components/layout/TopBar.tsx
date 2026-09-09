import type { ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { findNavItem } from './nav'
import { useUiStore } from '../../store/ui'
import { useDataStore } from '../../store/data'
import { cx } from '../../lib/format'

export interface TopBarProps {
  /** Global filter bar slot. */
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

/**
 * One 56px toolbar: menu (mobile) + current page name (mobile only, the sidebar shows it on desktop),
 * the global filters in a single horizontally scrollable row, and the theme control.
 */
export function TopBar({ children }: TopBarProps) {
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
        <div className="lg:hidden text-sm font-semibold text-ink whitespace-nowrap shrink-0">{item?.label ?? '頁面'}</div>
        <div className="lg:hidden w-px h-5 bg-border shrink-0" />
        {children && <div className="min-w-0 flex-1 scroll-x -my-2 py-2">{children}</div>}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <CloudStatus />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
