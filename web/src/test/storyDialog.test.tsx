import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StoryDialog } from '../components/ui/StoryDialog'
import { useDataStore } from '../store/data'
import { SEED_DATASET } from '../data/seed'
import { DEFAULT_FILTERS } from '../data/types'
import { battingLines, pitchingLines } from '../data/stats'
import { storyPlayers } from '../data/storyCard'

const game = SEED_DATASET.games[0]
const hitter = battingLines(SEED_DATASET, SEED_DATASET.batting.filter((p) => p.gameId === game.id)).sort((a, b) => b.pa - a.pa)[0].name
const pitcher = pitchingLines(SEED_DATASET.pitching.filter((p) => p.gameId === game.id), [game]).sort((a, b) => b.outs - a.outs)[0].name
const show = (props: { player?: string; gameId?: string }) => render(<MemoryRouter><StoryDialog open onClose={() => undefined} {...props} /></MemoryRouter>)
const headline = () => screen.getByLabelText('亮點文字（可以自己改）') as HTMLTextAreaElement

describe('分享限時動態', () => {
  beforeAll(() => { HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext })
  beforeEach(() => { useDataStore.setState({ base: SEED_DATASET, demo: false, filters: DEFAULT_FILTERS }) })
  afterEach(() => cleanup())

  it('球員頁: his kinds of card, his games, and a sentence he can reword and put back', () => {
    show({ player: hitter })
    const dlg = screen.getByRole('dialog', { name: '分享限時動態' })
    expect(within(dlg).getByRole('tab', { name: '單場打擊' })).toHaveAttribute('aria-selected', 'true')
    expect(within(dlg).getByRole('tab', { name: '本季打擊' })).toBeInTheDocument()
    const auto = headline().value
    expect(auto).toMatch(/打數 \d+ 安打/)
    fireEvent.change(headline(), { target: { value: '第五局追平的一棒' } })
    expect(headline().value).toBe('第五局追平的一棒')
    expect(within(dlg).getByRole('img').getAttribute('aria-label')).toContain('第五局追平的一棒')
    fireEvent.click(within(dlg).getByRole('button', { name: /還原/ }))
    expect(headline().value).toBe(auto)
    // another kind of card starts from its own sentence
    fireEvent.change(headline(), { target: { value: '自己寫的' } })
    fireEvent.click(within(dlg).getByRole('tab', { name: '本季打擊' }))
    expect(headline().value).toMatch(/^\d+ 場 \d+ 打數/)
    expect(within(dlg).getByRole('button', { name: '下載圖片' })).toBeEnabled()
    expect(within(dlg).getByLabelText('選照片')).toHaveAttribute('accept', 'image/*')
  })

  it('比賽頁: pick any of our players in that game; a pitcher gets 單場投球', () => {
    show({ gameId: game.id })
    const dlg = screen.getByRole('dialog', { name: '分享限時動態' })
    const pick = within(dlg).getByLabelText('球員') as HTMLSelectElement
    expect([...pick.options].map((o) => o.value)).toEqual(storyPlayers(SEED_DATASET, game.id))
    fireEvent.change(pick, { target: { value: pitcher } })
    fireEvent.click(within(dlg).getByRole('tab', { name: '單場投球' }))
    expect(headline().value).toMatch(/局 \d+ 三振/)
    // (one game only: no game picker)
    expect(within(dlg).queryByLabelText('比賽')).toBeNull()
  })

  it('says so when there is nothing to make a card from', () => {
    show({ player: '沒上過場的人' })
    expect(screen.getByText('這位球員還沒有可以做成卡片的紀錄。')).toBeInTheDocument()
  })
})
