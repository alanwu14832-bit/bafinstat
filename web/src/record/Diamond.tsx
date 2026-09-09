import type { Runner } from './model'

/** Three bases + home plate; occupied bases are filled. */
export function Diamond({ runners, size = 84 }: { runners: Runner[]; size?: number }) {
  const on = (b: number) => runners.some((r) => r.base === b)
  const sq = (cx: number, cy: number, b: number) => <rect key={b} x={cx - 9} y={cy - 9} width={18} height={18} transform={`rotate(45 ${cx} ${cy})`} fill={on(b) ? 'var(--ink)' : 'var(--surface-3)'} stroke="var(--border-strong)" strokeWidth={1} />
  return <svg viewBox="0 0 100 80" style={{ width: size, height: size * 0.81 }} className="shrink-0" aria-hidden>{sq(78, 46, 1)}{sq(50, 18, 2)}{sq(22, 46, 3)}<rect x={44} y={64} width={12} height={12} transform="rotate(45 50 70)" fill="var(--surface-3)" stroke="var(--border-strong)" /></svg>
}
