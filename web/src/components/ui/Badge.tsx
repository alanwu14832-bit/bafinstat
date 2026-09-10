import type { ReactNode } from 'react'
import { cx } from '../../lib/format'

export type BadgeVariant = 'neutral' | 'accent' | 'good' | 'warning' | 'critical' | 'outline'

export interface BadgeProps {
  variant?: BadgeVariant
  icon?: ReactNode
  children: ReactNode
  className?: string
}

const styles: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  outline: 'bg-transparent text-ink-2 border border-border',
  accent: 'bg-accent-soft text-[color-mix(in_srgb,var(--accent)_70%,var(--ink))]',
  good: 'bg-[color-mix(in_srgb,var(--good)_12%,transparent)] text-[color-mix(in_srgb,var(--good)_70%,var(--ink))]',
  warning: 'bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-[color-mix(in_srgb,var(--warning)_45%,var(--ink))]',
  critical: 'bg-[color-mix(in_srgb,var(--critical)_12%,transparent)] text-[color-mix(in_srgb,var(--critical)_75%,var(--ink))]',
}

/** Small status label. Never the only carrier of meaning: the text says what the tint means. */
export function Badge({ variant = 'neutral', icon, children, className }: BadgeProps) {
  return (
    <span className={cx('inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-medium leading-none whitespace-nowrap', styles[variant], className)}>
      {icon && <span className="[&>svg]:size-3 inline-flex">{icon}</span>}
      {children}
    </span>
  )
}

export const Pill = Badge
