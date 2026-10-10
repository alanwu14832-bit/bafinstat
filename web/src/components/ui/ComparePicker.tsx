import { useState } from 'react'
import { Search, Users, X } from 'lucide-react'
import { Button } from './Button'
import { Input } from './Input'
import { Sheet } from './Sheet'
import { PlayerChips } from './PlayerSelect'
import type { Player } from '../../data/types'

export interface ComparePickerProps {
  /** who can be picked, in the site's player order (only those with numbers on this tab) */
  names: string[]
  selected: string[]
  /** the player the page is about (never in the list) */
  main: string
  onChange: (names: string[]) => void
  max?: number
  /** for the search by jersey number */
  roster?: Player[]
}

/** 「比較」: up to 8 teammates next to the main player. A button, the chosen names as chips with ✕, and a sheet to pick. */
export function ComparePicker({ names, selected, main, onChange, max = 8, roster = [] }: ComparePickerProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const number = new Map(roster.map((p) => [p.name, p.number ?? '']))
  const pickable = names.filter((n) => n !== main)
  const shown = q.trim() ? pickable.filter((n) => n.includes(q.trim()) || (number.get(n) ?? '').includes(q.trim())) : pickable
  const full = selected.length >= max
  const toggle = (n: string) => onChange(selected.includes(n) ? selected.filter((x) => x !== n) : full ? selected : [...selected, n])
  return (
    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
      <Button size="sm" variant="outline" icon={<Users />} onClick={() => setOpen(true)} aria-haspopup="dialog">{selected.length ? `比較・${selected.length} 人` : '比較'}</Button>
      {selected.map((n) => (
        <span key={n} className="inline-flex items-center h-9 pointer-fine:h-8 pl-3 pr-0 rounded-full bg-surface-2 text-[13px] text-ink">
          {n}
          <button type="button" aria-label={`移除 ${n}`} onClick={() => onChange(selected.filter((x) => x !== n))}
            className="ml-0.5 grid place-items-center size-9 pointer-fine:size-7 pointer-fine:mr-1 rounded-full text-muted hover:text-ink hover:bg-surface-3 cursor-pointer"><X className="size-3.5" /></button>
        </span>
      ))}
      {selected.length > 0 && <Button size="sm" variant="ghost" onClick={() => onChange([])}>清除比較</Button>}
      <Sheet open={open} onClose={() => setOpen(false)} ariaLabel="選擇比較的球員" side="bottom" desktopFrom="sm" panelClassName="sm:max-w-lg max-h-[88vh]">
        <div className="p-5 flex flex-col gap-3">
          <div>
            <div className="text-[16px] font-semibold text-ink">選擇比較的球員</div>
            <p className="text-[13px] text-ink-2 mt-1">最多再選 {max} 位（連同 {main} 共 {max + 1} 位）；用目前的篩選範圍比較</p>
          </div>
          <Input icon={<Search />} size="sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋姓名或背號" aria-label="搜尋比較的球員" />
          {full && <p className="text-[12px] text-warning">已選 {max} 位</p>}
          <div className="max-h-[46vh] overflow-y-auto">
            <PlayerChips names={shown} selected={selected} onToggle={toggle} disabled={full ? new Set(shown) : undefined} empty={q ? '沒有符合的球員' : '這個分頁沒有其他有數據的球員'} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => onChange([])} disabled={!selected.length}>清除</Button>
            <Button size="sm" variant="primary" onClick={() => setOpen(false)}>完成</Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
