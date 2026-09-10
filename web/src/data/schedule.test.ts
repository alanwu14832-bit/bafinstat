import { describe, expect, it } from 'vitest'
import { playedGames, applyFilters } from './filters'
import { SEED_DATASET } from './seed'
import { DEFAULT_FILTERS, type Game } from './types'
import { datasetToWorkbook, parseWorkbook } from './xlsx'
import * as XLSX from 'xlsx'

describe('schedule entries', () => {
  const scheduled: Game = { id: 'G20270101-01', date: '2027-01-01', tournament: '友誼賽', opponent: '未來隊', homeAway: '主', status: 'scheduled' }
  const emptyGame: Game = { id: 'G20270102-01', date: '2027-01-02', tournament: '友誼賽', opponent: '沒紀錄隊', homeAway: '主' }
  const ds = { ...SEED_DATASET, games: [...SEED_DATASET.games, scheduled, emptyGame] }

  it('never count in the statistics', () => {
    const ids = playedGames(ds).map((g) => g.id)
    expect(ids).not.toContain('G20270101-01')
    expect(ids).not.toContain('G20270102-01')
    expect(ids.length).toBe(SEED_DATASET.games.length)
    const fd = applyFilters(ds, DEFAULT_FILTERS)
    expect(fd.summaries.every((s) => s.runsUs + s.runsOpp + s.hitsUs > 0 || !s.game.status)).toBe(true)
    expect(fd.games.map((g) => g.id)).not.toContain('G20270101-01')
  })

  it('survive a round trip through the workbook (狀態 column)', async () => {
    const wb = datasetToWorkbook(ds)
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const { dataset } = await parseWorkbook(buf)
    expect(dataset.games.find((g) => g.id === 'G20270101-01')?.status).toBe('scheduled')
    expect(dataset.games.find((g) => g.id === 'G20251010-01')?.status).toBeUndefined()
  })
})
