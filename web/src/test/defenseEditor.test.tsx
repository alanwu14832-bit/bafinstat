/**
 * 修改資料 (batch 17 bug 1): who stood where in each inning, errors shown with the player charged (「失誤 SS（子）」),
 * a 守位變動 added by hand, and the 守備 lines of a game saved before every change was logged put right in one tap.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { GameEditor } from '../components/ui/GameEditor'
import type { GameEdit } from '../data/edit'
import type { BattingPA, FieldingLine, Game, PitchingPA } from '../data/types'

const POS = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P']
const NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬']
// 主: we field the top halves. 子 pinch-hit for the shortstop 丁 in the bottom of the 1st and stayed in (not logged).
const game: Game = {
  id: 'G20261015-01', date: '2026-10-15', tournament: '友誼賽', opponent: '測試隊', homeAway: '主', innings: 3,
  dayRoster: { starters: NAMES.map((name, i) => ({ name, pos: POS[i], order: i + 1 })), bench: ['子', '丑'], subs: [{ kind: 'PH', in: '子', out: '丁', pos: 'PH', inning: 1, half: 'bottom', slot: 3 }], reentry: false },
}
const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: game.id, inning: 1, outsBefore: 0, basesBefore: '無', order: 1, batter: '甲', pitches: ['IP'], result: '內滾', loc: 6, traj: 'G', code: 'I', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: game.id, inning: 1, outsBefore: 0, basesBefore: '無', oppOrder: 1, pitcher: '壬', pitches: ['IP'], result: '內滾', loc: 6, traj: 'G', code: 'I', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })
const line = (player: string, pos: string, e = 0): FieldingLine => ({ gameId: game.id, player, pos, innings: 3, po: 0, a: 0, e, dp: 0, pb: 0, sb: 0, cs: 0 })
// the error in the 2nd went to 丁 when it was saved (the old rule)
const initial: GameEdit = { game, batting: [bat({})], pitching: [pit({ inning: 2, result: '失誤', code: undefined })], fielding: [line('甲', 'C'), line('丁', 'SS', 1), line('壬', 'P')] }
const open = () => { const onSave = vi.fn(async () => undefined); render(<GameEditor initial={initial} roster={[...NAMES, '子', '丑']} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />); return onSave }
const saved = (onSave: ReturnType<typeof vi.fn>) => (onSave.mock.calls[0] as unknown as [GameEdit])[0]

describe('修改資料: positions after a 代打', () => {
  it('the error shows who it is charged to, and the 守備 lines are put right in one tap', async () => {
    const onSave = open()
    fireEvent.click(screen.getByRole('tab', { name: /投球/ }))
    // the 代打 who stayed in took the shortstop's place: the error is his
    expect(screen.getByText(/失誤 SS（子）/)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /守備/ }))
    const notice = screen.getByRole('status')
    expect(within(notice).getByText('丁 SS：失誤 1 → 0')).toBeTruthy()
    expect(within(notice).getByText('子 SS：失誤 0 → 1')).toBeTruthy()
    fireEvent.click(within(notice).getByRole('button', { name: '依登錄名單重算失誤' }))
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const f = saved(onSave).fielding
    expect(f.find((l) => l.player === '丁')!.e).toBe(0)
    expect(f.find((l) => l.player === '子' && l.pos === 'SS')!.e).toBe(1)
  })
  it('a 守位變動 added in the 登錄名單 moves the error with it', async () => {
    const onSave = open()
    fireEvent.click(screen.getByRole('tab', { name: /登錄名單/ }))
    const byInning = screen.getByRole('group', { name: '看哪一局的守備' })
    fireEvent.click(within(byInning).getByRole('button', { name: '2' }))
    expect(within(screen.getByRole('list', { name: '第 2 局守備' })).getByText('子')).toBeTruthy()
    // really 丙 moved to SS in the 2nd and 子 went to 2B
    fireEvent.change(screen.getByRole('combobox', { name: '誰' }), { target: { value: '丙' } })
    fireEvent.change(screen.getByRole('combobox', { name: '改守' }), { target: { value: 'SS' } })
    fireEvent.click(screen.getByRole('button', { name: '從第 2 局起改守位' }))
    fireEvent.change(screen.getByRole('combobox', { name: '誰' }), { target: { value: '子' } })
    fireEvent.change(screen.getByRole('combobox', { name: '改守' }), { target: { value: '2B' } })
    fireEvent.click(screen.getByRole('button', { name: '從第 2 局起改守位' }))
    expect(screen.getByText('2局上 換守位 丙 改守 SS')).toBeTruthy()
    const shown = screen.getByRole('list', { name: '第 2 局守備' })
    expect(within(shown).getByText('丙')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const s = saved(onSave)
    expect(s.game.dayRoster!.subs!.slice(1)).toEqual([
      // (with their batting slots: the Box Score and the 逐局表 show the new positions)
      { kind: 'DEF', in: '丙', out: '丙', pos: 'SS', inning: 2, half: 'top', slot: 2 },
      { kind: 'DEF', in: '子', out: '子', pos: '2B', inning: 2, half: 'top', slot: 3 },
    ])
    // the error moved off the line saved the old way onto the player who stood there
    expect(s.fielding.filter((l) => l.e).map((l) => [l.player, l.pos, l.e])).toEqual([['丙', 'SS', 1]])
  })
  // 子 (the 代打 who stayed in) went to 2B and 丙 to SS from the 2nd: the SS error in the 2nd is 丙's, once
  const addSwap = () => {
    fireEvent.click(screen.getByRole('tab', { name: /登錄名單/ }))
    fireEvent.click(within(screen.getByRole('group', { name: '看哪一局的守備' })).getByRole('button', { name: '2' }))
    for (const [who, pos] of [['子', '2B'], ['丙', 'SS']]) {
      fireEvent.change(screen.getByRole('combobox', { name: '誰' }), { target: { value: who } })
      fireEvent.change(screen.getByRole('combobox', { name: '改守' }), { target: { value: pos } })
      fireEvent.click(screen.getByRole('button', { name: '從第 2 局起改守位' }))
    }
  }
  const errorsOf = (f: FieldingLine[]) => f.filter((l) => l.e).map((l) => [l.player, l.pos, l.e])
  it('重算失誤, then a 守位變動, then 儲存: the error moves once', async () => {
    const onSave = open()
    fireEvent.click(screen.getByRole('tab', { name: /守備/ }))
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: '依登錄名單重算失誤' }))
    addSwap()
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(errorsOf(saved(onSave).fielding)).toEqual([['丙', 'SS', 1]])
  })
  it('a 守位變動, then 重算失誤 when offered, then 儲存: the error moves once', async () => {
    const onSave = open()
    addSwap()
    fireEvent.click(screen.getByRole('tab', { name: /守備/ }))
    // (the notice is worked out on what the save would write: nothing left to put right here)
    const notice = screen.queryByRole('status')
    if (notice) fireEvent.click(within(notice).getByRole('button', { name: '依登錄名單重算失誤' }))
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(errorsOf(saved(onSave).fielding)).toEqual([['丙', 'SS', 1]])
  })
  it('the reviewer’s case: 代打 for LF, then 子 → SS and 丁 → LF, 重算, 儲存: the team still has one error', async () => {
    const g2: Game = { ...game, dayRoster: { ...game.dayRoster!, subs: [{ kind: 'PH', in: '子', out: '己', pos: 'PH', inning: 1, half: 'bottom', slot: 5 }] } }
    const init2: GameEdit = { ...initial, game: g2, fielding: [line('甲', 'C'), line('丁', 'SS', 1), line('己', 'LF'), line('壬', 'P')] }
    const onSave = vi.fn(async () => undefined)
    render(<GameEditor initial={init2} roster={[...NAMES, '子', '丑']} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: /登錄名單/ }))
    fireEvent.click(within(screen.getByRole('group', { name: '看哪一局的守備' })).getByRole('button', { name: '2' }))
    for (const [who, pos] of [['子', 'SS'], ['丁', 'LF']]) {
      fireEvent.change(screen.getByRole('combobox', { name: '誰' }), { target: { value: who } })
      fireEvent.change(screen.getByRole('combobox', { name: '改守' }), { target: { value: pos } })
      fireEvent.click(screen.getByRole('button', { name: '從第 2 局起改守位' }))
    }
    fireEvent.click(screen.getByRole('tab', { name: /守備/ }))
    const notice = screen.queryByRole('status')
    if (notice) fireEvent.click(within(notice).getByRole('button', { name: '依登錄名單重算失誤' }))
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(errorsOf(saved(onSave).fielding)).toEqual([['子', 'SS', 1]])
  })
  it('someone who has not played comes in for a player (替誰), with that player’s batting slot', async () => {
    const onSave = open()
    fireEvent.click(screen.getByRole('tab', { name: /登錄名單/ }))
    fireEvent.click(within(screen.getByRole('group', { name: '看哪一局的守備' })).getByRole('button', { name: '2' }))
    fireEvent.change(screen.getByRole('combobox', { name: '誰' }), { target: { value: '丑' } })
    fireEvent.change(screen.getByRole('combobox', { name: '替誰' }), { target: { value: '子' } })
    fireEvent.change(screen.getByRole('combobox', { name: '改守' }), { target: { value: 'SS' } })
    fireEvent.click(screen.getByRole('button', { name: '從第 2 局起換上場' }))
    expect(within(screen.getByRole('list', { name: '第 2 局守備' })).getByText('丑')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const s = saved(onSave)
    expect(s.game.dayRoster!.subs!.at(-1)).toEqual({ kind: 'DEF', in: '丑', out: '子', pos: 'SS', inning: 2, half: 'top', slot: 3 })
    expect(errorsOf(s.fielding)).toEqual([['丑', 'SS', 1]])
  })
  it('a substitution row can be deleted', () => {
    open()
    fireEvent.click(screen.getByRole('tab', { name: /登錄名單/ }))
    fireEvent.click(screen.getByRole('button', { name: /^刪除這筆替補紀錄/ }))
    expect(screen.getByText('沒有替補紀錄')).toBeTruthy()
  })
})

describe('修改資料: a change in the middle of a plate appearance', () => {
  it('the half’s last row has an error before the change and one after it: each shows its own player', () => {
    // top 1: 三振, 三振, 一安 (丁 errs on it); 丑 replaces 丁 at SS, errs between pitches, and the half ends on the bases
    const g: Game = { ...game, dayRoster: { ...game.dayRoster!, subs: [{ kind: 'DEF', in: '丑', out: '丁', pos: 'SS', inning: 1, half: 'top', slot: 3, row: 3, after: { errors: ['SS'] } }] } }
    const rows = [pit({ result: '三振', loc: undefined, code: 'I' }), pit({ result: '三振', loc: undefined, code: 'II' }), pit({ result: '一安', loc: 6, code: 'III', errors: ['SS', 'SS'] })]
    render(<GameEditor initial={{ game: g, batting: [bat({})], pitching: rows, fielding: [] }} roster={[...NAMES, '子', '丑']} onSave={vi.fn(async () => undefined)} onCancel={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: /投球/ }))
    expect(screen.getByText(/失誤 SS（丁）、SS（丑）/)).toBeTruthy()
  })
})
