/**
 * 2026-11-25 (a recorder's report): a 外飛 that brought a runner home was saved as 外飛 with an RBI, so it counted as an
 * at bat. A caught fly with a runner scoring and fewer than two out is a 犧飛 (rule 9.08(d)): sending the runner home on
 * a 外飛／界外飛 now turns the result into 犧飛, on 紀錄比賽 and in 修改資料, and an old 外飛 with an RBI is 待核對.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage } from '../pages/Record'
import { GameEditor } from '../components/ui/GameEditor'
import { PRACTICE_KEY, readDraft, writeDraft } from '../record/draft'
import { addPitch, commitPA, defaultPlan, newGame, type RecordState } from '../record/model'
import { auditGame } from '../data/audit'
import { battingLines } from '../data/stats'
import type { BattingPA } from '../data/types'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = { id: 'PRACTICE-20261125', date: '2026-11-25', tournament: '練習', opponent: '練習對手', homeAway: '客' as const }
const start = (s: RecordState) => { writeDraft({ ...s, practice: true }, PRACTICE_KEY); render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>) }
const draft = () => readDraft(PRACTICE_KEY)!
Element.prototype.scrollIntoView ??= () => {}
afterEach(() => { cleanup(); writeDraft(null, PRACTICE_KEY) })

// 甲 triples; with `outs` out already, 乙 is up and puts the ball in play
const tripleThenUp = (outs: number) => {
  let s = newGame(game, lineup, '甲')
  s = commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '三安'), loc: 8, traj: 'L' })
  return addPitch({ ...s, outs }, 'IP')
}
const flyOut = () => {
  // (the opponent pitcher's hand is asked first)
  const unknown = screen.queryAllByRole('button', { name: '不知道' })
  if (unknown.length) fireEvent.click(unknown[0])
  fireEvent.click(screen.getByRole('button', { name: '外飛' }))
  fireEvent.click(screen.getAllByRole('button', { name: /^8 CF/ })[0])
  fireEvent.click(screen.getByRole('button', { name: '飛球 F' }))
}

describe('紀錄比賽: 外飛 with the runner home is a 犧飛', () => {
  it('sending the runner from third home on a 外飛 makes it 犧飛 with his RBI: no at bat', async () => {
    start(tripleThenUp(1))
    flyOut()
    const runner = screen.getByText('3B 甲').parentElement as HTMLElement
    fireEvent.click(within(runner).getByRole('button', { name: '得分' }))
    expect(await screen.findByText(/結果改成「犧飛」/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /送出這個打席/ }))
    await wait(50)
    const [, sf] = draft().batting
    expect([sf.result, sf.rbi]).toEqual(['犧飛', 1])
    expect(battingLines({ roster: [], games: [], batting: draft().batting, pitching: [], fielding: [] }, draft().batting).find((l) => l.name === '乙')).toMatchObject({ ab: 0, sf: 1, rbi: 1, pa: 1 })
    expect(draft().outs).toBe(2)
  })
  it('with two out there is no 犧飛: the catch ends the inning, the result stays 外飛', async () => {
    start(tripleThenUp(2))
    flyOut()
    const runner = screen.getByText('3B 甲').parentElement as HTMLElement
    fireEvent.click(within(runner).getByRole('button', { name: '得分' }))
    expect(screen.queryByText(/結果改成「犧飛」/)).toBeNull()
  })
})

describe('修改資料: 外飛 with the runner home is a 犧飛', () => {
  const g = { id: 'G20261123-01', date: '2026-11-23', tournament: '大專盃', opponent: '測試隊', homeAway: '客' as const, innings: 7 }
  const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: g.id, inning: 1, outsBefore: 1, basesBefore: '無', order: 1, batter: '甲', pitches: ['IP'], result: '外飛', loc: 8, traj: 'F', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
  it('the runner on third set to 得分 on a 外飛: 犧飛, an RBI, the run scored', async () => {
    const onSave = vi.fn(async () => undefined)
    const rows = [bat({ batter: '藍正祐', result: '三安', traj: 'L', code: undefined }), bat({ batter: '嚴敬翔', order: 2, basesBefore: '3', code: 'II' })]
    render(<GameEditor initial={{ game: g, batting: rows, pitching: [], fielding: [] }} roster={['藍正祐', '嚴敬翔']} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^修改第 2 個打席/ }))
    const runner = screen.getByRole('group', { name: '藍正祐 這打席結束時' })
    fireEvent.click(within(runner).getByRole('button', { name: '得分' }))
    expect((await screen.findAllByText(/結果改成「犧飛」/)).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const out = (onSave.mock.calls[0] as unknown as [{ batting: BattingPA[] }])[0].batting
    expect(out.map((p) => [p.result, p.rbi])).toEqual([['三安', 0], ['犧飛', 1]])
    expect(out[0].code).toBe('R')
  })
  it('an old 外飛 with an RBI and fewer than two out is 待核對 (ours and theirs); with two out it is not', () => {
    const rows = [bat({ batter: '藍正祐', result: '三安', traj: 'L', code: 'R', run: 1 }), bat({ batter: '嚴敬翔', order: 2, basesBefore: '3', code: 'II', rbi: 1 })]
    expect(auditGame(rows, []).some((x) => x.message.includes('應該記成「犧飛」'))).toBe(true)
    expect(auditGame([rows[0], { ...rows[1], outsBefore: 2 }], []).some((x) => x.message.includes('應該記成「犧飛」'))).toBe(false)
    const theirs = { gameId: g.id, inning: 3, outsBefore: 1, oppOrder: 4, pitcher: '謝昊瑾', pitches: ['IP'], result: '外飛', loc: 9, traj: 'F', rbi: 1, code: 'II', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 }
    expect(auditGame([], [theirs]).some((x) => x.side === 'pit' && x.message.includes('應該記成「犧飛」'))).toBe(true)
  })
})

describe('修改資料: a caught fly keeps the batter out (2026-11-27 audit)', () => {
  it('putting the 外飛 batter on a base is refused with what to change instead', async () => {
    const g = { id: 'G20261125-01', date: '2026-11-25', tournament: '大專盃', opponent: '測試隊', homeAway: '客' as const, innings: 7 }
    const rows: BattingPA[] = [{ gameId: g.id, inning: 1, outsBefore: 0, basesBefore: '無', order: 1, batter: '嚴敬翔', pitches: ['IP'], result: '外飛', loc: 7, traj: 'F', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, code: 'I' }]
    render(<GameEditor initial={{ game: g, batting: rows, pitching: [], fielding: [] }} roster={['嚴敬翔']} onSave={async () => undefined} onCancel={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^修改第 1 個打席/ }))
    const batter = screen.getByRole('group', { name: '嚴敬翔 這打席結束時' })
    fireEvent.click(within(batter).getByRole('button', { name: '1B' }))
    expect((await screen.findAllByText(/「外飛」是高飛球被接殺、打者出局，不能上壘/)).length).toBeGreaterThan(0)
  })
})

