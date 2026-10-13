/**
 * 紀錄比賽 records our batting and theirs equally (batch 11): 對方失誤 while we bat, 失誤進壘 asking whose error for
 * both sides' runners, their RBI and 對方代打, 備註 in the confirm panel, the 趁傳／失誤進壘 chips told apart.
 * Run on 練習紀錄 (this device only, no cloud).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage } from '../pages/Record'
import { PitchingPlayByPlay } from '../components/ui/PlayByPlay'
import { PRACTICE_KEY, readDraft, writeDraft } from '../record/draft'
import { addPitch, commitPA, defaultPlan, newGame, type RecordState } from '../record/model'
import { OPP_PH_UNNAMED } from '../data/types'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = (homeAway: '主' | '客') => ({ id: 'PRACTICE-20261013', date: '2026-10-13', tournament: '練習', opponent: '練習對手', homeAway })
const start = (s: RecordState) => { writeDraft({ ...s, practice: true }, PRACTICE_KEY); render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>) }
const draft = () => readDraft(PRACTICE_KEY)!
Element.prototype.scrollIntoView ??= () => {}
afterEach(() => { cleanup(); writeDraft(null, PRACTICE_KEY) })

describe('紀錄比賽: their side as complete as ours', () => {
  it('while we bat: 對方失誤 with a position, 失誤進壘 asking whose (or 不知道)', async () => {
    let s = newGame(game('客'), lineup, '甲')
    s = commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '一安'), loc: 7 })
    start(s)
    fireEvent.click(screen.getByRole('button', { name: /^對方失誤/ }))
    fireEvent.click(screen.getByRole('button', { name: 'C' }))
    await wait(50)
    expect(draft().extras.oppErrors).toEqual(['C'])
    // our runner moves up on their error between pitches: whose error first
    fireEvent.click(screen.getByRole('button', { name: /^壘上跑者\s*\dB/ }))
    fireEvent.click(screen.getByRole('button', { name: '失誤進壘' }))
    fireEvent.click(within(screen.getByRole('group', { name: '誰失誤' })).getByRole('button', { name: '不知道' }))
    await wait(50)
    expect(draft().runners[0].base).toBe(2)
    expect(draft().extras.oppErrors).toEqual(['C', '?'])
    expect(draft().batting[0].advOnError).toBe(1)
  })

  it('the confirm panel: chips say 趁傳（不算失誤）／對方失誤進壘, a 備註 goes on the row', async () => {
    const s = newGame(game('客'), lineup, '甲')
    start(s)
    fireEvent.click(screen.getByRole('button', { name: '一安' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^7 LF/ })[0])
    // the batter takes second: how
    fireEvent.click(screen.getAllByRole('button', { name: '2B' }).at(-1)!)
    expect(screen.getByRole('button', { name: /打者 趁傳（不算失誤）/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /打者 對方失誤進壘/ }))
    expect(screen.getByText(/趁傳：守備傳別的壘/)).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '對方誰失誤' })).getByRole('button', { name: 'LF' }))
    fireEvent.change(screen.getByRole('textbox', { name: '這個打席的備註' }), { target: { value: '左外野漏接' } })
    fireEvent.click(screen.getByRole('button', { name: /送出這個打席/ }))
    await wait(50)
    const row = draft().batting[0]
    expect(row.errors).toEqual(['LF'])
    expect(row.note).toBe('左外野漏接')
  })

  it('while they bat: 對方代打, their RBI on the play, and 失誤進壘 of their runner needs our fielder', async () => {
    let s = newGame(game('主'), lineup, '甲')
    s = commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '二安'), loc: 8 })
    start(s)
    fireEvent.click(screen.getByRole('button', { name: '對方代打' }))
    fireEvent.click(screen.getByRole('button', { name: '記為代打' }))
    await wait(50)
    expect(draft().oppBatter).toBe(OPP_PH_UNNAMED)
    // their runner on 2B: 失誤進壘 lists only our nine positions
    fireEvent.click(screen.getByRole('button', { name: /^壘上跑者\s*\dB/ }))
    fireEvent.click(screen.getByRole('button', { name: '失誤進壘' }))
    const who = screen.getByRole('group', { name: '誰失誤' })
    expect(within(who).queryByRole('button', { name: '不知道' })).toBeNull()
    fireEvent.click(within(who).getByRole('button', { name: 'C' }))
    await wait(50)
    expect(draft().extras.errors).toEqual(['C'])
    // a single scores him: their RBI stepper is there
    fireEvent.click(screen.getByRole('button', { name: '一安' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^8 CF/ })[0])
    expect(screen.getByText('對方打點')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /送出這個打席/ }))
    await wait(50)
    expect(draft().pitching[1].rbi).toBe(1)
    expect(draft().pitching[1].errors).toEqual(['C'])
    expect(draft().pitching[1].oppBatter).toBe(OPP_PH_UNNAMED)
  })

  it('逐打席 on the pitching side has their 打點 −／＋', () => {
    const prow = { gameId: 'G', inning: 1, pitcher: '壬', oppOrder: 3, pitches: ['IP'], result: '一安', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, basesBefore: '2', outsBefore: 0, rbi: 1 }
    let got: [number, number] | null = null
    render(<PitchingPlayByPlay pas={[prow]} onRbi={(i, n) => { got = [i, n] }} />)
    fireEvent.click(screen.getByRole('button', { name: /對方打點加一/ }))
    expect(got).toEqual([0, 2])
  })
})

