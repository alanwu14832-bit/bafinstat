import { useState } from 'react'
import { cx } from '../../lib/format'

/** Team mark (character) from public/mark.png on a white tile; falls back to the monogram if missing. Full logo: public/logo.png */
export function TeamLogo({ size = 32, className }: { size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const src = `${import.meta.env.BASE_URL}mark.png`
  if (failed) {
    return (
      <span aria-hidden style={{ width: size, height: size }} className={cx('shrink-0 rounded-[8px] bg-ink text-bg font-semibold inline-flex items-center justify-center', className)}>
        <span style={{ fontSize: size * 0.56 }}>B</span>
      </span>
    )
  }
  return (
    <span style={{ width: size, height: size }} className={cx('shrink-0 rounded-[8px] overflow-hidden bg-white border border-border inline-flex items-center justify-center', className)}>
      <img src={src} alt="NTU BaFiN" width={size} height={size} className="block object-contain" style={{ width: size * 0.92, height: size * 0.92 }} onError={() => setFailed(true)} draggable={false} />
    </span>
  )
}
