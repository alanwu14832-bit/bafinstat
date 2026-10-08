import { describe, expect, it } from 'vitest'
import { safeCell } from './csv'

describe('CSV cells a spreadsheet would run as formulas', () => {
  it('text starting with = + - @ gets a leading apostrophe', () => {
    for (const s of ['=1+1', '=HYPERLINK("http://x","點我")', '+cmd', '-2+3', '@SUM(A1)', '\t=1']) expect(safeCell(s)).toBe(`'${s}`)
  })
  it('numbers, rates, percentages and ordinary text stay as they are', () => {
    for (const s of ['-0.512', '+3', '.312', '-.5', '12%', '1e-3', '-', '王小明', '3-2', '2026-10-01', '']) expect(safeCell(s)).toBe(s)
  })
})
