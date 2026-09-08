import { Sparkles, X } from 'lucide-react'
import { useDataStore } from '../../store/data'

/** Shown whenever synthetic demo games are mixed into the view. */
export function DemoBanner() {
  const demo = useDataStore((s) => s.demo)
  const setDemo = useDataStore((s) => s.setDemo)
  const base = useDataStore((s) => s.base)
  if (!demo) return null
  return (
    <div role="status" className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-accent-soft px-3 py-2 text-xs text-ink">
      <Sparkles className="size-4 shrink-0 text-accent" />
      <span className="min-w-0">
        目前混入 <strong>程式產生的示範比賽</strong>（比賽頁以「示範」標籤標示），只為展示儀表板功能；實際資料只有 {base.games.length} 場。匯入你的總表後建議關閉。
      </span>
      <button type="button" onClick={() => setDemo(false)} className="ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-[var(--radius-sm)] hover:bg-surface cursor-pointer text-ink-2 whitespace-nowrap">
        <X className="size-3.5" /> 關閉示範
      </button>
    </div>
  )
}
