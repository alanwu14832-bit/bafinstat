import type { ReactNode } from 'react'
import { Menu, Upload } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Button } from '../ui/Button'
import { ThemeToggle } from './ThemeToggle'
import { findNavItem } from './nav'
import { useUiStore } from '../../store/ui'

export interface TopBarProps {
  /** Global filter bar slot. */
  children?: ReactNode
}

export function TopBar({ children }: TopBarProps) {
  const { pathname } = useLocation()
  const item = findNavItem(pathname)
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen)

  return (
    <header
      className="sticky top-0 z-30 border-b border-border bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] backdrop-blur-md"
      style={{ WebkitBackdropFilter: 'blur(12px)' }}
    >
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 flex flex-wrap items-center gap-x-4 gap-y-2 py-2 min-h-14 lg:min-h-16">
        <div className="flex items-center gap-2 min-w-0 order-1">
          <button
            type="button"
            aria-label="開啟選單"
            onClick={() => setMobileNavOpen(true)}
            className="lg:hidden size-9 -ml-1 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-ink-2 hover:bg-surface-2 cursor-pointer"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 leading-tight">
            <div className="font-display font-bold text-[20px] text-ink tracking-wide truncate">{item?.label ?? '頁面'}</div>
            {item?.subtitle && <div className="text-[11px] text-muted -mt-0.5 hidden sm:block">{item.subtitle}</div>}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto order-2">
          <ThemeToggle />
          <span className="hidden sm:inline-flex">
            <Button variant="primary" size="sm" icon={<Upload />} to="/import">
              匯入資料
            </Button>
          </span>
          <span className="sm:hidden inline-flex">
            <Button variant="primary" size="sm" to="/import" aria-label="匯入資料" className="w-9 px-0">
              <Upload />
            </Button>
          </span>
        </div>

        {children && <div className="order-3 w-full xl:order-2 xl:w-auto xl:flex-1 xl:ml-2">{children}</div>}
      </div>
    </header>
  )
}
