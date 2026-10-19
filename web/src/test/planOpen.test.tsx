/**
 * 紀錄比賽: the result that opens by itself on strike three / ball four goes away when that pitch is taken back, and a
 * steal or wild pitch recorded while it is open moves the runner on — he is never put back where he was.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage } from '../pages/Record'
import { PRACTICE_KEY, readDraft, writeDraft } from '../record/draft'
import { addPitch, commitPA, defaultPlan, newGame, planProblems, refreshPlan, runnerEvent, type RecordState } from '../record/model'
import { answered } from './answered'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = { id: 'PRACTICE-20261019', date: '2026-10-19', tournament: '練習', opponent: '練習對手', homeAway: '客' as const }
const start = (s: RecordState) => { writeDraft({ ...answered(s), practice: true }, PRACTICE_KEY); render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>) }
const draft = () => readDraft(PRACTICE_KEY)!
Element.prototype.scrollIntoView ??= () => {}
afterEach(() => { cleanup(); writeDraft(null, PRACTICE_KEY) })
const onFirst = () => { const s = newGame(game, lineup, '甲'); return commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '一安'), loc: 7, traj: 'L' }) }
const swing = () => fireEvent.click(screen.getAllByRole('button', { name: /^揮空/ })[0])
const send = () => screen.queryByRole('button', { name: /^送出/ })

describe('the plan follows the runners', () => {
  it('a steal recorded after strike three: the runner stays on 2B (refreshPlan), going back is a problem', () => {
    let s = addPitch(addPitch(addPitch(onFirst(), 'SS'), 'SS'), 'SS')
    const plan = defaultPlan(s, '三振')
    s = runnerEvent(s, s.runners[0].row, 'us', 'sb')
    expect(planProblems(s, plan)[0]).toMatch(/已經在 2B，不能退回 1B/)
    const next = refreshPlan(s, plan)
    expect(next.runners[s.runners[0].row]).toBe(2)
    expect(planProblems(s, next)).toEqual([])
  })
})

describe('紀錄比賽: the result box that opened by itself', () => {
  it('closes when strike three is taken back (刪最後一球)', async () => {
    start(addPitch(addPitch(onFirst(), 'SS'), 'SS'))
    swing()
    await wait(20)
    expect(send()).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '刪最後一球' }))
    await wait(20)
    expect(send()).toBeNull()
  })
  it('a steal on strike three, recorded with the box open: sent with the runner on 2B', async () => {
    start(addPitch(addPitch(onFirst(), 'SS'), 'SS'))
    swing()
    await wait(20)
    fireEvent.click(screen.getByRole('button', { name: /^壘上跑者\s*1B/ }))
    fireEvent.click(screen.getByRole('button', { name: '盜壘' }))
    await wait(20)
    fireEvent.click(send()!)
    await wait(50)
    const d = draft()
    expect(d.outs).toBe(1)
    expect(d.runners.map((r) => r.base)).toEqual([2])
    expect(d.batting.at(-1)).toMatchObject({ result: '三振' })
  })
})
