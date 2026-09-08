import { describe, expect, it } from 'vitest'
import { SEED_DATASET } from './seed'
import { rowsToDataset, toBattingRow, toFieldingRow, toGameRow, toPitchingRow, toPlayerRow } from './supabase'

describe('supabase row mapping', () => {
  it('round-trips the seed dataset through table rows', () => {
    const ds = SEED_DATASET
    const seq = <T extends { gameId: string }>(rows: T[]) => { const c = new Map<string, number>(); return rows.map((r) => { const s = (c.get(r.gameId) ?? 0) + 1; c.set(r.gameId, s); return s }) }
    const bs = seq(ds.batting), ps = seq(ds.pitching), fs = seq(ds.fielding)
    const back = rowsToDataset({
      players: ds.roster.map(toPlayerRow), games: ds.games.map(toGameRow),
      batting: ds.batting.map((r, i) => toBattingRow(r, bs[i])), pitching: ds.pitching.map((r, i) => toPitchingRow(r, ps[i])), fielding: ds.fielding.map((r, i) => toFieldingRow(r, fs[i])),
    })
    expect(back.games[0]).toMatchObject({ id: ds.games[0].id, date: ds.games[0].date, opponent: '群風', homeAway: '主', winningPitcher: '許振謙' })
    expect(back.batting).toHaveLength(ds.batting.length)
    expect(back.batting[0]).toMatchObject({ batter: ds.batting[0].batter, pitches: ds.batting[0].pitches, result: ds.batting[0].result, inning: 1 })
    expect(back.pitching.map((p) => p.code)).toEqual(ds.pitching.map((p) => p.code))
    expect(back.fielding.map((f) => f.e)).toEqual(ds.fielding.map((f) => f.e))
    expect(back.roster.map((p) => p.name)).toEqual(ds.roster.map((p) => p.name))
  })
})
