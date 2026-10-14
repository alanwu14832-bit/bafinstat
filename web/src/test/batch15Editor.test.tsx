/**
 * batch 15 in 修改資料: a batter who reached and was put out on the same play can be set so in 壘上跑者 (壘上出局, with a
 * 跑壘失誤（壘死） toggle), an old row with that warning is one click 「設成壘上出局」, and the opponent pitcher of a
 * later plate appearance of a stint is either fixed for the whole stint or changed from there.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { GameEditor } from '../components/ui/GameEditor'
import type { GameEdit } from '../data/edit'
import type { BattingPA, PitchingPA } from '../data/types'
import { isBatterOutMark } from '../record/timeline'

const game = { id: 'G20261014-01', date: '2026-10-14', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 7 }
const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: game.id, inning: 1, outsBefore: 0, basesBefore: '無', order: 1, batter: '甲', pitches: ['IP'], result: '內滾', loc: 6, traj: 'G', code: 'I', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: game.id, inning: 1, outsBefore: 0, basesBefore: '無', oppOrder: 1, pitcher: '壬', pitches: ['IP'], result: '內滾', loc: 6, traj: 'G', code: 'I', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })
const edit = (batting: BattingPA[]): GameEdit => ({ game, batting, pitching: [pit({})], fielding: [] })
const roster = ['苗軒杰', '乙', '丙', '丁', '壬']
const saveAndGet = async (onSave: ReturnType<typeof vi.fn>) => {
  fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
  await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
  return (onSave.mock.calls[0] as unknown as [GameEdit])[0]
}

describe('修改資料: 三安 then out on the bases', () => {
  it('an old row (三安 with code I, no 壘上出局): the warning names what is on screen and 設成壘上出局 clears it', async () => {
    const onSave = vi.fn(async () => undefined)
    const rows = [bat({ batter: '苗軒杰', result: '三安', loc: 8, traj: 'L', code: 'I', inning: 3 }), bat({ batter: '乙', order: 2, outsBefore: 1, code: 'II', inning: 3 }), bat({ batter: '丙', order: 3, outsBefore: 2, code: 'III', inning: 3 })]
    render(<GameEditor initial={edit(rows)} roster={roster} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^修改第 1 個打席/ }))
    const warning = await screen.findByText(/第 3 局・苗軒杰：上壘（三安）卻記出局碼 I。若是打完被觸殺出局：在「壘上跑者」把他設成出局/)
    expect(warning.textContent).not.toContain('壘死')
    expect(screen.getByText('壘上跑者')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '設成壘上出局' }))
    expect(screen.queryByText(/卻記出局碼/)).toBeNull()
    expect(screen.queryByRole('button', { name: '設成壘上出局' })).toBeNull()
    const saved = (await saveAndGet(onSave)).batting[0]
    expect(saved).toMatchObject({ result: '三安', code: 'I', outOnBase: 1 })
    expect((saved.events ?? []).filter(isBatterOutMark)).toHaveLength(1)
  })
  it('the batter set to 出局 after his triple: 壘上出局 by itself, a 跑壘失誤（壘死） toggle, back to 3B clears both', async () => {
    const onSave = vi.fn(async () => undefined)
    const rows = [bat({ batter: '苗軒杰', result: '三安', loc: 8, traj: 'L', code: 'L' }), bat({ batter: '乙', order: 2, basesBefore: '3', code: 'I' }), bat({ batter: '丙', order: 3, basesBefore: '3', outsBefore: 1, code: 'II' })]
    render(<GameEditor initial={edit(rows)} roster={roster} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^修改第 1 個打席/ }))
    const ends = await screen.findByRole('group', { name: '苗軒杰 這打席結束時' })
    expect(screen.queryByRole('button', { name: '跑壘失誤（壘死）' })).toBeNull()
    fireEvent.click(within(ends).getByRole('button', { name: '出局' }))
    const toggle = await screen.findByRole('button', { name: '跑壘失誤（壘死）' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByText(/卻記出局碼/)).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: '跑壘失誤（壘死）' }).getAttribute('aria-pressed')).toBe('true')
    const saved = await saveAndGet(onSave)
    expect(saved.batting[0]).toMatchObject({ code: 'I', outOnBase: 1, baserunningOuts: 1 })
    expect(saved.batting.map((r) => r.code)).toEqual(['I', 'II', 'III'])
    // back on 3B
    fireEvent.click(within(screen.getByRole('group', { name: '苗軒杰 這打席結束時' })).getByRole('button', { name: '3B' }))
    expect(screen.queryByRole('button', { name: '跑壘失誤（壘死）' })).toBeNull()
    onSave.mockClear()
    const again = (await saveAndGet(onSave)).batting[0]
    expect(again).toMatchObject({ code: 'L', outOnBase: 0 })
    expect('baserunningOuts' in again).toBe(false)
  })
})

describe('修改資料: 對方投手 整段都改 or 從這個打席起換投', () => {
  const L = { oppHand: 'L' as const }, R = { oppHand: 'R' as const }
  const rows = () => [bat({ ...L, batter: '苗軒杰', code: 'I' }), bat({ ...L, batter: '乙', order: 2, outsBefore: 1, code: 'II' }), bat({ ...L, batter: '丙', order: 3, outsBefore: 2, code: 'III' }), bat({ ...R, batter: '丁', order: 4, inning: 2, code: 'I' })]
  const openOpp = async (n: number) => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^修改第 ${n} 個打席`) }))
    const line = (await screen.findByText('對方投手：')).parentElement as HTMLElement
    fireEvent.click(within(line).getByRole('button', { name: '修改' }))
  }
  it('a later row of the stint: 整段都改 (the default) fixes the whole stint, hand only', async () => {
    const onSave = vi.fn(async () => undefined)
    render(<GameEditor initial={edit(rows())} roster={roster} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    await openOpp(2)
    const modes = screen.getByRole('group', { name: '整段都改或換投' })
    expect(within(modes).getByRole('button', { name: '整段都改' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('同一位投手記錯了：他這一段的 3 個打席一起改')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '左投或右投' })).getByRole('button', { name: '右投' }))
    fireEvent.click(screen.getByRole('button', { name: '套用' }))
    expect((await saveAndGet(onSave)).batting.map((r) => r.oppHand)).toEqual(['R', 'R', 'R', 'R'])
  })
  it('從這個打席起換投 changes from there to the end of the stint', async () => {
    const onSave = vi.fn(async () => undefined)
    render(<GameEditor initial={edit(rows())} roster={roster} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    await openOpp(2)
    fireEvent.click(screen.getByRole('button', { name: '從這個打席起換投' }))
    expect(screen.getByText(/從這裡到下一次換投前的 2 個打席改成新投手/)).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '左投或右投' })).getByRole('button', { name: '右投' }))
    fireEvent.click(screen.getByRole('button', { name: '套用' }))
    expect((await saveAndGet(onSave)).batting.map((r) => r.oppHand)).toEqual(['L', 'R', 'R', 'R'])
  })
  it('the first row of a stint asks nothing and fixes the whole stint (hand only)', async () => {
    const onSave = vi.fn(async () => undefined)
    render(<GameEditor initial={edit(rows())} roster={roster} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    await openOpp(1)
    expect(screen.queryByRole('group', { name: '整段都改或換投' })).toBeNull()
    fireEvent.click(within(screen.getByRole('group', { name: '左投或右投' })).getByRole('button', { name: '右投' }))
    fireEvent.click(screen.getByRole('button', { name: '套用' }))
    expect((await saveAndGet(onSave)).batting.map((r) => r.oppHand)).toEqual(['R', 'R', 'R', 'R'])
  })
})
