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
  /** A dashed ring at this value (e.g. 50 = the team median) drawn as a guide, not as a series. */
  reference?: number
  /** Extra text after a series' value in the tooltip (e.g. the raw stat and team rank). */
  detail?: (datum: RadarDatum, seriesKey: string) => string | undefined
}

const REF = '__ref'

export function RadarCard({ data, series, max = 100, formatValue, reference, detail, height = 280, ...frame }: RadarCardProps) {
  const resolved = resolveSeries(series.slice(0, 2))
  const anim = useChartAnimation()
  const fmt = formatValue ?? ((v: number) => String(v))
  const rows = reference === undefined ? data : data.map((d) => ({ ...d, [REF]: reference }))
  return (
    <ChartFrame height={height} legend={<ChartLegend series={resolved} />} {...frame}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={rows} outerRadius="76%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke="var(--grid)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: 'var(--ink-2)', fontSize: 11 }} />
          <PolarRadiusAxis domain={[0, max]} tick={false} axisLine={false} />
          <Tooltip content={({ active, payload, label }) => (
            <ChartTooltip active={active} payload={payload?.filter((e) => e.dataKey !== REF)} label={label}
              formatValue={(v, e) => {
                const extra = detail && e?.payload ? detail(e.payload as RadarDatum, String(e.dataKey)) : undefined
                return extra ? `${fmt(v)}・${extra}` : fmt(v)
              }} />
          )} />
          {reference !== undefined && (
            <Radar dataKey={REF} name="參考" stroke="var(--ink-2)" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 3" fill="none" dot={false} isAnimationActive={false} legendType="none" activeDot={false} />
          )}
          {resolved.map((s) => (
            <Radar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              fill={s.color}
              fillOpacity={0.12}
              dot={false}
              {...anim}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
