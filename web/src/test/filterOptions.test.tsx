import { renderHook } from '@testing-library/react'
import { useFilterOptions, useStats } from '../hooks/useStats'
import { useDataStore } from '../store/data'
import { DEFAULT_FILTERS, EMPTY_DATASET } from '../data/types'
import { SEED_DATASET } from '../data/seed'


describe('杯賽篩選選項', () => {
  it('lists a tournament that has a 報名名單 but no games yet', () => {
    useDataStore.setState({ base: EMPTY_DATASET, demo: false, registrations: [{ season: 2026, tournament: '秋季聯賽', players: ['林軒亦'] }] })
    const { result } = renderHook(() => useFilterOptions())
    expect(result.current.tournaments).toEqual(['秋季聯賽'])
  })
  it('merges recorded and registered tournaments without duplicates', () => {
    useDataStore.setState({
      base: { ...EMPTY_DATASET, games: [{ id: 'G20261001-01', date: '2026-10-01', tournament: '秋季聯賽', opponent: '甲', homeAway: '主' }, { id: 'G20261002-01', date: '2026-10-02', tournament: '友誼賽', opponent: '乙', homeAway: '客' }] },
      demo: false,
      registrations: [{ season: 2026, tournament: '秋季聯賽', players: [] }, { season: 2026, tournament: '大專盃', players: [] }],
    })
    const { result } = renderHook(() => useFilterOptions())
    expect([...result.current.tournaments].sort()).toEqual(['友誼賽', '大專盃', '秋季聯賽'].sort())
  })
})

describe('useStats', () => {
  it('a page and its 情境拆分 card share one pass; a filter change makes a new one', () => {
    useDataStore.setState({ base: SEED_DATASET, demo: false, filters: DEFAULT_FILTERS })
    const a = renderHook(() => useStats())
    const b = renderHook(() => useStats())
    const first = a.result.current
    expect(b.result.current).toBe(first)
    expect(first.pitchers.length).toBeGreaterThan(0)
    useDataStore.setState({ filters: { ...DEFAULT_FILTERS, homeAway: '主' } })
    const c = renderHook(() => useStats())
    expect(c.result.current).not.toBe(first)
    expect(a.result.current).toBe(c.result.current)
    expect(c.result.current.games.every((g) => g.homeAway === '主')).toBe(true)
  })
})
