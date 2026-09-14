import { useEffect } from 'react'
import { X } from 'lucide-react'
import { LoginForm } from './LoginForm'
import { Button } from './Button'

/** Small centred sign-in dialog, opened from the sidebar. */
export function AuthDialog({ open, onClose, title = '紀錄員登入', intro }: { open: boolean; onClose: () => void; title?: string; intro?: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-surface border border-border rounded-t-[14px] sm:rounded-[14px] shadow-[var(--shadow-modal)] p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between"><div className="text-[16px] font-semibold text-ink">{title}</div><Button variant="ghost" size="sm" icon={<X />} aria-label="關閉" onClick={onClose} /></div>
        <LoginForm onDone={onClose} autoFocus intro={intro} />
      </div>
    </div>
  )
}
