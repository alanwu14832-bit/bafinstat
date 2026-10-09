/** 合併 in local mode: games whose 比賽ID is already here are skipped, and the import page is told how many. */
import { describe, expect, it } from 'vitest'
import { useDataStore } from '../store/data'
import { EMPTY_DATASET, type Dataset } from '../data/types'

const game = (id: string, opponent: string) => ({ id, date: '2026-10-01', tournament: '聯賽', opponent, homeAway: '主' as const })
const pa = (gameId: string, batter: string) => ({ gameId, inning: 1, batter, pitches: ['IP'], result: '一安', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 })

describe('合併 (local mode)', () => {
  it('adds only the new games and says how many were skipped', async () => {
    const first: Dataset = { ...EMPTY_DATASET, games: [game('G1', '政大'), game('G2', '師大')], batting: [pa('G1', '甲'), pa('G2', '乙')] }
    await useDataStore.getState().replaceDataset(first)
    const file: Dataset = { ...EMPTY_DATASET, games: [game('G2', '改過的名字'), game('G3', '輔大')], batting: [pa('G2', '丙'), pa('G3', '丁')] }
    const r = await useDataStore.getState().appendDataset(file)
    expect(r).toMatchObject({ games: 1, skipped: 1 })
    const { base } = useDataStore.getState()
    expect(base.games.map((g) => `${g.id} ${g.opponent}`)).toEqual(['G1 政大', 'G2 師大', 'G3 輔大'])
    expect(base.batting.map((p) => p.batter)).toEqual(['甲', '乙', '丁'])
    expect(await useDataStore.getState().appendDataset(file)).toMatchObject({ games: 0, skipped: 2 })
  })
})
