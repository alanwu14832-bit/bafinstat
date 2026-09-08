import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { axisCommon, ChartFrame, ChartLegend, ChartTooltip, resolveSeries, useChartAnimation, type ChartFrameProps, type SeriesConfig } from './common'

export interface BarDatum {
  name: string
  [key: string]: string | number
}

export interface BarChartCardProps extends Omit<ChartFrameProps, 'children' | 'legend'> {
  data: BarDatum[]
  series: SeriesConfig[]
  /** 'vertical' = bars rise from the bottom (default); 'horizontal' = bars extend to the right. */
  layout?: 'vertical' | 'horizontal'
  /** Only this category's bar keeps series-1; the rest are muted. Single-series only. */
  highlightKey?: string
  showLabels?: boolean
  formatValue?: (v: number) => string
  /** Width reserved for category labels in horizontal layout. */
  categoryWidth?: number
}

const MUTED = 'var(--surface-3)'

export function BarChartCard({
  data, series, layout = 'vertical', highlightKey, showLabels, formatValue, categoryWidth = 56, height, ...frame
}: BarChartCardProps) {
  const resolved = resolveSeries(series)
  const anim = useChartAnimation()
  const horizontal = layout === 'horizontal'
  const fmt = formatValue ?? ((v: number) => String(v))
  const h = height ?? (horizontal ? Math.max(180, data.length * 32 + 24) : 260)

  return (
    <ChartFrame height={h} legend={<ChartLegend series={resolved} />} {...frame}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: showLabels && !horizontal ? 18 : 6, right: showLabels && horizontal ? 40 : 8, bottom: 0, left: horizontal ? 0 : -12 }}
          barGap={2}
          barCategoryGap="28%"
        >
          <CartesianGrid stroke="var(--grid)" strokeDasharray="0" vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" {...axisCommon} tickCount={5} />
              <YAxis type="category" dataKey="name" {...axisCommon} width={categoryWidth} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" {...axisCommon} axisLine={{ stroke: 'var(--axis)' }} interval="preserveStartEnd" minTickGap={6} />
              <YAxis {...axisCommon} tickCount={5} />
            </>
          )}
          <Tooltip
            cursor={{ fill: 'var(--surface-2)', opacity: 0.6 }}
            content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload} label={label} formatValue={(v) => fmt(v)} />}
          />
          {resolved.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              maxBarSize={24}
              radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              {...anim}
            >
              {highlightKey !== undefined &&
                data.map((d) => <Cell key={d.name} fill={d.name === highlightKey ? s.color : MUTED} />)}
              {showLabels && (
                <LabelList
                  dataKey={s.key}
                  position={horizontal ? 'right' : 'top'}
                  fill="var(--ink-2)"
                  fontSize={11}
                  formatter={(v: unknown) => (typeof v === 'number' ? fmt(v) : String(v ?? ''))}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

export const AnimatedBar = BarChartCard
