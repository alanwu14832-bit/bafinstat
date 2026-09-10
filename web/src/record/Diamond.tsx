import type { Runner } from './model'

/** Three bases + home plate; occupied bases are filled. */
export function Diamond({ runners, size = 84, onBoard }: { runners: Runner[]; size?: number; onBoard?: boolean }) {
  const on = (b: number) => runners.some((r) => r.base === b)
  const filled = onBoard ? '#e5a53a' : 'var(--ink)'
  const empty = onBoard ? 'rgba(243,239,231,0.14)' : 'var(--surface-3)'
  const stroke = onBoard ? 'rgba(243,239,231,0.4)' : 'var(--border-strong)'
  const sq = (cx: number, cy: number, b: number) => <rect key={b} x={cx - 9} y={cy - 9} width={18} height={18} transform={`rotate(45 ${cx} ${cy})`} fill={on(b) ? filled : empty} stroke={stroke} strokeWidth={1} style={on(b) && onBoard ? { filter: 'drop-shadow(0 0 4px rgba(229,165,58,0.6))' } : undefined} />
  return <svg viewBox="0 0 100 80" style={{ width: size, height: size * 0.81 }} className="shrink-0" aria-hidden>{sq(78, 46, 1)}{sq(50, 18, 2)}{sq(22, 46, 3)}<path d="M44 64h12v6l-6 6-6-6z" fill={empty} stroke={stroke} /></svg>
}
