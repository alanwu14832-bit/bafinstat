/** 擊球剖面 table (Savant 版型): on the player page for a hitter and a pitcher (the player and a 全隊 row), and as the 擊球剖面 view of the team pages. */
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PlayersPage } from '../pages/Players'
import { BattingPage } from '../pages/Batting'
import { PitchingPage } from '../pages/Pitching'
import { useDataStore } from '../store/data'
import { SEED_DATASET } from '../data/seed'
import { DEFAULT_FILTERS } from '../data/types'
import { battingLines, pitchingLines } from '../data/stats'

const at = (url: string) => render(
  <MemoryRouter initialEntries={[url]}><Routes>
    <Route path="/players" element={<PlayersPage />} /><Route path="/batting" element={<BattingPage />} /><Route path="/pitching" element={<PitchingPage />} />
  </Routes></MemoryRouter>,
)
const roster = new Set(SEED_DATASET.roster.map((p) => p.name))
const hitter = battingLines(SEED_DATASET, SEED_DATASET.batting).filter((l) => l.bip > 0 && roster.has(l.name)).sort((a, b) => b.bip - a.bip)[0].name
const pitcher = pitchingLines(SEED_DATASET.pitching, SEED_DATASET.games).filter((l) => l.bip > 0).sort((a, b) => b.bip - a.bip)[0].name

describe('擊球剖面 table', () => {
  beforeEach(() => {
    useDataStore.setState({ base: SEED_DATASET, demo: false, filters: DEFAULT_FILTERS })
    try { localStorage.clear() } catch { /* none */ }
  })
  afterEach(() => cleanup())

  const heads = ['GB%', 'LD%', 'FB%', 'PU%', 'AIR%', 'Pull%', 'Center%', 'Oppo%', 'Soft%', 'Med%', 'Hard%', 'HR/FB', 'BABIP 滾地', 'BABIP 平飛', 'BABIP 飛球']

  it('a hitter: the four column groups and his row above 全隊', () => {
    at(`/players?player=${encodeURIComponent(hitter)}&tab=batting`)
    const t = screen.getAllByRole('table').find((x) => within(x).queryByText('PU%'))!
    for (const h of heads) expect(within(t).getByText(h)).toBeInTheDocument()
    for (const g of ['擊球種類', '方向', '強度', '結果']) expect(within(t).getByText(g)).toBeInTheDocument()
    const body = within(t).getAllByRole('row').slice(2)
    expect(body).toHaveLength(2)
    expect(body[0]).toHaveTextContent(hitter)
    expect(body[1]).toHaveTextContent('全隊')
  })

  it('a pitcher: his row above 全隊投手', () => {
    at(`/players?player=${encodeURIComponent(pitcher)}&tab=pitching`)
    const t = screen.getAllByRole('table').find((x) => within(x).queryByText('PU%'))!
    const body = within(t).getAllByRole('row').slice(2)
    expect(body[0]).toHaveTextContent(pitcher)
    expect(body[body.length - 1]).toHaveTextContent('全隊投手')
  })

  it('the team pages have a 擊球剖面 view with PU% and AIR%', () => {
    at('/batting?view=batted')
    expect(screen.getAllByText('PU%').length).toBeGreaterThan(0)
    cleanup()
    at('/pitching?view=batted')
    expect(screen.getAllByText('AIR%').length).toBeGreaterThan(0)
  })
})
