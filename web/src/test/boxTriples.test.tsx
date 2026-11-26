/** 2026-11-26 (a player's report): the game page's 打擊 box score lists 3B between 2B and HR, as 對方打擊 does. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { useDataStore } from '../store/data'
import { GameView } from '../pages/GameView'
import { summarizeGame } from '../data/stats'
import { EMPTY_DATASET, type BattingPA, type Dataset, type Game } from '../data/types'

const game: Game = { id: 'T1', date: '2026-10-03', tournament: '友誼賽', opponent: '測試隊', homeAway: '主', innings: 7 }
const b = (order: number, batter: string, result: string, p: Partial<BattingPA> = {}): BattingPA =>
  ({ gameId: 'T1', inning: 1, order, batter, pitches: ['IP'], result, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p }) as BattingPA
const ds: Dataset = { ...EMPTY_DATASET, games: [game], batting: [b(1, '子', '三安', { loc: 8, traj: 'L' }), b(2, '丑', '二安', { loc: 7, traj: 'L', rbi: 1 }), b(3, '寅', '內滾', { code: 'I' })] }

beforeEach(() => { localStorage.clear(); useDataStore.setState({ base: ds, demo: false, albums: [], albumsSupported: true }) })
afterEach(cleanup)

it('打擊 box score: 3B sits between 2B and HR and counts the triple', () => {
  render(<MemoryRouter><GameView summary={summarizeGame(ds, game)} mode="page" onClose={() => undefined} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('tab', { name: '攻守成績' }))
  const t = screen.getAllByRole('table').find((x) => [...x.querySelectorAll('th')].some((th) => th.textContent?.trim() === '打者'))!
  const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent?.trim())
  expect(heads.indexOf('3B')).toBe(heads.indexOf('2B') + 1)
  expect(heads.indexOf('HR')).toBe(heads.indexOf('3B') + 1)
  const row = [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim())).find((r) => r[0] === '子')!
  expect(row[heads.indexOf('3B')]).toBe('1')
  expect(row[heads.indexOf('2B')]).toBe('0')
})
