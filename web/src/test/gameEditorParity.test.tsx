/**
 * 修改資料 mirrors live recording for both sides (batch 11): 對方失誤 and their RBI survive the editor, and a
 * 失誤進壘 on their plate appearance without our fielder cannot be saved (紀錄比賽 does not send it either).
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { GameEditor } from '../components/ui/GameEditor'
import type { GameEdit } from '../data/edit'
import type { BattingPA, PitchingPA } from '../data/types'
import { errorsOf, oppErrorsOf } from '../data/errors'

const game = { id: 'G20261013-01', date: '2026-10-13', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 7 }
const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: game.id, inning: 1, outsBefore: 0, basesBefore: '無', order: 1, batter: '甲', pitches: ['IP'], result: '內滾', code: 'I', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: game.id, inning: 1, outsBefore: 0, basesBefore: '無', oppOrder: 1, pitcher: '壬', pitches: ['IP'], result: '內滾', code: 'I', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })

const edit = (pitching: PitchingPA[], batting: BattingPA[] = [bat({})]): GameEdit => ({ game, batting, pitching, fielding: [] })

describe('修改資料: their side', () => {
  it('keeps 對方失誤 and their 打點 through the editor', async () => {
    const onSave = vi.fn(async () => undefined)
    render(<GameEditor initial={edit([pit({ result: '一安', code: undefined, basesBefore: '無', rbi: 0 }), pit({ oppOrder: 2, result: '二安', basesBefore: '1', code: undefined, rbi: 1 })], [bat({ errors: ['C', '?'] })])} roster={['甲', '壬']} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = (onSave.mock.calls[0] as unknown as [GameEdit])[0]
    expect(saved.batting[0].errors).toEqual(['C', '?'])
    expect(saved.pitching[1].rbi).toBe(1)
    expect('rbi' in saved.pitching[0]).toBe(false)
  })
  it('a 失誤進壘 of their runner without whose error is not saved', async () => {
    const onSave = vi.fn(async () => undefined)
    const rows = [pit({ result: '一安', code: undefined }), pit({ oppOrder: 2, basesBefore: '1', result: '三振', code: 'I', pitches: ['B', 'SS', 'SS', 'SS'], events: [{ at: 1, kind: 'err', from: 1, to: 2 }] })]
    render(<GameEditor initial={edit(rows)} roster={['甲', '壬']} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    expect(await screen.findByText(/第 2 個打席有「失誤進壘」，請在「我隊守備失誤」點是誰失誤/)).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
    // pick the catcher: it saves
    fireEvent.click(screen.getByRole('button', { name: '2 C' }))
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    expect((onSave.mock.calls[0] as unknown as [GameEdit])[0].pitching[1].errors).toEqual(['C'])
  })
})

describe('修改資料: our side', () => {
  it('a 失誤進壘 switched to 趁傳 takes its named fielder off 對方失誤', async () => {
    // 紀錄比賽: 一安, the batter took 2B on their SS error (picked live, so the list holds 'SS', after a 不知道 pressed earlier)
    const onSave = vi.fn(async () => undefined)
    const row = bat({ result: '一安', code: undefined, errors: ['?', 'SS'], events: [{ at: 0, kind: 'err', from: 1, to: 2, play: true, batter: true }], advOnError: 1 })
    render(<GameEditor initial={edit([pit({})], [row])} roster={['甲', '壬']} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^修改第 1 個打席/ }))
    fireEvent.click(await screen.findByRole('button', { name: /趁傳（不算失誤）/ }))
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = (onSave.mock.calls[0] as unknown as [GameEdit])[0].batting[0]
    expect(saved.errors).toEqual(['?'])
    expect(saved.advOnError).toBe(0)
  })
})


describe('修改資料 counts errors like 紀錄比賽 (batch 11 review)', () => {
  it('a 失誤 result at SS plus a 失誤進壘 by the same SS: one click counts both', async () => {
    const onSave = vi.fn(async () => undefined)
    const rows = [pit({ result: '一安', code: undefined }), pit({ oppOrder: 2, basesBefore: '1', result: '失誤', loc: 6, code: undefined, pitches: ['B', 'IP'], events: [{ at: 1, kind: 'err', from: 1, to: 2 }] })]
    render(<GameEditor initial={edit(rows)} roster={['甲', '壬']} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: /投球/ }))
    fireEvent.click(screen.getByRole('button', { name: /^修改第 2 個打席/ }))
    const box = (await screen.findByText('我隊守備失誤')).closest('section') as HTMLElement
    fireEvent.click(within(box).getByRole('button', { name: '6 SS' }))
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = (onSave.mock.calls[0] as unknown as [GameEdit])[0].pitching[1]
    expect(saved.errors).toEqual(['SS', 'SS'])
    const e = errorsOf(saved)
    expect(e.positions.length + e.unknown).toBe(2)
  })
  it('一安 with a 失誤進壘 changed to 失誤: the 不知道 it had added goes, so the error counts once', async () => {
    const onSave = vi.fn(async () => undefined)
    const row = bat({ result: '一安', code: undefined, errors: ['?'], events: [{ at: 0, kind: 'err', from: 1, to: 2, play: true, batter: true }], advOnError: 1 })
    render(<GameEditor initial={edit([pit({})], [row])} roster={['甲', '壬']} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^修改第 1 個打席/ }))
    fireEvent.click(await screen.findByRole('button', { name: '失誤', pressed: false }))
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = (onSave.mock.calls[0] as unknown as [GameEdit])[0].batting[0]
    expect(saved.result).toBe('失誤')
    expect(saved.errors).toBeUndefined()
    expect(oppErrorsOf(saved).count).toBe(1)
  })
})
