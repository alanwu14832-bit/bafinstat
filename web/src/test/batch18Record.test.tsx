/**
 * 紀錄比賽 (batch 18): the opponent pitcher's hand and the opponent batter's side are required — the pitch pad and the
 * results wait for 左投／右投／不知道 (we bat) or 左打／右打 (they bat, no 不知道); before the 2026-10-16
 * migration the batter-side question is not shown at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'

vi.mock('../data/supabase', async (orig) => ({
  ...(await orig<typeof import('../data/supabase')>()),
  saveCloudDraft: vi.fn(async () => true),
  listCloudDrafts: vi.fn(async () => []),
  deleteCloudDraft: vi.fn(async () => undefined),
}))

import { RecordPage } from '../pages/Record'
import { DRAFT_KEY, PRACTICE_KEY, readDraft, writeDraft } from '../record/draft'
import { addPitch, commitPA, defaultPlan, newGame, setOppPitcher, type RecordState } from '../record/model'
import { useDataStore } from '../store/data'
import { ALL_RECORD_FIELDS } from '../data/recordFields'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = (homeAway: '主' | '客') => ({ id: 'PRACTICE-20261016', date: '2026-10-16', tournament: '練習', opponent: '練習對手', homeAway })
const start = (s: RecordState) => { writeDraft({ ...s, practice: true }, PRACTICE_KEY); render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>) }
const draft = () => readDraft(PRACTICE_KEY)!
const ball = () => screen.getByRole('button', { name: /^壞球/ }) as HTMLButtonElement
Element.prototype.scrollIntoView ??= () => {}
const cloudBefore = useDataStore.getState().cloud
afterEach(() => { cleanup(); writeDraft(null, PRACTICE_KEY); writeDraft(null); useDataStore.setState({ cloud: cloudBefore, recordFields: ALL_RECORD_FIELDS }) })

describe('紀錄比賽: 對方投手左右投 is required', () => {
  it('before the first pitch of our first half: the pad and the results wait; 右投 opens them; 復原 asks again', async () => {
    start(newGame(game('客'), lineup, '甲'))
    const strip = screen.getByRole('group', { name: '對方投手左右投' })
    expect(within(strip).queryByRole('button', { name: '不記' })).toBeNull()
    expect(screen.getByText(/先選對方投手左投或右投（看不出來就按「不知道」）/)).toBeTruthy()
    expect(ball().disabled).toBe(true)
    expect((screen.getByRole('button', { name: '一安' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(strip).getByRole('button', { name: '右投' }))
    await wait(50)
    expect(draft().oppPitcher).toEqual({ hand: 'R' })
    expect(ball().disabled).toBe(false)
    expect(screen.queryByRole('group', { name: '對方投手左右投' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '復原上一步' }))
    await wait(50)
    expect(screen.getByRole('group', { name: '對方投手左右投' })).toBeTruthy()
    expect(ball().disabled).toBe(true)
  })
  it('不知道 is an answer: nothing goes on the rows', async () => {
    start(newGame(game('客'), lineup, '甲'))
    fireEvent.click(within(screen.getByRole('group', { name: '對方投手左右投' })).getByRole('button', { name: '不知道' }))
    await wait(50)
    expect(draft().oppPitcher).toEqual({ handUnknown: true })
    expect(ball().disabled).toBe(false)
  })
  it('對方換投: the sheet needs 左投／右投／不知道 before 換投; a pitcher with only a name is asked his hand', async () => {
    let s = setOppPitcher(newGame(game('客'), lineup, '甲'), { hand: 'R' })
    s = commitPA(addPitch(s, 'S'), defaultPlan(s, '三振'))
    start(s)
    fireEvent.click(screen.getByRole('button', { name: '對方 右投' }))
    const sheet = await screen.findByRole('dialog', { name: '對方投手' })
    fireEvent.click(within(sheet).getByRole('button', { name: '對方換投' }))
    fireEvent.change(within(sheet).getByPlaceholderText('例如 12號'), { target: { value: '林' } })
    expect((within(sheet).getByRole('button', { name: '換投' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(within(sheet).getByRole('group', { name: '左投或右投' })).getByRole('button', { name: '不知道' }))
    fireEvent.click(within(sheet).getByRole('button', { name: '換投' }))
    await wait(50)
    expect(draft().oppPitcher).toEqual({ name: '林', handUnknown: true })
    expect(draft().oppPitcherFrom).toEqual({ row: 1, pitches: 0 })
    expect(ball().disabled).toBe(false)
    cleanup()
    // an older draft: 換投 to a name only (no hand) → asked, and the answer is his (no second 換投)
    start(setOppPitcher(s, { name: '陳' }))
    const strip = screen.getByRole('group', { name: '對方投手左右投' })
    expect(within(strip).getByText('對方投手 陳是？')).toBeTruthy()
    fireEvent.click(within(strip).getByRole('button', { name: '左投' }))
    await wait(50)
    expect(draft().oppPitcher).toEqual({ name: '陳', hand: 'L' })
    expect(draft().oppPitcherChanges).toHaveLength(1)
  })
  it('a progress that pressed the old 「不記」 is asked once', () => {
    start({ ...newGame(game('客'), lineup, '甲'), oppHandOff: true } as RecordState)
    expect(screen.getByRole('group', { name: '對方投手左右投' })).toBeTruthy()
    expect(ball().disabled).toBe(true)
  })
})

describe('紀錄比賽: 對方打者左打／右打', () => {
  it('asked next to 「對方第 N 棒」; the pad waits; the side goes on his row and comes back for his next time up', async () => {
    start(newGame(game('主'), lineup, '甲'))
    expect(screen.getByText(/先選對方打者左打或右打/)).toBeTruthy()
    expect(ball().disabled).toBe(true)
    const chips = () => screen.getByRole('group', { name: '對方打者左打或右打' })
    fireEvent.click(within(chips()).getByRole('button', { name: '左打' }))
    await wait(50)
    expect(within(chips()).getByRole('button', { name: '左打' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/對方第 1 棒：左打/)).toBeTruthy()
    expect(ball().disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '三振' }))
    fireEvent.click(screen.getByRole('button', { name: /送出這個打席/ }))
    await wait(50)
    expect(draft().pitching[0].oppBats).toBe('L')
    // the next batter: asked again, and there is no 不知道 — a side has to be picked
    expect(ball().disabled).toBe(true)
    expect(within(chips()).queryByRole('button', { name: '不知道' })).toBeNull()
    fireEvent.click(within(chips()).getByRole('button', { name: '右打' }))
    await wait(50)
    fireEvent.click(screen.getByRole('button', { name: '三振' }))
    fireEvent.click(screen.getByRole('button', { name: /送出這個打席/ }))
    await wait(50)
    expect(draft().pitching[1].oppBats).toBe('R')
  })
  it('a batter already picked this game is pre-filled (one tap per batter per game)', () => {
    const s = { ...newGame(game('主'), lineup, '甲'), oppBatsBySlot: { 1: 'R' as const } }
    start(s)
    expect(within(screen.getByRole('group', { name: '對方打者左打或右打' })).getByRole('button', { name: '右打' }).getAttribute('aria-pressed')).toBe('true')
    expect(ball().disabled).toBe(false)
  })
  it('before the 2026-10-16 migration (cloud without pitching_pa.opp_bats) it is not asked at all', async () => {
    useDataStore.setState({ cloud: { ...cloudBefore, configured: true, status: 'ready', user: { id: 'u1', email: 'a@b.c' } as User, isEditor: true }, recordFields: { ...ALL_RECORD_FIELDS, oppBats: false } })
    writeDraft({ ...newGame({ ...game('主'), id: 'G20261016-01', tournament: '聯賽' }, lineup, '甲'), updatedAt: '2026-10-16T05:00:00.000Z' }, DRAFT_KEY)
    render(<MemoryRouter initialEntries={['/record']}><RecordPage /></MemoryRouter>)
    await wait(50)
    expect(screen.queryByRole('group', { name: '對方打者左打或右打' })).toBeNull()
    expect(ball().disabled).toBe(false)
    expect(screen.getByText(/對方打者左打／右打要等管理員在 Supabase 執行 supabase\/migrations\/2026-10-16_opp_bats.sql/)).toBeTruthy()
  })
})
