import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Column } from './DataTable'
import { Tabs } from './Tabs'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import type { WithNumber } from '../../data/rosterSort'

/** The stats tables' 背號 column, right after the pinned name (click it to sort by number; 球員 sorts by surname). */
export function withJerseyColumn<T>(cols: Column<T>[]): Column<WithNumber<T>>[] {
  const number: Column<WithNumber<T>> = { key: 'number' as keyof WithNumber<T> & string, header: '背號', align: 'right', sortable: true, className: 'text-ink-2', format: (v) => (v === null || v === undefined ? '—' : String(v)) }
  const all = cols as unknown as Column<WithNumber<T>>[]
  return [all[0], number, ...all.slice(1)]
}

/**
 * 精簡 view of a stats table for phones: the name (with the jersey number and any tag under it) and the few columns
 * people look up, in that order, so nothing needs a sideways scroll. The sort is the table's own and carries over.
 */
export function compactColumns<T>(cols: Column<WithNumber<T>>[], keys: string[], tag?: (row: WithNumber<T>) => ReactNode): Column<WithNumber<T>>[] {
  const [name] = cols
  const named: Column<WithNumber<T>> = {
    ...name,
    text: (v) => String(v ?? ''),
    format: (v, row) => (
      <span className="flex flex-col leading-tight">
        <span>{name.format ? name.format(v, row) : String(v ?? '')}</span>
        <span className="text-[11px] font-normal text-muted">{row.number === null ? '' : `#${row.number}`}{tag && <> {tag(row)}</>}</span>
      </span>
    ),
  }
  const byKey = new Map(cols.map((c) => [c.key as string, c]))
  return [named, ...keys.map((k) => byKey.get(k)).filter((c): c is Column<WithNumber<T>> => !!c)]
}

const KEY = 'bafin.tableView'
const read = () => { try { return localStorage.getItem(KEY) === 'full' ? 'full' : 'compact' } catch { return 'compact' } }

/** Phones open the stats tables in 精簡 (remembered on the device); wider screens always show the full table. */
export function useTableView(): { compact: boolean; toggle: ReactNode } {
  const phone = useMediaQuery('(max-width: 767px)')
  const [view, setView] = useState<'compact' | 'full'>(read)
  const set = (v: 'compact' | 'full') => { setView(v); try { localStorage.setItem(KEY, v) } catch { /* storage unavailable */ } }
  return {
    compact: phone && view === 'compact',
    toggle: phone ? <Tabs size="sm" aria-label="表格欄位" value={view} onChange={set} items={[{ value: 'compact', label: '精簡' }, { value: 'full', label: '完整' }]} /> : null,
  }
}

/** A tag after the name in the full table (e.g. 未達門檻), the same one the 精簡 view puts under it. */
export function tagNameColumn<T>(cols: Column<WithNumber<T>>[], tag: (row: WithNumber<T>) => ReactNode): Column<WithNumber<T>>[] {
  const [name, ...rest] = cols
  return [{ ...name, text: (v) => String(v ?? ''), format: (v, row) => { const t = tag(row); return <span className="inline-flex items-center gap-1.5">{name.format ? name.format(v, row) : String(v ?? '')}{t}</span> } }, ...rest]
}

/** A rate with what it is made of (".333  2/6"), so a small sample reads as one. */
export function withFraction(text: string, num: number, den: number): ReactNode {
  return <span className="inline-flex items-baseline gap-1.5 justify-end">{text}{den > 0 && <span className="text-[11px] text-muted font-normal">{num}/{den}</span>}</span>
}

/** The small grey tag for a player below a ranking's minimum (his numbers are shown, but he is not ranked). */
export const BelowMinimum = () => <span className="text-[10px] font-medium text-muted border border-border rounded px-1 leading-4">未達門檻</span>

/** Marks numbers the site worked out itself (守備 lines inferred from the plate appearances). */
export const Inferred = () => <span className="text-[10px] font-medium text-[color-mix(in_srgb,var(--warning)_55%,var(--ink))] bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] rounded px-1 leading-4" title="這場沒有填守備紀錄，數字由打席紀錄推算">推定</span>
