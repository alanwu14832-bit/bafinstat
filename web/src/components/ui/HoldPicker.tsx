/**
 * 中繼 (holds): toggle chips of the relievers, several can be picked. A pitcher already chosen as 勝投 or 救援 is
 * greyed out (one pitcher gets only one of 勝投／中繼／救援). Names in `suggested` carry a small 「建議」 tag; nothing is
 * picked for the recorder. Used by 結束比賽 (紀錄比賽) and 修改資料.
 */
import { cx } from '../../lib/format'

export function HoldPicker({ names, value, onChange, disabled = [], suggested = [], className }: {
  names: string[]
  value: string[]
  onChange: (list: string[]) => void
  /** chosen as 勝投／救援 (blank entries are ignored) */
  disabled?: Array<string | undefined>
  suggested?: string[]
  className?: string
}) {
  const on = new Set(value)
  const off = new Set(disabled.filter(Boolean))
  const hint = new Set(suggested)
  if (!names.length) return <p className={cx('text-[12px] text-muted', className)}>只有先發投手投球，沒有中繼可選</p>
  const toggle = (n: string) => onChange(on.has(n) ? value.filter((x) => x !== n) : [...value, n])
  return (
    <div className={cx('flex flex-wrap gap-1.5', className)} role="group" aria-label="中繼">
      {names.map((n) => {
        const dis = off.has(n)
        return (
          <button key={n} type="button" aria-pressed={on.has(n) && !dis} disabled={dis} title={dis ? '已選為勝投／救援' : undefined} onClick={() => toggle(n)}
            className={cx('min-h-9 min-w-9 px-3 rounded-[var(--radius-sm)] border text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors motion-reduce:transition-none',
              dis ? 'border-border bg-surface-2 text-muted opacity-60 cursor-default' : on.has(n) ? 'border-ink bg-ink text-bg cursor-pointer' : 'border-border bg-surface text-ink hover:bg-surface-2 cursor-pointer')}>
            {n}
            {hint.has(n) && !dis && <span className={cx('text-[10px] font-normal px-1 rounded-[4px]', on.has(n) ? 'bg-bg/20 text-bg' : 'bg-accent-soft text-ink-2')}>建議</span>}
          </button>
        )
      })}
    </div>
  )
}
