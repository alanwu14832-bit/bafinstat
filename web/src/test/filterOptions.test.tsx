import { renderHook } from '@testing-library/react'
import { useFilterOptions } from '../hooks/useStats'
import { useDataStore } from '../store/data'
import { EMPTY_DATASET } from '../data/types'

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
