/**
 * The game page (GameView, page mode) on one synthetic game in local mode: pitchers in the order they pitched with
 * their 勝敗 marks, the 逐球 filter chips and count wording, the 分享 panel (copy and the manual-copy fallback),
 * the 影片 header button, and the 攻守成績 tab's 對方打擊 and 歷來對 cards.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { useDataStore } from '../store/data'
import { GameView } from '../pages/GameView'
import { PhotosPage } from '../pages/Photos'
import { summarizeGame } from '../data/stats'
import { VIDEO_TITLE } from '../data/albums'
import { EMPTY_DATASET, type BattingPA, type Dataset, type Game, type PitchingPA } from '../data/types'

const game: Game = { id: 'G1', date: '2026-10-03', tournament: '友誼賽', opponent: '測試隊', homeAway: '主', innings: 7, winningPitcher: '甲', holds: ['乙'] }
const b = (inning: number, order: number, batter: string, result: string, p: Partial<BattingPA> = {}): BattingPA => ({ gameId: 'G1', inning, order, batter, pitches: ['IP'], result, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
const p = (inning: number, pitcher: string, result: string, code?: string, oppOrder = 1): PitchingPA => ({ gameId: 'G1', inning, pitcher, oppOrder, pitches: result === '三振' ? ['S', 'S', 'S'] : ['IP'], result, code, sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 })
const outs = (inning: number, pitcher: string) => [p(inning, pitcher, '內滾', 'I'), p(inning, pitcher, '三振', 'II'), p(inning, pitcher, '內飛', 'III')]

// 甲 starts and gets 6 outs; 乙 relieves for 15 (more outs than the starter); 3–5
const pitching: PitchingPA[] = [
  p(1, '甲', '全壘打', 'ER'), ...outs(1, '甲'), ...outs(2, '甲'),
  ...outs(3, '乙'), p(4, '乙', '全壘打', 'ER', 4), p(4, '乙', '全壘打', 'ER', 5), ...outs(4, '乙'), ...outs(5, '乙'), ...outs(6, '乙'), ...outs(7, '乙'),
]
const batting: BattingPA[] = [
  b(1, 1, '子', '全壘打', { pitches: ['B', 'CS', 'IP'], run: 1, rbi: 1, loc: 8, traj: 'F' }), b(1, 2, '丑', '內滾', { code: 'I' }), b(1, 3, '寅', '三振', { pitches: ['S', 'S', 'S'], code: 'II' }), b(1, 4, '卯', '內飛', { code: 'III' }),
  b(2, 5, '辰', '一安', { run: 1, loc: 7 }), b(2, 6, '巳', '保送', { pitches: ['B', 'B', 'B', 'B'], run: 1 }), b(2, 7, '午', '一安', { run: 1, loc: 9 }), b(2, 8, '未', '全壘打', { run: 1, rbi: 4, loc: 7 }),
  b(2, 9, '申', '內滾', { code: 'I' }), b(2, 1, '子', '三振', { pitches: ['S', 'S', 'S'], code: 'II' }), b(2, 2, '丑', '內飛', { code: 'III' }),
]
const ds: Dataset = { ...EMPTY_DATASET, games: [game], batting, pitching }

function show() {
  return render(<MemoryRouter><GameView summary={summarizeGame(ds, game)} mode="page" onClose={() => undefined} /></MemoryRouter>)
}
const tableWith = (header: string) => screen.getAllByRole('table').find((t) => [...t.querySelectorAll('th')].some((th) => th.textContent?.trim() === header))!

describe('the game page', () => {
  beforeEach(() => {
    localStorage.clear()
    useDataStore.setState({ base: ds, demo: false, albums: [], albumsSupported: true })
  })
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('lists pitchers in the order they pitched, with 勝敗 in its own column', () => {
    show()
    expect(summarizeGame(ds, game)).toMatchObject({ runsUs: 5, runsOpp: 3 })
    const t = tableWith('投手')
    const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent?.trim())
    const rows = [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()))
    expect(rows.map((r) => r[0])).toEqual(['甲', '乙'])
    const col = heads.indexOf('勝敗')
    expect(col).toBeGreaterThan(0)
    expect(rows[0][col]).toBe('勝')
    expect(rows[1][col]).toBe('中繼')
    expect(rows[1][heads.indexOf('IP')]).toBe('5.0')
  })

  it('逐球: the 全壘打 chip leaves only the home runs; results read with the count before them', () => {
    show()
    fireEvent.click(screen.getByRole('tab', { name: /逐球・打擊/ }))
    const chips = screen.getByRole('tablist', { name: '篩選打席' })
    expect(within(chips).getByRole('tab', { name: /得分/ })).toBeInTheDocument()
    expect(within(chips).queryByRole('tab', { name: /強勁擊球/ })).toBeNull()
    fireEvent.click(within(chips).getByRole('tab', { name: /全壘打/ }))
    expect(screen.getByText('只顯示：全壘打（2 個打席）')).toBeInTheDocument()
    const t = tableWith('打者')
    const rows = [...t.querySelectorAll('tbody tr')].filter((tr) => tr.querySelectorAll('td').length > 1)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => /全壘打/.test(r.textContent ?? ''))).toBe(true)
    expect(rows[0].textContent).toContain('1-1 後')
    expect(rows[0].textContent).toContain('中外野全壘打')
  })

  it('分享: shows the exact text and copies it, or selects it when the browser blocks copying', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    show()
    fireEvent.click(screen.getByRole('button', { name: '分享' }))
    const box = screen.getByLabelText('要分享的文字') as HTMLTextAreaElement
    expect(box.value).toContain('5:3')
    expect(box.value).toContain('/games/G1')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '複製文字' })) })
    expect(writeText).toHaveBeenCalledWith(box.value)
    expect(screen.getByText('已複製，可以貼到 LINE 群組')).toBeInTheDocument()
    writeText.mockRejectedValueOnce(new Error('blocked'))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '複製文字' })) })
    expect(screen.getByText('這個瀏覽器不讓網站自動複製：文字已選取，請長按選「拷貝」')).toBeInTheDocument()
    // 複製連結 blocked: only the link is put up and selected, not the whole report
    writeText.mockRejectedValueOnce(new Error('blocked'))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '複製連結' })) })
    const link = screen.getByLabelText('這場比賽的連結') as HTMLInputElement
    expect(link.value).toMatch(/\/games\/G1$/)
    expect(link.value).not.toContain('5:3')
    expect(document.activeElement).toBe(link)
    expect([link.selectionStart, link.selectionEnd]).toEqual([0, link.value.length])
    expect(screen.getByText(/連結已選取/)).toBeInTheDocument()
  })

  it('a game video: the header 影片 button opens it, and it is not counted as a 相簿', () => {
    useDataStore.setState({ albums: [{ id: 'a1', gameId: 'G1', title: VIDEO_TITLE, url: 'https://youtu.be/abc', note: '上半場', updatedAt: '2026-10-03T12:00:00Z' }] })
    show()
    const video = screen.getAllByRole('link').find((a) => a.textContent === '影片')!
    expect(video).toHaveAttribute('href', 'https://youtu.be/abc')
    expect(video).toHaveAttribute('target', '_blank')
    expect(screen.queryAllByRole('link').some((a) => a.textContent?.startsWith('相簿'))).toBe(false)
    expect(screen.getByText('比賽影片（上半場）')).toBeInTheDocument()
  })

  it('攻守成績: 對方打擊 with a 合計 row equal to the line score, and 歷來對 the opponent', () => {
    show()
    fireEvent.click(screen.getByRole('tab', { name: '攻守成績' }))
    expect(screen.getByText('對方打擊')).toBeInTheDocument()
    const t = tableWith('對方打者')
    const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent?.trim())
    const foot = [...t.querySelectorAll('tfoot td, tfoot th')].map((td) => td.textContent?.trim())
    expect(foot[0]).toBe('合計')
    expect(foot[heads.indexOf('R')]).toBe('3')
    expect(foot[heads.indexOf('H')]).toBe('3')
    expect(screen.getByText('這場沒有記對方姓名，以棒次代替（同一棒的代打會合在一起）')).toBeInTheDocument()
    expect(screen.getByText('歷來對 測試隊')).toBeInTheDocument()
    expect(screen.getByText('比賽附註')).toBeInTheDocument()
  })

  it('逐局表: remembered on this device', () => {
    show()
    fireEvent.click(screen.getAllByRole('tab', { name: '逐局表' })[0])
    expect(localStorage.getItem('bafin.gameBox.v1')).toBe('grid')
    const t = tableWith('球員')
    expect(t.textContent).toContain('中全壘打①')
    expect(t.textContent).toContain('左全壘打④')
    cleanup()
    show()
    expect(screen.getAllByRole('tab', { name: '逐局表' })[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('相簿 → 新增: a pasted video link turns the form into a video form, title included', () => {
    const canEdit = useDataStore.getState().canEdit
    useDataStore.setState({ canEdit: () => true })
    onTestFinished(() => useDataStore.setState({ canEdit }))
    render(<MemoryRouter><PhotosPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: '新增相簿連結' }))
    expect(screen.getAllByText('新增相簿連結').length).toBeGreaterThan(1)
    fireEvent.change(screen.getByPlaceholderText('https://drive.google.com/drive/folders/…'), { target: { value: 'https://vimeo.com/123' } })
    expect(screen.getByText('新增影片連結')).toBeInTheDocument()
    expect(screen.getByText('影片連結')).toBeInTheDocument()
  })
})
