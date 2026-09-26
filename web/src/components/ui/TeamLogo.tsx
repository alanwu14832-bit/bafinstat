import { useState } from 'react'
import { cx } from '../../lib/format'
import { TEAM, teamAsset } from '../../config/team'

/** Team mark (VITE_TEAM_MARK, default public/mark.png) on a white tile; falls back to the monogram if it is missing. */
export function TeamLogo({ size = 32, className }: { size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const src = teamAsset(TEAM.mark)
  if (failed) {
    return (
      <span aria-hidden style={{ width: size, height: size }} className={cx('shrink-0 rounded-[8px] bg-ink text-bg font-semibold inline-flex items-center justify-center', className)}>
        <span style={{ fontSize: size * 0.56 }}>{TEAM.monogram}</span>
      </span>
    )
  }
  return (
    <span style={{ width: size, height: size }} className={cx('shrink-0 rounded-[8px] overflow-hidden bg-white border border-border inline-flex items-center justify-center', className)}>
      <img src={src} alt={TEAM.short} width={size} height={size} className="block object-contain" style={{ width: size * 0.92, height: size * 0.92 }} onError={() => setFailed(true)} draggable={false} />
    </span>
  )
}
