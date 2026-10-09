import { describe, expect, it } from 'vitest'
import { SEED_DATASET } from './seed'
import { missingGameColumns, missingRecordColumns, rowsToDataset, toBattingRow, toFieldingRow, toGameRow, toPitchingRow, toPlayerRow } from './supabase'
import type { BattingPA, Game, GameDayRoster } from './types'

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

  it('writes day_roster only for games that have one, and reads it back defensively', () => {
    const dayRoster: GameDayRoster = { starters: [{ name: '甲', pos: 'CF', order: 1 }, { name: '壬', pos: 'P' }], bench: ['丙'], subs: [{ kind: 'PH', in: '戊', out: '甲', pos: 'PH', inning: 5, half: 'top', slot: 0 }], reentry: true }
    const plain: Game = { id: 'G1', date: '2026-01-01', tournament: '大專盃', opponent: '甲隊', homeAway: '主' }
    // never null / undefined: postgrest would NULL a roster saved in the cloud for rows that lack the key
    expect('day_roster' in toGameRow(plain)).toBe(false)
    expect(toGameRow({ ...plain, dayRoster }).day_roster).toEqual(dayRoster)
    const rows = (games: ReturnType<typeof toGameRow>[]) => rowsToDataset({ players: [], games, batting: [], pitching: [], fielding: [] }).games
    expect(rows([toGameRow({ ...plain, dayRoster })])[0].dayRoster).toEqual(dayRoster)
    expect(rows([toGameRow(plain)])[0].dayRoster).toBeUndefined()
    expect(rows([{ ...toGameRow(plain), day_roster: null }])[0].dayRoster).toBeUndefined()
    expect(rows([{ ...toGameRow(plain), day_roster: { starters: 'x' } as unknown as GameDayRoster }])[0].dayRoster).toBeUndefined()
  })

  it('recognises the missing-column errors of a project without the latest migrations', () => {
    expect(missingGameColumns({ code: 'PGRST204', message: "Could not find the 'day_roster' column of 'games' in the schema cache" })).toEqual(['day_roster'])
    expect(missingGameColumns({ code: '42703', message: 'column games.status does not exist' })).toEqual(['status'])
    expect(missingGameColumns({ message: "Could not find the 'updated_by' column of 'games' in the schema cache" })).toEqual(['updated_by'])
    expect(missingGameColumns({ code: '42501', message: 'new row violates row-level security policy for table "games"' })).toEqual([])
    expect(missingGameColumns({ code: 'PGRST204', message: "Could not find the 'other' column of 'games' in the schema cache" })).toEqual([])
    expect(missingGameColumns(null)).toEqual([])
  })

  it('結束時間 and 對方投手 (2026-10-14): end_time always sent, opp_* only when set, read back', () => {
    const plain: Game = { id: 'G1', date: '2026-01-01', tournament: '大專盃', opponent: '甲隊', homeAway: '主' }
    expect(toGameRow(plain).end_time).toBeNull()
    expect(toGameRow({ ...plain, endTime: '15:22' }).end_time).toBe('15:22')
    const games = (g: ReturnType<typeof toGameRow>[]) => rowsToDataset({ players: [], games: g, batting: [], pitching: [], fielding: [] }).games
    expect(games([toGameRow({ ...plain, endTime: '15:22' })])[0].endTime).toBe('15:22')
    expect('endTime' in games([toGameRow(plain)])[0]).toBe(false)
    const pa: BattingPA = { gameId: 'G1', inning: 1, batter: '甲', pitches: ['IP'], result: '一安', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 }
    const bare = toBattingRow(pa, 1)
    expect('opp_hand' in bare || 'opp_pitcher' in bare).toBe(false)
    const withOpp = toBattingRow({ ...pa, oppPitcher: '王', oppHand: 'L' }, 1)
    expect([withOpp.opp_pitcher, withOpp.opp_hand]).toEqual(['王', 'L'])
    const bat = (rows: ReturnType<typeof toBattingRow>[]) => rowsToDataset({ players: [], games: [], batting: rows, pitching: [], fielding: [] }).batting
    expect(bat([withOpp])[0]).toMatchObject({ oppPitcher: '王', oppHand: 'L' })
    const odd = bat([{ ...withOpp, opp_hand: 'Z' }])[0]
    expect('oppHand' in odd).toBe(false)
    expect(odd.oppPitcher).toBe('王')
    expect('oppHand' in bat([bare])[0] || 'oppPitcher' in bat([bare])[0]).toBe(false)
  })

  it('tells which 2026-10-14 columns the cloud lacks from the rows it loaded', () => {
    expect(missingRecordColumns({ games: [{ id: 'G1' }], batting: [{ game_id: 'G1' }] })).toEqual(['end_time', 'opp_hand'])
    expect(missingRecordColumns({ games: [{ id: 'G1', end_time: null }], batting: [{ game_id: 'G1', opp_hand: null }] })).toEqual([])
    expect(missingRecordColumns({ games: [], batting: [] })).toEqual([])
  })
})
