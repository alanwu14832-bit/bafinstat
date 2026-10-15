/**
 * Batch 17 bug 1 on the 紀錄比賽 page: after a 代打 the recorder sets his position with 換人 (只改守位); while we field,
 * the 打線 shows where each one stands and the 我隊失誤 pickers name who an error there is charged to (「6 SS 子」), and
 * the change is logged so the saved game charges it to him. Run on 練習紀錄 (this device only, no cloud).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage } from '../pages/Record'
import { PRACTICE_KEY, readDraft, writeDraft } from '../record/draft'
import { addPitch, commitPA, defaultPlan, newGame, substitute, type RecordState } from '../record/model'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
// 客: we bat the top halves, field the bottom ones
const game = { id: 'PRACTICE-20261015', date: '2026-10-15', tournament: '練習', opponent: '練習對手', homeAway: '客' as const }
const start = (s: RecordState) => { writeDraft({ ...s, practice: true }, PRACTICE_KEY); render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>) }
const draft = () => readDraft(PRACTICE_KEY)!
const k = (s: RecordState) => commitPA(addPitch(addPitch(addPitch(s, 'S'), 'S'), 'S'), defaultPlan(s, '三振'))
Element.prototype.scrollIntoView ??= () => {}
afterEach(() => { cleanup(); writeDraft(null, PRACTICE_KEY) })

describe('紀錄比賽: positions after a 代打 (batch 17)', () => {
  it('only-position change is logged; the lineup and the 我隊失誤 pickers show who stands where', async () => {
    let s = newGame(game, lineup, '壬', { bench: ['子'] })
    s = k(k(s))
    s = substitute(s, 3, '子', 'PH')            // 子 bats for the shortstop 丁 …
    s = k(s)                                    // … and makes the third out: we field the bottom of the 1st
    expect(s.half).toBe('bottom')
    start(s)
    // the 打線 flags him: he has no position yet
    expect(screen.getAllByText(/代打・沒守位/).length).toBeGreaterThan(0)
    // set his position: 換人 → 第 4 棒 → (nobody) → SS
    fireEvent.click(screen.getAllByRole('button', { name: '設定守位' })[0])
    const sheet = screen.getByRole('dialog', { name: '換人' })
    fireEvent.click(within(sheet).getByRole('group', { name: '守位' }).querySelectorAll('button')[5])
    expect(within(sheet).getByText('第 4 棒 子 改守 SS')).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: '確定' }))
    await wait(50)
    expect(draft().lineup[3]).toEqual({ name: '子', pos: 'SS' })
    expect(draft().subs!.at(-1)).toMatchObject({ kind: 'DEF', in: '子', out: '子', pos: 'SS', inning: 1, half: 'bottom', slot: 3 })
    expect(screen.getAllByText('守 6 SS').length).toBeGreaterThan(0)
    // 我隊失誤: 「6 SS 子」
    fireEvent.click(screen.getByRole('button', { name: /^我隊失誤/ }))
    fireEvent.click(screen.getByRole('button', { name: '6 SS 子' }))
    await wait(50)
    expect(draft().extras.errors).toEqual(['SS'])
  })
})
