import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import type { TooltipPayloadEntry } from 'recharts'
import { Card, type CardProps } from '../ui/Card'
import { readThemeTokens, seriesColor, useThemeTokens, type ThemeTokens } from '../../theme/tokens'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import { cx } from '../../lib/format'

export interface SeriesConfig {
  key: string
  label: string
  /** Defaults to var(--series-N) in fixed order. */
  color?: string
}

export type ResolvedSeries = Required<SeriesConfig>

/** Assign fixed-order series colors to any series without an explicit color. */
export function resolveSeries(series: SeriesConfig[]): ResolvedSeries[] {
  return series.map((s, i) => ({ ...s, color: s.color ?? seriesColor(i) }))
}

/** Chart colors derived from the current theme tokens (real hex values, for gradients/SVG attrs). */
export interface ChartTheme {
  tokens: ThemeTokens
  series: string[]
  grid: string
  axis: string
  muted: string
  ink: string
  surface: string
  border: string
}

export function chartTheme(tokens: ThemeTokens = readThemeTokens()): ChartTheme {
  return {
    tokens,
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => tokens[`series-${n}` as keyof ThemeTokens]),
    grid: tokens.grid,
    axis: tokens.axis,
    muted: tokens.muted,
    ink: tokens.ink,
    surface: tokens.surface,
    border: tokens.border,
  }
}

export function useChartTheme(): ChartTheme {
  return chartTheme(useThemeTokens())
}

/** Recharts entrance animation props (disabled under reduced motion). */
export function useChartAnimation() {
  const reduced = usePrefersReducedMotion()
  return {
    isAnimationActive: !reduced,
    animationDuration: 900,
    animationEasing: 'ease-out' as const,
    animationBegin: 0,
  }
}

/** Shared axis props: tick text in --muted 12px, no axis line, no tick line. */
export const axisTick = { fontSize: 12, fill: 'var(--muted)' }
export const axisCommon = { tickLine: false, axisLine: false, tick: axisTick }

/** Subset of recharts' TooltipContentProps we render, plus our own formatters. */
export interface ChartTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<TooltipPayloadEntry>
  label?: ReactNode
  formatValue?: (value: number, entry: TooltipPayloadEntry) => string
  formatLabel?: (label: ReactNode) => ReactNode
}

/** Card-styled tooltip using text tokens; the swatch carries series identity. */
export function ChartTooltip({ active, payload, label, formatValue, formatLabel }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-[var(--radius-sm)] bg-surface border border-border shadow-[var(--shadow-hover)] px-3 py-2 text-xs min-w-[120px]">
      {label !== undefined && label !== '' && (
        <div className="text-muted mb-1">{formatLabel ? formatLabel(label) : label}</div>
      )}
      <ul className="flex flex-col gap-1">
        {payload.map((entry, i) => {
          const raw = entry.value
          const num = typeof raw === 'number' ? raw : Number(raw)
          const text = formatValue && Number.isFinite(num) ? formatValue(num, entry) : String(raw ?? '')
          return (
            <li key={`${String(entry.dataKey)}-${i}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-ink-2">
                <span
                  className="inline-block size-2.5 rounded-[2px] shrink-0"
                  style={{ background: entry.color ?? entry.fill ?? 'var(--ink-2)' }}
                />
                {entry.name}
              </span>
              <span className="text-ink font-medium tnum">{text}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export interface ChartLegendProps {
  series: ResolvedSeries[]
  className?: string
  /** Called with the hovered series key (for future dimming). */
  align?: 'left' | 'center' | 'right'
}

/** Custom legend: 10px square swatch + label in --ink-2. Render only when >= 2 series. */
export function ChartLegend({ series, className, align = 'left' }: ChartLegendProps) {
  if (series.length < 2) return null
  return (
    <ul
      className={cx(
        'flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2',
        align === 'center' && 'justify-center',
        align === 'right' && 'justify-end',
        className,
      )}
    >
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-[2px]" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

export interface ChartFrameProps extends Omit<CardProps, 'children'> {
  /** Chart height in px; the container includes the x-axis band so nothing is clipped. */
  height?: number
  legend?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

/**
 * Card wrapper for charts. Rises in on mount via framer-motion and is
 * visible immediately (no intersection observer gating).
 */
export function ChartFrame({ height = 260, legend, footer, children, ...card }: ChartFrameProps) {
  const reduced = usePrefersReducedMotion()
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0.01, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="min-w-0"
    >
      <Card {...card}>
        {legend && <div className="mb-3">{legend}</div>}
        <div style={{ height, width: '100%' }} className="min-w-0">
          {children}
        </div>
        {footer && <div className="mt-3 text-xs text-muted">{footer}</div>}
      </Card>
    </motion.div>
  )
}
