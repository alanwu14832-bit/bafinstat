/**
 * 2026-11-18: a runner put out on the bases is 壘死 (with a 自己跑壘失誤 tick for his own mistake); 內滾 that puts a runner
 * out instead of the batter turns into 野選; the 逐打席 list on 紀錄比賽 sits above the lineup and a row opens to fix its
 * 落點／軌跡／強弱／備註. Run on 練習紀錄 (this device only).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage } from '../pages/Record'
import { PRACTICE_KEY, readDraft, writeDraft } from '../record/draft'
import { addPitch, commitPA, defaultPlan, newGame, type RecordState } from '../record/model'
import { inferAll, outsDuring } from '../record/timeline'
import type { BattingPA } from '../data/types'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = { id: 'PRACTICE-20261118', date: '2026-11-18', tournament: '練習', opponent: '練習對手', homeAway: '客' as const }
const start = (s: RecordState) => { writeDraft({ ...s, practice: true }, PRACTICE_KEY); render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>) }
const draft = () => readDraft(PRACTICE_KEY)!
Element.prototype.scrollIntoView ??= () => {}
afterEach(() => { cleanup(); writeDraft(null, PRACTICE_KEY) })

// 甲 walks; 乙 up with 甲 on first, the ball just put in play
const walkThenUp = () => {
  let s = newGame(game, lineup, '甲')
  s = commitPA(['B', 'B', 'B', 'B'].reduce((x, p) => addPitch(x, p), s), defaultPlan(s, '保送'))
  return addPitch(s, 'IP')
}

describe('紀錄比賽: 內滾 with the runner out is a 野選', () => {
  it('marking the runner 壘死 on a 內滾 turns it into 野選: the batter on first, the out on the runner', async () => {
    start(walkThenUp())
    fireEvent.click(screen.getByRole('button', { name: '不知道' }))
    fireEvent.click(screen.getByRole('button', { name: '內滾' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^6 SS/ })[0])
    const runner = screen.getByText('1B 甲').parentElement as HTMLElement
    // one 壘死 button for a runner (no 出局), and no mistake tick until he is out
    expect(within(runner).queryByRole('button', { name: '出局' })).toBeNull()
    expect(within(runner).queryByRole('button', { name: '自己跑壘失誤' })).toBeNull()
    fireEvent.click(within(runner).getByRole('button', { name: '壘死' }))
    expect(await screen.findByText(/結果改成「野選」/)).toBeTruthy()
    expect(within(runner).getByRole('button', { name: '自己跑壘失誤' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: /送出這個打席/ }))
    await wait(50)
    const [walk, fc] = draft().batting
    expect(fc.result).toBe('野選')
    expect(walk).toMatchObject({ code: 'I', outOnBase: 1 })
    expect(walk.baserunningOuts ?? 0).toBe(0)
    expect(draft().outs).toBe(1)
  })
  it('自己跑壘失誤 is charged to the runner only when ticked', async () => {
    start(walkThenUp())
    fireEvent.click(screen.getByRole('button', { name: '不知道' }))
    fireEvent.click(screen.getByRole('button', { name: '一安' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^7 LF/ })[0])
    fireEvent.click(screen.getByRole('button', { name: '平飛 L' }))
    const runner = screen.getByText('1B 甲').parentElement as HTMLElement
    fireEvent.click(within(runner).getByRole('button', { name: '壘死' }))
    fireEvent.click(within(runner).getByRole('button', { name: '自己跑壘失誤' }))
    fireEvent.click(screen.getByRole('button', { name: /送出這個打席/ }))
    await wait(50)
    expect(draft().batting[0]).toMatchObject({ code: 'I', outOnBase: 1, baserunningOuts: 1 })
    expect(draft().batting[1].result).toBe('一安')
  })
})

describe('紀錄比賽: 逐打席', () => {
  it('sits above the lineup; a row opens the full editor: its result changed, the bases follow', async () => {
    // 甲 singled, 乙 up: change 甲's single into a strikeout from the list
    let s = newGame(game, lineup, '甲')
    s = commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '一安'), loc: 7, traj: 'L' })
    start(s)
    const log = screen.getByText('逐打席', { selector: 'h3' }).closest('section')!
    const order = screen.getByText('打線', { selector: 'h3' }).closest('section')!
    expect(log.compareDocumentPosition(order) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(within(log).getByText('甲'))
    const sheet = await screen.findByRole('dialog', { name: '修改這個打席' })
    // the 修改資料 panel, without 插入／刪除 while the game goes on
    expect(within(sheet).queryByRole('button', { name: '在前面插入' })).toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: /^三振$/ }))
    fireEvent.click(within(sheet).getByRole('button', { name: '儲存修改' }))
    await wait(80)
    expect(screen.queryByRole('dialog', { name: '修改這個打席' })).toBeNull()
    expect(draft().batting[0].result).toBe('三振')
    expect([draft().outs, draft().runners]).toEqual([1, []])
  })
})

describe('修改資料: where a runner was put out', () => {
  it('outsDuring: the runner forced out on a later plate appearance points at it', () => {
    const b = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, batter: 'x', pitches: ['IP'], result: '內滾', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
    const rows = [b({ batter: '甲', outsBefore: 0, basesBefore: '無', result: '保送', pitches: ['B', 'B', 'B', 'B'], code: 'I', outOnBase: 1 }), b({ batter: '乙', outsBefore: 0, basesBefore: '1', result: '野選', code: 'L' }), b({ batter: '丙', outsBefore: 1, basesBefore: '1', result: '三振', pitches: ['S', 'S', 'S'], code: 'II' })]
    expect([...outsDuring(inferAll(rows, 'bat'))]).toEqual([[0, 1]])
  })
})

describe('修改資料: 內滾 with the runner out is a 野選', async () => {
  const { vi } = await import('vitest')
  const { GameEditor } = await import('../components/ui/GameEditor')
  const g = { id: 'G20261118-01', date: '2026-11-18', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 7 }
  const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: g.id, inning: 2, outsBefore: 2, basesBefore: '無', order: 1, batter: '甲', pitches: ['IP'], result: '內滾', loc: 6, traj: 'G', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
  it('the runner set to 壘死 on a 內滾: 野選, the out on the runner, the batter safe', async () => {
    const onSave = vi.fn(async () => undefined)
    const rows = [bat({ batter: '藍正祐', result: '保送', pitches: ['B', 'B', 'B', 'B'], code: 'L', loc: undefined, traj: undefined }), bat({ batter: '嚴敬翔', order: 2, basesBefore: '1', code: 'III' })]
    render(<GameEditor initial={{ game: g, batting: rows, pitching: [], fielding: [] }} roster={['藍正祐', '嚴敬翔']} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^修改第 2 個打席/ }))
    const runner = screen.getByRole('group', { name: '藍正祐 這打席結束時' })
    fireEvent.click(within(runner).getByRole('button', { name: '壘死' }))
    expect((await screen.findAllByText(/結果改成「野選」/)).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const out = (onSave.mock.calls[0] as unknown as [{ batting: BattingPA[] }])[0].batting
    expect(out.map((p) => [p.result, p.code])).toEqual([['保送', 'I'], ['野選', 'L']])   // (the inning's first out: the codes count from its start)
    expect(out[0].baserunningOuts ?? 0).toBe(0)
  })
})
