import { ArrowDownUp } from 'lucide-react'
import { Tabs } from './Tabs'
import { useUiStore } from '../../store/ui'
import { ROSTER_SORT_LABEL, type RosterSort } from '../../data/rosterSort'
import { cx } from '../../lib/format'

/** The current 球員排序 (one choice for every player list on the site). */
export const useRosterSort = () => useUiStore((s) => s.rosterSort)

/** 排序 背號／姓氏: switches every player list on the site at once (and is remembered on this device). */
export function RosterSortToggle({ className }: { className?: string }) {
  const mode = useUiStore((s) => s.rosterSort)
  const set = useUiStore((s) => s.setRosterSort)
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[12px] text-muted shrink-0', className)} title="姓氏依筆畫排序；換了之後全站的球員名單都會跟著換">
      <ArrowDownUp aria-hidden className="size-3.5" />
      <span>排序</span>
      <Tabs size="sm" aria-label="球員排序" value={mode} onChange={set} items={(['number', 'surname'] as RosterSort[]).map((v) => ({ value: v, label: ROSTER_SORT_LABEL[v] }))} />
    </span>
  )
}
