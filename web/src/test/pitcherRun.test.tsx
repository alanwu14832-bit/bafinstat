/**
 * 修改資料: the starter was entered wrong. Changing the pitcher of one plate appearance offers to change the ones right
 * after it that name the same pitcher, up to the next pitching change.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GameEditor } from '../components/ui/GameEditor'
import { carryPitcher, pitcherChangedAt, pitcherRunAfter, type GameEdit } from '../data/edit'
import type { PitchingPA } from '../data/types'

const game = { id: 'G20261113-01', date: '2026-11-13', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 7 }
const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: game.id, inning: 1, outsBefore: 0, basesBefore: '無', oppOrder: 1, pitcher: '甲', pitches: ['S', 'S', 'S'], result: '三振', code: 'I', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })
// 甲 ×3, then 乙 comes in during a count (甲 threw its first 2 pitches), then 甲 is named once more later
const rows = [pit({}), pit({ oppOrder: 2, outsBefore: 1, code: 'II' }), pit({ oppOrder: 3, outsBefore: 2, code: 'III' }),
  pit({ inning: 2, oppOrder: 4, pitcher: '乙', priorPitchers: [{ name: '甲', pitches: 2 }] }), pit({ inning: 2, oppOrder: 5, outsBefore: 1, code: 'II', pitcher: '乙' }), pit({ inning: 2, oppOrder: 6, outsBefore: 2, code: 'III', pitcher: '甲' })]

const openTable = (onSave: (e: GameEdit) => Promise<void>) => {
  render(<GameEditor initial={{ game, batting: [], pitching: rows, fielding: [] } satisfies GameEdit} roster={['甲', '乙', '丙']} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
  fireEvent.click(screen.getByRole('tab', { name: /投球/ }))
  fireEvent.click(screen.getByRole('tab', { name: '表格' }))
  return screen.getAllByLabelText('投手') as HTMLSelectElement[]
}
const saved = async (onSave: ReturnType<typeof vi.fn<(e: GameEdit) => Promise<void>>>) => {
  fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
  await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
  return (onSave.mock.calls[0] as unknown as [GameEdit])[0].pitching
}

describe('修改資料: a corrected pitcher carries to the rest of his stint', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('counts and renames only the rows right after, up to the next pitching change', () => {
    const next = rows.map((r, k) => (k === 0 ? { ...r, pitcher: '丙' } : r))
    expect(pitcherChangedAt(rows, next)).toBe(0)
    expect(pitcherChangedAt(rows, rows)).toBeNull()
    expect(pitcherRunAfter(next, 0, '甲')).toBe(2)
    const out = carryPitcher(next, 0, '甲', '丙')
    expect(out.map((r) => r.pitcher)).toEqual(['丙', '丙', '丙', '乙', '乙', '甲'])
    // the pitches he threw before 乙 came in go with him
    expect(out[3].priorPitchers).toEqual([{ name: '丙', pitches: 2 }])
  })

  it('表格: changing the first row asks, and 確定 changes his whole stint', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn(async (_e: GameEdit) => undefined)
    const cells = openTable(onSave)
    fireEvent.change(cells[0], { target: { value: '丙' } })
    expect(ask.mock.calls[0][0]).toContain('後面連續 2 個打席的投手也是「甲」')
    expect((await saved(onSave)).map((p) => p.pitcher)).toEqual(['丙', '丙', '丙', '乙', '乙', '甲'])
  })

  it('取消 changes that one plate appearance only; the last of a stint does not ask', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onSave = vi.fn(async (_e: GameEdit) => undefined)
    const cells = openTable(onSave)
    fireEvent.change(cells[0], { target: { value: '丙' } })
    expect(ask).toHaveBeenCalledTimes(1)
    fireEvent.change((screen.getAllByLabelText('投手') as HTMLSelectElement[])[4], { target: { value: '丙' } })
    expect(ask).toHaveBeenCalledTimes(1)
    expect((await saved(onSave)).map((p) => p.pitcher)).toEqual(['丙', '甲', '甲', '乙', '丙', '甲'])
  })
})
