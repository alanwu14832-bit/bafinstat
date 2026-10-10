/**
 * 投手休息表 page: a pitcher who threw 85 pitches two days ago is resting until 10/12, and the rules are spelled out.
 * 可以出賽 counts the rested pitchers with the idle ones, and its empty line never contradicts 休息中. On 紀錄比賽 the
 * line under 我隊投手 says first when he is pitching before his rest is over.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PitcherRestPage } from '../pages/PitcherRest'
import { useDataStore } from '../store/data'
import { RecordPage } from '../pages/Record'
import { PRACTICE_KEY, writeDraft } from '../record/draft'
import { newGame } from '../record/model'
import type { Dataset, PitchingPA } from '../data/types'

afterEach(() => { cleanup(); vi.useRealTimers() })

// 85 pitches by 王投手 on 10/07 (17 batters × 5 pitches), 20 by 李投手 on 10/01
const row = (pitcher: string, pitches: string[], gameId: string): PitchingPA => ({ gameId, inning: 1, oppOrder: 1, pitcher, pitches, result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 })
const roster: Dataset['roster'] = [{ name: '王投手', number: '11', primaryPos: 'P' }, { name: '李投手', primaryPos: 'P' }, { name: '陳投手', secondaryPos: 'P' }]
const g1007 = { id: 'G20261007-01', date: '2026-10-07', tournament: '聯賽', opponent: '資管', homeAway: '主' as const }
const g1001 = { id: 'G20261001-01', date: '2026-10-01', tournament: '聯賽', opponent: '政大', homeAway: '主' as const }
const wang = Array.from({ length: 17 }, () => row('王投手', ['B', 'S', 'F', 'B', 'IP'], g1007.id))
const lee = Array.from({ length: 4 }, () => row('李投手', ['B', 'S', 'F', 'B', 'IP'], g1001.id))
const on1009 = () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 9, 10, 0)) }
const cardOf = (title: string) => screen.getByText(title).closest('section') ?? screen.getByText(title).parentElement!.parentElement!

describe('投手休息表', () => {
  it('lists who rests and until when', () => {
    on1009()
    const before = useDataStore.getState().base
    useDataStore.setState({ base: { roster, games: [g1007, g1001], batting: [], pitching: [...wang, ...lee], fielding: [] } })
    render(<MemoryRouter><PitcherRestPage /></MemoryRouter>)
    expect(screen.getByText('休息中（1 人）')).toBeInTheDocument()
    // 李投手 (rested) + 陳投手 (no outing in 30 days)
    expect(screen.getByText('可以出賽（2 人）')).toBeInTheDocument()
    // dates are always MM/DD, with or without the weekday
    expect(screen.getByRole('option', { name: '今天 10/09（五）' })).toBeInTheDocument()
    expect(screen.getByText(/10\/12（一）起可投/)).toBeInTheDocument()
    expect(screen.getByText(/10\/07 投 85 球，要休 4 天/)).toBeInTheDocument()
    expect(screen.getByText('上次 10/01 投 20 球')).toBeInTheDocument()
    expect(screen.getByText(/最近 30 天沒出賽：陳投手/)).toBeInTheDocument()
    expect(screen.getByText('106 球以上：休 5 天')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /10\/07 vs 資管 85 球/ })).toHaveAttribute('href', '/games?game=G20261007-01')
    useDataStore.setState({ base: before })
  })

  it('when everyone who pitched lately is resting, 可以出賽 says so and still counts the idle pitchers', () => {
    on1009()
    const before = useDataStore.getState().base
    useDataStore.setState({ base: { roster, games: [g1007], batting: [], pitching: wang, fielding: [] } })
    render(<MemoryRouter><PitcherRestPage /></MemoryRouter>)
    expect(screen.getByText('可以出賽（2 人）')).toBeInTheDocument()
    expect(screen.getByText(/最近 30 天沒出賽：李投手、陳投手（都可以出賽）/)).toBeInTheDocument()
    expect(screen.queryByText(/沒有投手需要休息/)).toBeNull()
    cleanup()
    // nobody idle either: the card says the pitchers who pitched are all resting
    useDataStore.setState({ base: { roster: roster.slice(0, 1), games: [g1007], batting: [], pitching: wang, fielding: [] } })
    render(<MemoryRouter><PitcherRestPage /></MemoryRouter>)
    expect(screen.getByText('可以出賽（0 人）')).toBeInTheDocument()
    expect(screen.getByText('最近有出賽的投手都還在休息')).toBeInTheDocument()
    cleanup()
    // no outing at all
    useDataStore.setState({ base: { roster: [], games: [], batting: [], pitching: [], fielding: [] } })
    render(<MemoryRouter><PitcherRestPage /></MemoryRouter>)
    expect(screen.getByText('最近 30 天沒有投手出賽')).toBeInTheDocument()
    expect(within(cardOf('休息中（0 人）')).getByText('沒有人在休息')).toBeInTheDocument()
    useDataStore.setState({ base: before })
  })

  it('custom dates read MM/DD in every line', () => {
    on1009()
    const before = useDataStore.getState().base
    const g1008 = { id: 'G20261008-01', date: '2026-10-08', tournament: '聯賽', opponent: '工海', homeAway: '主' as const }
    useDataStore.setState({ base: { roster, games: [g1008], batting: [], pitching: Array.from({ length: 4 }, () => row('李投手', ['B', 'S', 'F', 'B', 'IP'], g1008.id)), fielding: [] } })
    render(<MemoryRouter><PitcherRestPage /></MemoryRouter>)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-10-08' } })
    expect(screen.getByText(/10\/09（五）起可投・10\/08 投 20 球，一天只投一場/)).toBeInTheDocument()
    expect(screen.queryByText(/10\/9（/)).toBeNull()
    useDataStore.setState({ base: before })
  })
})

describe('紀錄比賽：休息未滿的投手', () => {
  it('the line under 我隊投手 says he should still rest', () => {
    on1009()
    const before = useDataStore.getState().base
    const cloudBefore = useDataStore.getState().cloud
    useDataStore.setState({ base: { roster, games: [g1007], batting: [], pitching: wang, fielding: [] }, cloud: { ...cloudBefore, configured: false } })
    const lineup = ['王投手', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }))
    writeDraft({ ...newGame({ id: 'PRACTICE-20261009', date: '2026-10-09', tournament: '練習', opponent: '練習對手', homeAway: '主' }, lineup, '王投手'), practice: true }, PRACTICE_KEY)
    render(<MemoryRouter initialEntries={['/record?practice=1']}><RecordPage /></MemoryRouter>)
    const line = screen.getByText(/休息未滿，10\/12（一）起才建議出賽・這場後不用多休/)
    expect(line).toHaveClass('text-warning')
    expect(screen.queryByText(/^不用休息/)).toBeNull()
    cleanup()
    writeDraft(null, PRACTICE_KEY)
    useDataStore.setState({ base: before, cloud: cloudBefore })
  })
})
