import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cx } from '../../lib/format'
import { EmptyState } from './EmptyState'

export type Align = 'left' | 'center' | 'right'

export interface Column<Row> {
  key: keyof Row & string
  header: ReactNode
  align?: Align
  /** Format the cell value. Receives the raw value and the row. */
  format?: (value: Row[keyof Row], row: Row) => ReactNode
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
  return String(a ?? '').localeCompare(String(b ?? ''), 'zh-Hant')
}

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

  return (
    <div className={cx('overflow-x-auto overflow-y-auto rounded-[var(--radius-sm)]', className)} style={{ maxHeight }}>
      <table className="w-full border-collapse text-sm tnum whitespace-nowrap">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-border">
            {columns.map((col) => {
              const active = sort?.key === col.key
              const align = col.align ?? 'left'
              return (
                <th
                  key={col.key}
                  scope="col"
                  style={{ width: col.width }}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cx('text-xs font-medium text-muted', cellPad, alignCls[align], col.sortable && 'cursor-pointer select-none hover:text-ink')}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                >
                  <span className={cx('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
                    {col.header}
                    {col.sortable &&
                      (active ? (
                        sort.dir === 'asc' ? <ArrowUp className="size-3 text-accent" /> : <ArrowDown className="size-3 text-accent" />
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      ))}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState title={emptyTitle} description={emptyDescription} compact />
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row) } : undefined}
                className={cx(
                  'border-b border-border last:border-b-0 transition-colors motion-reduce:transition-none',
                  i % 2 === 1 && 'bg-surface-2/50',
                  'hover:bg-accent-soft',
                  onRowClick && 'cursor-pointer',
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cx(cellPad, alignCls[col.align ?? 'left'], 'text-ink', col.className)}>
                    {col.format ? col.format(row[col.key], row) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer && (
          <tfoot className="sticky bottom-0 bg-surface-2">
            <tr className="border-t border-border font-medium">
              {columns.map((col) => (
                <td key={col.key} className={cx(cellPad, alignCls[col.align ?? 'left'], 'text-ink text-xs')}>
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
