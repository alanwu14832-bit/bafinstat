/**
 * batch 15 on 紀錄比賽: correcting the opponent pitcher's hand (左投 written by mistake) keeps his pitch count and one
 * stint; 對方換投 still starts a new one. A batter who reached and was put out on the same play is a 壘上出局 (壘死 when
 * it was his own mistake). Run on 練習紀錄 (this device only, no cloud).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage } from '../pages/Record'
import { PRACTICE_KEY, readDraft, writeDraft } from '../record/draft'
import { addPitch, commitPA, defaultPlan, newGame, setOppPitcher, type RecordState } from '../record/model'
import { auditGame } from '../data/audit'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
const game = { id: 'PRACTICE-20261014', date: '2026-10-14', tournament: '練習', opponent: '練習對手', homeAway: '客' as const }
const start = (s: RecordState) => { writeDraft({ ...s, practice: true }, PRACTICE_KEY); render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>) }
const draft = () => readDraft(PRACTICE_KEY)!
const countText = () => screen.getByTitle(/對方現在這位投手投給我們的球數/).textContent
Element.prototype.scrollIntoView ??= () => {}
afterEach(() => { cleanup(); writeDraft(null, PRACTICE_KEY) })

// we bat first; 左投 by mistake, two plate appearances, two pitches to the third batter
const recorded = () => {
  let s = newGame(game, lineup, '甲')
  s = setOppPitcher(s, { hand: 'L' })
  s = commitPA(addPitch(addPitch(s, 'B'), 'IP'), { ...defaultPlan(s, '一安'), loc: 7, traj: 'L' })
  s = commitPA(addPitch(addPitch(addPitch(s, 'CS'), 'SS'), 'SS'), defaultPlan(s, '三振'))
  return addPitch(addPitch(s, 'B'), 'B')
}

describe('紀錄比賽: 更正這位投手 vs 對方換投', () => {
  it('更正 (the default): 右投 on every row of his, 「對方投手 N 球」 does not start again', async () => {
    start(recorded())
    expect(countText()).toBe('對方投手 7 球')
    fireEvent.click(screen.getByRole('button', { name: '對方 左投' }))
    const sheet = await screen.findByRole('dialog', { name: '對方投手' })
    const modes = within(sheet).getByRole('group', { name: '更正或換投' })
    expect(within(modes).getByRole('button', { name: '更正這位投手' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(sheet).getByText(/他今天投過的 2 個打席一起改，球數照算/)).toBeTruthy()
    fireEvent.click(within(within(sheet).getByRole('group', { name: '左投或右投' })).getByRole('button', { name: '右投' }))
    fireEvent.click(within(sheet).getByRole('button', { name: '更正' }))
    await wait(50)
    expect(draft().oppPitcher).toEqual({ hand: 'R' })
    expect(draft().batting.map((b) => b.oppHand)).toEqual(['R', 'R'])
    expect(draft().oppPitcherFrom).toBeUndefined()
    expect(countText()).toBe('對方投手 7 球')
    expect(screen.getByText(/已更正對方投手：右投/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '對方 右投' })).toBeTruthy()
  })
  it('對方換投: a new pitcher from the next plate appearance, his count from 0', async () => {
    start(recorded())
    fireEvent.click(screen.getByRole('button', { name: '對方 左投' }))
    const sheet = await screen.findByRole('dialog', { name: '對方投手' })
    fireEvent.click(within(sheet).getByRole('button', { name: '對方換投' }))
    expect(within(sheet).getByText(/球數從 0 算/)).toBeTruthy()
    // a new pitcher starts blank
    expect(within(within(sheet).getByRole('group', { name: '左投或右投' })).getByRole('button', { name: '左投' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(within(within(sheet).getByRole('group', { name: '左投或右投' })).getByRole('button', { name: '右投' }))
    fireEvent.click(within(sheet).getByRole('button', { name: '換投' }))
    await wait(50)
    expect(draft().batting.map((b) => b.oppHand)).toEqual(['L', 'L'])
    expect(draft().oppPitcherFrom).toEqual({ row: 2, pitches: 2 })
    expect(countText()).toBe('對方投手 0 球')
  })
})

describe('紀錄比賽: 三安, then out on the bases on the same play', () => {
  it('the batter row offers 出局 and 壘死; either way his row counts 壘上出局 and no warning comes up', async () => {
    start(newGame(game, lineup, '甲'))
    fireEvent.click(screen.getByRole('button', { name: '不知道' }))
    fireEvent.click(screen.getByRole('button', { name: '三安' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^8 CF/ })[0])
    fireEvent.click(screen.getByRole('button', { name: '平飛 L' }))
    const row = screen.getByText('打者 甲').parentElement as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '壘死' }))
    expect(within(row).getByRole('button', { name: '壘死' }).getAttribute('aria-pressed')).toBe('true')
    // touch targets: 36px on a phone, 32px only with a mouse (like 修改資料's chips)
    for (const b of within(row).getAllByRole('button')) if (['出局', '壘死', '3B', '得分'].includes(b.textContent ?? '')) expect(b.className).toMatch(/(^| )h-9 pointer-fine:h-8 min-w-9/)
    fireEvent.click(screen.getByRole('button', { name: /送出這個打席/ }))
    await wait(50)
    const b = draft().batting[0]
    expect(b).toMatchObject({ result: '三安', code: 'I', outOnBase: 1, baserunningOuts: 1 })
    expect(auditGame(draft().batting, []).filter((i) => i.message.includes('卻記出局碼'))).toEqual([])
    expect(draft().outs).toBe(1)
  })
  it('not a reach (內滾): no 壘死 on the batter row', async () => {
    start(newGame(game, lineup, '甲'))
    fireEvent.click(screen.getByRole('button', { name: '不知道' }))
    fireEvent.click(screen.getByRole('button', { name: '內滾' }))
    const row = screen.getByText('打者 甲').parentElement as HTMLElement
    expect(within(row).queryByRole('button', { name: '壘死' })).toBeNull()
  })
})
