/**
 * 即時比分 redesign (batch 12): the board's order and grid, and the three bugs it fixed — 最新 when we are the away team
 * (bug 1), our pitcher's count with the ball put in play (bug 2), 攻守交換後 only at two outs (bug 3) —, and the
 * 文字轉播 card's 得分 chip.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LivePage } from '../pages/Live'
import { writeDraft } from '../record/draft'
import { addPitch, commitPA, defaultPlan, newGame, runnerEvent, type PAPlan, type RecordState } from '../record/model'
import { Broadcast } from '../components/ui/Broadcast'
import { buildFeed, liveSourceOf } from '../data/broadcast'
import type { BattingPA, PitchingPA } from '../data/types'
import { useDataStore } from '../store/data'
import { EMPTY_DATASET, type Game } from '../data/types'

const NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬']
const GAME: Game = { id: 'G20261020-01', date: '2026-10-20', tournament: '系際盃', opponent: '對手', homeAway: '客', innings: 7, venue: '台大棒球場' }
const start = (g: Partial<Game> = {}) => newGame({ ...GAME, ...g }, NAMES.map((name, i) => ({ name, pos: i === 8 ? 'P' : 'DH' })), '壬')
const pitch = (s: RecordState, ps: string[]) => ps.reduce((a, p) => addPitch(a, p), s)
const pa = (s: RecordState, ps: string[], result: string, edit?: (p: PAPlan, s: RecordState) => void) => { s = pitch(s, ps); const plan = defaultPlan(s, result); edit?.(plan, s); return commitPA(s, plan) }
const show = (s: RecordState) => {
  writeDraft(s)
  useDataStore.setState({ base: EMPTY_DATASET })
  render(<MemoryRouter><LivePage /></MemoryRouter>)
}
const valueOf = (label: string) => screen.getByText(label, { selector: 'span' }).nextElementSibling?.textContent
const numOf = (label: string) => screen.getByText(label, { selector: 'span' }).nextElementSibling?.nextElementSibling?.textContent
afterEach(() => { writeDraft(null); try { localStorage.removeItem('bafin.live.feedFilter') } catch { /* none */ } })

// 1▲ (we are away): 甲 singles; 乙 is up, 1-1
const top1 = () => pitch(pa(start(), ['B', 'IP'], '一安', (p) => { p.loc = 8; p.traj = 'L' }), ['B', 'S'])
// then the side is retired and their leadoff man singles in 1▼; their second batter has seen a ball
const bottom1 = (outs = 0) => {
  let s = top1()
  s = pa(s, ['IP'], '雙殺', (p) => { p.loc = 6 })
  s = pa(s, ['S', 'S', 'SS'], '三振')
  s = pa(s, ['B', 'S', 'IP'], '一安', (p) => { p.loc = 7 })
  for (let i = 0; i < outs; i++) s = pa(s, ['IP'], '外飛')
  return pitch(s, ['B'])
}

describe('即時比分 board (batch 12)', () => {
  it('one order: the inning on the top strip, S/B/O lights, R H E pinned, the matchup rows in their fixed order', async () => {
    show(top1())
    await screen.findByText('下一棒')
    expect(screen.getByLabelText('第 1 局上').textContent).toBe('▲1局上')
    // CPBL's order: strikes first (the record page keeps B/S/O)
    const lights = screen.getAllByRole('group', { name: '球數' })[0]
    expect([...lights.children].map((c) => c.getAttribute('aria-label'))).toEqual(['S 1', 'B 1', 'O 0'])
    // R H E are always on screen: pinned to the right edge of the line score
    const head = screen.getAllByRole('columnheader')
    for (const k of ['R', 'H', 'E']) expect(head.find((h) => h.textContent === k)?.className).toContain('sticky')
    expect(screen.queryByText('SCORE')).toBeNull()
    // label column: 投手 / 打者 / 本打席 / 壘上 / 下一棒, in that order, then 最新
    const labels = ['投手', '打者', '本打席', '壘上', '下一棒', '最新'].map((l) => screen.getByText(l, { selector: 'span' }))
    for (let i = 1; i < labels.length; i++) expect(labels[i - 1].compareDocumentPosition(labels[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(valueOf('投手')).toBe('對方投手')
    expect(valueOf('壘上')).toBe('一壘 甲')
    expect(valueOf('下一棒')).toBe('3 丙・4 丁')
    expect(numOf('打者')).toBe('今日首打席')
    // 本打席: one character per pitch, so 好 (called) and 空 (whiff) differ in words
    expect(screen.getByLabelText('本打席 2 球').textContent).toBe('壞好')
    expect(valueOf('最新')).toBe('甲 擊出中外野平飛球，一壘安打。')
    // the game, once, at the bottom of the board; no 進行中 badge or description above it
    expect(screen.getByText('系際盃・台大棒球場')).toBeTruthy()
    expect(screen.queryByText('進行中', { selector: '.bg-surface, span[class*="badge"]' })).toBeNull()
    // bug 3: 攻守交換後 only at two outs
    expect(screen.queryByText('攻守交換後')).toBeNull()
  })

  it('bug 1: we are the away team and they bat in the bottom half — 最新 is their play, not our last batter', async () => {
    show(bottom1())
    await screen.findByText('下一棒')
    expect(valueOf('最新')).toBe('對方第 1 棒 擊出左外野方向一壘安打。')
    expect(valueOf('打者')).toBe('2對方打者')
    expect(valueOf('壘上')).toBe('一壘 第 1 棒')
  })

  it('bug 2: our pitcher\'s count has the ball put in play (the 紀錄比賽 number), and his line today', async () => {
    const s = bottom1()
    show(s)
    await screen.findByText('下一棒')
    // 3 pitches to their leadoff man (B S IP) and 1 to the batter now: 4, not 3
    const record = s.pitching.filter((p) => p.pitcher === s.pitcher).reduce((a, p) => a + p.pitches.length, 0) + s.pitches.length
    expect(record).toBe(4)
    expect(numOf('投手')).toBe('4 球')
    expect(valueOf('投手')).toBe('壬')
    expect(screen.getByText('0.0 局 1 安 0 失分 0 四死 0 三振')).toBeTruthy()
  })

  it('bug 3: 攻守交換後 at two outs, with the other side\'s first three', async () => {
    show(bottom1(2))
    await screen.findByText('下一棒')
    expect(screen.getByText('攻守交換後').nextElementSibling?.textContent).toBe('4 丁・5 戊・6 己')
  })

  it('文字轉播: both sides newest first, the score chip on the scoring play, 得分 keeps only those (remembered)', async () => {
    let s = top1()
    s = pa(s, ['IP'], '全壘打', (p) => { p.loc = 7; p.traj = 'F' })
    s = pa(s, ['S', 'S', 'SS'], '三振')
    show(s)
    const card = (await screen.findByText('文字轉播')).closest('section')!
    expect(within(card).getByText('一局上 我隊進攻')).toBeTruthy()
    expect(within(card).getByText(/擊出左外野高飛球，全壘打，2 分打點；甲回本壘得分。/)).toBeTruthy()
    expect(within(card).getByLabelText('比分 客 2 比 主 0')).toBeTruthy()
    expect(within(card).getByText('1 出局')).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: '得分' }))
    expect(within(card).getByRole('button', { name: '得分' }).getAttribute('aria-pressed')).toBe('true')
    // (the rows that leave slide out first)
    await waitFor(() => expect(within(card).queryByText(/揮棒落空，三振出局/)).toBeNull())
    await waitFor(() => expect(within(card).queryByText(/一壘安打/)).toBeNull())
    expect(within(card).getByText(/全壘打，2 分打點/)).toBeTruthy()
    expect(localStorage.getItem('bafin.live.feedFilter')).toBe('runs')
    // a plate appearance opens to its pitches
    fireEvent.click(within(card).getByText(/全壘打，2 分打點/).closest('button')!)
    expect(within(card).getByText(/^① 壞球/)).toBeTruthy()
    expect(within(card).getByText(/^③ 擊出/)).toBeTruthy()
  })
})

describe('文字轉播 card: 得分 and the half header', () => {
  it('得分 shows a run scored during the plate appearance in progress right away', async () => {
    let s = top1()
    const r = () => s.runners[0].row
    s = runnerEvent(s, r(), 'us', 'wp'); s = runnerEvent(s, r(), 'us', 'wp'); s = runnerEvent(s, r(), 'us', 'wp')
    expect(s.runners).toHaveLength(0)
    show(s)
    const card = (await screen.findByText('文字轉播')).closest('section')!
    fireEvent.click(within(card).getByRole('button', { name: '得分' }))
    await waitFor(() => expect(within(card).queryByText(/一壘安打/)).toBeNull())
    // the live row (with the wild pitch that scored) stays, with the score
    expect(within(card).getByText('打擊中')).toBeTruthy()
    expect(within(card).getByText(/^第 2 球 投手暴投.*甲回本壘得分$/)).toBeTruthy()
    expect(within(card).getByLabelText('比分 客 1 比 主 0')).toBeTruthy()
  })
  it('得分 on a half without 壘上(前) (an older import): the RBI hit stays, the walk whose batter scored goes, their scoring half is kept', async () => {
    const B = (x: Partial<BattingPA>): BattingPA => ({ gameId: 'g', inning: 1, batter: '甲', order: 1, pitches: ['IP'], result: '一安', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...x })
    const P = (x: Partial<PitchingPA>): PitchingPA => ({ gameId: 'g', inning: 1, pitcher: '壬', oppOrder: 1, pitches: ['IP'], result: '一安', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...x })
    const halves = buildFeed({ homeAway: '客', opponent: '對手', batting: [B({ result: '保送', run: 1 }), B({ batter: '乙', order: 2, result: '三安', rbi: 1, code: 'L' })], pitching: [P({ result: '失誤', code: 'R' }), P({ oppOrder: 2, result: '三振', code: 'I' })] })
    render(<Broadcast halves={halves} weTop opponent="對手" allOpen />)
    fireEvent.click(screen.getByRole('button', { name: '得分' }))
    await waitFor(() => expect(screen.queryByText(/四壞球上壘/)).toBeNull())
    expect(screen.getByText(/三壘安打，1 分打點/)).toBeTruthy()
    expect(screen.getByText('一局下 對方進攻')).toBeTruthy()
    expect(screen.getByText('這個半局沒有壘上紀錄，看不出是哪一棒得分')).toBeTruthy()
  })
  it('between halves: 準備上場 on its own line under the pitcher, nobody 打擊中 yet; an unnamed batter beside his order chip is 對方打者', () => {
    let s = top1()
    s = pa(s, ['IP'], '雙殺', (p) => { p.loc = 6 })
    s = pa(s, ['S', 'S', 'SS'], '三振')
    render(<Broadcast halves={buildFeed({ homeAway: '客', opponent: '對手', batting: s.batting, pitching: s.pitching, live: liveSourceOf(s, '對方第 1、2、3 棒') })} weTop opponent="對手" />)
    const head = screen.getByText('一局下 對方進攻').closest('button')!
    expect(within(head).getByText('投手 壬').textContent).toBe('投手 壬')
    expect(within(head).getByText('對方第 1、2、3 棒').parentElement?.textContent).toBe('準備上場 對方第 1、2、3 棒')
    expect(screen.queryByText('打擊中')).toBeNull()
    s = pa(s, ['IP'], '內滾', (p) => { p.loc = 6 })
    render(<Broadcast halves={buildFeed({ homeAway: '客', opponent: '對手', batting: s.batting, pitching: s.pitching })} weTop opponent="對手" allOpen />)
    expect(screen.getByText('對方打者', { selector: 'b' }).parentElement?.textContent).toBe('對方打者 擊出游擊方向滾地球，出局。')
  })
})
