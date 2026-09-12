import { motion } from 'framer-motion'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { NAV_GROUPS } from './nav'
import { TeamLogo } from '../ui/TeamLogo'
import { useUiStore } from '../../store/ui'
import { useDataStore } from '../../store/data'
import { SidebarAccount } from './SidebarAccount'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import { cx } from '../../lib/format'
import { Sheet } from '../ui/Sheet'

export const SIDEBAR_WIDTH = 248
export const SIDEBAR_WIDTH_COLLAPSED = 72

const EASE = [0.22, 1, 0.36, 1] as const
const WIDTH_TRANSITION = { type: 'tween', duration: 0.24, ease: EASE } as const

interface NavListProps {
  collapsed: boolean
  reduced: boolean
}

/** Grouped nav list. Icons keep a fixed x-position; labels fade and are clipped by the link. */
function NavList({ collapsed, reduced }: NavListProps) {
  const cloud = useDataStore((s) => s.cloud)
  const showEditorItems = !cloud.configured || (!!cloud.user && cloud.isEditor)
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.editorOnly || showEditorItems) })).filter((g) => g.items.length)
  return (
    <div className="flex flex-col gap-5 px-3">
      {groups.map((group, gi) => (
        <div key={gi}>
          {group.label && (
            <div className={cx('h-5 px-2.5 mb-1 text-[11px] font-medium text-muted whitespace-nowrap overflow-hidden transition-opacity', collapsed ? 'opacity-0' : 'opacity-100')} aria-hidden={collapsed}>
              {group.label}
            </div>
          )}
          <ul className="flex flex-col gap-0.5" role="list">
            {group.items.map(({ to, label, icon: Icon }) => (
              <li key={to} className="relative group">
                <NavLink
                  to={to}
                  end={to === '/'}
                  title={collapsed ? label : undefined}
                  aria-label={label}
                  className={({ isActive }) =>
                    cx(
                      'relative flex items-center h-9 rounded-[var(--radius-sm)] pl-[13px] pr-3 overflow-hidden whitespace-nowrap',
                      'text-[13px] transition-colors motion-reduce:transition-none',
                      isActive ? 'text-ink font-medium' : 'text-ink-2 hover:text-ink hover:bg-surface-2 active:bg-surface-3',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-[10px] bg-surface-3/80"
                          transition={reduced ? { duration: 0 } : { type: 'spring', visualDuration: 0.25, bounce: 0.05 }}
                        />
                      )}
                      <Icon className="relative size-[18px] shrink-0" strokeWidth={isActive ? 2.1 : 1.8} />
                      <motion.span
                        className="relative ml-3"
                        initial={false}
                        animate={{ opacity: collapsed ? 0 : 1 }}
                        transition={reduced ? { duration: 0 } : { duration: 0.16, ease: EASE, delay: collapsed ? 0 : 0.06 }}
                        aria-hidden={collapsed}
                      >
                        {label}
                      </motion.span>
                    </>
                  )}
                </NavLink>
                {collapsed && (
                  <span
                    role="tooltip"
                    className={cx(
                      'pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 whitespace-nowrap',
                      'rounded-[6px] bg-ink text-bg text-xs font-medium px-2 py-1 shadow-[var(--shadow-hover)]',
                      'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-100 motion-reduce:transition-none',
                    )}
                  >
                    {label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Brand({ collapsed, reduced }: { collapsed: boolean; reduced: boolean }) {
  return (
    <div className="flex items-center h-14 pl-[15px] pr-3 mx-3 overflow-hidden whitespace-nowrap">
      <span className="-ml-1 inline-flex"><TeamLogo size={30} /></span>
      <motion.div
        className="ml-2.5 leading-none min-w-0"
        initial={false}
        animate={{ opacity: collapsed ? 0 : 1 }}
        transition={reduced ? { duration: 0 } : { duration: 0.16, ease: EASE, delay: collapsed ? 0 : 0.06 }}
        aria-hidden={collapsed}
      >
        <div className="text-[13.5px] font-semibold text-ink leading-4 tracking-[-0.01em]">台大工管財金系棒</div>
        <div className="text-[11px] text-muted leading-4 mt-px">NTU BaFiN・數據平台</div>
      </motion.div>
    </div>
  )
}

/** Desktop sidebar: animated width, persisted collapsed state, Ctrl/Cmd+B toggle. */
export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggle = useUiStore((s) => s.toggleSidebar)
  const reduced = usePrefersReducedMotion()
  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH

  return (
    <motion.aside
      data-testid="sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      initial={false}
      animate={{ width }}
      transition={reduced ? { duration: 0 } : WIDTH_TRANSITION}
      className="hidden lg:flex flex-col sticky top-0 h-screen shrink-0 bg-bg z-40"
      style={{ width }}
    >
      <Brand collapsed={collapsed} reduced={reduced} />
      <nav aria-label="主選單" className="flex-1 overflow-visible pt-2 pb-4">
        <NavList collapsed={collapsed} reduced={reduced} />
      </nav>
      <SidebarAccount collapsed={collapsed} reduced={reduced} />
      <div className="px-3 py-3 border-t border-border">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? '展開側邊欄' : '收合側邊欄'}
          aria-expanded={!collapsed}
          title={`${collapsed ? '展開' : '收合'} (Ctrl/⌘+B)`}
          className="flex items-center h-9 w-full rounded-[var(--radius-sm)] pl-[13px] pr-3 text-ink-2 hover:text-ink hover:bg-surface-2 overflow-hidden whitespace-nowrap cursor-pointer transition-colors motion-reduce:transition-none"
        >
          {collapsed ? <PanelLeftOpen className="size-[18px] shrink-0" strokeWidth={1.8} /> : <PanelLeftClose className="size-[18px] shrink-0" strokeWidth={1.8} />}
          <motion.span className="ml-3 text-[12px]" initial={false} animate={{ opacity: collapsed ? 0 : 1 }} transition={reduced ? { duration: 0 } : { duration: 0.16, ease: EASE }} aria-hidden={collapsed}>
            收合側邊欄 <kbd className="ml-1.5 text-muted font-body text-[11px]">⌘B</kbd>
          </motion.span>
        </button>
      </div>
    </motion.aside>
  )
}

/** Mobile off-canvas drawer: a left sheet that can be dragged shut; closes on route change, Esc, scrim. */
export function MobileDrawer() {
  const open = useUiStore((s) => s.mobileNavOpen)
  const setOpen = useUiStore((s) => s.setMobileNavOpen)
  const reduced = usePrefersReducedMotion()
  const { pathname } = useLocation()
  useEffect(() => { setOpen(false) }, [pathname, setOpen])
  return (
    <Sheet open={open} onClose={() => setOpen(false)} ariaLabel="主選單" side="left" desktopFrom="never" className="lg:hidden">
      <div className="flex items-center justify-between pr-3">
        <Brand collapsed={false} reduced={reduced} />
        <button type="button" onClick={() => setOpen(false)} aria-label="關閉選單" className="size-9 inline-flex items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 active:bg-surface-3 cursor-pointer">
          <X className="size-5" />
        </button>
      </div>
      <nav aria-label="主選單" className="pt-2 pb-4">
        <NavList collapsed={false} reduced={reduced} />
      </nav>
      <div className="pb-3"><SidebarAccount collapsed={false} reduced={reduced} /></div>
    </Sheet>
  )
}
