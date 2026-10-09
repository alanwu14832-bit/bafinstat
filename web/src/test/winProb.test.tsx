import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GamePage } from '../pages/GamePage'
import { useDataStore } from '../store/data'
import { SEED_DATASET } from '../data/seed'
import { wpaTitle } from '../components/ui/PlayByPlay'
import { signedPtsBetween } from '../lib/fmt'
import type { RowWin } from '../data/winTimeline'

describe('獲勝機率 on a game page', () => {
  it('shows the chart card with its disclaimer, at most 5 key plays as a list, and still one 打者 table', () => {
    useDataStore.setState({ base: SEED_DATASET, demo: false })
    render(
      <MemoryRouter initialEntries={['/games/G20251010-01']}>
        <Routes><Route path="/games/:id" element={<GamePage />} /></Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('獲勝機率走勢')).toBeInTheDocument()
    expect(screen.getAllByText(/描述這場發生了什麼，不代表預測能力/).length).toBeGreaterThan(0)
    const key = screen.getByText('本場關鍵 5 打席').closest('section')!
    const items = within(key).getAllByRole('listitem')
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThanOrEqual(5)
    expect(key.querySelector('table')).toBeNull()
    // the game simulations find the box score by its header: still exactly one table with a th 打者
    const tables = [...document.querySelectorAll('table')].filter((t) => [...t.querySelectorAll('th')].some((th) => th.textContent?.trim() === '打者'))
    expect(tables).toHaveLength(1)
    // the box score gained a WPA column
    expect([...tables[0].querySelectorAll('th')].some((th) => th.textContent?.includes('WPA'))).toBe(true)
  })
  it('the 逐球 tabs say it too: in the card subtitle and on the WPA column', () => {
    useDataStore.setState({ base: SEED_DATASET, demo: false })
    render(
      <MemoryRouter initialEntries={['/games/G20251010-01']}>
        <Routes><Route path="/games/:id" element={<GamePage />} /></Routes>
      </MemoryRouter>,
    )
    for (const tab of [/逐球・打擊/, /逐球・投球/]) {
      fireEvent.click(screen.getByRole('tab', { name: tab }))
      expect(screen.getByText(/；WPA 描述這場發生了什麼，不代表預測能力/)).toBeInTheDocument()
      const th = [...document.querySelectorAll('th')].find((x) => x.textContent === 'WPA')!
      expect(th.getAttribute('title')).toContain('描述這場發生了什麼，不代表預測能力')
    }
  })
})

describe('the numbers next to each other add up', () => {
  it('a change between two rounded percents is their difference', () => {
    // 0.904 → 0.826 is −7.8 points, but reads 90% → 83%: the change shown is −7%
    expect(signedPtsBetween(0.904, 0.826)).toBe('−7%')
    expect(signedPtsBetween(0.355, 0.414)).toBe('+5%')
    expect(signedPtsBetween(0.501, 0.504)).toBe('0%')
  })
  it('the 逐球 hover: before → after, the running and the result in between, and the plays after it', () => {
    const w: RowWin = { wpa: 0.1149, re24: 0, li: 1, weBefore: 0.4549, weResult: 0.4849, weAfter: 0.6, weEnd: 0.6, runWpa: 0.0302, runRe24: 0, approx: false }
    expect(wpaTitle(w)).toBe('打席前 45% → 打席後 60%；其中跑壘 +3%、打擊結果 +12%。描述這場發生了什麼，不代表預測能力。')
    expect(wpaTitle({ ...w, weBefore: 0.4849, weEnd: 0.21 })).toBe('打席前 48% → 打席後 60%；之後的跑壘 −39%（下一位打者還沒打完就結束了）。描述這場發生了什麼，不代表預測能力。')
  })
})
