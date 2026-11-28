/**
 * 2026-11-27 impeccable critique, package C: leaders on one minimum (規定打席) with 樣本還小 until someone reaches it, the
 * 球員 page opening on the player this device last looked at, and 即時比分 between games showing the last score and the next
 * game instead of a dead end.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LeaderStrip } from '../components/ui/Leaders'
import { PlayersPage } from '../pages/Players'
import { LivePage } from '../pages/Live'
import { useDataStore } from '../store/data'
import { SEED_DATASET } from '../data/seed'
import { DEFAULT_FILTERS } from '../data/types'
import { playedGames } from '../data/filters'
import { summarizeGame } from '../data/stats'
import { qualifiedBatters } from '../data/stories'
import { minPlateAppearances } from '../data/qualify'

const at = (url: string) => render(
  <MemoryRouter initialEntries={[url]}><Routes>
    <Route path="/players" element={<PlayersPage />} /><Route path="/live" element={<LivePage />} />
  </Routes></MemoryRouter>,
)
beforeEach(() => {
  useDataStore.setState({ base: SEED_DATASET, demo: false, filters: DEFAULT_FILTERS })
  try { localStorage.clear() } catch { /* none */ }
})
afterEach(() => cleanup())

describe('one minimum for every leader', () => {
  it('總覽 ranks on 規定打席 (2.1 × games), like the 打擊 page', () => {
    const lines = [{ name: '甲', pa: 13 }, { name: '乙', pa: 12 }] as never
    expect(minPlateAppearances('college', 6)).toBe(13)
    expect(qualifiedBatters(lines, 6).map((l: { name: string }) => l.name)).toEqual(['甲'])
  })
  it('a rate nobody qualifies for yet reads 樣本還小, and the strip says its minimum', () => {
    render(<MemoryRouter><LeaderStrip rule="打擊率、OPS：規定打席 PA ≥ 13" leaders={[
      { label: '打擊率', value: '樣本還小', names: [], to: '', note: '還沒有人達 PA ≥ 13' },
      { label: '全壘打', value: '2', names: ['甲'], to: '/players?player=甲' },
    ]} /></MemoryRouter>)
    const strip = screen.getByRole('region', { name: '領先者' })
    expect(within(strip).getByText('打擊率、OPS：規定打席 PA ≥ 13')).toBeInTheDocument()
    expect(within(strip).getByText('樣本還小')).toBeInTheDocument()
    expect(within(strip).getByText('還沒有人達 PA ≥ 13')).toBeInTheDocument()
    // only the real leader is a link
    expect(within(strip).getAllByRole('link')).toHaveLength(1)
  })
})

describe('球員 opens on the player this device last looked at', () => {
  it('without a player in the link, the remembered one; a link updates it', () => {
    const names = SEED_DATASET.roster.map((p) => p.name)
    localStorage.setItem('bafin.players.last.v1', names[3])
    at('/players')
    expect(screen.getAllByText(names[3]).length).toBeGreaterThan(0)
    cleanup()
    at(`/players?player=${encodeURIComponent(names[5])}`)
    expect(localStorage.getItem('bafin.players.last.v1')).toBe(names[5])
  })
})

describe('即時比分 between games', () => {
  it('shows how the last game ended and where the schedule is', () => {
    const last = playedGames(SEED_DATASET).slice(-1)[0]
    const s = summarizeGame(SEED_DATASET, last, new Set())
    at('/live')
    expect(screen.getByText('目前沒有進行中的比賽')).toBeInTheDocument()
    const box = screen.getByRole('region', { name: '最近一場' })
    expect(box.textContent).toContain(`${s.runsUs}:${s.runsOpp}`)
    expect(within(box).getByRole('link', { name: '看這場的成績' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '下一場' })).getByRole('link', { name: '看賽程' })).toBeInTheDocument()
  })
})
