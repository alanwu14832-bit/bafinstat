import { useId } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { axisCommon, ChartFrame, ChartTooltip, resolveSeries, useChartAnimation, useChartTheme, type ChartFrameProps, type SeriesConfig } from './common'

export interface AreaDatum {
  name: string
  [key: string]: string | number
}

export interface AreaChartCardProps extends Omit<ChartFrameProps, 'children' | 'legend'> {
  data: AreaDatum[]
  /** Single series. */
  series: SeriesConfig
  formatValue?: (v: number) => string
  /** Draw a zero baseline (useful for +/- run differential). */
  zeroLine?: boolean
}

export function AreaChartCard({ data, series, formatValue, zeroLine, height = 260, ...frame }: AreaChartCardProps) {
  const [s] = resolveSeries([series])
  const anim = useChartAnimation()
  const theme = useChartTheme()
  const gradId = useId()
  const fmt = formatValue ?? ((v: number) => String(v))
  // Gradients need a concrete color; map var(--series-N) to the resolved hex.
  const match = /var\(--series-(\d)\)/.exec(s.color)
  const hex = match ? theme.series[Number(match[1]) - 1] : s.color

  return (
    <ChartFrame height={height} {...frame}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={hex} stopOpacity={0.16} />
              <stop offset="100%" stopColor={hex} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="name" {...axisCommon} axisLine={{ stroke: 'var(--axis)' }} minTickGap={16} />
          <YAxis {...axisCommon} width={40} tickFormatter={fmt} tickCount={5} />
          {zeroLine && <ReferenceLine y={0} stroke="var(--axis)" strokeWidth={1} />}
          <Tooltip
            cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
            content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload} label={label} formatValue={(v) => fmt(v)} />}
          />
          <Area
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
            {...anim}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
