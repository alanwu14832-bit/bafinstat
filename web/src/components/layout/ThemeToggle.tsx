import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useUiStore, type FontMode, type ThemeMode } from '../../store/ui'
import { cx } from '../../lib/format'

const MODES: Array<{ value: ThemeMode; label: string; icon: LucideIcon }> = [
  { value: 'system', label: '跟隨系統', icon: Monitor },
  { value: 'light', label: '淺色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
]

/** Three-state theme control. Same segmented style as Tabs. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  return (
    <div role="radiogroup" aria-label="主題" className={cx('inline-flex items-center gap-0.5 p-0.5 rounded-[var(--radius-sm)] bg-surface-2', className)}>
      {MODES.map(({ value, label, icon: Icon }) => {
        const active = theme === value
        return (
          <button key={value} type="button" role="radio" aria-checked={active} aria-label={label} title={label} onClick={() => setTheme(value)}
            className={cx('size-7 rounded-[6px] inline-flex items-center justify-center cursor-pointer transition-colors motion-reduce:transition-none',
              active ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)]' : 'text-muted hover:text-ink')}>
            <Icon className="size-3.5" />
          </button>
        )
      })}
    </div>
  )
}

const FONTS: Array<{ value: FontMode; label: string; glyph: string }> = [
  { value: 'sans', label: '黑體', glyph: '黑' },
  { value: 'serif', label: '宋體', glyph: '宋' },
]

/** 宋體 / 黑體 switch for the whole site. */
export function FontToggle({ className }: { className?: string }) {
  const font = useUiStore((s) => s.font)
  const setFont = useUiStore((s) => s.setFont)
  return (
    <div role="radiogroup" aria-label="字體" className={cx('inline-flex items-center gap-0.5 p-0.5 rounded-[var(--radius-sm)] bg-surface-2', className)}>
      {FONTS.map(({ value, label, glyph }) => {
        const active = font === value
        return (
          <button key={value} type="button" role="radio" aria-checked={active} aria-label={label} title={label} onClick={() => setFont(value)}
            className={cx('size-7 rounded-[6px] inline-flex items-center justify-center cursor-pointer transition-colors motion-reduce:transition-none text-[12px] leading-none',
              value === 'serif' ? 'font-[family-name:var(--font-serif)]' : 'font-[family-name:var(--font-sans)]',
              active ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)] font-semibold' : 'text-muted hover:text-ink')}>
            {glyph}
          </button>
        )
      })}
    </div>
  )
}
