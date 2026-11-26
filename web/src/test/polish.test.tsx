/**
 * 2026-11-25 (3), the look: a card's explanation folds behind its ⓘ, 總覽 opens with the team's name and its real
 * record (開場形象區), 本季看點 has its dots, a long page has its 區塊快捷鈕, and 選球紀律 lists the batters by 打席.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useDataStore } from '../store/data'
import { SEED_DATASET } from '../data/seed'
import { Card } from '../components/ui/Card'
import { SectionNav } from '../components/layout/SectionNav'
import { StoryRow } from '../components/ui/SeasonHero'
import { OverviewPage } from '../pages/Overview'
import { TEAM } from '../config/team'
import type { Story } from '../data/stories'

afterEach(cleanup)

describe('a card and its ⓘ', () => {
  it('keeps the explanation folded until the ⓘ is pressed, and folds it again', () => {
    render(<Card still title="打擊成績" subtitle="點欄位標題排序">表格</Card>)
    const note = screen.getByText('點欄位標題排序')
    const button = screen.getByRole('button', { name: '看打擊成績的說明' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(note).toHaveClass('hidden')
    // printing shows every note
    expect(note).toHaveClass('print:block')
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: '收起打擊成績的說明' })).toHaveAttribute('aria-expanded', 'true')
    expect(note).not.toHaveClass('hidden')
    expect(button.getAttribute('aria-controls')).toBe(note.id)
    fireEvent.click(button)
    expect(note).toHaveClass('hidden')
  })
  it('has no ⓘ without an explanation, and opens with it shown when asked (a warning)', () => {
    render(<><Card still title="A">x</Card><Card still title="戰報摘要" subtitle="這場有 2 項待核對" noteOpen>y</Card></>)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByText('這場有 2 項待核對')).not.toHaveClass('hidden')
  })
})

describe('總覽 opens with the team', () => {
  beforeEach(() => { localStorage.clear(); useDataStore.setState({ base: SEED_DATASET, demo: false }); useDataStore.getState().resetFilters() })
  it('names the team in the page heading and shows its real record', () => {
    render(<MemoryRouter><OverviewPage /></MemoryRouter>)
    const hero = screen.getByRole('region', { name: '球季概況' })
    expect(within(hero).getByRole('heading', { level: 1, name: TEAM.org })).toBeInTheDocument()
    expect(within(hero).getByLabelText(/^戰績 \d+ 勝 \d+ 敗/)).toBeInTheDocument()
    // no scroll cue, and the stitches stay with the page titles
    expect(within(hero).queryByText(/捲動|往下滑|scroll/i)).toBeNull()
  })
})

describe('本季看點 and its dots', () => {
  const stories: Story[] = [1, 2, 3].map((i) => ({ id: `s${i}`, kicker: `看點 ${i}`, text: `第 ${i} 則` }) as unknown as Story)
  it('one dot per story, the first one marked', () => {
    render(<MemoryRouter><StoryRow stories={stories} /></MemoryRouter>)
    const dots = screen.getByRole('group', { name: '看點：第 1 則，共 3 則' })
    expect(within(dots).getAllByRole('button')).toHaveLength(3)
    expect(within(dots).getByRole('button', { name: '第 1 則' })).toHaveAttribute('aria-current', 'true')
  })
  it('no dots for a single story', () => {
    render(<MemoryRouter><StoryRow stories={stories.slice(0, 1)} /></MemoryRouter>)
    expect(screen.queryByRole('group')).toBeNull()
  })
})

describe('區塊快捷鈕', () => {
  it('lists only the sections that are on the page, and jumps to one', () => {
    const jumped: string[] = []
    Element.prototype.scrollIntoView = function () { jumped.push((this as Element).id) }
    render(<><SectionNav items={[{ id: 'a', label: '領先者' }, { id: 'b', label: '成績表' }, { id: 'gone', label: '圖表' }]} /><div id="a" /><div id="b" /></>)
    const nav = screen.getByRole('navigation', { name: '本頁區塊' })
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['領先者', '成績表'])
    fireEvent.click(within(nav).getByRole('button', { name: '成績表' }))
    expect(jumped).toEqual(['b'])
    expect(within(nav).getByRole('button', { name: '成績表' })).toHaveAttribute('aria-current', 'true')
  })
  it('stays away when there is nothing to choose between', () => {
    render(<><SectionNav items={[{ id: 'a', label: '領先者' }, { id: 'gone', label: '圖表' }]} /><div id="a" /></>)
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})

describe('2026-11-26: 球員卡 and 總覽 below the opening', () => {
  it('draws the jersey number behind the player card, hidden from screen readers, and nothing without a number', async () => {
    const { PlayerBackdrop } = await import('../components/ui/PlayerArt')
    const { container, rerender } = render(<PlayerBackdrop number="17" />)
    const back = container.firstElementChild as HTMLElement
    expect(back).toHaveAttribute('aria-hidden')
    expect(back.textContent).toBe('17')
    rerender(<PlayerBackdrop />)
    expect((container.firstElementChild as HTMLElement).textContent).toBe('')
  })
  it('a counting figure always reads as its real value', async () => {
    const { RollingNumber } = await import('../components/motion/RollingNumber')
    const { container } = render(<RollingNumber text=".314" onView />)
    // the wheels are decoration (aria-hidden); the value itself is always in the page
    expect(container.querySelector('.sr-only')?.textContent).toBe('.314')
  })
  it('總覽 has its three stretches after the opening, each with a line of real numbers', () => {
    localStorage.clear(); useDataStore.setState({ base: SEED_DATASET, demo: false, cloud: { ...useDataStore.getState().cloud, role: 'admin' } as never }); useDataStore.getState().resetFilters()
    render(<MemoryRouter><OverviewPage /></MemoryRouter>)
    for (const name of ['打擊摘要', '投球與守備摘要', '球季走勢']) expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    expect(screen.getByText(/^\d+ 分・\d+ 支安打・\d+ 次保送$/)).toBeInTheDocument()
    expect(screen.getByText(/^\d+ 失分・\d+ 次三振・\d+ 次失誤$/)).toBeInTheDocument()
  })
})
