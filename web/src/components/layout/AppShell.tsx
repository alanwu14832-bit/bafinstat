import { useEffect, type ReactNode } from 'react'
import { MobileDrawer, Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useUiStore } from '../../store/ui'
import { useLocation } from 'react-router-dom'
import { PageTransition } from '../motion/Reveal'

export interface AppShellProps {
  children: ReactNode
  /** Override the TopBar filter slot (defaults to the global FilterBar). */
  filters?: ReactNode
}

export function AppShell({ children, filters }: AppShellProps) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen)
  const { pathname } = useLocation()

  // Ctrl/Cmd+B toggles the sidebar (drawer on mobile).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        const isMobile = window.matchMedia?.('(max-width: 1023px)').matches
        if (isMobile) setMobileNavOpen(!useUiStore.getState().mobileNavOpen)
        else toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSidebar, setMobileNavOpen])

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)] bg-bg text-ink">
      <Sidebar />
      <MobileDrawer />
      <div className="min-w-0 flex flex-col">
        {filters === undefined ? <TopBar /> : <TopBar>{filters}</TopBar>}
        <main className="flex-1 min-w-0">
          <div className="max-w-[var(--content-max)] mx-auto px-4 py-6 md:px-10 md:py-10"><PageTransition id={pathname}>{children}</PageTransition></div>
        </main>
      </div>
    </div>
  )
}
