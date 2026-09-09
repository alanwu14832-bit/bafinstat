import { motion } from 'framer-motion'
import { Card, type CardProps } from '../ui/Card'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import { POSITION_LABEL } from '../../lib/fmt'
import { cx } from '../../lib/format'

/** Zone centres on a 200×190 field viewBox (home plate at 100,178). */
const ZONES: Record<number, { x: number; y: number; pos: string }> = {
  1: { x: 100, y: 128, pos: 'P' }, 2: { x: 100, y: 168, pos: 'C' }, 3: { x: 140, y: 118, pos: '1B' }, 4: { x: 124, y: 88, pos: '2B' },
  5: { x: 60, y: 118, pos: '3B' }, 6: { x: 76, y: 88, pos: 'SS' }, 7: { x: 42, y: 52, pos: 'LF' }, 8: { x: 100, y: 34, pos: 'CF' }, 9: { x: 158, y: 52, pos: 'RF' },
}
const SEQ = ['--seq-100', '--seq-200', '--seq-300', '--seq-400', '--seq-500', '--seq-600', '--seq-700']

export interface SprayChartProps extends Omit<CardProps, 'children'> {
  /** counts[1..9]; index 0 unused */
  counts: number[]
  /** optional secondary counts (e.g. hits) shown as "hits/all" */
  secondary?: number[]
  unit?: string
  emptyText?: string
}

/** Field diagram with the nine positions as a sequential heat scale. */
export function SprayChart({ counts, secondary, unit = '球', emptyText = '尚無場內球資料', ...card }: SprayChartProps) {
  const reduced = usePrefersReducedMotion()
  const max = Math.max(0, ...counts.slice(1))
  const total = counts.slice(1).reduce((a, b) => a + b, 0)
  const step = (n: number) => {
    if (n === 0 || max === 0) return 'var(--surface-2)'
    const idx = Math.min(SEQ.length - 1, Math.floor((n / max) * (SEQ.length - 1)))
    return `var(${SEQ[idx]})`
  }
  const inkFor = (n: number) => (max > 0 && n / max > 0.55 ? '#ffffff' : 'var(--ink)')
  return (
    <Card {...card} className={cx('h-full', card.className)}>
      <motion.div initial={reduced ? false : { opacity: 0.01 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="min-w-0">
        <svg viewBox="0 0 200 190" role="img" aria-label="落點分佈" className="w-full max-w-[380px] mx-auto block">
          {/* outfield arc + foul lines */}
          <path d="M100 178 L8 86 A130 130 0 0 1 192 86 Z" fill="var(--surface-2)" stroke="var(--axis)" strokeWidth="1" />
          <path d="M100 178 L58 136 L100 94 L142 136 Z" fill="var(--surface-3)" stroke="var(--axis)" strokeWidth="1" />
          <circle cx="100" cy="136" r="5" fill="none" stroke="var(--axis)" strokeWidth="1" />
          {Object.entries(ZONES).map(([k, z]) => {
            const n = counts[Number(k)] ?? 0
            const r = 12
            return (
              <g key={k}>
                <title>{`${k} ${POSITION_LABEL[z.pos]}：${n} ${unit}${secondary ? `（安打 ${secondary[Number(k)] ?? 0}）` : ''}`}</title>
                <motion.circle
                  cx={z.x} cy={z.y} r={r} fill={step(n)} stroke="var(--surface)" strokeWidth="2"
                  initial={reduced ? false : { scale: 0.6, opacity: 0.01 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.05 * Number(k), duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformOrigin: `${z.x}px ${z.y}px` }}
                />
                <text x={z.x} y={z.y + 3.5} textAnchor="middle" fontSize="9" fontWeight={600} fill={inkFor(n)} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {secondary ? `${secondary[Number(k)] ?? 0}/${n}` : n}
                </text>
                <text x={z.x} y={z.y + r + 8} textAnchor="middle" fontSize="6.5" fill="var(--muted)">{z.pos}</text>
              </g>
            )
          })}
        </svg>
        <div className="flex items-center justify-between text-[12px] text-muted mt-3">
          <span>{total === 0 ? emptyText : `${total} ${unit}${secondary ? '，顯示 安打/場內球' : ''}`}</span>
          <span className="flex items-center gap-1" aria-hidden>
            少 {SEQ.map((s) => <span key={s} className="inline-block size-2.5 rounded-[2px]" style={{ background: `var(${s})` }} />)} 多
          </span>
        </div>
      </motion.div>
    </Card>
  )
}
