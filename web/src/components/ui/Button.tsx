import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../../lib/format'

export type ButtonVariant = 'primary' | 'outline' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  /** Render as a router link. */
  to?: string
  /** Render as a plain anchor (download links). */
  href?: string
  download?: boolean | string
}

const variantCls: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-bg border border-transparent hover:bg-[color-mix(in_srgb,var(--ink)_88%,var(--bg))] active:bg-[color-mix(in_srgb,var(--ink)_80%,var(--bg))]',
  outline: 'bg-surface text-ink border border-border hover:bg-surface-2 active:bg-surface-3',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-surface-2 hover:text-ink active:bg-surface-3',
}
const sizeCls: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 [&>svg]:size-3.5',
  md: 'h-9 px-3 text-sm gap-2 [&>svg]:size-4',
  lg: 'h-10 px-4 text-sm gap-2 [&>svg]:size-4',
}
const base =
  'inline-flex items-center justify-center rounded-[var(--radius-sm)] font-medium whitespace-nowrap select-none ' +
  'transition-colors duration-150 motion-reduce:transition-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer [&>svg]:shrink-0'

/** The one button. Primary is the ink-colored action; the brand accent is reserved for highlights. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', icon, to, href, download, className, children, type = 'button', ...rest },
  ref,
) {
  const cls = cx(base, variantCls[variant], sizeCls[size], !children && 'px-0 aspect-square', className)
  if (to) return <Link to={to} className={cls} aria-label={rest['aria-label']} title={rest.title}>{icon}{children}</Link>
  if (href) return <a href={href} download={download} className={cls} aria-label={rest['aria-label']} title={rest.title}>{icon}{children}</a>
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {icon}
      {children}
    </button>
  )
})
