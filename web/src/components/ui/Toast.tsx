import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'

export interface ToastData { id: number; text: string; action?: { label: string; onClick: () => void } }

/**
 * One line at the bottom of the screen saying what just happened, with an optional action (復原). A new toast
 * replaces the old one; it leaves by itself after a few seconds.
 */
export function Toast({ toast, onDone, ms = 4500 }: { toast: ToastData | null; onDone: () => void; ms?: number }) {
  const reduced = usePrefersReducedMotion()
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(onDone, ms)
    return () => window.clearTimeout(t)
  }, [toast, ms, onDone])
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom))] z-[80] flex justify-center px-4" aria-live="polite" role="status">
      <AnimatePresence mode="popLayout">
        {toast && (
          <motion.div key={toast.id} layout initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', visualDuration: 0.28, bounce: 0.15 }}
            className="pointer-events-auto max-w-[min(560px,100%)] flex items-center gap-3 rounded-full bg-[#141517] text-[#f3efe7] pl-4 pr-1.5 py-1.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
            <CheckCircle2 className="size-4 shrink-0 text-accent" aria-hidden />
            <span className="text-[13px] leading-5 min-w-0 line-clamp-2">{toast.text}</span>
            {toast.action && (
              <button type="button" onClick={() => { const a = toast.action!; onDone(); a.onClick() }} className="shrink-0 h-9 px-3.5 rounded-full bg-white/12 hover:bg-white/20 text-[13px] font-semibold cursor-pointer transition-colors">{toast.action.label}</button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
