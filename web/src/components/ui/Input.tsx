import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../lib/format'

/** Shared text-input styling so every field on the site has the same height, radius and states. */
export const inputCls = (size: 'sm' | 'md' = 'md') =>
  cx(
    'bg-surface border border-border rounded-[var(--radius-sm)] text-ink placeholder:text-muted min-w-0',
    'hover:border-[color-mix(in_srgb,var(--ink)_22%,transparent)] focus:border-[color-mix(in_srgb,var(--ink)_40%,transparent)] focus:outline-none',
    'transition-colors motion-reduce:transition-none disabled:opacity-50',
    size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3 text-sm',
  )

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md'
  /** Leading icon (16px). */
  icon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ size = 'md', icon, className, ...rest }, ref) {
  if (!icon) return <input ref={ref} className={cx(inputCls(size), 'w-full', className)} {...rest} />
  return (
    <span className={cx('relative inline-flex min-w-0', className)}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted [&>svg]:size-4">{icon}</span>
      <input ref={ref} className={cx(inputCls(size), 'w-full pl-8')} {...rest} />
    </span>
  )
})

/** Label + control stacked with a 6px gap. */
export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <label className={cx('flex flex-col gap-1.5 min-w-0', className)}>
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  )
}

/** Native checkbox with the site's accent and a 13px label. */
export function Checkbox({ label, checked, onChange, className }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <label className={cx('inline-flex items-center gap-2 text-[13px] text-ink-2 cursor-pointer select-none', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--ink)] cursor-pointer" />
      {label}
    </label>
  )
}
