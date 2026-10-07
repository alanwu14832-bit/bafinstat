import type { Column } from './DataTable'
import type { WithNumber } from '../../data/rosterSort'

/** The stats tables' 背號 column, right after the pinned name (click it to sort by number; 球員 sorts by surname). */
export function withJerseyColumn<T>(cols: Column<T>[]): Column<WithNumber<T>>[] {
  const number: Column<WithNumber<T>> = { key: 'number' as keyof WithNumber<T> & string, header: '背號', align: 'right', sortable: true, className: 'text-ink-2', format: (v) => (v === null || v === undefined ? '—' : String(v)) }
  const all = cols as unknown as Column<WithNumber<T>>[]
  return [all[0], number, ...all.slice(1)]
}
