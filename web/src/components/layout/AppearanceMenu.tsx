/**
 * 「外觀」: the theme (跟隨系統／淺色／深色) and the reading face (黑體／宋體) behind one button in the top bar, with words, not
 * five unlabeled icons (2026-11-27 audit: the bar held 篩選, 雲端, 黑, 宋 and three theme icons). The phone menu keeps the
 * two full-width controls.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useUiStore } from '../../store/ui'
import { cx } from '../../lib/format'
import { FontToggle, ThemeToggle } from './ThemeToggle'

export function AppearanceMenu() {
  const theme = useUiStore((s) => s.theme)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor
  return (
    <div ref={box} className="relative">
      <button ref={button} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className={cx('tap-44 inline-flex items-center gap-1.5 h-9 pointer-fine:h-8 px-2.5 rounded-full text-[13px] font-medium cursor-pointer transition-colors motion-reduce:transition-none',
          open ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
        <Icon aria-hidden className="size-4" />外觀
      </button>
      {open && (
        <div id={id} role="dialog" aria-label="外觀" className="absolute right-0 top-[calc(100%+8px)] z-40 w-[240px] rounded-[var(--radius-sm)] bg-surface shadow-[var(--shadow-modal)] p-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5"><span className="text-[12px] text-ink-2">主題（跟隨系統／淺色／深色）</span><ThemeToggle size="md" /></div>
          <div className="flex flex-col gap-1.5"><span className="text-[12px] text-ink-2">內文字體（黑體／宋體）</span><FontToggle size="md" /></div>
        </div>
      )}
    </div>
  )
}
