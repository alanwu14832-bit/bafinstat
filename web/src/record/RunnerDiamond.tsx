/**
 * The infield with the runners' names on their bases. With `onPick` every runner is a button (紀錄比賽: tap a runner
 * to steal, advance, score…); `batter` shows who is at the plate. Shared by live recording and the plate-appearance
 * editor so both read the same way.
 */
import { cx } from '../lib/format'

export interface DiamondRunner { key: string; base: 1 | 2 | 3; name: string }

const SPOT: Record<1 | 2 | 3, string> = { 1: 'left-[78%] top-[52%]', 2: 'left-1/2 top-[16%]', 3: 'left-[22%] top-[52%]' }

export function RunnerDiamond({ runners, batter, onPick, picked, className }: { runners: DiamondRunner[]; batter?: string; onPick?: (key: string) => void; picked?: string | null; className?: string }) {
  const at = (b: 1 | 2 | 3) => runners.find((r) => r.base === b)
  return (
    <div className={cx('relative w-full max-w-[300px] aspect-[300/210] mx-auto select-none', className)} role="group" aria-label="壘上跑者">
      {/* infield: base paths and bases */}
      <svg viewBox="0 0 300 210" className="absolute inset-0 w-full h-full" aria-hidden>
        <path d="M150 182 L234 110 L150 38 L66 110 Z" fill="color-mix(in srgb, var(--good) 8%, transparent)" stroke="var(--border-strong)" strokeWidth="1.5" />
        {([[234, 110, 1], [150, 38, 2], [66, 110, 3]] as const).map(([x, y, b]) => (
          <rect key={b} x={x - 9} y={y - 9} width="18" height="18" transform={`rotate(45 ${x} ${y})`} fill={at(b) ? 'var(--ink)' : 'var(--surface)'} stroke="var(--border-strong)" strokeWidth="1.5" />
        ))}
        <path d="M143 176h14v7l-7 7-7-7z" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="1.5" />
      </svg>
      {([1, 2, 3] as const).map((b) => {
        const r = at(b)
        if (!r) return null
        const label = <><span className="text-[10px] opacity-70 tnum mr-1">{b}B</span>{r.name}</>
        const cls = cx('absolute -translate-x-1/2 -translate-y-1/2 max-w-[46%] truncate h-9 pointer-fine:h-8 px-2.5 rounded-full border text-[13px] font-medium shadow-[var(--shadow-card)]', SPOT[b],
          picked === r.key ? 'border-ink bg-ink text-bg' : 'border-border bg-surface text-ink', onPick && 'cursor-pointer hover:border-ink')
        return onPick
          ? <button key={b} type="button" aria-pressed={picked === r.key} aria-label={`${b}B ${r.name}`} onClick={() => onPick(r.key)} className={cls}>{label}</button>
          : <span key={b} className={cls}>{label}</span>
      })}
      {batter && <span className="absolute left-1/2 top-[94%] -translate-x-1/2 -translate-y-1/2 max-w-[60%] truncate text-[12px] text-ink-2">打者 <span className="font-medium text-ink">{batter}</span></span>}
      {!runners.length && <span className="absolute left-1/2 top-[64%] -translate-x-1/2 -translate-y-1/2 text-[12px] text-muted">壘上無人</span>}
    </div>
  )
}
