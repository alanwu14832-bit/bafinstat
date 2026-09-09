import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx } from '../../lib/format'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Shown inside the control, before the value (e.g. 杯賽). */
  label?: string
  options: SelectOption[]
  size?: 'sm' | 'md'
}

/** Compact select with the label inside the border, so a row of filters reads as one toolbar. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, options, size = 'md', className, id, ...rest }, ref) {
  const selectId = id ?? (label ? `sel-${label}` : undefined)
  return (
    <label
      htmlFor={selectId}
      className={cx(
        'relative inline-flex items-center bg-surface border border-border rounded-[var(--radius-sm)] text-ink min-w-0 cursor-pointer',
        'hover:border-[color-mix(in_srgb,var(--ink)_22%,transparent)] focus-within:border-[color-mix(in_srgb,var(--ink)_40%,transparent)] transition-colors motion-reduce:transition-none',
        size === 'sm' ? 'h-8 text-[13px]' : 'h-9 text-sm',
        className,
      )}
    >
      {label && <span className="pl-2.5 text-muted whitespace-nowrap">{label}</span>}
      <select
        ref={ref}
        id={selectId}
        className={cx('appearance-none bg-transparent h-full pr-7 font-medium text-ink cursor-pointer focus:outline-none min-w-0 flex-1 w-full', label ? 'pl-1.5' : 'pl-2.5')}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
    </label>
  )
})
