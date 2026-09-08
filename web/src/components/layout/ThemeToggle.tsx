import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { useUiStore, type ThemeMode } from '../../store/ui'
import { cx } from '../../lib/format'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'

const MODES: Array<{ value: ThemeMode; label: string; icon: LucideIcon }> = [
  { value: 'system', label: '跟隨系統', icon: Monitor },
  { value: 'light', label: '淺色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
]

/** Three-state segmented theme control (system / light / dark). */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const reduced = usePrefersReducedMotion()
  return (
    <div
      role="radiogroup"
      aria-label="主題"
      className={cx('inline-flex items-center gap-0.5 p-0.5 rounded-[var(--radius-sm)] bg-surface-2 border border-border', className)}
    >
      {MODES.map(({ value, label, icon: Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cx(
              'relative size-7 rounded-[6px] inline-flex items-center justify-center cursor-pointer transition-colors motion-reduce:transition-none',
              active ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId="theme-active"
                className="absolute inset-0 rounded-[6px] bg-surface border border-border"
                transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <Icon className="relative size-4" />
          </button>
        )
      })}
    </div>
  )
}
