/**
 * 修改資料 (batch 18): their plate appearances have 左右打 — 左打／右打／不知道, for the whole slot this game
 * (整段（同一棒這場）都改, the default) or this one only — in the panel and as a column of the table.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { GameEditor } from '../components/ui/GameEditor'
import type { GameEdit } from '../data/edit'
import type { PitchingPA } from '../data/types'

const game = { id: 'G20261016-01', date: '2026-10-16', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 7 }
const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: game.id, inning: 1, outsBefore: 0, basesBefore: '無', oppOrder: 1, pitcher: '壬', pitches: ['S', 'S', 'S'], result: '三振', code: 'I', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })
const rows = [pit({ oppBats: 'L' }), pit({ oppOrder: 2, outsBefore: 1, code: 'II' }), pit({ oppOrder: 3, outsBefore: 2, code: 'III' }), pit({ inning: 2, oppBats: 'L' }), pit({ inning: 2, oppOrder: 2, outsBefore: 1, code: 'II' }), pit({ inning: 2, oppOrder: 3, outsBefore: 2, code: 'III' })]
const open = (onSave: (e: GameEdit) => Promise<void>, n: number) => {
  render(<GameEditor initial={{ game, batting: [], pitching: rows, fielding: [] } satisfies GameEdit} roster={['壬']} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
  fireEvent.click(screen.getByRole('tab', { name: /投球/ }))
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^修改第 ${n} 個打席`) }))
}
const saved = async (onSave: ReturnType<typeof vi.fn<(e: GameEdit) => Promise<void>>>) => {
  fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
  await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
  return (onSave.mock.calls[0] as unknown as [GameEdit])[0].pitching
}

describe('修改資料: 對方打者左右打', () => {
  it('整段（同一棒這場）都改 (the default) changes both of his plate appearances', async () => {
    const onSave = vi.fn(async (_e: GameEdit) => undefined)
    open(onSave, 4)
    expect(screen.getByText('左打', { selector: 'span.font-medium' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '修改對方打者左右打' }))
    const modes = screen.getByRole('group', { name: '整段都改或只改這個打席' })
    expect(within(modes).getByRole('button', { name: '整段（同一棒這場）都改' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/他這場的 2 個打席一起改/)).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '左打或右打' })).getByRole('button', { name: '右打' }))
    fireEvent.click(screen.getByRole('button', { name: '套用' }))
    expect((await saved(onSave)).map((p) => p.oppBats)).toEqual(['R', undefined, undefined, 'R', undefined, undefined])
  })
  it('只改這個打席, and 不知道 takes it off', async () => {
    const onSave = vi.fn(async (_e: GameEdit) => undefined)
    open(onSave, 1)
    fireEvent.click(screen.getByRole('button', { name: '修改對方打者左右打' }))
    fireEvent.click(screen.getByRole('button', { name: '只改這個打席' }))
    fireEvent.click(within(screen.getByRole('group', { name: '左打或右打' })).getByRole('button', { name: '不知道' }))
    fireEvent.click(screen.getByRole('button', { name: '套用' }))
    const out = await saved(onSave)
    expect('oppBats' in out[0]).toBe(false)
    expect(out[3].oppBats).toBe('L')
  })
})
