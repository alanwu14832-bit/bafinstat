/**
 * 紀錄比賽 (batch 14): a batted ball is not sent without its 落點 and 軌跡 (強度 stays optional), on both sides — we
 * bat and they bat — and in 練習紀錄 the same; results without a batted ball (三振、保送、故四、觸身、妨礙) never ask.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecordPage } from '../pages/Record'
import { PRACTICE_KEY, readDraft, writeDraft } from '../record/draft'
import { missingBattedBall, newGame, type RecordState } from '../record/model'
import { answered } from './answered'
import { NO_BATTED_BALL, RESULT_GROUPS } from '../record/widgets'
import { TRAJ_OF } from '../data/types'

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
// 客: we bat first (top of the 1st); 主: they bat first
const game = (homeAway: '主' | '客') => ({ id: 'PRACTICE-20261014', date: '2026-10-14', tournament: '練習', opponent: '練習對手', homeAway })
const start = (s: RecordState) => { writeDraft({ ...answered(s), practice: true }, PRACTICE_KEY); render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>) }
Element.prototype.scrollIntoView ??= () => {}
afterEach(() => { cleanup(); writeDraft(null, PRACTICE_KEY) })

const ALL = RESULT_GROUPS.flatMap((g) => g.items)
const BATTED = ALL.filter((r) => !NO_BATTED_BALL.has(r))
const send = () => screen.getByRole('button', { name: /^送出/ }) as HTMLButtonElement
const missingLine = () => screen.queryByText(/^還沒選/)

describe('missingBattedBall', () => {
  it('asks for 落點 and 軌跡 of a batted ball only', () => {
    expect(missingBattedBall({ result: '一安' })).toEqual(['落點', '軌跡'])
    expect(missingBattedBall({ result: '一安', loc: 8 })).toEqual(['軌跡'])
    expect(missingBattedBall({ result: '全壘打', loc: 78, traj: 'F' })).toEqual([])
    for (const r of NO_BATTED_BALL) expect(missingBattedBall({ result: r })).toEqual([])
    expect(missingBattedBall({ result: '突破僵局' })).toEqual([])
    expect(missingBattedBall({ result: '' })).toEqual([])
  })
})

describe.each([['we bat', '客'], ['they bat', '主']] as const)('紀錄比賽 (%s): 落點 and 軌跡 required for a batted ball', (_side, homeAway) => {
  it('the 送出 button waits for both, with a line saying what is missing', async () => {
    start(newGame(game(homeAway), lineup, '甲'))
    fireEvent.click(screen.getByRole('button', { name: '一安' }))
    expect(send().disabled).toBe(true)
    expect(missingLine()?.textContent).toBe('還沒選落點、軌跡')
    // the missing pickers are highlighted
    expect(screen.getByRole('group', { name: '落點' }).dataset.missing).toBe('true')
    expect(screen.getByRole('group', { name: '軌跡' }).dataset.missing).toBe('true')
    fireEvent.click(screen.getAllByRole('button', { name: /^8 CF/ })[0])
    expect(send().disabled).toBe(true)
    expect(missingLine()?.textContent).toBe('還沒選軌跡')
    expect(screen.getByRole('group', { name: '落點' }).dataset.missing).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: '平飛 L' }))
    expect(missingLine()).toBeNull()
    expect(send().disabled).toBe(false)
    // 強度 stays optional
    fireEvent.click(send())
    await wait(50)
    const d = readDraft(PRACTICE_KEY)!
    const row = homeAway === '客' ? d.batting[0] : d.pitching[0]
    expect(row).toMatchObject({ result: '一安', loc: 8, traj: 'L' })
    expect(row.quality).toBeUndefined()
  })

  it('every batted-ball result offers 落點 and 軌跡 and asks for them; the others never ask', () => {
    start(newGame(game(homeAway), lineup, '甲'))
    for (const r of ALL) {
      fireEvent.click(screen.getByRole('button', { name: r }))
      if (NO_BATTED_BALL.has(r)) {
        expect(screen.queryByRole('group', { name: '落點' }), r).toBeNull()
        expect(missingLine(), r).toBeNull()
      } else {
        // the result may already tell the 軌跡 (內滾 → G, 外飛 → F …): then only 落點 is asked
        expect(missingLine()?.textContent, r).toBe(TRAJ_OF[r] ? '還沒選落點' : '還沒選落點、軌跡')
        expect(send().disabled, r).toBe(true)
        fireEvent.click(within(screen.getByRole('group', { name: '落點' })).getAllByRole('button', { name: /^6 SS/ })[0])
        if (!TRAJ_OF[r]) fireEvent.click(within(screen.getByRole('group', { name: '軌跡' })).getByRole('button', { name: '滾地 G' }))
        expect(missingLine(), r).toBeNull()
      }
      fireEvent.click(screen.getByRole('button', { name: /改結果/ }))
    }
    expect(BATTED.length).toBe(15)
  }, 60_000) // renders every result on both sides: slow on a busy CI runner
})
