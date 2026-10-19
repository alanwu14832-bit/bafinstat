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
const NUM: Record<string, string> = { C: '2 C', '1B': '3 1B', '2B': '4 2B', '3B': '5 3B', SS: '6 SS', LF: '7 LF', CF: '8 CF', RF: '9 RF' }
/** 每局守備: tap the position, then the player, then 確認 */
const change = (pos: string, who: string) => {
  fireEvent.click(within(screen.getByRole('list', { name: /局守備$/ })).getByRole('button', { name: new RegExp(`^${NUM[pos]} `) }))
  fireEvent.click(within(screen.getByRole('group', { name: '換成誰' })).getByRole('button', { name: new RegExp(`^${who}`) }))
  fireEvent.click(screen.getByRole('button', { name: '確認' }))
}
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
    change('SS', '丙')
    // (2B is empty now, and said so)
    expect(screen.getByRole('status')).toHaveTextContent('4 2B 沒有人守')
    change('2B', '子')
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
    for (const [who, pos] of [['子', '2B'], ['丙', 'SS']]) change(pos, who)
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
    for (const [who, pos] of [['子', 'SS'], ['丁', 'LF']]) change(pos, who)
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
    // tap SS (子 is there), pick 丑 from the bench: the sentence says what happens before 確認
    fireEvent.click(within(screen.getByRole('list', { name: '第 2 局守備' })).getByRole('button', { name: /^6 SS 子/ }))
    fireEvent.click(within(screen.getByRole('group', { name: '換成誰' })).getByRole('button', { name: '丑' }))
    expect(screen.getByText('第 2 局起：丑 上場守 6 SS，替下 子')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '確認' }))
    // the change is listed under the inning, with its own delete
    expect(within(screen.getByRole('list', { name: '第 2 局的變動' })).getByText('丑 上場守 6 SS，替下 子')).toBeTruthy()
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

describe('每局守備: the changes of an inning', () => {
  it('are marked on the grid and can be deleted there', () => {
    open()
    fireEvent.click(screen.getByRole('tab', { name: /登錄名單/ }))
    fireEvent.click(within(screen.getByRole('group', { name: '看哪一局的守備' })).getByRole('button', { name: '3' }))
    change('C', '丑')
    const grid = screen.getByRole('list', { name: '第 3 局守備' })
    expect(within(grid).getByRole('button', { name: /^2 C 丑/ })).toHaveTextContent('換')
    fireEvent.click(screen.getByRole('button', { name: /^刪除這個變動：丑/ }))
    expect(within(screen.getByRole('list', { name: '第 3 局守備' })).getByRole('button', { name: /^2 C 甲/ })).toBeTruthy()
  })
  it('a 代打 logged while we batted shows in the next inning we field, on the position he took', () => {
    open()
    fireEvent.click(screen.getByRole('tab', { name: /登錄名單/ }))
    fireEvent.click(within(screen.getByRole('group', { name: '看哪一局的守備' })).getByRole('button', { name: '2' }))
    // (we are 主: 子 pinch-hit in the bottom of the 1st and stayed in at SS)
    expect(within(screen.getByRole('list', { name: '第 2 局的變動' })).getByText('代打 子 替 丁，守 6 SS')).toBeTruthy()
    expect(within(screen.getByRole('list', { name: '第 2 局守備' })).getByRole('button', { name: /^6 SS 子/ })).toHaveTextContent('換')
  })
  it('a substitute who comes in later is not 已下場 in an earlier inning; one who left is, and the hint follows 允許再上場', () => {
    open()
    fireEvent.click(screen.getByRole('tab', { name: /登錄名單/ }))
    // inning 1 (before 子's 代打): 子 is just on the bench
    fireEvent.click(within(screen.getByRole('list', { name: '第 1 局守備' })).getByRole('button', { name: /^7 LF/ }))
    expect(within(screen.getByRole('group', { name: '換成誰' })).getByRole('button', { name: '子' })).toBeTruthy()
    // inning 2: 丁 was replaced by 子, so 丁 has left
    fireEvent.click(within(screen.getByRole('group', { name: '看哪一局的守備' })).getByRole('button', { name: '2' }))
    fireEvent.click(within(screen.getByRole('list', { name: '第 2 局守備' })).getByRole('button', { name: /^7 LF/ }))
    fireEvent.click(within(screen.getByRole('group', { name: '換成誰' })).getByRole('button', { name: '丁・已下場' }))
    expect(screen.getByText(/他已下場：要在上面的板凳勾/)).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: '允許被換下的球員再上場' }))
    expect(screen.queryByText(/他已下場/)).toBeNull()
  })
  it('someone coming in at an empty position picks 替誰, with that player’s batting slot', async () => {
    const onSave = open()
    fireEvent.click(screen.getByRole('tab', { name: /登錄名單/ }))
    fireEvent.click(within(screen.getByRole('group', { name: '看哪一局的守備' })).getByRole('button', { name: '2' }))
    change('SS', '丙')                     // 2B is empty now
    fireEvent.click(within(screen.getByRole('list', { name: '第 2 局守備' })).getByRole('button', { name: /^4 2B 沒有人/ }))
    fireEvent.click(within(screen.getByRole('group', { name: '換成誰' })).getByRole('button', { name: '丑' }))
    expect(screen.getByRole('button', { name: '確認' })).toBeDisabled()
    fireEvent.click(within(screen.getByRole('group', { name: '替誰' })).getByRole('button', { name: /^子/ }))
    expect(screen.getByText('第 2 局起：丑 上場守 4 2B，替下 子')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '確認' }))
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(saved(onSave).game.dayRoster!.subs!.at(-1)).toEqual({ kind: 'DEF', in: '丑', out: '子', pos: '2B', inning: 2, half: 'top', slot: 3 })
  })
})
