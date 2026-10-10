import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../App'
import { useDataStore } from '../store/data'
import { SEED_DATASET, TEAM_NAME } from '../data/seed'
import { DEFAULT_FILTERS } from '../data/types'
import { battingLines, summarizeGame } from '../data/stats'
import { autoOrder, emptyLineup, writeLineup } from '../record/lineup'
import { addPitch, commitPA, defaultPlan, newGame, type RecordState } from '../record/model'

const at = (url: string) => render(<MemoryRouter initialEntries={[url]}><AppRoutes /></MemoryRouter>)
const game = SEED_DATASET.games.find((g) => !g.status && SEED_DATASET.batting.some((p) => p.gameId === g.id))!

describe('print pages', () => {
  beforeEach(() => {
    useDataStore.setState({ base: SEED_DATASET, demo: false, filters: DEFAULT_FILTERS })
    try { localStorage.clear() } catch { /* none */ }
  })
  afterEach(() => cleanup())

  it('prints the scoresheet of a game without the site shell', async () => {
    at(`/print/game/${game.id}`)
    const sheets = await screen.findAllByTestId('scoresheet', {}, { timeout: 4000 })
    expect(sheets).toHaveLength(2)
    const titles = screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)
    expect(titles).toEqual([`${TEAM_NAME} vs ${game.opponent}　記分表`, `${TEAM_NAME} vs ${game.opponent}　記分表`])
    const ours = sheets.find((s) => within(s).queryByText(`本頁：${TEAM_NAME} 打擊`))!
    expect(within(ours).getAllByTestId('slot-row').filter((r) => /^\d$/.test(r.querySelector('td')!.textContent ?? ''))).toHaveLength(9)
    expect(within(ours).getAllByText('得分 R').some((el) => el.tagName === 'TD')).toBe(true)
    expect(screen.queryByRole('navigation', { name: '主選單' })).toBeNull()
    expect(screen.getByText(/請在列印設定選『橫向』/)).toBeInTheDocument()
  })

  it('draws each plate appearance from the scoresheet model: marks, counts and the diamond', async () => {
    at(`/print/game/${game.id}?side=us`)
    const [sheet] = await screen.findAllByTestId('scoresheet', {}, { timeout: 4000 })
    const marks = [...sheet.querySelectorAll('.pa-mark')].map((m) => m.textContent ?? '')
    expect(marks.some((m) => /^(1B|2B|3B|HR)/.test(m))).toBe(true)
    expect(marks.some((m) => /^(K|G|F|P|L)/.test(m))).toBe(true)
    expect([...sheet.querySelectorAll('.pa-count')].some((c) => /^\d-\d/.test(c.textContent ?? ''))).toBe(true)
    expect(sheet.querySelectorAll('.cell svg polygon').length).toBeGreaterThan(0)
  })

  it('follows the runners of a game recorded on the site: no 「只畫上壘與得分」 note', async () => {
    const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
    let s: RecordState = newGame({ id: 'G20260301-01', date: '2026-03-01', tournament: '友誼賽', opponent: '測試隊', homeAway: '客', innings: 7 }, lineup, '壬')
    const pa = (result: string, pitches: string[]) => { for (const c of pitches) s = addPitch(s, c); s = commitPA(s, defaultPlan(s, result)) }
    pa('一安', ['B', 'IP']); pa('全壘打', ['IP']); for (let k = 0; k < 6; k++) pa('三振', ['S', 'S', 'S'])
    useDataStore.setState({ base: { ...SEED_DATASET, games: [...SEED_DATASET.games, s.game], batting: [...SEED_DATASET.batting, ...s.batting], pitching: [...SEED_DATASET.pitching, ...s.pitching] } })
    at('/print/game/G20260301-01?side=us')
    const [sheet] = await screen.findAllByTestId('scoresheet', {}, { timeout: 4000 })
    expect(sheet.textContent).not.toContain('只畫上壘與得分')
    const lead = within(sheet).getAllByTestId('slot-row').find((r) => r.querySelector('td')!.textContent === '1')!
    expect(lead.querySelector('.pa-mark')!.textContent).toBe('1B')
    expect(lead.querySelector('.pa-count')!.textContent).toBe('1-0・2')
    // he came home on the home run: the path all the way round, home filled
    expect(lead.querySelector('polyline')!.getAttribute('points')!.split(' ')).toHaveLength(5)
    expect(lead.querySelector('polygon')!.getAttribute('fill')).toBe('#222')
  })

  it('puts each team\'s own errors on its row of the line score', async () => {
    const g = SEED_DATASET.games.find((x) => {
      if (x.status) return false
      const s = summarizeGame(SEED_DATASET, x)
      return s.errorsUs !== s.errorsOpp
    })!
    const s = summarizeGame(SEED_DATASET, g)
    at(`/print/game/${g.id}?side=us`)
    await screen.findAllByTestId('scoresheet', {}, { timeout: 4000 })
    const rows = within(screen.getByRole('table', { name: '局分表' })).getAllByRole('row').slice(1)
    const eOf = (name: string) => {
      const row = rows.find((r) => r.querySelector('td')!.textContent === name)!
      const cells = row.querySelectorAll('td')
      return Number(cells[cells.length - 1].textContent)
    }
    expect(eOf(TEAM_NAME)).toBe(s.errorsUs)
    expect(eOf(g.opponent)).toBe(s.errorsOpp)
  })

  it('calls the browser print once, and prints one team with ?side=us', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const { container } = at(`/print/game/${game.id}?side=us`)
    await screen.findAllByTestId('scoresheet', {}, { timeout: 4000 })
    expect(container.querySelectorAll('.paper')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '列印／存成 PDF' }))
    expect(print).toHaveBeenCalledTimes(1)
    print.mockRestore()
  })

  it('says so for a game that does not exist', async () => {
    at('/print/game/nope')
    expect(await screen.findByText('找不到這場比賽', {}, { timeout: 4000 })).toBeInTheDocument()
  })

  it('prints the totals: one row per batter with a plate appearance, plus the team', async () => {
    at('/print/stats')
    const table = await screen.findByTestId('print-batting', {}, { timeout: 4000 })
    const lines = battingLines(SEED_DATASET, SEED_DATASET.batting).filter((l) => l.pa >= 1)
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(lines.length + 1)
    expect(rows[rows.length - 1].textContent).toContain('全隊')
    // a portrait sheet never asks for 橫向
    expect(screen.queryByText(/橫向/)).toBeNull()
    expect(screen.getByText(/列印設定請選『直向』/)).toBeInTheDocument()
  })

  it('sorts by plate appearances with ?sort=pa', async () => {
    at('/print/stats?sort=pa')
    const table = await screen.findByTestId('print-batting', {}, { timeout: 4000 })
    const most = [...battingLines(SEED_DATASET, SEED_DATASET.batting)].sort((a, b) => b.pa - a.pa)[0]
    expect(within(table).getAllByRole('row')[1].textContent).toContain(most.name)
  })

  it('asks for a lineup first, and prints two cards with ?copies=2', async () => {
    at('/print/lineup')
    expect(await screen.findByText('這台裝置還沒有排好的陣容', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去排先發陣容' })).toBeInTheDocument()
    cleanup()
    const names = SEED_DATASET.roster.slice(0, 9).map((p) => p.name)
    const field = { P: names[0], C: names[1], '1B': names[2], '2B': names[3], '3B': names[4], SS: names[5], LF: names[6], CF: names[7], RF: names[8] }
    act(() => writeLineup(autoOrder({ ...emptyLineup(), field, updatedAt: '2026-10-09T00:00:00Z' })))
    at('/print/lineup?copies=2')
    expect(await screen.findAllByTestId('lineup-card', {}, { timeout: 4000 })).toHaveLength(2)
    expect(screen.getAllByText('先發名單')).toHaveLength(2)
  })
})
