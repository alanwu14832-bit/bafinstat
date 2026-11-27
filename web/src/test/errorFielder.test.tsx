/**
 * 2026-11-27 audit: a 失誤 result is charged to who 「這次失誤算給」 names (the 落點 moves to him), so the fielder who
 * really erred is no longer typed as a second error. Run on 練習紀錄 (this device only).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage } from '../pages/Record'
import { PRACTICE_KEY, readDraft, writeDraft } from '../record/draft'
import { addPitch, newGame, type RecordState } from '../record/model'
import { errorsOf } from '../data/errors'

const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
// 主: they bat first, we field
const game = { id: 'PRACTICE-20261127', date: '2026-11-27', tournament: '練習', opponent: '練習對手', homeAway: '主' as const }
const start = (s: RecordState) => { writeDraft({ ...s, practice: true }, PRACTICE_KEY); render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>) }
Element.prototype.scrollIntoView ??= () => {}
afterEach(() => { cleanup(); writeDraft(null, PRACTICE_KEY) })

describe('紀錄比賽: 這次失誤算給', () => {
  it('a grounder to short, the first baseman drops the throw: one error, his (落點 3)', () => {
    start(addPitch(newGame(game, lineup, '甲'), 'IP'))
    fireEvent.click(screen.getByRole('button', { name: '右打' }))
    fireEvent.click(screen.getByRole('button', { name: '失誤' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^6 SS/ })[0])
    fireEvent.click(screen.getByRole('button', { name: '滾地 G' }))
    const who = screen.getByRole('group', { name: '這次失誤算給' })
    // the 落點's fielder is picked to start with, with who stands there
    expect(within(who).getByRole('button', { name: /^6 SS/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(who).getByRole('button', { name: /^3 1B/ }).textContent).toContain('丙')
    fireEvent.click(within(who).getByRole('button', { name: /^3 1B/ }))
    expect(within(who).getByRole('button', { name: /^3 1B/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '送出這個打席' }))
    const row = readDraft(PRACTICE_KEY)!.pitching[0]
    expect(row.loc).toBe(3)
    expect(row.errors).toBeUndefined()
    expect(errorsOf(row)).toEqual({ positions: ['1B'], unknown: 0 })
  })
})

describe('紀錄比賽: a caught fly keeps the batter out', () => {
  it('putting the 外飛 batter on first is refused with what to pick instead', () => {
    start(addPitch(newGame(game, lineup, '甲'), 'IP'))
    fireEvent.click(screen.getByRole('button', { name: '右打' }))
    fireEvent.click(screen.getByRole('button', { name: '外飛' }))
    const batterRow = screen.getByText(/^打者 /).parentElement as HTMLElement
    fireEvent.click(within(batterRow).getByRole('button', { name: '1B' }))
    expect(within(batterRow).getByRole('button', { name: '出局' }).className).toContain('bg-ink')
    expect(screen.getByText(/「外飛」是高飛球被接殺、打者出局，不能上壘/)).toBeInTheDocument()
  })
})
