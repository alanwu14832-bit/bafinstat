import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LivePage } from '../pages/Live'
import { writeDraft } from '../record/draft'
import { newGame, type RecordState } from '../record/model'
import { useDataStore } from '../store/data'
import { EMPTY_DATASET, type BattingPA, type Dataset, type Game, type PitchingPA } from '../data/types'

const NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬']
const LIVE: Game = { id: 'G20261020-01', date: '2026-10-20', tournament: '系際盃', opponent: '對手', homeAway: '客', innings: 7 }
const bat = (gameId: string, batter: string, result: string, extra: Partial<BattingPA> = {}): BattingPA => ({
  gameId, inning: 1, batter, order: NAMES.indexOf(batter) + 1, pitches: result === '三振' ? ['S', 'S', 'SS'] : ['IP'], result, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...extra,
})
// two earlier games this season: 丙 is 2 for 5 with runners in scoring position, 丁 has at bats too
const G1: Game = { id: 'G20260920-01', date: '2026-09-20', tournament: '系際盃', opponent: '別隊', homeAway: '主', innings: 7 }
const G2: Game = { ...G1, id: 'G20261004-01', date: '2026-10-04' }
const BASE: Dataset = {
  ...EMPTY_DATASET,
  games: [G1, G2],
  batting: [
    ...['一安', '外飛', '內滾'].map((r) => bat(G1.id, '丙', r, { basesBefore: '2' })),
    ...['二安', '三振'].map((r) => bat(G2.id, '丙', r, { basesBefore: '23' })),
    ...['一安', '外飛', '內滾'].map((r) => bat(G1.id, '丁', r)),
  ],
}

const show = (s: RecordState, base: Dataset = BASE) => {
  writeDraft(s)
  useDataStore.setState({ base })
  render(<MemoryRouter><LivePage /></MemoryRouter>)
}
afterEach(() => { writeDraft(null) })

describe('即時比分: who is up next, 本季, 本半局看點', () => {
  it('our batter at the plate: 準備打擊／再下一棒, his 本季 line and the half-inning card, also in 大螢幕', async () => {
    show({ ...newGame(LIVE, NAMES.map((name) => ({ name, pos: 'DH' })), '壬'), slot: 2 })
    const onDeck = await screen.findByText('準備打擊')
    expect(onDeck.nextElementSibling?.textContent).toBe('4 棒 丁.333')
    expect(screen.getByText('再下一棒').nextElementSibling?.textContent).toBe('5 棒 戊')
    expect(screen.getByText(/^本季 /).textContent).toBe('本季 .400・OPS 1.000（5 打席）')
    expect(screen.getByText('本半局看點・照紀錄自動挑選')).toBeTruthy()
    expect(screen.getByText('3 棒 丙 本季得點圈 5 打數 2 安')).toBeTruthy()
    // (while we bat, the other side is up next)
    expect(screen.getByText('攻守交換後').nextElementSibling?.textContent).toBe('對方第 1、2、3 棒')
    fireEvent.click(screen.getByRole('button', { name: /大螢幕/ }))
    const big = screen.getByRole('dialog', { name: '即時比分大螢幕' })
    expect(within(big).getByText('準備打擊')).toBeTruthy()
    expect(within(big).getByText('再下一棒')).toBeTruthy()
    expect(within(big).getByText('3 棒 丙 本季得點圈 5 打數 2 安')).toBeTruthy()
  })

  it('the opponent at bat: by batting order, and our first three after the side is retired', async () => {
    show({ ...newGame({ ...LIVE, homeAway: '主' }, NAMES.map((name) => ({ name, pos: 'DH' })), '壬'), oppOrder: 5 })
    const onDeck = await screen.findByText('準備打擊')
    expect(onDeck.nextElementSibling?.textContent).toBe('第 6 棒')
    expect(screen.getByText('再下一棒').nextElementSibling?.textContent).toBe('第 7 棒')
    expect(screen.getByText('攻守交換後').nextElementSibling?.textContent).toBe('1 棒 甲・2 棒 乙・3 棒 丙')
    expect(screen.queryByText(/^本季 /)).toBeNull()
  })

  it('after the game is over (the draft already on 8▲ until 結束比賽): nobody up next, no card', async () => {
    // we are 主 and lost 3–5: the third out of 7▼ moved the draft on to 8▲
    const home = { ...LIVE, homeAway: '主' as const }
    const er = (i: number): PitchingPA => ({ gameId: LIVE.id, inning: 1, pitcher: '壬', oppOrder: i + 1, pitches: ['IP'], result: '全壘打', code: 'ER', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 })
    const s: RecordState = {
      ...newGame(home, NAMES.map((name) => ({ name, pos: 'DH' })), '壬'), inning: 8, half: 'top', oppOrder: 6,
      batting: ['甲', '乙', '丙'].map((b) => bat(LIVE.id, b, '全壘打', { run: 1, rbi: 1, code: 'R' })),
      pitching: [0, 1, 2, 3, 4].map(er),
    }
    // (two earlier games against 對手 would give a 歷年對對手 card)
    show(s, { ...BASE, games: [G1, G2].map((g) => ({ ...g, opponent: '對手' })) })
    await screen.findByText('我隊投手')
    expect(screen.queryByText('準備打擊')).toBeNull()
    expect(screen.queryByText('攻守交換後')).toBeNull()
    expect(screen.queryByText('本半局看點・照紀錄自動挑選')).toBeNull()
  })
})
