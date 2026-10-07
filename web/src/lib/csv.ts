import type { Column } from '../components/ui/DataTable'

/** A cell as plain text: the column's own formatting when it is text, otherwise the raw value (rates to 3 places). */
function cell<T>(c: Column<T>, row: T): string {
  const raw = row[c.key]
  if (c.text) return c.text(raw, row)
  const f = c.format ? c.format(raw, row) : raw
  const v = typeof f === 'string' || typeof f === 'number' ? f : Array.isArray(raw) ? raw.join(' / ') : raw
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000)
  return String(v)
}
const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/**
 * Download what a table shows as CSV (UTF-8 with BOM so Excel reads the Chinese). The first lines say what it covers —
 * the title, the filter and sample, the baselines, the page it came from — then a blank line and the table.
 */
export function downloadCsv<T>(filename: string, columns: Column<T>[], rows: T[], meta: string[]) {
  const header = columns.map((c) => (typeof c.header === 'string' ? c.header : c.key))
  const lines = [...meta.map((m) => esc(m)), '', header.map(esc).join(','), ...rows.map((r) => columns.map((c) => esc(cell(c, r))).join(','))]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
