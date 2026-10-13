/**
 * Batch 13 (local mode): the shared list of games being recorded (hooks/useLiveGames.ts) reads this device's draft;
 * while it is live the game page, the game cards and the overview say 「比賽進行中」 instead of 勝／敗, and the team
 * record leaves it out; once the draft is gone (結束比賽／放棄) the result is back.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { refreshLiveGames, resetLiveGames, useLiveGames } from '../hooks/useLiveGames'
import { useStats } from '../hooks/useStats'
import { DRAFT_KEY, PRACTICE_KEY, writeDraft } from '../record/draft'
import { newGame, type RecordState } from '../record/model'
import { useDataStore } from '../store/data'
import { GameView } from '../pages/GameView'
import { GameCard } from '../components/ui/GameCard'
import { SeasonHero } from '../components/ui/SeasonHero'
import { Scoresheet } from '../components/print/Scoresheet'
import { buildScoresheet } from '../data/scoresheet'
import { teamSummary } from '../data/stats'
import { summarizeGame } from '../data/stats'
import { liveGameIds } from '../data/liveGames'
import { TEAM_NAME } from '../data/seed'
import { DEFAULT_FILTERS, EMPTY_DATASET, type BattingPA, type Dataset, type Game, type PitchingPA } from '../data/types'

const NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬']
const game = (id: string, date: string): Game => ({ id, date, tournament: '系際盃', opponent: '對手', homeAway: '客', innings: 7 })
const DONE = game('G20261006-01', '2026-10-06')
const LIVE = game('G20261013-01', '2026-10-13')
const b = (gameId: string, run: number): BattingPA => ({ gameId, inning: 1, batter: '甲', order: 1, pitches: ['IP'], result: run ? '全壘打' : '內滾', code: run ? undefined : 'I', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run, rbi: run })
const p = (gameId: string, code: string): PitchingPA => ({ gameId, inning: 1, pitcher: '壬', oppOrder: 1, pitches: ['IP'], result: code === 'R' ? '一安' : '內滾', code, sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 })
// a 1:0 win, and the game being recorded: we lead 2:1 in the 1st
const ds: Dataset = { ...EMPTY_DATASET, games: [DONE, LIVE], batting: [b(DONE.id, 1), b(LIVE.id, 1), b(LIVE.id, 1)], pitching: [p(DONE.id, 'I'), p(LIVE.id, 'R')] }
const recording = (patch: Partial<RecordState> = {}): RecordState => ({ ...newGame(LIVE, NAMES.map((name) => ({ name, pos: 'DH' })), '壬'), ...patch })

function Probe() {
  const { drafts } = useLiveGames()
  const s = useStats()
  return <div data-testid="probe">{drafts.map((d) => d.state.game.id).join(',')}|{s.summary.w}-{s.summary.l}-{s.summary.t}|{s.summary.live}</div>
}
const probe = () => screen.getByTestId('probe').textContent
const page = () => render(<MemoryRouter><GameView summary={summarizeGame(ds, LIVE)} mode="page" onClose={() => undefined} /></MemoryRouter>)

beforeEach(() => {
  localStorage.clear()
  resetLiveGames()
  useDataStore.setState({ base: ds, demo: false, filters: DEFAULT_FILTERS, albums: [], albumsSupported: true })
})
afterEach(() => { cleanup(); writeDraft(null); writeDraft(null, PRACTICE_KEY); resetLiveGames() })

describe('the list of games in progress (this device)', () => {
  it('an unfinished draft is live; the team record leaves it out', () => {
    writeDraft(recording())
    render(<MemoryRouter><Probe /></MemoryRouter>)
    expect(probe()).toBe(`${LIVE.id}|1-0-0|1`)
    expect(liveGameIds().has(LIVE.id)).toBe(true)
  })
  it('a finished draft, a practice, or a draft untouched for 13 hours is not', () => {
    writeDraft(recording({ finished: true }))
    const { unmount } = render(<MemoryRouter><Probe /></MemoryRouter>)
    expect(probe()).toBe('|2-0-0|0')
    unmount()
    writeDraft(null)
    writeDraft(recording({ practice: true }), PRACTICE_KEY)
    render(<MemoryRouter><Probe /></MemoryRouter>)
    expect(probe()).toBe('|2-0-0|0')
    cleanup()
    const old = new Date(Date.now() - 13 * 3600_000).toISOString()
    writeDraft(recording({ startedAt: old, updatedAt: old }))
    render(<MemoryRouter><Probe /></MemoryRouter>)
    expect(probe()).toBe('|2-0-0|0')
  })
  it('follows the draft: discarded, the game counts again on the next refresh', async () => {
    writeDraft(recording())
    render(<MemoryRouter><Probe /></MemoryRouter>)
    expect(probe()).toBe(`${LIVE.id}|1-0-0|1`)
    writeDraft(null)
    await act(() => refreshLiveGames())
    expect(probe()).toBe('|2-0-0|0')
    // another tab of this browser started one: the storage event reads it
    act(() => { writeDraft(recording()); window.dispatchEvent(new StorageEvent('storage', { key: DRAFT_KEY })) })
    expect(probe()).toBe(`${LIVE.id}|1-0-0|1`)
  })
})

describe('比賽進行中 where 勝／敗 would be', () => {
  it('the game page: the badge, a link to 即時比分, the score as it stands; 勝 again once finished', async () => {
    writeDraft(recording())
    page()
    const head = screen.getByRole('heading', { level: 2 })
    expect(within(head).getByText('比賽進行中')).toBeTruthy()
    expect(within(head).queryByText('勝')).toBeNull()
    expect(within(head).queryByText('敗')).toBeNull()
    expect(head.textContent).toContain('2:1')
    expect(screen.getByRole('link', { name: '看即時比分' }).getAttribute('href')).toBe('/live')
    // the recap says so too
    expect(screen.getByText(`比賽還在進行，目前 ${TEAM_NAME} 2:1 對手。`, { exact: false })).toBeTruthy()
    // 結束比賽: the draft is gone
    writeDraft(null)
    await act(() => refreshLiveGames())
    expect(within(head).getByText('勝')).toBeTruthy()
    expect(within(head).queryByText('比賽進行中')).toBeNull()
    expect(screen.queryByRole('link', { name: '看即時比分' })).toBeNull()
  })
  it('a game card: 比賽進行中, no 勝／敗 plate', () => {
    writeDraft(recording())
    render(<MemoryRouter><Probe /></MemoryRouter>)
    render(<GameCard s={summarizeGame(ds, LIVE)} teamName="我隊" onOpen={() => undefined} />)
    const card = screen.getByRole('button', { name: /看這場/ })
    expect(card.getAttribute('aria-label')).toBe('2026-10-13 我隊 2 比 1 對手，比賽進行中，目前比分，看這場')
    expect(within(card).getByText('比賽進行中')).toBeTruthy()
    expect(within(card).queryByText('勝')).toBeNull()
    cleanup()
    render(<GameCard s={summarizeGame(ds, DONE)} teamName="我隊" onOpen={() => undefined} />)
    expect(within(screen.getByRole('button', { name: /看這場/ })).getByText('勝')).toBeTruthy()
  })

  it('the innings not reached yet stay blank (game card, game page, scoresheet), not 0', () => {
    writeDraft(recording())
    render(<MemoryRouter><Probe /></MemoryRouter>)
    // LIVE: 7 innings scheduled, both sides have batted in the 1st only
    const s = summarizeGame(ds, LIVE)
    render(<GameCard s={s} teamName="我隊" onOpen={() => undefined} />)
    const card = screen.getByRole('button', { name: /看這場/ })
    const rows = card.querySelectorAll('[aria-hidden] > div.grid')
    // header row + two teams; each team: 7 innings, a spacer, R H E
    expect([...rows[1].children].slice(0, 7).map((c) => c.textContent)).toEqual(['2', '', '', '', '', '', ''])
    expect([...rows[2].children].slice(0, 7).map((c) => c.textContent)).toEqual(['1', '', '', '', '', '', ''])
    cleanup()
    render(<MemoryRouter><Probe /></MemoryRouter>)
    page()
    const board = screen.getAllByRole('table')[0]
    // (the team name is the row's th; the tds are the innings, then R H E)
    const cells = (name: string) => [...within(board).getByText(name, { exact: false }).closest('tr')!.querySelectorAll('td')].slice(0, 7).map((c) => c.textContent)
    expect(cells(TEAM_NAME)).toEqual(['2', '', '', '', '', '', ''])
    cleanup()
    // the printed scoresheet: line score and the per-inning totals stop at the 1st
    const sheet = buildScoresheet(ds.batting.filter((r) => r.gameId === LIVE.id), 'bat', { innings: 7 })
    render(<Scoresheet game={LIVE} summary={s} side="us" sheet={sheet} />)
    const totals = [...screen.getAllByText('得分 R').find((el) => el.tagName === 'TD')!.closest('tr')!.querySelectorAll('td')].slice(1, 8).map((c) => c.textContent)
    expect(totals).toEqual(['2', '', '', '', '', '', ''])
  })
  it('the overview: the record, the run differential and the runs beside it count the finished games only', () => {
    writeDraft(recording())
    render(<MemoryRouter><Probe /></MemoryRouter>)
    const ss = [summarizeGame(ds, DONE), summarizeGame(ds, LIVE)]
    render(<MemoryRouter><SeasonHero summary={teamSummary(ss)} summaries={ss} stories={[]} title="系隊" /></MemoryRouter>)
    const hero = screen.getByRole('region', { name: '球季概況' })
    expect(within(hero).getByLabelText('戰績 1 勝 0 敗')).toBeTruthy()
    // 1:0 win only (the live 2:1 is left out): +1, 1 / 0
    expect(within(hero).getByText('+1')).toBeTruthy()
    expect(within(hero).getByText('得分／失分').nextElementSibling!.textContent).toBe('1/0')
    // the 近 N 場 chip of the live game: 進行中 in the small box, the full words in its label
    const chip = within(hero).getByRole('link', { name: `${LIVE.date} vs 對手 比賽進行中，目前 2：1` })
    expect(chip.textContent).toBe('進行中2:1')
    expect(chip.className).toContain('w-11')
  })
})
