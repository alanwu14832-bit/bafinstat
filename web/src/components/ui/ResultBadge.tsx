import { cx } from '../../lib/format'
import { LIVE_TEXT, type SummaryResult } from '../../data/stats'
import { Badge } from './Badge'

/** The small pulsing dot of 即時比分 (still when the viewer asked for less motion). */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cx('relative inline-flex size-2 shrink-0', className)}>
      <span className="absolute inset-0 rounded-full bg-[var(--critical)] opacity-60 animate-ping motion-reduce:animate-none" />
      <span className="relative size-2 rounded-full bg-[var(--critical)]" />
    </span>
  )
}

/** 「比賽進行中」: a game still being recorded, where its 勝／敗 would be. */
export function LiveBadge({ className }: { className?: string }) {
  return <Badge variant="accent" icon={<LiveDot />} className={className}>{LIVE_TEXT}</Badge>
}

/** Not known yet whether the game is still being recorded (the list of games in progress is on its way): neither
 *  勝／敗 nor 比賽進行中. */
export function PendingBadge({ className }: { className?: string }) {
  return <span role="status" aria-label="正在確認這場是否還在進行"><Badge className={className}>確認中</Badge></span>
}

/** 勝 / 敗 / 和 as a badge, or 比賽進行中 while the game is being recorded. */
export const resultBadge = (r: SummaryResult) => (r === 'live' ? <LiveBadge /> : r === 'W' ? <Badge variant="good">勝</Badge> : r === 'L' ? <Badge variant="critical">敗</Badge> : <Badge>和</Badge>)
