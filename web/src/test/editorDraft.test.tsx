/**
 * 修改資料 does not lose changes (batch 1): the bar under the editor counts them, 取消 and anything that closes the game
 * ask first, and the changes stay on this device until saved — the next 修改資料 offers 接著改／丟掉.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GameEditor } from '../components/ui/GameEditor'
import { Sheet } from '../components/ui/Sheet'
import { changeCount, readEditDraft } from '../components/ui/editDraft'
import { confirmLeave } from '../lib/unsaved'
import type { GameEdit } from '../data/edit'
import type { BattingPA, PitchingPA } from '../data/types'

const game = { id: 'G20261019-01', date: '2026-10-19', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 7 }
const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: game.id, inning: 1, outsBefore: 0, basesBefore: '無', order: 1, batter: '甲', pitches: ['IP'], result: '內滾', code: 'I', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: game.id, inning: 1, outsBefore: 0, basesBefore: '無', oppOrder: 1, pitcher: '壬', pitches: ['IP'], result: '內滾', code: 'I', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })
const initial: GameEdit = { game, batting: [bat({}), bat({ order: 2, batter: '乙', outsBefore: 1 })], pitching: [pit({})], fielding: [] }

const open = (props: Partial<Parameters<typeof GameEditor>[0]> = {}) => {
  const onSave = vi.fn(async () => undefined); const onCancel = vi.fn()
  render(<GameEditor initial={initial} roster={['甲', '乙', '壬']} onSave={onSave} onCancel={onCancel} onDelete={() => {}} {...props} />)
  return { onSave, onCancel }
}
const status = () => screen.queryByText(/處修改還沒儲存$/)
const rename = (to: string) => {
  fireEvent.click(screen.getByRole('button', { name: /比賽資訊/ }))
  fireEvent.change(screen.getByDisplayValue('測試隊'), { target: { value: to } })
}
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('changeCount', () => {
  const snap = (b: string[], p: string[] = []) => ({ game: 'g', roster: 'r', fielding: 'f', batting: b, pitching: p })
  it('counts an edited, added, deleted or moved plate appearance once, and the game info, roster and 守備 once each', () => {
    const was = snap(['a', 'b', 'c'])
    expect(changeCount(was, snap(['a', 'b', 'c']))).toBe(0)
    expect(changeCount(was, snap(['a', 'B', 'c']))).toBe(1)
    expect(changeCount(was, snap(['a', 'x', 'b', 'c']))).toBe(1)
    expect(changeCount(was, snap(['a', 'c']))).toBe(1)
    expect(changeCount(was, snap(['b', 'a', 'c']))).toBe(1)
    expect(changeCount(was, snap(['a', 'B', 'C'], ['z']))).toBe(3)
    expect(changeCount(was, { ...snap(['a', 'b', 'c']), game: 'G', roster: 'R', fielding: 'F' })).toBe(3)
  })
})

describe('修改資料: unsaved changes', () => {
  it('opens with nothing to save; a change shows on the bar and is kept on this device', () => {
    open()
    expect(status()).toBeNull()
    expect(readEditDraft(game.id)).toBeNull()
    rename('新對手')
    expect(status()?.textContent).toBe('1 處修改還沒儲存')
    expect(readEditDraft<{ game: { opponent: string } }>(game.id)).toMatchObject({ changes: 1, game: { opponent: '新對手' } })
  })

  it('取消 asks before throwing the changes away, and nothing is left behind after it', () => {
    const { onCancel } = open()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledTimes(1) // nothing changed: no question
    rename('新對手')
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(ask.mock.calls[0][0]).toContain('放棄這 1 處修改')
    expect(onCancel).toHaveBeenCalledTimes(1)
    ask.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(readEditDraft(game.id)).toBeNull()
  })

  it('closing the game (✕, scrim, Escape) asks while changes are unsaved', () => {
    open()
    expect(confirmLeave()).toBe(true)
    rename('新對手')
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false)
    expect(confirmLeave()).toBe(false)
    expect(ask.mock.calls[0][0]).toContain('有 1 處修改還沒儲存')
    expect(ask.mock.calls[0][0]).toContain('接著改')
    cleanup()
    expect(confirmLeave()).toBe(true) // the editor is gone: nothing to ask about
  })

  it('the next 修改資料 offers 接著改: the changes come back and save', async () => {
    open(); rename('新對手'); cleanup()
    const { onSave } = open()
    expect(screen.getByText('這台裝置上有這場還沒儲存的修改')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '儲存修改' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '接著改' }))
    expect(status()?.textContent).toBe('1 處修改還沒儲存')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '儲存修改' })) })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect((onSave.mock.calls[0] as unknown as [GameEdit])[0].game.opponent).toBe('新對手')
    expect(readEditDraft(game.id)).toBeNull()
  })

  it('丟掉 starts from the game as saved; a game changed elsewhere since says so', () => {
    open(); rename('新對手'); cleanup()
    render(<GameEditor initial={{ ...initial, game: { ...game, venue: '別處改的' } }} roster={['甲']} onSave={vi.fn()} onCancel={vi.fn()} onDelete={() => {}} />)
    expect(screen.getByText(/這場之後有被修改過/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /丟掉/ }))
    expect(status()).toBeNull()
    expect(readEditDraft(game.id)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /比賽資訊/ }))
    expect(screen.getByDisplayValue('測試隊')).toBeInTheDocument()
  })

  it('after deleting a plate appearance whose runner the next ones carry, saving asks to rebuild that inning first', async () => {
    const rows = [bat({ result: '一安', code: undefined, pitches: ['IP'] }), bat({ order: 2, batter: '乙', basesBefore: '1', result: '二安', code: undefined, run: 0, rbi: 1 })]
    const { onSave } = open({ initial: { ...initial, batting: rows } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: /^修改第 1 個打席/ }))
    fireEvent.click(screen.getByRole('button', { name: '刪除這個打席' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '儲存修改' })) })
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('插入或刪除打席後，壘上的跑者接不起來')
  })

  it('a sheet with confirmClose stays open on Escape and the scrim when the answer is no', () => {
    const onClose = vi.fn(); let answer = false
    render(<Sheet open onClose={onClose} confirmClose={() => answer} ariaLabel="測試">內容</Sheet>)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: '關閉', hidden: true }))
    expect(onClose).not.toHaveBeenCalled()
    answer = true
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
