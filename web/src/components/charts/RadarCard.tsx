import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ChartFrame, ChartLegend, ChartTooltip, resolveSeries, useChartAnimation, type ChartFrameProps, type SeriesConfig } from './common'

export interface RadarDatum {
  axis: string
  [key: string]: string | number
}

export interface RadarCardProps extends Omit<ChartFrameProps, 'children' | 'legend'> {
  data: RadarDatum[]
  /** Up to 2 series. */
  series: SeriesConfig[]
  max?: number
  formatValue?: (v: number) => string
}

export function RadarCard({ data, series, max = 100, formatValue, height = 280, ...frame }: RadarCardProps) {
  const resolved = resolveSeries(series.slice(0, 2))
  const anim = useChartAnimation()
  const fmt = formatValue ?? ((v: number) => String(v))
  return (
    <ChartFrame height={height} legend={<ChartLegend series={resolved} />} {...frame}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke="var(--grid)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: 'var(--ink-2)', fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, max]} tick={false} axisLine={false} />
          <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload} label={label} formatValue={(v) => fmt(v)} />} />
          {resolved.map((s) => (
            <Radar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              fill={s.color}
              fillOpacity={0.15}
              dot={false}
              {...anim}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
