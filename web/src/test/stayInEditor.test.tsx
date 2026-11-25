/**
 * 2026-11-25: 修改資料 stays open after 儲存修改 (at the same tab and plate appearance), says it was saved, and 結束修改 goes back;
 * 即時比分 shows the 球速 (each pitch, the last one, the pitcher's fastest) lit 黃 at 125–134 and 紅 at 135 and up;
 * the 打擊 page's 擊球強度 is a 強擊率 (Hard Hit%) bar chart.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GameView } from '../pages/GameView'
import { LivePage } from '../pages/Live'
import { BattingPage } from '../pages/Batting'
import { writeDraft } from '../record/draft'
import { addPitch, newGame } from '../record/model'
import { useDataStore } from '../store/data'
import { summarizeGame } from '../data/stats'
import { speedFacts, speedTone } from '../data/speeds'
import { DEFAULT_FILTERS, EMPTY_DATASET, type BattingPA, type Dataset, type Game } from '../data/types'
import { SEED_DATASET } from '../data/seed'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
afterEach(() => { cleanup(); writeDraft(null) })

describe('球速 colours', () => {
  it('125–134 黃, 135 and up 紅, slower plain', () => {
    expect([124, 125, 134, 135, 150, null].map(speedTone)).toEqual([null, 'quick', 'quick', 'fast', 'fast', null])
    expect(speedFacts([{ pitches: ['S', 'B'], speeds: [131, 136] }, { pitches: ['B', 'S'], speeds: [128, null] }])).toEqual({ max: 136, last: 128 })
    expect(speedFacts([{ pitches: ['S'] }])).toEqual({ max: null, last: null })
  })
})

describe('即時比分: 球速', () => {
  it('each pitch of the plate appearance with its speed, the last one and the pitcher\'s fastest today', async () => {
    const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name) => ({ name, pos: 'DH' }))
    // 主: they bat first, our 壬 pitches
    let s = newGame({ id: 'G20261125-01', date: '2026-11-25', tournament: '練習', opponent: '對手', homeAway: '主', innings: 7 }, lineup, '壬')
    s = addPitch(addPitch(addPitch(s, 'S'), 'B'), 'F')
    writeDraft({ ...s, speedOn: { us: true }, speeds: [136, null, 129] })
    useDataStore.setState({ base: EMPTY_DATASET })
    render(<MemoryRouter><LivePage /></MemoryRouter>)
    await screen.findByText('本打席')
    const fast = screen.getAllByText('136').find((e) => e.getAttribute('aria-label') === '136 公里')!
    expect(fast).toBeTruthy()
    expect(screen.getByText('最快')).toBeTruthy()
    const row = screen.getByText('本打席', { selector: 'span' }).parentElement!
    expect(row.textContent).toContain('129km/h')       // the last pitch measured
    expect(fast.getAttribute('style')).toContain('rgb(255, 90, 79)')   // 紅
    const mid = within(row).getAllByText('129').find((e) => e.getAttribute('aria-label') === '129 公里')!
    expect(mid.getAttribute('style')).toContain('rgb(246, 207, 62)')   // 黃
  })
})

describe('修改資料: stays open after saving', () => {
  const game: Game = { id: 'G1', date: '2026-10-03', tournament: '友誼賽', opponent: '測試隊', homeAway: '主', innings: 7 }
  const b = (order: number, batter: string, result: string, p: Partial<BattingPA> = {}): BattingPA => ({ gameId: 'G1', inning: 1, outsBefore: order - 1, basesBefore: '無', order, batter, pitches: ['IP'], result, loc: 6, traj: 'G', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
  const ds: Dataset = { ...EMPTY_DATASET, roster: [{ name: '子' }, { name: '丑' }, { name: '寅' }], games: [game], batting: [b(1, '子', '內滾', { code: 'I' }), b(2, '丑', '內滾', { code: 'II' }), b(3, '寅', '內滾', { code: 'III' })] }
  it('儲存修改 keeps the editor on the same plate appearance; 結束修改 goes back to the game page', async () => {
    localStorage.clear()
    useDataStore.setState({ base: ds, demo: false, albums: [], albumsSupported: true })
    render(<MemoryRouter><GameView summary={summarizeGame(ds, game)} mode="page" onClose={() => undefined} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: '修改資料' }))
    fireEvent.click(screen.getByRole('button', { name: /^修改第 2 個打席/ }))
    fireEvent.click(screen.getByRole('button', { name: /^內飛$/ }))
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await wait(80)
    expect(useDataStore.getState().base.batting[1].result).toBe('內飛')
    // still editing, the same plate appearance open, nothing left unsaved
    expect(screen.getByRole('button', { name: '儲存修改' })).toBeTruthy()
    // (this game has no 守備紀錄, so the save comes with a note to check: the bar points at it)
    expect(screen.getByText(/^已儲存，(可以繼續修改|請看上方的提醒)$/)).toBeTruthy()
    // (the panel of the plate appearance being fixed is open again: 丑's, now 內飛)
    expect(screen.getByRole('button', { name: '刪除這個打席' })).toBeTruthy()
    expect(screen.getAllByText('丑').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /^內飛$/ }).getAttribute('aria-pressed')).toBe('true')
    // a second change on the next one, saved again
    fireEvent.click(screen.getByRole('button', { name: '下一個' }))
    fireEvent.click(screen.getByRole('button', { name: /^外飛$/ }))
    expect(screen.getByText(/處修改還沒儲存/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await wait(80)
    expect(useDataStore.getState().base.batting.map((p) => p.result)).toEqual(['內滾', '內飛', '外飛'])
    fireEvent.click(screen.getByRole('button', { name: '結束修改' }))
    expect(screen.queryByRole('button', { name: '儲存修改' })).toBeNull()
    expect(screen.getByRole('button', { name: '修改資料' })).toBeTruthy()
  })
})

describe('比賽頁 逐球紀錄: a tap opens 修改資料 on that plate appearance', () => {
  const game: Game = { id: 'G2', date: '2026-10-04', tournament: '友誼賽', opponent: '測試隊', homeAway: '主', innings: 7 }
  const b = (order: number, batter: string, result: string, p: Partial<BattingPA> = {}): BattingPA => ({ gameId: 'G2', inning: 1, outsBefore: order - 1, basesBefore: '無', order, batter, pitches: ['IP'], result, loc: 6, traj: 'G', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
  const ds: Dataset = { ...EMPTY_DATASET, roster: [{ name: '子' }, { name: '丑' }, { name: '寅' }], games: [game], batting: [b(1, '子', '內滾', { code: 'I' }), b(2, '丑', '外飛', { code: 'II', loc: 8, traj: 'F' }), b(3, '寅', '內滾', { code: 'III' })] }
  const show = () => render(<MemoryRouter><GameView summary={summarizeGame(ds, game)} mode="page" onClose={() => undefined} /></MemoryRouter>)
  const pbp = () => screen.getAllByRole('table').find((t) => t.textContent?.includes('本打席用球'))!
  it('a 紀錄員／管理者 (here: this device, local mode) taps 丑\'s row and edits it', async () => {
    localStorage.clear()
    useDataStore.setState({ base: ds, demo: false, albums: [], albumsSupported: true })
    show()
    fireEvent.click(screen.getByRole('tab', { name: /逐球・打擊/ }))
    fireEvent.click(within(pbp()).getAllByText('丑')[0])
    expect(await screen.findByRole('button', { name: '儲存修改' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '刪除這個打席' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^外飛$/ }).getAttribute('aria-pressed')).toBe('true')
  })
  it('anyone else: the rows do nothing', () => {
    localStorage.clear()
    useDataStore.setState({ base: ds, demo: false, albums: [], albumsSupported: true, cloud: { ...useDataStore.getState().cloud, configured: true, authReady: true, user: null, isEditor: false } })
    show()
    fireEvent.click(screen.getByRole('tab', { name: /逐球・打擊/ }))
    fireEvent.click(within(pbp()).getAllByText('丑')[0])
    expect(screen.queryByRole('button', { name: '儲存修改' })).toBeNull()
    expect(within(pbp()).getAllByText('丑')[0].closest('tr')?.getAttribute('tabindex')).toBeNull()
    useDataStore.setState({ cloud: { ...useDataStore.getState().cloud, configured: false } })
  })
})

describe('打擊: 強擊率', () => {
  it('a Hard Hit% bar per batter, highest first, with the team rate', () => {
    useDataStore.setState({ base: SEED_DATASET, demo: false, filters: DEFAULT_FILTERS })
    render(<MemoryRouter><BattingPage /></MemoryRouter>)
    expect(screen.getByText('強擊率 Hard Hit%')).toBeTruthy()
    expect(screen.getByText(/全隊 \d+\.\d%/)).toBeTruthy()
    expect(screen.queryByText('擊球強度')).toBeNull()
  })
})
