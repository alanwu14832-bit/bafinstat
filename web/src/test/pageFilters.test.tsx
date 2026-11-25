/** 2026-11-25: each page offers its own filters (總覽／投球／比賽 no 守位; 即時比分 and the other tools none), and a filter a
 *  page does not offer does not apply there. */
import { cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { filterKeysFor, maskFilters } from '../hooks/usePageFilters'
import { useStats } from '../hooks/useStats'
import { TopBar } from '../components/layout/TopBar'
import { useDataStore } from '../store/data'
import { DEFAULT_FILTERS } from '../data/types'
import { SEED_DATASET } from '../data/seed'

afterEach(() => cleanup())

describe('每一頁的篩選', () => {
  it('which page offers what', () => {
    expect(filterKeysFor('/')).not.toContain('position')
    expect(filterKeysFor('/pitching')).not.toContain('position')
    expect(filterKeysFor('/games')).not.toContain('position')
    expect(filterKeysFor('/batting')).toContain('position')
    expect(filterKeysFor('/players')).toContain('position')
    expect(filterKeysFor('/fielding')).toContain('position')
    for (const p of ['/live', '/record', '/lineup', '/guide', '/dictionary', '/recordbook', '/games/G1']) expect(filterKeysFor(p)).toEqual([])
    const f = { ...DEFAULT_FILTERS, position: ['SS'], tournament: ['新生盃'], from: '2026-01-01' }
    expect(maskFilters(f, filterKeysFor('/'))).toEqual({ ...f, position: [] })
    expect(maskFilters(f, [])).toEqual(DEFAULT_FILTERS)
    expect(maskFilters(f, null)).toBe(f)
  })

  it('a 守位 picked on 打擊 narrows 打擊, not 總覽', () => {
    useDataStore.setState({ base: SEED_DATASET, demo: false, filters: { ...DEFAULT_FILTERS, position: ['SS'] } })
    const at = (path: string) => ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    const batting = renderHook(() => useStats(), { wrapper: at('/batting') }).result.current
    const overview = renderHook(() => useStats(), { wrapper: at('/') }).result.current
    expect(batting.batting.every((p) => p.pos === 'SS')).toBe(true)
    expect(overview.batting.length).toBeGreaterThan(batting.batting.length)
    useDataStore.setState({ filters: DEFAULT_FILTERS })
  })

  it('the bar: 總覽 has no 守位, 打擊 has it, 即時比分 has no filters at all', () => {
    useDataStore.setState({ base: SEED_DATASET, demo: false, filters: DEFAULT_FILTERS })
    const bar = (path: string) => render(<MemoryRouter initialEntries={[path]}><TopBar /></MemoryRouter>)
    bar('/')
    fireEvent.click(screen.getByRole('button', { name: /^篩選/ }))
    let sheet = screen.getByRole('dialog', { name: '篩選' })
    expect(within(sheet).queryByRole('group', { name: '守位' })).toBeNull()
    expect(within(sheet).getByRole('group', { name: '杯賽' })).toBeTruthy()
    cleanup()
    bar('/batting')
    fireEvent.click(screen.getByRole('button', { name: /^篩選/ }))
    sheet = screen.getByRole('dialog', { name: '篩選' })
    expect(within(sheet).getByRole('group', { name: '守位' })).toBeTruthy()
    cleanup()
    bar('/live')
    expect(screen.queryByRole('button', { name: /^篩選/ })).toBeNull()
    expect(screen.queryByRole('group', { name: '全域篩選' })).toBeNull()
  })
})
