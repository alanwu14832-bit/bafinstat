/** 紀錄比賽 setup (2026-11-25): a phone that reloads the page while the recorder looks at another app brings the form back. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage, SETUP_KEY } from '../pages/Record'
import { useDataStore } from '../store/data'
import { EMPTY_DATASET } from '../data/types'

const KEY = `${SETUP_KEY}.practice`
const open = () => render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>)
const field = (label: string) => screen.getAllByLabelText(label, { exact: true }).at(-1) as HTMLInputElement | HTMLSelectElement
afterEach(() => { cleanup(); localStorage.removeItem(KEY) })

describe('紀錄比賽: the setup survives a reload', () => {
  it('the opponent, 預定局數 and the lineup come back after the page is opened again; another day starts afresh', () => {
    useDataStore.setState({ base: { ...EMPTY_DATASET, roster: ['甲', '乙', '丙'].map((name) => ({ name })) }, cloud: { ...useDataStore.getState().cloud, configured: false } })
    localStorage.removeItem(KEY)
    open()
    const edit = screen.queryByRole('button', { name: '修改' })
    if (edit) fireEvent.click(edit)
    fireEvent.change(field('對手'), { target: { value: '經濟系' } })
    fireEvent.change(field('預定局數'), { target: { value: '5' } })
    const kept = JSON.parse(localStorage.getItem(KEY)!)
    expect([kept.game.opponent, kept.game.innings]).toEqual(['經濟系', 5])
    // the page goes away (the phone dropped it) and is opened again
    cleanup()
    open()
    const again = screen.queryByRole('button', { name: '修改' })
    if (again) fireEvent.click(again)
    expect(field('對手').value).toBe('經濟系')
    expect(field('預定局數').value).toBe('5')
    // yesterday's form is not brought back
    cleanup()
    localStorage.setItem(KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(KEY)!), date: '2000-01-01' }))
    open()
    const fresh = screen.queryByRole('button', { name: '修改' })
    if (fresh) fireEvent.click(fresh)
    expect(field('對手').value).not.toBe('經濟系')
  })
})
