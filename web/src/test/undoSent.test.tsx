/** 復原 right after 送出 brings the plate appearance's confirm panel back filled in; 改結果 keeps the 落點 and 軌跡. */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage } from '../pages/Record'
import { PRACTICE_KEY, readDraft, writeDraft } from '../record/draft'
import { addPitch, newGame, type RecordState } from '../record/model'
import { answered } from './answered'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = { id: 'PRACTICE-20261019', date: '2026-10-19', tournament: '練習', opponent: '練習對手', homeAway: '客' as const, innings: 7 }
const start = (s: RecordState) => { writeDraft({ ...answered(s), practice: true }, PRACTICE_KEY); render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>) }
Element.prototype.scrollIntoView ??= () => {}
afterEach(() => { cleanup(); writeDraft(null, PRACTICE_KEY) })

describe('復原 after 送出', () => {
  it('the confirm panel comes back with the result, 落點 and 軌跡', async () => {
    start(addPitch(newGame(game, lineup, '甲'), 'IP'))
    fireEvent.click(screen.getByRole('button', { name: '一安' }))
    fireEvent.click(within(screen.getByRole('group', { name: '落點' })).getAllByRole('button', { name: /^8 CF/ })[0])
    fireEvent.click(within(screen.getByRole('group', { name: '軌跡' })).getByRole('button', { name: '平飛 L' }))
    fireEvent.click(screen.getByRole('button', { name: /^送出/ }))
    await wait(30)
    expect(readDraft(PRACTICE_KEY)!.batting).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '復原' }))
    await wait(30)
    expect(readDraft(PRACTICE_KEY)!.batting).toHaveLength(0)
    expect(screen.getByRole('button', { name: /^送出/ })).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '軌跡' })).getByRole('button', { name: '平飛 L' }).getAttribute('aria-pressed')).toBe('true')
  })
})
