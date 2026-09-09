import { FlaskConical, X } from 'lucide-react'
import { useDataStore } from '../../store/data'

/** Shown whenever synthetic demo games are mixed into the view. Quiet by design: it is a note, not an alarm. */
export function DemoBanner() {
  const demo = useDataStore((s) => s.demo)
  const setDemo = useDataStore((s) => s.setDemo)
  const base = useDataStore((s) => s.base)
  if (!demo) return null
  return (
    <div role="status" className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
      <FlaskConical className="size-4 shrink-0 text-muted" />
      <span className="min-w-0">
        目前混入程式產生的示範比賽（比賽頁以「示範」標示）。實際資料 {base.games.length} 場；匯入總表後建議關閉。
      </span>
      <button type="button" onClick={() => setDemo(false)} className="ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-[6px] text-ink-2 hover:bg-surface-3 hover:text-ink cursor-pointer whitespace-nowrap text-xs font-medium">
        <X className="size-3.5" /> 關閉示範
      </button>
    </div>
  )
}
