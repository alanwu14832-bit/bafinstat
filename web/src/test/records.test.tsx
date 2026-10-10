/**
 * 紀錄簿 (/recordbook) and the 球員 page's 生涯 tab, rendered over the seed games (calendar-year seasons, the default).
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useDataStore } from '../store/data'
import { SEED_DATASET } from '../data/seed'
import { EMPTY_DATASET } from '../data/types'
import { RecordsPage } from '../pages/Records'
import { PlayersPage } from '../pages/Players'
import { OverviewPage } from '../pages/Overview'
import { FilterBar, seasonPreset } from '../components/layout/FilterBar'
import { useFilterUrlSync } from '../components/layout/FilterChips'

/** What AppShell does around every page: keep the filters and the address in step, and (here) show the address. */
function Shell() {
  useFilterUrlSync()
  const { pathname, search } = useLocation()
  return <><output data-testid="url">{pathname}{search}</output><Outlet /></>
}
const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route element={<Shell />}>
        <Route path="/recordbook" element={<RecordsPage />} /><Route path="/players" element={<PlayersPage />} /><Route path="/" element={<><FilterBar /><OverviewPage /></>} />
      </Route>
    </Routes>
  </MemoryRouter>,
)
const url = () => decodeURIComponent(screen.getByTestId('url').textContent ?? '')

describe('紀錄簿', () => {
  beforeEach(() => { localStorage.clear(); useDataStore.setState({ base: SEED_DATASET, demo: false }); useDataStore.getState().resetFilters() })
  afterEach(() => cleanup())

  it('lists single-game records over every game, linking to the player’s 生涯 tab', () => {
    at('/recordbook')
    expect(screen.getByRole('heading', { level: 1, name: '紀錄簿' })).toBeInTheDocument()
    expect(screen.getByText(/自 2025\/10\/10 起 2 場有逐打席紀錄的比賽/)).toBeInTheDocument()
    const hits = screen.getByRole('list', { name: '安打' })
    expect(within(hits).getAllByRole('link', { name: '蔡奇霖' })[0]).toHaveAttribute('href', '/players?player=%E8%94%A1%E5%A5%87%E9%9C%96&tab=career')
    expect(within(hits).getAllByText('2025/10/10 對 群風').length).toBeGreaterThan(0)
  })
  it('shows the biggest comeback on the 球隊 tab, with the season table', () => {
    at('/recordbook')
    fireEvent.click(screen.getByRole('tab', { name: '球隊' }))
    const comeback = screen.getByRole('list', { name: '最大逆轉勝' })
    expect(within(comeback).getAllByText('3')).toHaveLength(2)
    expect(screen.getByText('逐季戰績')).toBeInTheDocument()
    expect(screen.getAllByText('2025 年').length).toBeGreaterThan(0)
    // no 打擊／投球 switch on 球隊
    expect(screen.queryByRole('tab', { name: '投球' })).toBeNull()
  })
  it('opens 總覽 for a season tapped in 逐季戰績, with the filter set to it', async () => {
    at('/recordbook?view=team')
    const table = screen.getByText('逐季戰績').closest('section')!
    fireEvent.click(within(table).getAllByText('2025 年')[0])
    expect(await screen.findByRole('heading', { level: 1, name: '總覽' })).toBeInTheDocument()
    expect(url()).toBe('/?from=2025-01-01&to=2025-12-31')
    expect(useDataStore.getState().filters).toMatchObject({ from: '2025-01-01', to: '2025-12-31' })
  })
  it('gives each team list its own unit, and every row one big link', () => {
    at('/recordbook?view=team')
    const hits = screen.getByRole('list', { name: '最多安打' })
    // a team row opens its game; the context line is no second, tiny link to the same place
    const row = within(hits).getAllByRole('listitem')[0]
    expect(within(row).getAllByRole('link')).toHaveLength(1)
    expect(within(row).getByRole('link').className).toContain('after:inset-0')
  })
  it('offers 只看現役 on 生涯', () => {
    at('/recordbook?view=career&side=pit')
    expect(screen.getByLabelText('只看現役')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '最長連續無失分局數' })).toBeInTheDocument()
  })
  it('says there is nothing yet without games', () => {
    useDataStore.setState({ base: EMPTY_DATASET, demo: false })
    at('/recordbook')
    expect(screen.getByText('還沒有比賽紀錄')).toBeInTheDocument()
  })
})

describe('球員頁「生涯」', () => {
  beforeEach(() => { localStorage.clear(); useDataStore.setState({ base: SEED_DATASET, demo: false }); useDataStore.getState().resetFilters() })
  afterEach(() => cleanup())

  it('shows season tables with a career line and personal bests', () => {
    at('/players?player=蔡奇霖&tab=career')
    expect(screen.getByRole('tab', { name: '生涯・1 年' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('打擊逐季')).toBeInTheDocument()
    expect(screen.getAllByText('2025 年').length).toBeGreaterThan(0)
    expect(screen.getAllByText('生涯合計').length).toBeGreaterThan(0)
    expect(screen.getByText('單場最多打點')).toBeInTheDocument()
    const tile = screen.getByRole('link', { name: /單場最多打點 3/ })
    expect(tile).toHaveAttribute('href', '/games?game=G20251010-01')
    expect(screen.getByText('生涯 AVG')).toBeInTheDocument()
  })
  it('sets the filter to a season when a row is tapped, and switches to 打擊', async () => {
    at('/players?player=蔡奇霖&tab=career')
    const table = screen.getByText('打擊逐季').closest('section')!
    fireEvent.click(within(table).getAllByText('2025 年')[0])
    expect(await screen.findByRole('tab', { name: /^打擊/, selected: true })).toBeInTheDocument()
    expect(useDataStore.getState().filters).toMatchObject({ from: '2025-01-01', to: '2025-12-31' })
    expect(url()).toBe('/players?player=蔡奇霖&tab=batting&from=2025-01-01&to=2025-12-31')
    // later filter changes still reach the address
    act(() => useDataStore.getState().resetFilters())
    await waitFor(() => expect(url()).toBe('/players?player=蔡奇霖&tab=batting'))
  })
})

describe('篩選列的季按鈕', () => {
  beforeEach(() => { localStorage.clear(); useDataStore.setState({ base: SEED_DATASET, demo: false }); useDataStore.getState().resetFilters() })
  afterEach(() => cleanup())
  it('reads the calendar year by default, 學年 when the season starts in August', () => {
    at('/')
    expect(screen.getByRole('button', { name: '2025年' })).toBeInTheDocument()
    expect(seasonPreset('2025-12-22')).toEqual({ from: '2025-01-01', label: '2025年' })
    expect(seasonPreset('2025-12-22', 8)).toEqual({ from: '2025-08-01', label: '114 學年' })
    expect(seasonPreset('2026-08-01', 8)).toEqual({ from: '2026-08-01', label: '115 學年' })
    fireEvent.click(screen.getByRole('button', { name: '2025年' }))
    expect(useDataStore.getState().filters.from).toBe('2025-01-01')
    expect(screen.getByRole('button', { name: '2025年' })).toHaveAttribute('aria-pressed', 'true')
  })
})
