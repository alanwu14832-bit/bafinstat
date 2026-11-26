/** 2026-11-26 (a player's ask): the 球員 page's 逐場紀錄 shows 2B and 3B between H and HR. */
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { useDataStore } from '../store/data'
import { SEED_DATASET } from '../data/seed'
import { DEFAULT_FILTERS } from '../data/types'
import { battingLines } from '../data/stats'
import { PlayersPage } from '../pages/Players'

beforeEach(() => { localStorage.clear(); useDataStore.setState({ base: SEED_DATASET, demo: false, filters: DEFAULT_FILTERS }) })
afterEach(cleanup)

it('逐場紀錄 lists H, 2B, 3B, HR in that order, and the game rows add up to the player’s 2B and 3B', () => {
  // the batter with the most extra-base hits in the seed games
  const lines = battingLines(SEED_DATASET, SEED_DATASET.batting)
  const who = [...lines].sort((a, b) => b.h2 + b.h3 - (a.h2 + a.h3))[0]
  expect(who.h2 + who.h3).toBeGreaterThan(0)
  render(<MemoryRouter initialEntries={[`/players?player=${encodeURIComponent(who.name)}`]}><PlayersPage /></MemoryRouter>)
  const card = document.getElementById('p-log')!
  const table = within(card).getByRole('table')
  const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent?.trim())
  expect(heads.indexOf('2B')).toBe(heads.indexOf('H') + 1)
  expect(heads.indexOf('3B')).toBe(heads.indexOf('2B') + 1)
  expect(heads.indexOf('HR')).toBe(heads.indexOf('3B') + 1)
  const rows = within(table).getAllByRole('row').slice(1).map((r) => within(r).queryAllByRole('cell').map((c) => c.textContent?.trim())).filter((r) => r.length)
  const sum = (col: string) => rows.reduce((a, r) => a + Number(r[heads.indexOf(col)] || 0), 0)
  expect(sum('2B')).toBe(who.h2)
  expect(sum('3B')).toBe(who.h3)
  expect(screen.getByText('逐場紀錄')).toBeInTheDocument()
})
