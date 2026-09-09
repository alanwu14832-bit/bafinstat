import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { motion } from 'framer-motion'
import { Card, type CardProps } from '../ui/Card'
import { ChartTooltip, resolveSeries, useChartAnimation } from './common'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import { seriesColor } from '../../theme/tokens'
import { cx } from '../../lib/format'

export interface DonutSegment {
  key: string
  label: string
  value: number
  color?: string
}

export interface DonutCardProps extends Omit<CardProps, 'children'> {
  /** Up to 6 segments. */
  segments: DonutSegment[]
  /** Center hero number (defaults to total). */
  centerValue?: string
  centerCaption?: string
  size?: number
  formatValue?: (v: number) => string
}

export function DonutCard({ segments, centerValue, centerCaption, size = 180, formatValue, ...card }: DonutCardProps) {
  const anim = useChartAnimation()
  const reduced = usePrefersReducedMotion()
  const segs = segments.slice(0, 6)
  const resolved = resolveSeries(segs.map((s, i) => ({ key: s.key, label: s.label, color: s.color ?? seriesColor(i) })))
  const total = segs.reduce((a, s) => a + s.value, 0)
  const fmt = formatValue ?? ((v: number) => String(v))
  const data = segs.map((s, i) => ({ name: s.label, value: s.value, color: resolved[i].color }))

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0.01 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cx('min-w-0 h-full', card.className)}
    >
      <Card {...card} className="h-full">
        <div className="flex flex-col sm:flex-row flex-wrap items-center gap-6 min-w-0">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="68%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  {...anim}
                >
                  {data.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload} label={label} formatValue={(v) => fmt(v)} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[26px] font-semibold tracking-[-0.02em] leading-none text-ink tnum">{centerValue ?? fmt(total)}</div>
              {centerCaption && <div className="text-xs text-muted mt-1">{centerCaption}</div>}
            </div>
          </div>
          <ul className="flex flex-col gap-2 w-full sm:w-auto sm:flex-1 sm:min-w-[140px] min-w-0 text-[13px]">
            {data.map((d) => (
              <li key={d.name} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-ink-2">
                  <span className="inline-block size-2.5 rounded-[2px]" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span className="tnum text-ink font-medium">
                  {fmt(d.value)}
                  <span className="text-muted font-normal ml-1.5 text-xs">{total ? `${((d.value / total) * 100).toFixed(0)}%` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </motion.div>
  )
}
