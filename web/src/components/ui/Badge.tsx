import type { ReactNode } from 'react'
import { cx } from '../../lib/format'

export type BadgeVariant = 'neutral' | 'accent' | 'good' | 'warning' | 'critical'

export interface BadgeProps {
  variant?: BadgeVariant
  icon?: ReactNode
  children: ReactNode
  className?: string
}

const styles: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-2 text-ink-2 border-border',
  accent: 'bg-accent-soft text-ink border-transparent',
  good: 'bg-[color-mix(in_srgb,var(--good)_14%,transparent)] text-[color-mix(in_srgb,var(--good)_75%,var(--ink))] border-transparent',
  warning: 'bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] text-[color-mix(in_srgb,var(--warning)_55%,var(--ink))] border-transparent',
  critical: 'bg-[color-mix(in_srgb,var(--critical)_14%,transparent)] text-[color-mix(in_srgb,var(--critical)_80%,var(--ink))] border-transparent',
}

export function Badge({ variant = 'neutral', icon, children, className }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 h-6 px-2 rounded-full border text-xs font-medium whitespace-nowrap',
        styles[variant],
        className,
      )}
    >
      {icon && <span className="[&>svg]:size-3 inline-flex">{icon}</span>}
      {children}
    </span>
  )
}

export const Pill = Badge
