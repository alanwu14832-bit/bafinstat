import { AnimatePresence, motion } from 'framer-motion'
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { NAV_ITEMS } from './nav'
import { useUiStore } from '../../store/ui'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import { cx } from '../../lib/format'

export const SIDEBAR_WIDTH = 248
export const SIDEBAR_WIDTH_COLLAPSED = 72

const EASE = [0.22, 1, 0.36, 1] as const
const WIDTH_TRANSITION = { type: 'tween', duration: 0.28, ease: EASE } as const

interface NavListProps {
  collapsed: boolean
  reduced: boolean
}

/** Shared nav list. Icons keep a fixed x-position; labels fade/slide and are clipped by the link. */
function NavList({ collapsed, reduced }: NavListProps) {
  return (
    <ul className="flex flex-col gap-1 px-3" role="list">
      {NAV_ITEMS.map(({ to, label, icon: Icon }, i) => (
        <li key={to} className="relative group">
          <NavLink
            to={to}
            end={to === '/'}
            title={collapsed ? label : undefined}
            aria-label={label}
            className={({ isActive }) =>
              cx(
                'relative flex items-center h-10 rounded-[var(--radius-sm)] pl-[14px] pr-3 overflow-hidden whitespace-nowrap',
                'text-sm transition-colors motion-reduce:transition-none',
                isActive ? 'text-ink font-medium' : 'text-ink-2 hover:text-ink hover:bg-surface-2',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-[var(--radius-sm)] bg-accent-soft"
                    transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 38 }}
                  >
                    <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" />
                  </motion.span>
                )}
                <Icon className="relative size-5 shrink-0" strokeWidth={isActive ? 2.25 : 2} />
                <motion.span
                  className="relative ml-3"
                  initial={false}
                  animate={{ opacity: collapsed ? 0 : 1, x: collapsed ? -6 : 0 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { duration: 0.2, ease: EASE, delay: collapsed ? 0 : 0.05 + i * 0.02 }
                  }
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
                'rounded-[6px] bg-ink text-bg text-xs px-2 py-1 shadow-[var(--shadow-hover)]',
                'opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:translate-x-0',
                'transition-all duration-150 motion-reduce:transition-none',
              )}
            >
              {label}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

function Brand({ collapsed, reduced }: { collapsed: boolean; reduced: boolean }) {
  return (
    <div className="flex items-center h-16 pl-[14px] pr-3 mx-3 overflow-hidden whitespace-nowrap">
      <span
        className="size-8 shrink-0 rounded-[8px] bg-accent text-accent-ink font-display font-bold text-[18px] inline-flex items-center justify-center -ml-1.5"
        aria-hidden
      >
        B
      </span>
      <motion.div
        className="ml-2.5 leading-none"
        initial={false}
        animate={{ opacity: collapsed ? 0 : 1, x: collapsed ? -6 : 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE, delay: collapsed ? 0 : 0.05 }}
        aria-hidden={collapsed}
      >
        <div className="font-display font-bold text-[22px] tracking-wide text-ink">BAFIN</div>
        <div className="text-[11px] text-muted mt-0.5">喝FIN就好BA 數據平台</div>
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
      className="hidden lg:flex flex-col sticky top-0 h-screen shrink-0 border-r border-border bg-surface z-40"
      style={{ width }}
    >
      <Brand collapsed={collapsed} reduced={reduced} />
      <nav aria-label="主選單" className="flex-1 overflow-visible py-2">
        <NavList collapsed={collapsed} reduced={reduced} />
      </nav>
      <div className="px-3 py-3 border-t border-border">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? '展開側邊欄' : '收合側邊欄'}
          aria-expanded={!collapsed}
          title={`${collapsed ? '展開' : '收合'} (Ctrl/⌘+B)`}
          className="flex items-center h-9 w-full rounded-[var(--radius-sm)] pl-[14px] pr-3 text-ink-2 hover:text-ink hover:bg-surface-2 overflow-hidden whitespace-nowrap cursor-pointer transition-colors motion-reduce:transition-none"
        >
          {collapsed ? <ChevronsRight className="size-5 shrink-0" /> : <ChevronsLeft className="size-5 shrink-0" />}
          <motion.span
            className="ml-3 text-xs"
            initial={false}
            animate={{ opacity: collapsed ? 0 : 1, x: collapsed ? -6 : 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE }}
            aria-hidden={collapsed}
          >
            收合側邊欄 <kbd className="ml-1 text-muted font-body">⌘B</kbd>
          </motion.span>
        </button>
      </div>
    </motion.aside>
  )
}

/** Mobile off-canvas drawer: closes on route change, Esc, backdrop; locks body scroll; traps focus. */
export function MobileDrawer() {
  const open = useUiStore((s) => s.mobileNavOpen)
  const setOpen = useUiStore((s) => s.setMobileNavOpen)
  const reduced = usePrefersReducedMotion()
  const { pathname } = useLocation()
  const panelRef = useRef<HTMLDivElement>(null)

  // Close whenever the route changes.
  useEffect(() => {
    setOpen(false)
  }, [pathname, setOpen])

  // Body scroll lock + Esc + initial focus + focus trap.
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusables = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
    const previouslyFocused = document.activeElement as HTMLElement | null
    requestAnimationFrame(() => focusables()[0]?.focus())

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const els = focusables()
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [open, setOpen])

  return (
    <AnimatePresence>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="主選單">
          <motion.button
            type="button"
            aria-label="關閉選單"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            ref={panelRef}
            className="absolute inset-y-0 left-0 w-[248px] max-w-[85vw] bg-surface border-r border-border flex flex-col shadow-[var(--shadow-hover)]"
            initial={{ x: reduced ? 0 : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: reduced ? 0 : '-100%' }}
            transition={reduced ? { duration: 0 } : WIDTH_TRANSITION}
          >
            <div className="flex items-center justify-between pr-3">
              <Brand collapsed={false} reduced={reduced} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="關閉選單"
                className="size-9 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-ink-2 hover:bg-surface-2 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav aria-label="主選單" className="flex-1 overflow-y-auto py-2">
              <NavList collapsed={false} reduced={reduced} />
            </nav>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
