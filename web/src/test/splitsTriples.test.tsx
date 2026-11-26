/** 2026-11-26 (a player's report): the 情境拆分 and 對左投・對右投 tables list 3B between 2B and HR. */
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useDataStore } from '../store/data'
import { SEED_DATASET } from '../data/seed'
import { DEFAULT_FILTERS } from '../data/types'
import { SplitsCard } from '../components/ui/SplitsCard'
import { paContexts, splitTable } from '../data/splits'

afterEach(cleanup)

it('the split table has a 3B column between 2B and HR, with the triples counted', () => {
  useDataStore.setState({ base: SEED_DATASET, demo: false, filters: DEFAULT_FILTERS })
  const rows = SEED_DATASET.batting
  render(<MemoryRouter><SplitsCard side="bat" rows={rows} who="全隊" /></MemoryRouter>)
  const table = screen.getAllByRole('table').find((t) => within(t).queryAllByRole('columnheader').some((h) => h.textContent?.trim() === '情境'))!
  const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent?.trim())
  expect(heads.indexOf('3B')).toBe(heads.indexOf('2B') + 1)
  expect(heads.indexOf('HR')).toBe(heads.indexOf('3B') + 1)
  // the 「全部」 row shows the same triples the split itself counts (and the seed games have some)
  const expected = splitTable(rows, paContexts(SEED_DATASET, 'bat'), 'bat', 'count', { roster: SEED_DATASET.roster, innings: 7 }).rows.find((r) => r.all)!.line.h3
  expect(expected).toBeGreaterThan(0)
  const all = within(table).getAllByRole('row').find((r) => within(r).queryByText('全部'))!
  expect(within(all).getAllByRole('cell')[heads.indexOf('3B')].textContent?.trim()).toBe(String(expected))
})
