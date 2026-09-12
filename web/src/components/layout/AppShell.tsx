import { useEffect, type ReactNode } from 'react'
import { MobileDrawer, Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useUiStore } from '../../store/ui'
import { useLocation } from 'react-router-dom'
import { PageTransition } from '../motion/Reveal'
import { useDataStore } from '../../store/data'
import { CloudOff } from 'lucide-react'

export interface AppShellProps {
  children: ReactNode
  /** Override the TopBar filter slot (defaults to the global FilterBar). */
  filters?: ReactNode
}

export function AppShell({ children, filters }: AppShellProps) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen)
  const { pathname } = useLocation()
  const cloud = useDataStore((s) => s.cloud)
  const hasCache = useDataStore((s) => s.base.games.length > 0)
  const stale = cloud.configured && cloud.status === 'error' && hasCache

  // Phone: a swipe that starts on the left edge opens the drawer (10 px hysteresis, horizontal wins)
  useEffect(() => {
    let start: { x: number; y: number } | null = null
    const ts = (e: TouchEvent) => { const t = e.touches[0]; start = t.clientX <= 24 && window.matchMedia('(max-width: 1023px)').matches ? { x: t.clientX, y: t.clientY } : null }
    const tm = (e: TouchEvent) => {
      if (!start) return
      const t = e.touches[0]; const dx = t.clientX - start.x, dy = Math.abs(t.clientY - start.y)
      if (dx > 24 && dx > dy * 1.5) { start = null; useUiStore.getState().setMobileNavOpen(true) }
      else if (dy > 12 && dy > dx) start = null
    }
    const te = () => { start = null }
    document.addEventListener('touchstart', ts, { passive: true }); document.addEventListener('touchmove', tm, { passive: true }); document.addEventListener('touchend', te)
    return () => { document.removeEventListener('touchstart', ts); document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', te) }
  }, [])

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
          {stale && (
            <div role="status" className="max-w-[var(--content-max)] mx-auto px-4 md:px-10 pt-4 -mb-2">
              <div className="flex items-center gap-2 rounded-[12px] bg-[color-mix(in_srgb,var(--critical)_10%,var(--surface))] px-3 py-2 text-[13px] text-ink">
                <CloudOff className="size-4 text-critical shrink-0" />
                <span className="min-w-0 flex-1">顯示的是上次同步的資料{cloud.lastSync ? `（${new Date(cloud.lastSync).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}）` : ''}，雲端目前連不上。</span>
                <button type="button" onClick={() => void useDataStore.getState().loadCloud()} className="text-[13px] font-medium underline underline-offset-2 cursor-pointer">重新連線</button>
              </div>
            </div>
          )}
          <div className="max-w-[var(--content-max)] mx-auto px-4 py-6 md:px-10 md:py-10"><PageTransition id={pathname}>{children}</PageTransition></div>
        </main>
      </div>
    </div>
  )
}
