/**
 * 修改資料 (batch 14): 落點 and 軌跡 are required while recording, but an old game still saves; its batted balls that
 * lack them are marked 「缺落點／軌跡」 in the plate-appearance list and counted, per tab, next to 儲存修改.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GameEditor } from '../components/ui/GameEditor'
import type { GameEdit } from '../data/edit'
import type { BattingPA, PitchingPA } from '../data/types'

const game = { id: 'G20261014-01', date: '2026-10-14', tournament: '友誼賽', opponent: '測試隊', homeAway: '主' as const, innings: 7 }
const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: game.id, inning: 1, outsBefore: 0, basesBefore: '無', order: 1, batter: '甲', pitches: ['IP'], result: '內滾', loc: 6, traj: 'G', code: 'I', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: game.id, inning: 1, outsBefore: 0, basesBefore: '無', oppOrder: 1, pitcher: '壬', pitches: ['IP'], result: '內滾', loc: 6, traj: 'G', code: 'I', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })

describe('修改資料: batted balls without 落點／軌跡', () => {
  it('marks them in the list, counts them next to 儲存修改, and still saves', async () => {
    const onSave = vi.fn(async () => undefined)
    const batting = [bat({ result: '一安', loc: undefined, traj: undefined, code: undefined }), bat({ order: 2, basesBefore: '1', result: '三振', loc: undefined, traj: undefined, pitches: ['SS', 'SS', 'SS'] }), bat({ order: 3, basesBefore: '1', outsBefore: 1, result: '外飛', loc: 8, traj: undefined, code: 'II' })]
    const pitching = [pit({ result: '二安', loc: 78, traj: undefined, code: undefined }), pit({ oppOrder: 2, basesBefore: '2', result: '保送', loc: undefined, traj: undefined, pitches: ['B', 'B', 'B', 'B'], code: undefined })]
    const initial: GameEdit = { game, batting, pitching, fielding: [] }
    render(<GameEditor initial={initial} roster={['甲', '壬']} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    // our side: the 一安 lacks both, the 外飛 its 軌跡; the 三振 is no batted ball
    expect(screen.getByText('缺落點／軌跡')).toBeTruthy()
    expect(screen.getByText('缺軌跡')).toBeTruthy()
    // the count next to 儲存修改 says which tab holds them, so it adds up with the tags on that tab
    expect(screen.getByRole('status').textContent).toBe('缺落點或軌跡的擊球：我隊打擊 2 個、我隊投球 1 個（清單上標「缺落點」或「缺軌跡」，可以先儲存）')
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
  })
})
