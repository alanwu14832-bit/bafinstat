/** 記錄球速 on 紀錄比賽: a number pad after each pitch of our pitcher (always ✓ to send, 跳過 for none). Run on 練習紀錄. */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage } from '../pages/Record'
import { PRACTICE_KEY, readDraft, writeDraft } from '../record/draft'
import { newGame, setSpeedOn } from '../record/model'
import { answered } from './answered'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = { id: 'PRACTICE-20261123', date: '2026-11-23', tournament: '練習', opponent: '練習對手', homeAway: '主' as const }
const draft = () => readDraft(PRACTICE_KEY)!
Element.prototype.scrollIntoView ??= () => {}
afterEach(() => { cleanup(); writeDraft(null, PRACTICE_KEY) })
const start = (on: boolean) => { writeDraft({ ...answered(on ? setSpeedOn(newGame(game, lineup, '甲'), 'us', true) : newGame(game, lineup, '甲')), practice: true }, PRACTICE_KEY); render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>) }
const type = (digits: string) => { const pad = screen.getByRole('group', { name: '球速數字鍵盤' }); for (const d of digits) fireEvent.click(within(pad).getByRole('button', { name: d })) }

describe('紀錄比賽: 記錄球速', () => {
  it('each pitch opens the pad: 1 3 2 ✓ is 132; 跳過 leaves none; the row keeps them', async () => {
    start(true)
    fireEvent.click(screen.getByRole('button', { name: /^好球/ }))
    expect(await screen.findByRole('dialog', { name: '輸入球速' })).toBeTruthy()
    type('132')
    fireEvent.click(screen.getByRole('button', { name: '確定' }))
    await wait(30)
    expect(screen.queryByRole('dialog', { name: '輸入球速' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^壞球/ }))
    fireEvent.click(await screen.findByRole('button', { name: '沒測到，跳過' }))
    fireEvent.click(screen.getByRole('button', { name: /^好球/ }))
    type('35')
    fireEvent.click(screen.getByRole('button', { name: '確定' }))
    expect(screen.getByRole('alert').textContent).toContain('40～170')
    fireEvent.click(screen.getByRole('button', { name: '刪一個數字' })); fireEvent.click(screen.getByRole('button', { name: '刪一個數字' }))
    type('128')
    // the last speed of his is shown beside the pad
    expect(screen.getByText('上一球 132')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '確定' }))
    await wait(1300)
    expect(draft().speeds).toEqual([132, null, 128])
  })
  it('switched off: no pad', async () => {
    start(false)
    fireEvent.click(screen.getByRole('button', { name: /^好球/ }))
    await wait(30)
    expect(screen.queryByRole('dialog', { name: '輸入球速' })).toBeNull()
  })
})
