import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PlayersPage } from '../pages/Players'
import { useDataStore } from '../store/data'
import { SEED_DATASET } from '../data/seed'
import { DEFAULT_FILTERS } from '../data/types'
import { pitchingLines } from '../data/stats'

const at = (url: string) => render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/players" element={<PlayersPage />} /></Routes></MemoryRouter>)
const ace = pitchingLines(SEED_DATASET.pitching, SEED_DATASET.games).sort((a, b) => b.pc - a.pc)[0].name
const url = `/players?player=${encodeURIComponent(ace)}&tab=pitching`

describe('球員頁・投球: 球速', () => {
  afterEach(() => cleanup())
  beforeEach(() => { try { localStorage.clear() } catch { /* none */ } })

  it('no card for a pitcher without a measured pitch', () => {
    useDataStore.setState({ base: SEED_DATASET, demo: false, filters: DEFAULT_FILTERS })
    at(url)
    expect(screen.getByText('防禦率 ERA')).toBeInTheDocument()
    expect(screen.queryByText('每場球速')).toBeNull()
  })

  it('the fastest, the average, the count and the innings once speeds are recorded', () => {
    const mine = SEED_DATASET.pitching.map((p, i) => ({ p, i })).filter(({ p }) => p.pitcher === ace && p.pitches.length >= 2)
    const [a, b] = mine
    const pitching = SEED_DATASET.pitching.map((p, i) => (i === a.i ? { ...p, speeds: [130, 136, ...p.pitches.slice(2).map(() => null)] } : i === b.i ? { ...p, speeds: [128, ...p.pitches.slice(1).map(() => null)] } : p))
    useDataStore.setState({ base: { ...SEED_DATASET, pitching }, demo: false, filters: DEFAULT_FILTERS })
    at(url)
    const card = screen.getByRole('heading', { name: '球速' }).closest('section, div.flex-col') as HTMLElement
    expect(within(card).getAllByText('136').length).toBeGreaterThan(0)
    expect(within(card).getAllByText('131.3').length).toBeGreaterThan(0)
    const innings = within(card).getByRole('table', { name: '各局球速' })
    expect(within(innings).getAllByRole('row').length).toBeGreaterThan(1)
    expect(screen.getByText('每場球速')).toBeInTheDocument()
  })
})
