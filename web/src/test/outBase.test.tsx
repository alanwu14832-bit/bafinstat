/**
 * 壘死 on 紀錄比賽 says which base he died at: the confirm panel (our batter who reached and was put out, a 壘死 runner
 * on the batted ball) and the 壘上跑者 sheet (between pitches). Run on 練習紀錄 (this device only, no cloud).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage } from '../pages/Record'
import { PRACTICE_KEY, readDraft, writeDraft } from '../record/draft'
import { addPitch, commitPA, defaultPlan, newGame, type RecordState } from '../record/model'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = { id: 'PRACTICE-20261014', date: '2026-10-14', tournament: '練習', opponent: '練習對手', homeAway: '客' as const }
const start = (s: RecordState) => { writeDraft({ ...s, practice: true }, PRACTICE_KEY); render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>) }
const draft = () => readDraft(PRACTICE_KEY)!
Element.prototype.scrollIntoView ??= () => {}
afterEach(() => { cleanup(); writeDraft(null, PRACTICE_KEY) })
const chip = (name: string) => screen.getByRole('button', { name })
const pressed = (name: string) => chip(name).getAttribute('aria-pressed')

describe('壘死 asks which base', () => {
  it('our batter, 三安 then out: 本壘 is suggested, the recorder can pick 3B, and the pick is kept on the mark', async () => {
    start(newGame(game, lineup, '甲'))
    fireEvent.click(screen.getByRole('button', { name: '不知道' }))
    fireEvent.click(screen.getByRole('button', { name: '三安' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^8 CF/ })[0])
    fireEvent.click(screen.getByRole('button', { name: '平飛 L' }))
    // not out yet: nothing to ask
    expect(screen.queryByRole('group', { name: /死在哪個壘包/ })).toBeNull()
    const row = screen.getByText('打者 甲').parentElement as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '壘死' }))
    const at = screen.getByRole('group', { name: '打者 死在哪個壘包' })
    expect(within(at).getAllByRole('button').map((b) => b.textContent)).toEqual(['1B', '2B', '3B', '本壘'])
    expect(pressed('死在本壘')).toBe('true')
    fireEvent.click(chip('死在3B'))
    expect(pressed('死在3B')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /送出這個打席/ }))
    await wait(50)
    expect(draft().batting[0]).toMatchObject({ result: '三安', code: 'I', outOnBase: 1, baserunningOuts: 1 })
    expect(draft().batting[0].events).toEqual([expect.objectContaining({ kind: 'outPlay', batter: true, outAt: 3 })])
  })

  it('the batter set to 出局 after a single: 2B, without touching anything', async () => {
    start(newGame(game, lineup, '甲'))
    fireEvent.click(screen.getByRole('button', { name: '不知道' }))
    fireEvent.click(screen.getByRole('button', { name: '一安' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^8 CF/ })[0])
    fireEvent.click(screen.getByRole('button', { name: '平飛 L' }))
    const row = screen.getByText('打者 甲').parentElement as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '出局' }))
    expect(pressed('死在2B')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /送出這個打席/ }))
    await wait(50)
    expect(draft().batting[0].events).toEqual([expect.objectContaining({ kind: 'outPlay', outAt: 2 })])
  })

  it('the 壘上跑者 sheet: 壘死 asks the base, then records it (and 牽制出局 still asks nothing)', async () => {
    let s = newGame(game, lineup, '甲')
    s = commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '一安'), loc: 7, traj: 'L' })
    start(s)
    fireEvent.click(screen.getByRole('button', { name: /^壘上跑者\s*\dB/ }))
    fireEvent.click(screen.getByRole('button', { name: '壘死' }))
    const at = screen.getByRole('group', { name: '死在哪個壘包' })
    expect(within(at).getAllByRole('button').map((b) => b.textContent)).toEqual(['1B', '2B', '3B', '本壘'])
    fireEvent.click(within(at).getByRole('button', { name: '本壘' }))
    await wait(50)
    expect(draft().outs).toBe(1)
    expect(draft().plays).toEqual([{ at: 0, kind: 'out', from: 1, to: 'out', outAt: 'home' }])
  })
})
