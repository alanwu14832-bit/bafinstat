import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../../lib/format'

export type ButtonVariant = 'primary' | 'ghost' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  /** Render as a router link. */
  to?: string
}

const variantCls: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-95 border border-transparent font-semibold',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink border border-transparent',
  outline: 'bg-transparent text-ink border border-border hover:bg-surface-2',
}
const sizeCls: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 [&>svg]:size-3.5',
  md: 'h-9 px-3.5 text-sm gap-2 [&>svg]:size-4',
  lg: 'h-11 px-5 text-sm gap-2 [&>svg]:size-4',
}
const base =
  'inline-flex items-center justify-center rounded-[var(--radius-sm)] whitespace-nowrap select-none ' +
  'transition-colors duration-150 motion-reduce:transition-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer'

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', icon, to, className, children, type = 'button', ...rest },
  ref,
) {
  const cls = cx(base, variantCls[variant], sizeCls[size], className)
  if (to) {
    return (
      <Link to={to} className={cls}>
        {icon}
        {children}
      </Link>
    )
  }
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {icon}
      {children}
    </button>
  )
})
