/** Stats tables sort from the keyboard too, and a stat's explanation is linked to its name for screen readers. */
import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { DataTable } from '../components/ui/DataTable'

type Row = { name: string; AVG: number; note: string }
const rows: Row[] = [{ name: '甲', AVG: 0.25, note: 'x' }, { name: '乙', AVG: 0.4, note: 'y' }]

describe('DataTable from the keyboard', () => {
  it('Enter on a stat name sorts; a header without a hint is focusable itself', async () => {
    render(<DataTable columns={[{ key: 'name', header: '球員' }, { key: 'AVG', header: 'AVG', align: 'right' }, { key: 'note', header: '備註欄' }]} rows={rows} rowKey={(r) => r.name} />)
    const avg = screen.getByText('AVG')
    const th = avg.closest('th')!
    expect(th).not.toHaveAttribute('aria-sort')
    avg.focus()
    fireEvent.keyDown(avg, { key: 'Enter' })
    expect(th).toHaveAttribute('aria-sort')
    const sortedOnce = th.getAttribute('aria-sort')
    fireEvent.keyDown(avg, { key: ' ' })
    expect(th.getAttribute('aria-sort')).not.toBe(sortedOnce)
    expect(screen.getByText('備註欄').closest('th')).toHaveAttribute('tabindex', '0')
    // the hint card carries the id the name points to
    fireEvent.focus(avg)
    await act(() => new Promise((r) => setTimeout(r, 150)))
    const id = avg.getAttribute('aria-describedby')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)).toHaveAttribute('role', 'tooltip')
  })
})
