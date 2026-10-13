import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../../lib/format'

/** Ballpark scoreboard surface: always dark, light figures, whatever the site theme. */
export const BOARD = {
  bg: '#141517', ink: '#f3efe7', muted: 'rgba(243,239,231,0.55)', line: 'rgba(243,239,231,0.14)', on: '#f3efe7', off: 'rgba(243,239,231,0.16)',
  ball: '#4cc47a', strike: '#e5a53a', out: '#e0554a',
}

/** The classic B / S / O lights: three balls, two strikes, two outs. `order="SBO"` (即時比分) puts strikes first, the CPBL board's order. */
export function CountLights({ balls, strikes, outs, size = 'md', onBoard, className, order = 'BSO' }: { balls: number; strikes: number; outs: number; size?: 'sm' | 'md' | 'lg'; onBoard?: boolean; className?: string; order?: 'BSO' | 'SBO' }) {
  const dot = size === 'lg' ? 'size-3.5' : size === 'sm' ? 'size-2' : 'size-2.5'
  const text = size === 'lg' ? 'text-[13px]' : 'text-[11px]'
  const off = onBoard ? BOARD.off : 'var(--surface-3)'
  const row = (label: string, n: number, max: number, color: string) => (
    <div key={label} className="flex items-center gap-1.5" aria-label={`${label} ${n}`}>
      <span className={cx('w-3 font-semibold tabular-nums', text)} style={{ color: onBoard ? BOARD.muted : 'var(--muted)' }}>{label}</span>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={cx('rounded-full transition-colors duration-[var(--dur-fast)]', dot)} style={{ background: i < n ? color : off, boxShadow: i < n ? `0 0 6px ${color}66` : undefined }} />
      ))}
    </div>
  )
  const b = row('B', Math.min(balls, 3), 3, BOARD.ball), st = row('S', Math.min(strikes, 2), 2, BOARD.strike)
  return (
    <div className={cx('inline-flex flex-col gap-1', className)} role="group" aria-label="球數">
      {order === 'SBO' ? [st, b] : [b, st]}
      {row('O', Math.min(outs, 2), 2, BOARD.out)}
    </div>
  )
}

/** `line`: runs per inning (null = not reached yet, 'X' = a home half not needed); `mark` replaces the name in a `compact` board. */
export interface BoardTeam { name: string; line: Array<number | null | 'X'>; r: number; h: number; e?: number; us?: boolean; mark?: ReactNode }

/** The focal board sits in a thin tray (outer shell, inner core) with a faint top sheen, so it reads as a real panel. */
export function BoardTray({ children, className, innerClassName }: { children: ReactNode; className?: string; innerClassName?: string }) {
  return (
    <div className={cx('rounded-[calc(var(--radius-sm)+5px)] p-[5px] bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--ink)_6%,transparent)]', className)}>
      <div className={cx('rounded-[var(--radius-sm)] overflow-hidden', innerClassName)} style={{ background: `linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 42%), ${BOARD.bg}`, color: BOARD.ink, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.22), 0 12px 26px -12px rgba(0,0,0,0.45)' }}>
        {children}
      </div>
    </div>
  )
}

/**
 * Line score as a scoreboard panel: innings across, R H E on the right. `current` lights the inning in play.
 * `bare` drops the tray when the board already sits inside a larger one. `compact` (即時比分 on a phone): the team mark
 * instead of the name, narrow inning cells, and the mark and R H E pinned to the edges so only the innings scroll.
 */
export function LineScoreBoard({ top, bottom, innings, current, showErrors = true, footer, bare, className, compact }: { top: BoardTeam; bottom: BoardTeam; innings: number; current?: { inning: number; half: 'top' | 'bottom' }; showErrors?: boolean; footer?: ReactNode; bare?: boolean; className?: string; compact?: boolean }) {
  const n = Math.max(innings, top.line.length, bottom.line.length, 1)
  const cell = compact ? 'px-1 py-1.5 text-center min-w-6 tabular-nums' : 'px-2 py-1.5 text-center min-w-8 tabular-nums'
  // compact: R H E stay on screen (28px each, pinned from the right edge), the mark column from the left
  const pin = (k: 0 | 1 | 2): { className: string; style: CSSProperties } => (compact ? { className: 'sticky w-7 min-w-7', style: { right: (showErrors ? 2 - k : 1 - k) * 28, background: BOARD.bg } } : { className: '', style: {} })
  const rhe = (k: 0 | 1 | 2, extra: string, style: CSSProperties = {}) => { const p = pin(k); return { className: cx(cell, extra, p.className), style: { ...style, ...p.style } } }
  const lead = compact ? 'sticky left-0 z-[1] pl-3 pr-1.5' : 'pl-4 pr-3 max-w-[160px] truncate'
  const row = (t: BoardTeam, half: 'top' | 'bottom') => (
    <tr style={{ color: t.us ? BOARD.ink : BOARD.muted, borderTop: `1px solid ${BOARD.line}` }}>
      <th scope="row" className={cx('text-left py-1.5 font-semibold whitespace-nowrap', lead)} style={{ color: BOARD.ink, ...(compact ? { background: BOARD.bg } : {}) }}>
        <span className="inline-flex items-center gap-2">
          {current && current.half === half && <span className="size-1.5 rounded-full" style={{ background: BOARD.strike, boxShadow: `0 0 6px ${BOARD.strike}` }} aria-label="進攻中" />}
          {compact && t.mark ? <>{t.mark}<span className="sr-only">{t.name}</span></> : t.name}
        </span>
      </th>
      {Array.from({ length: n }, (_, i) => {
        const live = current && current.inning === i + 1 && current.half === half
        const v = t.line[i]
        return <td key={i} className={cx(cell, 'figure font-semibold text-[14px]')} style={{ color: live ? BOARD.strike : v === null || v === undefined ? BOARD.muted : undefined }}>{v === null || v === undefined ? (i + 1 < (current?.inning ?? 0) || (!current && i < t.line.length) ? 0 : '') : v}</td>
      })}
      <td {...rhe(0, 'figure font-semibold text-[15px]', { color: BOARD.ink, borderLeft: `1px solid ${BOARD.line}` })}>{t.r}</td>
      <td {...rhe(1, 'figure font-semibold text-[14px]')}>{t.h}</td>
      {showErrors && <td {...rhe(2, cx('figure font-semibold text-[14px]', !compact && 'pr-4'))}>{t.e ?? 0}</td>}
    </tr>
  )
  const table = (
    <>
      <div className="overflow-x-auto scroll-x">
        <table className="border-collapse min-w-full text-[13px]">
          <thead>
            <tr className="text-[11px] font-medium" style={{ color: BOARD.muted }}>
              <th className={cx('py-2 text-left font-medium tracking-[0.08em]', compact ? lead : 'pl-4 pr-3')} style={compact ? { background: BOARD.bg } : undefined}>{compact ? <span className="sr-only">隊伍</span> : 'SCORE'}</th>
              {Array.from({ length: n }, (_, i) => <th key={i} className={cx(cell, 'py-2 font-medium')} style={{ color: current?.inning === i + 1 ? BOARD.strike : undefined }}>{i + 1}</th>)}
              <th {...rhe(0, 'py-2 font-semibold', { color: BOARD.ink, borderLeft: `1px solid ${BOARD.line}` })}>R</th>
              <th {...rhe(1, 'py-2 font-medium')}>H</th>
              {showErrors && <th {...rhe(2, cx('py-2 font-medium', !compact && 'pr-4'))}>E</th>}
            </tr>
          </thead>
          <tbody>{row(top, 'top')}{row(bottom, 'bottom')}</tbody>
        </table>
      </div>
      {footer}
    </>
  )
  if (bare) return <div className={className} style={{ color: BOARD.ink, borderColor: BOARD.line }}>{table}</div>
  return <BoardTray className={className}>{table}</BoardTray>
}

/** Home-plate shaped number badge for batting slots and jersey numbers. */
export function PlateBadge({ children, active = true, size = 28, className }: { children: ReactNode; active?: boolean; size?: number; className?: string }) {
  return (
    <span aria-hidden className={cx('inline-grid place-items-center shrink-0 font-semibold tnum leading-none', active ? 'bg-ink text-bg' : 'bg-surface-3 text-ink-2', className)}
      style={{ width: size, height: size * 1.08, fontSize: Math.round(size * 0.44), clipPath: 'polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)', paddingBottom: size * 0.2 }}>
      {children}
    </span>
  )
}

/** A short run of baseball seam stitching (V-shaped threads across a faint seam), the accent on page-title rules. */
export function Stitches({ width = 56, className }: { width?: number; className?: string }) {
  const h = 9
  const n = Math.max(3, Math.round(width / 9))
  const step = (width - 8) / (n - 1)
  return (
    <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} aria-hidden className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={`M1 ${h / 2}H${width - 1}`} stroke="currentColor" strokeWidth="1" opacity="0.28" />
      {Array.from({ length: n }, (_, i) => { const x = 4 + i * step; return <path key={i} d={`M${x - 2.4} 1.2 L${x} ${h - 1.4} L${x + 2.4} 1.2`} stroke="var(--accent)" strokeWidth="1.3" /> })}
    </svg>
  )
}
