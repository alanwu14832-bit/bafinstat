import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx } from '../../lib/format'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string
  options: SelectOption[]
  size?: 'sm' | 'md'
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, size = 'md', className, id, ...rest },
  ref,
) {
  const selectId = id ?? (label ? `sel-${label}` : undefined)
  return (
    <label className={cx('inline-flex items-center gap-2 min-w-0', className)} htmlFor={selectId}>
      {label && <span className="text-xs text-muted whitespace-nowrap">{label}</span>}
      <span className="relative inline-flex min-w-0">
        <select
          ref={ref}
          id={selectId}
          className={cx(
            'appearance-none bg-surface border border-border rounded-[var(--radius-sm)] text-ink pr-7 pl-2.5',
            'hover:border-[color-mix(in_srgb,var(--ink)_25%,transparent)] transition-colors motion-reduce:transition-none cursor-pointer',
            size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm',
          )}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
      </span>
    </label>
  )
})
