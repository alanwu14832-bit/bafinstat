/** 紀錄比賽 setup: 預定局數 is a list (1–12), so any number can be picked — the old box snapped back to the team's default when cleared. */
import { describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage } from '../pages/Record'
import { useDataStore } from '../store/data'

describe('預定局數', () => {
  it('picks any of 1–12 innings', () => {
    useDataStore.setState({ cloud: { ...useDataStore.getState().cloud, configured: false } })
    render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>)
    const edit = screen.queryByRole('button', { name: '修改' })
    if (edit) fireEvent.click(edit)
    const pick = screen.getByRole('combobox', { name: '預定局數' }) as HTMLSelectElement
    expect(within(pick).getAllByRole('option').map((o) => o.textContent)).toEqual(Array.from({ length: 12 }, (_, k) => `${k + 1} 局`))
    fireEvent.change(pick, { target: { value: '5' } })
    expect((screen.getByRole('combobox', { name: '預定局數' }) as HTMLSelectElement).value).toBe('5')
    fireEvent.change(pick, { target: { value: '9' } })
    expect((screen.getByRole('combobox', { name: '預定局數' }) as HTMLSelectElement).value).toBe('9')
    cleanup()
  })
})
