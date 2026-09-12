import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cx } from '../../lib/format'
import { EmptyState } from './EmptyState'
import { StatHint } from './StatHint'

export type Align = 'left' | 'center' | 'right'

export interface Column<Row> {
  key: keyof Row & string
  header: ReactNode
  align?: Align
  /** Format the cell value. Receives the raw value and the row. */
  format?: (value: Row[keyof Row], row: Row) => ReactNode
  /** Every column sorts by default; pass false to opt out. */
  sortable?: boolean
  width?: number | string
  /** Extra class on cells (e.g. font-medium for a name column). */
  className?: string
}

export interface DataTableProps<Row> {
  columns: Column<Row>[]
  rows: Row[]
  rowKey: (row: Row, index: number) => string
  onRowClick?: (row: Row) => void
  footer?: Partial<Record<keyof Row & string, ReactNode>>
  emptyTitle?: string
  emptyDescription?: string
  /** Max height; header stays sticky inside the scroll container. */
  maxHeight?: number | string
  defaultSort?: { key: keyof Row & string; dir: 'asc' | 'desc' }
  dense?: boolean
  className?: string
}

const alignCls: Record<Align, string> = { left: 'text-left', center: 'text-center', right: 'text-right' }

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' || typeof b === 'number') return Number(a) - Number(b)
  return String(a ?? '').localeCompare(String(b ?? ''), 'zh-Hant')
}

/**
 * Sortable table: click any header to sort (desc → asc → off). Hairline rows, no zebra, sticky header; numbers are tabular so columns line up.
 * The first column is pinned so names stay visible while wide stat tables scroll sideways.
 */
export function DataTable<Row extends object>({
  columns, rows, rowKey, onRowClick, footer, emptyTitle = '沒有資料', emptyDescription, maxHeight, defaultSort, dense, className,
}: DataTableProps<Row>) {
  const [sort, setSort] = useState(defaultSort ?? null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const { key, dir } = sort
    return [...rows].sort((a, b) => compare(a[key], b[key]) * (dir === 'asc' ? 1 : -1))
  }, [rows, sort])

  const toggleSort = (key: keyof Row & string) =>
    setSort((s) => (s && s.key === key ? (s.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: 'desc' }))

  const cellPad = dense ? 'px-3 py-1.5' : 'px-3 py-2.5'
  const pin = (i: number) => (i === 0 ? 'sticky left-0 z-[1] bg-inherit' : '')

  return (
    <div className={cx('overflow-x-auto overflow-y-auto scroll-x', className)} style={{ maxHeight }}>
      <span role="status" aria-live="polite" className="sr-only">{sort ? `依 ${String(columns.find((c) => c.key === sort.key)?.header ?? sort.key)} ${sort.dir === 'asc' ? '升冪' : '降冪'}排序` : ''}</span>
      <table className="w-full border-collapse text-[13px] tnum whitespace-nowrap">
        <thead className="sticky top-0 z-[2] bg-surface">
          <tr className="border-b border-border">
            {columns.map((col, i) => {
              const active = sort?.key === col.key
              const sortable = col.sortable !== false
              const align = col.align ?? 'left'
              return (
                <th
                  key={col.key}
                  scope="col"
                  style={{ width: col.width }}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cx('text-[12px] font-medium h-9', active ? 'text-ink' : 'text-muted', cellPad, 'py-0', alignCls[align], pin(i), i === 0 && 'pl-4', i === columns.length - 1 && 'pr-4',
                    sortable && 'cursor-pointer select-none hover:text-ink')}
                  onClick={sortable ? () => toggleSort(col.key) : undefined}
                  title={sortable ? '點擊排序' : undefined}
                >
                  <span className={cx('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
                    <StatHint label={col.header}>{col.header}</StatHint>
                    {sortable && active && (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody key={sort ? `${String(sort.key)}-${sort.dir}` : 'unsorted'}>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState title={emptyTitle} description={emptyDescription} compact />
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr style={{ '--i': Math.min(i, 14) } as CSSProperties}
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row) } : undefined}
                className={cx('rise-in bg-surface border-b border-border last:border-b-0 transition-colors motion-reduce:transition-none motion-reduce:animate-none hover:bg-surface-2', onRowClick && 'cursor-pointer active:bg-surface-3/70')}
              >
                {columns.map((col, ci) => (
                  <td key={col.key} className={cx(cellPad, alignCls[col.align ?? 'left'], 'text-ink', pin(ci), ci === 0 && 'pl-4', ci === columns.length - 1 && 'pr-4', col.className)}>
                    {col.format ? col.format(row[col.key], row) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer && (
          <tfoot className="sticky bottom-0 z-[2]">
            <tr className="bg-surface-2 border-t border-border font-medium">
              {columns.map((col, ci) => (
                <td key={col.key} className={cx(cellPad, alignCls[col.align ?? 'left'], 'text-ink text-[12px]', pin(ci), ci === 0 && 'pl-4', ci === columns.length - 1 && 'pr-4')}>
                  {footer[col.key] ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
