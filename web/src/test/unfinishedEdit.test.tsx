/**
 * 2026-11-25: two out, a runner on first, two pitches thrown, and he is caught stealing on the third: the half ends with
 * the batter's count unfinished (未完成打席). 修改資料 can now fix that row (who was up, every pitch, its 球速), and the
 * runner's 盜壘失敗 stays on his own row.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { addPitch, commitPA, defaultPlan, newGame, runnerEvent, toGameEdit } from '../record/model'
import { normalizeGameEdit } from '../data/edit'
import { GameEditor } from '../components/ui/GameEditor'
import type { BattingPA, PitchingPA } from '../data/types'

const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
afterEach(() => cleanup())

/** 客: we bat first (our 丙 is caught stealing while 丁 is up); 主: they bat first (their runner, our pitcher 甲) */
function caughtStealing(homeAway: '主' | '客') {
  let s = newGame({ id: 'G20261125-09', date: '2026-11-25', tournament: '練習', opponent: '對手', homeAway }, lineup, '甲')
  const k = () => { s = commitPA(['S', 'S', 'S'].reduce((x, p) => addPitch(x, p), s), defaultPlan(s, '三振')) }
  k(); k()
  s = commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '一安'), loc: 7, traj: 'L', quality: '中' })
  s = addPitch(addPitch(addPitch(s, 'B'), 'S'), 'B')
  s = runnerEvent(s, s.runners[0].row, s.runners[0].side, 'cs')
  const { fragment } = normalizeGameEdit(lineup.map((l) => ({ name: l.name })), toGameEdit(s))
  return { game: fragment.games[0], batting: fragment.batting, pitching: fragment.pitching, fielding: fragment.fielding }
}

describe('修改資料: 未完成打席', () => {
  it('our side: the batter (not a pitcher), every pitch and its 球速 can be fixed; the runner keeps his 盜壘失敗', async () => {
    const initial = caughtStealing('客')
    expect(initial.batting.map((p) => p.result)).toEqual(['三振', '三振', '一安', '未完成打席'])
    const onSave = vi.fn(async () => undefined)
    render(<GameEditor initial={initial} roster={lineup.map((l) => l.name)} onSave={onSave} onCancel={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^修改第 4 個打席/ }))
    expect(screen.getByText('未完成打席（不算打席）')).toBeTruthy()
    expect(screen.queryByLabelText('投手')).toBeNull()
    expect((screen.getByLabelText('打者') as HTMLSelectElement | HTMLInputElement).value).toBe('丁')
    // the second pitch was a swinging strike, and one more ball was thrown before the runner went
    fireEvent.click(screen.getByRole('button', { name: /修改第 2 球/ }))
    fireEvent.click(screen.getByRole('button', { name: '改成…' }))
    fireEvent.click(within(screen.getByRole('group', { name: '第 2 球' })).getByRole('button', { name: '揮空' }))
    fireEvent.click(within(screen.getByRole('group', { name: '加一球' })).getByRole('button', { name: '壞球' }))
    const speeds = screen.getByLabelText('這個打席每一球的球速')
    fireEvent.change(speeds, { target: { value: '120,125,,118' } })
    fireEvent.blur(speeds)
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const out = (onSave.mock.calls[0] as unknown as [{ batting: BattingPA[] }])[0].batting
    expect(out[3]).toMatchObject({ result: '未完成打席', batter: '丁', pitches: ['B', 'SS', 'B', 'B'], speeds: [120, 125, null, 118] })
    expect(out[2]).toMatchObject({ batter: '丙', result: '一安', cs: 1, code: 'III' })
  })

  it('their side: our pitcher is the one named', () => {
    const initial = caughtStealing('主')
    expect(initial.pitching.at(-1)?.result).toBe('未完成打席')
    render(<GameEditor initial={initial} roster={lineup.map((l) => l.name)} onSave={vi.fn()} onCancel={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: /投球/ }))
    fireEvent.click(screen.getByRole('button', { name: /^修改第 4 個打席/ }))
    expect(screen.getByText('未完成打席（不算打席）')).toBeTruthy()
    expect((screen.getByLabelText('投手') as HTMLSelectElement | HTMLInputElement).value).toBe('甲')
    expect(screen.queryByLabelText('打者')).toBeNull()
    void ({} as PitchingPA)
  })
})
