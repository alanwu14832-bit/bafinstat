import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { axisCommon, ChartFrame, ChartLegend, ChartTooltip, resolveSeries, useChartAnimation, type ChartFrameProps, type SeriesConfig } from './common'

export interface StackedDatum {
  name: string
  [key: string]: string | number
}

export interface StackedBarCardProps extends Omit<ChartFrameProps, 'children' | 'legend'> {
  data: StackedDatum[]
  /** Up to 6 series. */
  series: SeriesConfig[]
  layout?: 'vertical' | 'horizontal'
  formatValue?: (v: number) => string
  /** Normalize each bar to 100%. */
  percent?: boolean
}

const pctTick = (v: number) => `${Math.round(v * 100)}%`

export function StackedBarCard({ data, series, layout = 'vertical', formatValue, percent, height, ...frame }: StackedBarCardProps) {
  const resolved = resolveSeries(series.slice(0, 6))
  const anim = useChartAnimation()
  const horizontal = layout === 'horizontal'
  const fmt = formatValue ?? ((v: number) => (percent ? `${v.toFixed(0)}%` : String(v)))
  const h = height ?? (horizontal ? Math.max(180, data.length * 32 + 24) : 260)

  return (
    <ChartFrame height={h} legend={<ChartLegend series={resolved} />} {...frame}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={horizontal ? 'vertical' : 'horizontal'}
          stackOffset={percent ? 'expand' : 'none'}
          margin={{ top: 6, right: 8, bottom: 0, left: horizontal ? 0 : -12 }}
          barCategoryGap="28%"
        >
          <CartesianGrid stroke="var(--grid)" strokeDasharray="0" vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" {...axisCommon} tickCount={5} tickFormatter={percent ? pctTick : undefined} />
              <YAxis type="category" dataKey="name" {...axisCommon} width={56} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" {...axisCommon} axisLine={{ stroke: 'var(--axis)' }} interval="preserveStartEnd" minTickGap={6} />
              <YAxis {...axisCommon} tickCount={5} tickFormatter={percent ? pctTick : undefined} />
            </>
          )}
          <Tooltip
            cursor={{ fill: 'var(--surface-2)', opacity: 0.6 }}
            content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload} label={label} formatValue={(v) => fmt(v)} />}
          />
          {resolved.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="stack"
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth={2}
              maxBarSize={28}
              radius={i === resolved.length - 1 ? (horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]) : 0}
              {...anim}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
