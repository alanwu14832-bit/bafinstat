import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { PlayersPage } from '../pages/Players'
import { useDataStore } from '../store/data'
import { SEED_DATASET } from '../data/seed'
import { DEFAULT_FILTERS } from '../data/types'
import { battingLines, pitchingLines } from '../data/stats'

let search = ''
function Probe() { search = useLocation().search; return null }
const at = (url: string) => render(
  <MemoryRouter initialEntries={[url]}><Routes><Route path="/players" element={<><PlayersPage /><Probe /></>} /></Routes></MemoryRouter>,
)
const rosterNames = new Set(SEED_DATASET.roster.map((p) => p.name))
const hitters = battingLines(SEED_DATASET, SEED_DATASET.batting).filter((l) => l.pa >= 1 && rosterNames.has(l.name)).sort((a, b) => b.pa - a.pa).map((l) => l.name)
const pitchers = new Set(pitchingLines(SEED_DATASET.pitching, SEED_DATASET.games).map((l) => l.name))
const [A, B, C] = hitters
const q = (main: string, cmp: string[]) => `/players?player=${encodeURIComponent(main)}${cmp.map((c) => `&cmp=${encodeURIComponent(c)}`).join('')}`
const gridNames = () => within(screen.getByTestId('compare-grid')).getAllByTestId('compare-name').map((e) => e.textContent)

describe('players: percentile bars and comparing up to nine', () => {
  beforeEach(() => {
    useDataStore.setState({ base: SEED_DATASET, demo: false, filters: DEFAULT_FILTERS })
    try { localStorage.clear() } catch { /* none */ }
  })
  afterEach(() => cleanup())

  it('needs at least 10 hitters in the seed', () => {
    expect(hitters.length).toBeGreaterThanOrEqual(10)
  })

  it('shows the comparison grid for the players in the link, in order', () => {
    at(q(A, [B, C]))
    expect(screen.getByText('3 人比較・打擊')).toBeInTheDocument()
    expect(gridNames()).toEqual([A, B, C])
  })

  it('takes the first 8 of 10 compared players, and disables a 9th pick', () => {
    const ten = hitters.slice(1, 11)
    at(q(A, ten))
    expect(gridNames()).toEqual([A, ...ten.slice(0, 8)])
    fireEvent.click(screen.getByRole('button', { name: '比較・8 人' }))
    const sheet = screen.getByRole('dialog', { name: '選擇比較的球員' })
    expect(within(sheet).getByText('已選 8 位')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: ten[8] })).toBeDisabled()
    expect(within(sheet).getByRole('button', { name: ten[0] })).not.toBeDisabled()
  })

  it('removes one with its ✕', () => {
    at(q(A, [B, C]))
    fireEvent.click(screen.getByRole('button', { name: `移除 ${B}` }))
    expect(new URLSearchParams(search).getAll('cmp')).toEqual([C])
  })

  it('draws 13 batting bars, and the radar on request', () => {
    at(q(A, []))
    expect(screen.getAllByTestId('pct-row')).toHaveLength(13)
    fireEvent.click(screen.getByRole('tab', { name: '雷達' }))
    expect(screen.queryAllByTestId('pct-row')).toHaveLength(0)
    expect(screen.getByText(/越外圈越好/)).toBeInTheDocument()
  })

  it('keeps the comparison when switching to 投球', () => {
    const p = hitters.find((n) => pitchers.has(n)) ?? A
    const others = hitters.filter((n) => n !== p).slice(0, 2)
    at(q(p, others))
    fireEvent.click(screen.getByRole('tab', { name: /^投球/ }))
    expect(new URLSearchParams(search).get('tab')).toBe('pitching')
    expect(new URLSearchParams(search).getAll('cmp')).toEqual(others)
  })
})
