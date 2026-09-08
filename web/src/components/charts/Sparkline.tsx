import { Area, AreaChart, Line, LineChart, ResponsiveContainer } from 'recharts'
import { useId } from 'react'
import { useChartAnimation } from './common'

export interface SparklineProps {
  data: number[]
  color?: string
  height?: number
  /** 'line' (default) or 'area' with a soft fill. */
  variant?: 'line' | 'area'
  className?: string
}

/** Tiny axis-less trend line (12–24 points). */
export function Sparkline({ data, color = 'var(--series-1)', height = 32, variant = 'line', className }: SparklineProps) {
  const anim = useChartAnimation()
  const gradId = useId()
  const points = data.map((v, i) => ({ i, v }))
  const margin = { top: 3, right: 3, bottom: 3, left: 3 }
  return (
    <div style={{ height, width: '100%' }} className={className} aria-hidden>
      <ResponsiveContainer width="100%" height={height}>
        {variant === 'area' ? (
          <AreaChart data={points} margin={margin}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={false}
              {...anim}
            />
          </AreaChart>
        ) : (
          <LineChart data={points} margin={margin}>
            <Line
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.5}
              strokeLinecap="round"
              dot={false}
              activeDot={false}
              {...anim}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
