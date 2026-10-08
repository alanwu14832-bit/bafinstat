import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { LoginForm } from './LoginForm'
import { Button } from './Button'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'

/**
 * Small centred sign-in dialog, opened from the sidebar. While open, Tab stays inside it, the page behind cannot be
 * reached (inert), Escape closes it, and the focus goes back to the button that opened it.
 */
export function AuthDialog({ open, onClose, title = '紀錄員登入', intro }: { open: boolean; onClose: () => void; title?: string; intro?: string }) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  // what had the focus before opening (read while rendering: the form's autofocus moves it before any effect runs)
  const back = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current && typeof document !== 'undefined') back.current = document.activeElement as HTMLElement | null
  wasOpen.current = open
  useEffect(() => {
    if (!open) return
    const opener = back.current
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeRef.current(); return }
      if (e.key !== 'Tab' || !panel.current) return
      const els = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (!els.length) return
      const first = els[0], last = els[els.length - 1]
      const inside = panel.current.contains(document.activeElement)
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); root?.removeAttribute('inert'); opener?.focus?.({ preventScroll: true }) }
  }, [open])
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div ref={panel} className="relative w-full sm:max-w-sm bg-surface border border-border rounded-t-[14px] sm:rounded-[14px] shadow-[var(--shadow-modal)] p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between"><div className="text-[16px] font-semibold text-ink">{title}</div><Button variant="ghost" size="sm" icon={<X />} aria-label="關閉" onClick={onClose} /></div>
        <LoginForm onDone={onClose} autoFocus intro={intro} />
      </div>
    </div>,
    document.body,
  )
}
