/** Batch 17 bug 3: the 報名名單 editor flags a list whose 杯賽 no game uses and moves it to the new name in one tap;
 *  editing a list's 杯賽 renames it (no copy left behind). */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RegistrationEditor } from '../components/ui/RegistrationEditor'
import type { Game, Registration } from '../data/types'

const games: Game[] = [{ id: 'G1', date: '2026-10-01', tournament: '2026秋季聯賽', opponent: '甲', homeAway: '主' }]
const regs: Registration[] = [{ season: 2026, tournament: '秋季聯賽', players: ['王', '李'] }]
const roster = [{ name: '王' }, { name: '李' }, { name: '陳' }]

describe('報名名單 editor: renamed tournaments', () => {
  it('flags 「沒有比賽用這個杯賽名稱」 and 改成「2026秋季聯賽」 moves the list', async () => {
    const onSave = vi.fn(async () => undefined), onDelete = vi.fn(async () => undefined)
    render(<RegistrationEditor registrations={regs} roster={roster} games={games} supported canEdit onSave={onSave} onDelete={onDelete} />)
    expect(screen.getByText(/2026 年還沒有比賽用這個杯賽名稱/)).toBeTruthy()
    // (it asks first, naming what the merge does)
    const ask = vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: '改成「2026秋季聯賽」' }))
    expect(ask.mock.calls[0][0]).toMatch(/只列名單上的 2 人/)
    expect(onSave).not.toHaveBeenCalled()
    ask.mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: '改成「2026秋季聯賽」' }))
    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledWith(2026, '秋季聯賽'))
    expect(onSave).toHaveBeenCalledWith({ season: 2026, tournament: '2026秋季聯賽', players: ['王', '李'] })
  })
  it('編輯 → 杯賽 changed → 儲存 renames the list', async () => {
    const onSave = vi.fn(async () => undefined), onDelete = vi.fn(async () => undefined)
    render(<RegistrationEditor registrations={regs} roster={roster} games={games} supported canEdit onSave={onSave} onDelete={onDelete} />)
    fireEvent.click(screen.getByRole('button', { name: '編輯' }))
    fireEvent.change(screen.getByPlaceholderText('例如 大專盃'), { target: { value: '2026秋季聯賽' } })
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledWith(2026, '秋季聯賽'))
    expect(onSave).toHaveBeenCalledWith({ season: 2026, tournament: '2026秋季聯賽', players: ['王', '李'] })
  })
  it('a list registered before its first game is never offered 友誼賽', () => {
    const fr: Game[] = [...games, { id: 'G2', date: '2026-09-01', tournament: '友誼賽', opponent: '乙', homeAway: '主' }]
    render(<RegistrationEditor registrations={[...regs.map((r) => ({ ...r, tournament: '2026秋季聯賽' })), { season: 2026, tournament: '新生盃', players: ['陳'] }]} roster={roster} games={fr} supported canEdit onSave={async () => {}} onDelete={async () => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /新生盃/ }))
    expect(screen.getByText(/還沒有比賽用這個杯賽名稱。先報名/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /改成/ })).toBeNull()
  })
  it('a list whose 杯賽 has games is not flagged', () => {
    render(<RegistrationEditor registrations={[{ ...regs[0], tournament: '2026秋季聯賽' }]} roster={roster} games={games} supported canEdit onSave={async () => {}} onDelete={async () => {}} />)
    expect(screen.queryByText(/沒有比賽用這個杯賽名稱/)).toBeNull()
  })
})
