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

/** Segmented control. One shared style for every "pick one of a few" control on the site. */
export function Tabs<T extends string>({ items, value, onChange, size = 'md', className, ...rest }: TabsProps<T>) {
  const layoutId = useId()
  const reduced = usePrefersReducedMotion()
  return (
    <div role="tablist" aria-label={rest['aria-label']} className={cx('inline-flex items-center gap-0.5 p-0.5 rounded-[var(--radius-sm)] bg-surface-2 max-w-full overflow-x-auto', className)}>
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
              'relative rounded-[6px] whitespace-nowrap font-medium transition-colors cursor-pointer motion-reduce:transition-none',
              size === 'sm' ? 'h-9 px-3 text-[12px] md:h-7 md:px-2.5' : 'h-10 px-3.5 text-[13px] md:h-8 md:px-3',
              active ? 'text-ink' : 'text-ink-2 hover:text-ink',
            )}
          >
            {active && (
              <motion.span layoutId={layoutId} className="absolute inset-0 rounded-[6px] bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)]"
                transition={reduced ? { duration: 0 } : { type: 'spring', visualDuration: 0.25, bounce: 0.05 }} />
            )}
            <span className="relative">
              {item.label}
              {item.count !== undefined && <span className="ml-1.5 text-muted tnum font-normal">{item.count}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
