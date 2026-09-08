import { motion } from 'framer-motion'
import { useId } from 'react'
import { cx } from '../../lib/format'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'

export interface TabItem<T extends string = string> {
  value: T
  label: string
  count?: number
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
}

/** Segmented control. The active background slides between items. */
export function Tabs<T extends string>({ items, value, onChange, size = 'md', className, ...rest }: TabsProps<T>) {
  const layoutId = useId()
  const reduced = usePrefersReducedMotion()
  return (
    <div
      role="tablist"
      aria-label={rest['aria-label']}
      className={cx('inline-flex items-center gap-0.5 p-0.5 rounded-[var(--radius-sm)] bg-surface-2 border border-border max-w-full overflow-x-auto', className)}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cx(
              'relative rounded-[6px] whitespace-nowrap transition-colors cursor-pointer motion-reduce:transition-none',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
              active ? 'text-ink font-medium' : 'text-ink-2 hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[6px] bg-surface border border-border"
                transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">
              {item.label}
              {item.count !== undefined && <span className="ml-1.5 text-muted tnum">{item.count}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
