import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { applyFilters } from '../data/filters'
import { DEFAULT_FILTERS, EMPTY_DATASET, type Dataset } from '../data/types'
import { useDataStore } from '../store/data'
import { FilterBar, activeFilterCount } from '../components/layout/FilterBar'
import { FilterChips, scopeText, useFilterUrlSync } from '../components/layout/FilterChips'
import { pickedText } from '../components/ui/MultiSelect'

const g = (id: string, date: string, tournament: string, opponent: string) => ({ id, date, tournament, opponent, homeAway: '主' as const })
const pa = (gameId: string, pos: string) => ({ gameId, inning: 1, order: 1, pos, batter: '甲', pitches: ['IP'], result: '一安', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 })
const ds: Dataset = {
  ...EMPTY_DATASET,
  roster: [{ name: '甲' }],
  games: [g('G1', '2026-10-01', '新生盃', '經濟'), g('G2', '2026-10-08', '大資盃', '會計'), g('G3', '2026-10-15', '友誼賽', '經濟')],
  batting: [pa('G1', 'SS'), pa('G2', '2B'), pa('G3', 'CF')],
}

describe('複選篩選', () => {
  it('a list filter passes a game holding any of its values; none picked passes every game', () => {
    expect(applyFilters(ds, DEFAULT_FILTERS).games.map((x) => x.id)).toEqual(['G1', 'G2', 'G3'])
    expect(applyFilters(ds, { ...DEFAULT_FILTERS, tournament: ['新生盃', '大資盃'] }).games.map((x) => x.id)).toEqual(['G1', 'G2'])
    expect(applyFilters(ds, { ...DEFAULT_FILTERS, opponent: ['經濟'] }).games.map((x) => x.id)).toEqual(['G1', 'G3'])
    // different filters narrow together (and), values of one filter widen (or)
    expect(applyFilters(ds, { ...DEFAULT_FILTERS, tournament: ['新生盃', '友誼賽'], opponent: ['經濟', '會計'] }).games.map((x) => x.id)).toEqual(['G1', 'G3'])
    expect(applyFilters(ds, { ...DEFAULT_FILTERS, position: ['SS', 'CF'] }).batting.map((x) => x.pos)).toEqual(['SS', 'CF'])
  })
  it('counts each filter once however many values it has, and says them all', () => {
    const f = { ...DEFAULT_FILTERS, tournament: ['新生盃', '大資盃'], result: ['W' as const, 'T' as const] }
    expect(activeFilterCount(f)).toBe(2)
    expect(scopeText(f, ds.games)).toContain('新生盃、大資盃')
    expect(scopeText(f, ds.games)).toContain('勝、和場')
    expect(pickedText([], [])).toBe('全部')
    expect(pickedText(['新生盃'], [{ value: '新生盃', label: '新生盃' }])).toBe('新生盃')
    expect(pickedText(['新生盃', '大資盃'], [{ value: '新生盃', label: '新生盃' }])).toBe('2 項')
  })
})

let search = ''
function Probe() { useFilterUrlSync(); search = useLocation().search; return null }
const page = (url: string) => render(
  <MemoryRouter initialEntries={[url]}><Routes><Route path="/games" element={<><FilterBar /><FilterChips /><Probe /></>} /></Routes></MemoryRouter>,
)

describe('複選篩選：畫面與網址', () => {
  beforeEach(() => { useDataStore.setState({ base: ds, demo: false, filters: DEFAULT_FILTERS }) })
  afterEach(() => cleanup())

  it('picks two tournaments from the dropdown, writes both into the address, and each chip takes one out', () => {
    page('/games')
    fireEvent.click(screen.getByRole('button', { name: '杯賽：全部' }))
    const list = screen.getByRole('listbox', { name: '杯賽' })
    fireEvent.click(within(list).getByRole('option', { name: '新生盃' }))
    fireEvent.click(within(list).getByRole('option', { name: '大資盃' }))
    expect(useDataStore.getState().filters.tournament).toEqual(['新生盃', '大資盃'])
    expect(within(list).getByRole('option', { name: '新生盃' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: '杯賽：2 項' })).toBeInTheDocument()
    expect(new URLSearchParams(search).getAll('cup')).toEqual(['新生盃', '大資盃'])
    expect(screen.getByText(/篩選：2 場/)).toBeInTheDocument()
    // 「全部」 clears the pick
    fireEvent.click(within(list).getByRole('option', { name: '全部' }))
    expect(useDataStore.getState().filters.tournament).toEqual([])
    // chips: one per value
    act(() => useDataStore.getState().setFilters({ opponent: ['經濟', '會計'] }))
    fireEvent.click(screen.getByRole('button', { name: '移除篩選 對手：會計' }))
    expect(useDataStore.getState().filters.opponent).toEqual(['經濟'])
    // Escape closes the list
    fireEvent.click(screen.getByRole('button', { name: '對手：經濟' }))
    expect(screen.getByRole('listbox', { name: '對手' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox', { name: '對手' })).toBeNull()
  })

  it('a shared link with repeated keys opens with every value; an old link (one value, or all) still works', () => {
    page('/games?cup=新生盃&cup=友誼賽&res=W&res=X&opp=all')
    const f = useDataStore.getState().filters
    expect(f.tournament).toEqual(['新生盃', '友誼賽'])
    expect(f.result).toEqual(['W'])
    expect(f.opponent).toEqual([])
  })

  it('the phone sheet shows the same choices as chips', () => {
    render(<MemoryRouter><FilterBar layout="stack" /></MemoryRouter>)
    const group = screen.getByRole('group', { name: '對手' })
    fireEvent.click(within(group).getByRole('button', { name: '經濟' }))
    fireEvent.click(within(group).getByRole('button', { name: '會計' }))
    expect(useDataStore.getState().filters.opponent).toEqual(['經濟', '會計'])
    expect(within(group).getByRole('button', { name: /經濟/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(group).getByRole('button', { name: '全部' }))
    expect(useDataStore.getState().filters.opponent).toEqual([])
  })
})
