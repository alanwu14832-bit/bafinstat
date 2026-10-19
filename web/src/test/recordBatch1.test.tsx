/**
 * 紀錄比賽 (batch 1 of the scorekeeper review): 擦棒 at two strikes is strike three; the game-over banner holds the
 * pitch pad until 結束比賽 or 繼續記下一局; 全部進一壘／全部不動 set every runner at once; 內滾 moves the forced runners;
 * 對方換投 is one tap and the hand.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage } from '../pages/Record'
import { PRACTICE_KEY, readDraft, writeDraft } from '../record/draft'
import { addPitch, commitPA, defaultPlan, newGame, type RecordState } from '../record/model'
import { gameOverNow } from '../record/upNext'
import { score } from '../record/model'
import { answered } from './answered'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = (homeAway: '主' | '客', innings = 7) => ({ id: 'PRACTICE-20261019', date: '2026-10-19', tournament: '練習', opponent: '練習對手', homeAway, innings })
const start = (s: RecordState) => { writeDraft({ ...answered(s), practice: true }, PRACTICE_KEY); render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>) }
const draft = () => readDraft(PRACTICE_KEY)!
Element.prototype.scrollIntoView ??= () => {}
afterEach(() => { cleanup(); writeDraft(null, PRACTICE_KEY) })
const k = (s: RecordState) => { for (let i = 0; i < 3; i++) s = addPitch(s, 'SS'); return commitPA(s, defaultPlan(s, '三振')) }
const hr = (s: RecordState) => commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '全壘打'), loc: 8, traj: 'F' })
const single = (s: RecordState) => commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '一安'), loc: 8, traj: 'L' })

describe('擦棒', () => {
  it('shows at two strikes and makes strike three (三振, no 待核對 about strikes)', async () => {
    start(addPitch(addPitch(newGame(game('客'), lineup, '甲'), 'CS'), 'F'))
    fireEvent.click(screen.getByRole('button', { name: /^擦棒/ }))
    await wait(20)
    fireEvent.click(screen.getByRole('button', { name: /^送出/ }))
    await wait(50)
    expect(draft().batting[0]).toMatchObject({ result: '三振', pitches: ['CS', 'F', 'T'] })
  })
  it('is not there before two strikes', () => {
    start(addPitch(newGame(game('客'), lineup, '甲'), 'CS'))
    expect(screen.queryByRole('button', { name: /^擦棒/ })).toBeNull()
  })
})

describe('game over', () => {
  // a 1-inning game, we bat first and lead 1-0: after their three outs it is over
  const decided = () => { let s = newGame(game('客', 1), lineup, '甲'); s = hr(s); s = k(k(k(s))); return k(k(k(s))) }
  it('gameOverNow: the last inning finished with a leader; a walk-off in the bottom of the last', () => {
    expect(gameOverNow(decided(), score(decided()), 1)).toBe(true)
    let s = newGame(game('主', 1), lineup, '甲')      // they bat first
    s = k(k(k(s)))
    expect(gameOverNow(s, score(s), 1)).toBe(false)
    s = hr(s)                                          // walk-off homer in the bottom of the 1st
    expect(gameOverNow(s, score(s), 1)).toBe(true)
  })
  it('the banner holds the pitch pad; 繼續記下一局 lets the recorder go on', async () => {
    start(decided())
    expect(screen.getByText(/^比賽結束：/)).toBeTruthy()
    expect((screen.getAllByRole('button', { name: /^壞球/ })[0] as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '繼續記下一局' }))
    await wait(20)
    expect(screen.queryByText(/^比賽結束：/)).toBeNull()
    // (extra innings: the 突破僵局 card comes first, as in any game going on past the last inning)
    expect(screen.getAllByText(/突破僵局/).length).toBeGreaterThan(0)
  })
})

describe('runner destinations', () => {
  it('內滾 moves the runner forced from first; 全部不動 / 全部進一壘 set them all', async () => {
    start(single(newGame(game('客'), lineup, '甲')))
    fireEvent.click(screen.getAllByRole('button', { name: /^擊進場內/ })[0])
    fireEvent.click(screen.getByRole('button', { name: '內滾' }))
    await wait(20)
    const row = () => screen.getByText(/^1B 甲/).parentElement!
    expect(within(row()).getByRole('button', { name: '2B' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '全部不動' }))
    expect(within(row()).getByRole('button', { name: '1B' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '全部進一壘' }))
    expect(within(row()).getByRole('button', { name: '2B' }).getAttribute('aria-pressed')).toBe('true')
    // the line next to 送出 says it
    expect(screen.getByText(/乙 內滾・甲 上2B/)).toBeTruthy()
  })
})

describe('對方換投', () => {
  it('one tap on the button, one on the hand: the new pitcher from the next plate appearance', async () => {
    let s = newGame(game('客'), lineup, '甲')
    s = { ...s, oppPitcher: { hand: 'R', name: '1號' } }
    s = single(s)
    start(s)
    fireEvent.click(screen.getByRole('button', { name: /^對方換投/ }))
    const sheet = screen.getByRole('dialog', { name: '對方投手' })
    fireEvent.click(within(sheet).getByRole('button', { name: '左投' }))
    await wait(50)
    expect(screen.queryByRole('dialog', { name: '對方投手' })).toBeNull()
    expect(draft().oppPitcher).toMatchObject({ hand: 'L' })
  })
})
