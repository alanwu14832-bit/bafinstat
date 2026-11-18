import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { sortStrikeRows, StrikeRatioCard } from '../components/charts/StrikeRatioCard'

const rows = [{ name: '林軒亦', strikes: 124, balls: 99 }, { name: '黃昱翔', strikes: 98, balls: 33 }, { name: '黃彥程', strikes: 12, balls: 8 }]
const order = () => within(screen.getByRole('list')).getAllByRole('button').map((b) => b.getAttribute('aria-label')!.split(' ')[0])

describe('好壞球分佈: the share, sortable', () => {
  it('sorts by 好球率, 球數 or 姓名, and turns around on a second tap', () => {
    expect(sortStrikeRows(rows, 'pct', true).map((r) => r.name)).toEqual(['黃昱翔', '黃彥程', '林軒亦'])
    expect(sortStrikeRows(rows, 'pitches', true).map((r) => r.name)).toEqual(['林軒亦', '黃昱翔', '黃彥程'])
    const pick = vi.fn()
    render(<StrikeRatioCard rows={rows} onPick={pick} />)
    expect(order()).toEqual(['黃昱翔', '黃彥程', '林軒亦'])
    expect(screen.getByText('75%')).toBeTruthy()
    expect(screen.getByText('223 球')).toBeTruthy()
    // under 30 pitches: marked
    expect(screen.getByText('樣本少')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /依好球率排序/ }))
    expect(order()).toEqual(['林軒亦', '黃彥程', '黃昱翔'])
    fireEvent.click(screen.getByRole('button', { name: /^依球數排序/ }))
    expect(order()).toEqual(['林軒亦', '黃昱翔', '黃彥程'])
    fireEvent.click(within(screen.getByRole('list')).getAllByRole('button')[0])
    expect(pick).toHaveBeenCalledWith('林軒亦')
  })
})
