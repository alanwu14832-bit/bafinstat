/**
 * 即時比分's Box Score (batch 16): the 文字轉播｜Box Score switch (remembered per viewer), the four tables with the
 * batter at the plate marked and 投球中, the same numbers as the game page once the game is saved, and the phone
 * layout (the tables scroll inside the card with the name column pinned).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LivePage } from '../pages/Live'
import { GameView } from '../pages/GameView'
import { writeDraft } from '../record/draft'
import { addPitch, commitPA, defaultPlan, newGame, toGameEdit, type PAPlan, type RecordState } from '../record/model'
import { normalizeGameEdit } from '../data/edit'
import { battingLines, pitchingLines, summarizeGame } from '../data/stats'
import { useDataStore } from '../store/data'
import { EMPTY_DATASET, type Dataset, type Game } from '../data/types'
import { playGame, roster } from './simGame'

const NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬']
const GAME: Game = { id: 'G20261020-01', date: '2026-10-20', tournament: '系際盃', opponent: '對手', homeAway: '客', innings: 7 }
const start = () => newGame(GAME, NAMES.map((name, i) => ({ name, pos: ['SS', 'C', '1B', '2B', '3B', 'LF', 'CF', 'RF', 'P'][i] })), '壬')
const pitch = (s: RecordState, ps: string[]) => ps.reduce((a, p) => addPitch(a, p), s)
const pa = (s: RecordState, ps: string[], result: string, edit?: (p: PAPlan) => void) => { s = pitch(s, ps); const plan = defaultPlan(s, result); edit?.(plan); return commitPA(s, plan) }
const show = (s: RecordState, base: Dataset = EMPTY_DATASET) => {
  writeDraft(s)
  useDataStore.setState({ base })
  return render(<MemoryRouter><LivePage /></MemoryRouter>)
}
afterEach(() => { cleanup(); writeDraft(null); try { localStorage.removeItem('bafin.live.panel') } catch { /* none */ } })

const part = (title: string) => screen.getByRole('region', { name: title })
/** A table's body rows as text cells (the pinned cell: just the name). */
const rowsOf = (table: HTMLElement) => [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td, i) => (i === 0 ? td.querySelector('.font-medium')?.textContent ?? td.textContent : td.textContent)?.trim()))
const headsOf = (table: HTMLElement) => [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim())

// 1▲ (we are away): 甲 doubles, 乙 walks, 丙 singles 甲 home, 丁 strikes out; 戊 is up, 1-1
const midGame = () => {
  let s = start()
  s = pa(s, ['B', 'IP'], '二安', (p) => { p.loc = 7; p.traj = 'L' })
  s = pa(s, ['B', 'B', 'B', 'B'], '保送')
  s = pa(s, ['S', 'IP'], '一安', (p) => { p.loc = 8; p.traj = 'G'; p.runners = { 0: 'home', 1: 2 }; p.batter = 1; p.rbi = 1 })
  s = pa(s, ['S', 'S', 'SS'], '三振')
  return pitch(s, ['B', 'S'])
}

describe('即時比分: Box Score', () => {
  it('the switch above the feed, remembered for this viewer; the four parts in order with the batter at the plate marked', async () => {
    const s = midGame()
    show(s)
    await screen.findByText('下一棒')
    // 文字轉播 first; one tap shows the Box Score
    const tabs = screen.getByRole('tablist', { name: '看文字轉播或 Box Score' })
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['文字轉播', 'Box Score'])
    expect(screen.getByRole('heading', { name: '文字轉播' })).toBeTruthy()
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Box Score' }))
    expect(screen.queryByRole('heading', { name: '文字轉播' })).toBeNull()
    const titles = ['我隊打擊', '我隊投球', '對方打擊'].map((t) => part(t))
    for (let i = 1; i < titles.length; i++) expect(titles[i - 1].compareDocumentPosition(titles[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const bat = within(part('我隊打擊')).getByRole('table')
    expect(headsOf(bat)).toEqual(['打者', '打數', '得分', '安打', '打點', '四死', '三振'])
    const rows = rowsOf(bat)
    // all nine from the first pitch, in batting order; the numbers are battingLines' of the same rows
    expect(rows.map((r) => r[0])).toEqual(NAMES)
    const lines = new Map(battingLines(EMPTY_DATASET, s.batting).map((l) => [l.name, l]))
    for (const r of rows) { const l = lines.get(r[0]!); expect(r.slice(1)).toEqual(l ? [l.ab, l.r, l.h, l.rbi, l.bb + l.hbp, l.so].map(String) : ['0', '0', '0', '0', '0', '0']) }
    expect([...bat.querySelectorAll('tfoot td')].map((td) => td.textContent)).toEqual(['合計', '3', '1', '2', '1', '1', '1'])
    // 戊 is at bat: his row is marked (not scrolled to); the notes line names the double
    const at = bat.querySelector('tr[data-highlight]')
    expect(at?.textContent).toContain('戊')
    expect(within(at as HTMLElement).getByText('（打擊中）')).toBeTruthy()
    expect(within(part('我隊打擊')).getByText('二安').parentElement?.textContent).toBe('二安 甲')
    // 我隊投球: our pitcher has not pitched yet (we bat first); nobody is 投球中 while we bat
    const pit = within(part('我隊投球')).getByRole('table')
    expect(headsOf(pit)).toEqual(['投手', '局數', '安打', '失分', '自責', '四死', '三振', '用球數'])
    expect(rowsOf(pit)).toEqual([['壬', '0.0', '0', '0', '0', '0', '0', '0']])
    expect(within(part('我隊投球')).queryByText('投球中')).toBeNull()
    // 對方打擊: nobody of theirs has batted yet
    expect(within(part('對方打擊')).getByText('還沒有打席')).toBeTruthy()
    // 對方投手: every pitch of ours so far, the plate appearance in progress too; he is the one pitching now
    const opp = within(part('對方投手')).getByRole('table')
    expect(rowsOf(opp)).toEqual([['對方投手', '4', '2', '1', '1', '13']])
    expect(within(opp).getByText('投球中')).toBeTruthy()

    // remembered: the next visit opens on the Box Score
    cleanup()
    show(s)
    await screen.findByText('下一棒')
    expect(part('我隊打擊')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '文字轉播' }))
    expect(screen.getByRole('heading', { name: '文字轉播' })).toBeTruthy()
    expect(localStorage.getItem('bafin.live.panel')).toBe('feed')
  })

  it('their half: their batter at the plate by slot, our pitcher 投球中 with the pitches of the plate appearance in progress', async () => {
    let s = midGame()
    // 戊 and 己 make the second and third outs; their leadoff man singles, the second one is 1-1
    s = pa(pitch(s, ['B']), ['IP'], '外飛', (p) => { p.loc = 9; p.traj = 'F' })
    s = pa(s, ['IP'], '內滾', (p) => { p.loc = 6; p.traj = 'G' })
    s = pa(s, ['IP'], '一安', (p) => { p.loc = 7; p.traj = 'L' })
    s = pitch(s, ['B', 'F'])
    localStorage.setItem('bafin.live.panel', 'box')
    show(s)
    await screen.findByText('下一棒')
    const pit = within(part('我隊投球')).getByRole('table')
    // (1 pitch to their leadoff man and 2 so far to the next one)
    expect(rowsOf(pit)).toEqual([['壬', '0.0', '1', '0', '0', '0', '0', '3']])
    expect(within(pit).getByText('投球中')).toBeTruthy()
    const opp = within(part('對方打擊')).getByRole('table')
    expect(rowsOf(opp)).toEqual([['第 1 棒', '1', '0', '1', '0', '0', '0'], ['第 2 棒', '0', '0', '0', '0', '0', '0']])
    expect(opp.querySelector('tr[data-highlight]')?.textContent).toContain('第 2 棒')
  })

  it('a phone: each table scrolls inside the card with the name column pinned (the page itself never scrolls sideways)', async () => {
    localStorage.setItem('bafin.live.panel', 'box')
    show(midGame())
    await screen.findByText('下一棒')
    for (const t of ['我隊打擊', '我隊投球', '對方投手']) {
      const table = within(part(t)).getByRole('table')
      expect(table.parentElement?.className).toContain('overflow-x-auto')
      expect(table.querySelector('tbody td')?.className).toContain('sticky')
      expect(table.querySelector('thead th')?.className).toContain('sticky')
    }
    // the card is a flex item that may shrink (min-w-0), so a wide table cannot push the page wider than the screen
    expect(screen.getByRole('heading', { name: 'Box Score' }).closest('section')?.className).toContain('min-w-0')
  })

  it('大螢幕: the Box Score beside the board on a 1920-wide TV, only the board on a laptop', async () => {
    const real = window.matchMedia
    const at = (width: number) => {
      // (min-width: N px) queries answer for a screen `width` wide; every other query is false
      window.matchMedia = ((query: string) => {
        const m = /min-width:\s*(\d+)px/.exec(query)
        return { matches: !!m && width >= Number(m[1]), media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }
      }) as typeof window.matchMedia
    }
    try {
      at(1920)
      show(midGame())
      await screen.findByText('下一棒')
      fireEvent.click(screen.getByRole('button', { name: /大螢幕/ }))
      const big = screen.getByRole('dialog', { name: '即時比分大螢幕' })
      expect(within(big).getByRole('region', { name: '我隊打擊' })).toBeTruthy()
      expect(within(big).getByRole('region', { name: '我隊打擊' }).querySelector('tr[data-highlight]')?.textContent).toContain('戊')
      cleanup()
      at(1366)
      show(midGame())
      await screen.findByText('下一棒')
      fireEvent.click(screen.getByRole('button', { name: /大螢幕/ }))
      expect(within(screen.getByRole('dialog', { name: '即時比分大螢幕' })).queryByRole('region', { name: '我隊打擊' })).toBeNull()
    } finally { window.matchMedia = real }
  })

  it('after 結束比賽 the game page shows the same numbers as the last /live box', async () => {
    // a whole random game, the moment before 結束比賽 is tapped (the board says 比賽結束，等待紀錄員確認)
    const s = { ...playGame(4), finished: false } as RecordState
    localStorage.setItem('bafin.live.panel', 'box')
    show(s, { ...EMPTY_DATASET, roster })
    await screen.findByText('比賽結束，等待紀錄員確認')
    const liveBat = rowsOf(within(part('我隊打擊')).getByRole('table'))
    const livePit = rowsOf(within(part('我隊投球')).getByRole('table'))
    const liveOpp = rowsOf(within(part('對方打擊')).getByRole('table'))
    expect(screen.queryByText('投球中')).toBeNull()
    cleanup()

    const { fragment } = normalizeGameEdit(roster, toGameEdit({ ...s, finished: true }))
    const game = fragment.games[0]
    useDataStore.setState({ base: fragment })
    render(<MemoryRouter><GameView summary={summarizeGame(fragment, game, new Set())} mode="page" onClose={() => undefined} initialTab="box" /></MemoryRouter>)
    const tableWith = (h: string) => screen.getAllByRole('table').find((t) => headsOf(t)[0] === h)!
    const col = (t: HTMLElement, h: string) => headsOf(t).indexOf(h)
    // 打擊: AB R H RBI SO per player (BB and HBP are separate columns on the game page)
    const gb = tableWith('打者')
    const gameBat = new Map(rowsOf(gb).map((r) => [r[0], ['AB', 'R', 'H', 'RBI', 'SO'].map((h) => r[col(gb, h)])]))
    const withPA = liveBat.filter((r) => gameBat.has(r[0]))
    expect(withPA.length).toBe(gameBat.size)
    for (const r of withPA) expect([r[1], r[2], r[3], r[4], r[6]]).toEqual(gameBat.get(r[0]))
    // 投球: in the same order, IP H R ER K PC
    const gp = tableWith('投手')
    expect(rowsOf(gp).map((r) => [r[0], ...['IP', 'H', 'R', 'ER', 'K', 'PC'].map((h) => r[col(gp, h)])])).toEqual(livePit.map((r) => [r[0], r[1], r[2], r[3], r[4], r[6], r[7]]))
    // 對方打擊: AB R H RBI SO by batter
    const go = tableWith('對方打者')
    const gameOpp = new Map(rowsOf(go).map((r) => [r[0], ['AB', 'R', 'H', 'RBI', 'SO'].map((h) => r[col(go, h)])]))
    expect(liveOpp.length).toBe(gameOpp.size)
    for (const r of liveOpp) expect([r[1], r[2], r[3], r[4], r[6]]).toEqual(gameOpp.get(r[0]))
    // (and both are the site's own lines)
    expect(pitchingLines(fragment.pitching, [game]).length).toBe(livePit.length)
  })
})
