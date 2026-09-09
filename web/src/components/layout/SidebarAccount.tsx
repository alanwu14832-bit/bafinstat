import { useState } from 'react'
import { motion } from 'framer-motion'
import { LogIn, LogOut, UserRound } from 'lucide-react'
import { AuthDialog } from '../ui/AuthDialog'
import { useDataStore } from '../../store/data'
import { signOut } from '../../data/supabase'
import { cx } from '../../lib/format'

const EASE = [0.22, 1, 0.36, 1] as const

/** Account block at the bottom of the sidebar: sign in, or who is signed in + sign out. Hidden in local mode. */
export function SidebarAccount({ collapsed, reduced }: { collapsed: boolean; reduced: boolean }) {
  const cloud = useDataStore((s) => s.cloud)
  const [open, setOpen] = useState(false)
  if (!cloud.configured) return null
  const label = cloud.user ? (cloud.user.email ?? '已登入') : '紀錄員登入'
  const sub = cloud.user ? (cloud.isEditor ? '紀錄員' : '瀏覽者（不在名單）') : '紀錄、上傳需要登入'
  return (
    <div className="px-3 pt-3 border-t border-border">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => { if (!cloud.user) setOpen(true) }} title={cloud.user ? label : '登入'} aria-label={cloud.user ? `已登入 ${label}` : '登入'}
          className={cx('flex items-center h-10 flex-1 min-w-0 rounded-[var(--radius-sm)] pl-[13px] pr-2 overflow-hidden whitespace-nowrap text-left', !cloud.user && 'hover:bg-surface-2 cursor-pointer', 'transition-colors motion-reduce:transition-none')}>
          <span className={cx('size-[18px] shrink-0 inline-flex items-center justify-center', cloud.user ? 'text-ink' : 'text-ink-2')}>{cloud.user ? <UserRound className="size-[18px]" strokeWidth={1.8} /> : <LogIn className="size-[18px]" strokeWidth={1.8} />}</span>
          <motion.span className="ml-3 min-w-0" initial={false} animate={{ opacity: collapsed ? 0 : 1 }} transition={reduced ? { duration: 0 } : { duration: 0.16, ease: EASE }} aria-hidden={collapsed}>
            <span className="block text-[12.5px] font-medium text-ink truncate">{label}</span>
            <span className="block text-[11px] text-muted truncate">{sub}</span>
          </motion.span>
        </button>
        {cloud.user && !collapsed && (
          <button type="button" onClick={() => void signOut()} title="登出" aria-label="登出" className="size-8 shrink-0 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-muted hover:text-ink hover:bg-surface-2 cursor-pointer"><LogOut className="size-4" /></button>
        )}
      </div>
      <AuthDialog open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
