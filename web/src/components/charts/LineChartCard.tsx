import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DotItemDotProps } from 'recharts/types/util/types'
import { axisCommon, ChartFrame, ChartLegend, ChartTooltip, resolveSeries, useChartAnimation, type ChartFrameProps, type SeriesConfig } from './common'

export interface LineDatum {
  name: string
  [key: string]: string | number
}

export interface LineChartCardProps extends Omit<ChartFrameProps, 'children' | 'legend'> {
  data: LineDatum[]
  series: SeriesConfig[]
  formatValue?: (v: number) => string
  yDomain?: [number | 'auto', number | 'auto']
  /** Optional reference band label for the y-axis width. */
  yWidth?: number
}

/** End-dot (r=4) with a 2px surface ring, drawn only on the last point. */
function endDot(color: string, lastIndex: number) {
  return function EndDot(props: DotItemDotProps) {
    if (props.index !== lastIndex || props.cx === undefined || props.cy === undefined) return null
    return <circle cx={props.cx} cy={props.cy} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
  }
}

export function LineChartCard({ data, series, formatValue, yDomain, yWidth = 40, height = 260, ...frame }: LineChartCardProps) {
  const resolved = resolveSeries(series)
  const anim = useChartAnimation()
  const fmt = formatValue ?? ((v: number) => String(v))
  const last = data.length - 1

  return (
    <ChartFrame height={height} legend={<ChartLegend series={resolved} />} {...frame}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="name" {...axisCommon} axisLine={{ stroke: 'var(--axis)' }} minTickGap={16} />
          <YAxis {...axisCommon} width={yWidth} domain={yDomain} tickFormatter={fmt} tickCount={5} />
          <Tooltip
            cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
            content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload} label={label} formatValue={(v) => fmt(v)} />}
          />
          {resolved.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={endDot(s.color, last)}
              activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
              {...anim}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

export const AnimatedLine = LineChartCard
