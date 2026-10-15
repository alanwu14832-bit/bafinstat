import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SplitsCard } from '../components/ui/SplitsCard'
import { useDataStore } from '../store/data'
import { SEED_DATASET } from '../data/seed'
import { DEFAULT_FILTERS } from '../data/types'

describe('情境拆分 card', () => {
  it('shows the count tab with the 4 × 3 grid, the outs／bases tab with what is missing, and spells a tapped count out', () => {
    useDataStore.setState({ base: SEED_DATASET, demo: false, filters: DEFAULT_FILTERS })
    render(<MemoryRouter><SplitsCard side="bat" rows={SEED_DATASET.batting} who="全隊" /></MemoryRouter>)
    expect(screen.getAllByText('全部').length).toBeGreaterThan(0)
    expect(screen.getByText('兩好球之後')).toBeInTheDocument()
    const grid = screen.getByRole('table', { name: '球數格' })
    const cells = within(grid).getAllByRole('button')
    expect(cells).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: /^1壞1好：/ }))
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain('1壞1好之後')
    fireEvent.click(screen.getByRole('tab', { name: '出局・壘上' }))
    expect(screen.getByText('滿壘')).toBeInTheDocument()
    expect(screen.getByText(/沒記壘上 64 個打席不列入/)).toBeInTheDocument()
    expect(within(document.body).queryAllByRole('button', { name: /^\d壞\d好：/ })).toHaveLength(0)
  })
  it('pitchers on a phone (精簡): short 被… headers, so 情境 / BF / 被打擊 / 被上壘 / 被OPS fit 360px; 完整 keeps the full names', () => {
    const real = window.matchMedia
    window.matchMedia = ((query: string) => ({ matches: query.includes('max-width: 767px'), media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
    try {
      useDataStore.setState({ base: SEED_DATASET, demo: false, filters: DEFAULT_FILTERS })
      render(<MemoryRouter><SplitsCard side="pit" rows={SEED_DATASET.pitching} who="全隊" /></MemoryRouter>)
      const tables = screen.getAllByRole('table')
      const heads = () => within(tables[tables.length - 1]).getAllByRole('columnheader').map((h) => h.textContent)
      expect(heads()).toEqual(['情境', 'BF', '被打擊', '被上壘', '被OPS'])
      fireEvent.click(screen.getByRole('tab', { name: '完整' }))
      const full = within(screen.getAllByRole('table').at(-1)!).getAllByRole('columnheader').map((h) => h.textContent)
      expect(full).toContain('被打擊率')
      expect(full).toContain('被上壘率')
    } finally { window.matchMedia = real }
  })
  it('左右打 (batch 18): our batters by their own side, the 未填 ones named with a link to the 球員名單; pitchers get 對左右打 once recorded', () => {
    const roster = SEED_DATASET.roster.map((p, i) => (i === 0 ? { ...p, bats: 'L' as const } : { ...p, bats: undefined }))
    const pitching = SEED_DATASET.pitching.map((p, i) => (i % 2 ? { ...p, oppBats: 'L' as const } : { ...p, oppBats: 'R' as const }))
    useDataStore.setState({ base: { ...SEED_DATASET, roster, pitching }, demo: false, filters: DEFAULT_FILTERS })
    render(<MemoryRouter><SplitsCard side="bat" rows={SEED_DATASET.batting} who="全隊" /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: '左右打' }))
    expect(screen.getByText('左打者')).toBeInTheDocument()
    expect(screen.getByText('右打者・對左投')).toBeInTheDocument()
    expect(screen.getByText('未填')).toBeInTheDocument()
    expect(screen.getByText(/^未填左右打：/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '到球員名單填左右打' })).toHaveAttribute('href', '/players')
    cleanup()
    render(<MemoryRouter><SplitsCard side="pit" rows={pitching} who="全隊" /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: '對左右打' }))
    expect(screen.getByText('對左打')).toBeInTheDocument()
    expect(screen.getByText('對右打')).toBeInTheDocument()
  })
})
