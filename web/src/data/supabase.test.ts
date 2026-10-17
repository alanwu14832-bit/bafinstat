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
    expect(missingRecordColumns({ games: [{ id: 'G1' }], batting: [{ game_id: 'G1', errors: null }] })).toEqual(['end_time', 'opp_hand'])
    expect(missingRecordColumns({ games: [{ id: 'G1', end_time: null }], batting: [{ game_id: 'G1', opp_hand: null, errors: null }] })).toEqual([])
    expect(missingRecordColumns({ games: [], batting: [] })).toEqual([])
  })

  it('對方代跑 (2026-10-15): pitching_pa.runner written only when set, read back, and missing when no loaded row has it', () => {
    const opp = { gameId: 'G1', inning: 2, outsBefore: 0, oppOrder: 3, pitcher: '乙', pitches: ['IP'], result: '一安', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, code: 'R' }
    const withRunner = toPitchingRow({ ...opp, runner: '12號' }, 1)
    expect(withRunner.runner).toBe('12號')
    expect('runner' in toPitchingRow(opp, 2)).toBe(false)
    const back = rowsToDataset({ players: [], games: [], batting: [], pitching: [withRunner, { ...toPitchingRow(opp, 2), runner: null }], fielding: [] }).pitching
    expect(back[0].runner).toBe('12號')
    expect('runner' in back[1]).toBe(false)
    expect(missingRecordColumns({ games: [], batting: [], pitching: [{ game_id: 'G1', rbi: 0, opp_bats: null, prior_pitchers: null }] })).toEqual(['pitching_runner'])
    expect(missingRecordColumns({ games: [], batting: [], pitching: [{ game_id: 'G1', runner: null, rbi: 0, opp_bats: null, prior_pitchers: null }] })).toEqual([])
    expect(missingRecordColumns({ games: [], batting: [], pitching: [] })).toEqual([])
  })

  it('對方失誤 / 對方打點 (2026-10-15): written only when there are some, read back, missing when no loaded row has the key', () => {
    const pa = { gameId: 'G1', inning: 1, outsBefore: 0, batter: '甲', pitches: ['IP'], result: '一安', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 }
    const opp = { gameId: 'G1', inning: 2, outsBefore: 0, oppOrder: 3, pitcher: '乙', pitches: ['IP'], result: '一安', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 }
    expect(toBattingRow({ ...pa, errors: ['C', '?'] }, 1).errors).toEqual(['C', '?'])
    expect('errors' in toBattingRow(pa, 1)).toBe(false)
    expect(toPitchingRow({ ...opp, rbi: 2 }, 1).rbi).toBe(2)
    expect('rbi' in toPitchingRow(opp, 1)).toBe(false)
    const back = rowsToDataset({ players: [], games: [], batting: [{ ...toBattingRow(pa, 1), errors: ['SS'] }, { ...toBattingRow(pa, 2), errors: null }], pitching: [{ ...toPitchingRow(opp, 1), rbi: 2 }, { ...toPitchingRow(opp, 2), rbi: 0 }], fielding: [] })
    expect(back.batting[0].errors).toEqual(['SS'])
    expect('errors' in back.batting[1]).toBe(false)
    expect(back.pitching[0].rbi).toBe(2)
    expect('rbi' in back.pitching[1]).toBe(false)
    expect(missingRecordColumns({ games: [], batting: [{ game_id: 'G1', opp_hand: null }], pitching: [{ game_id: 'G1', runner: null, opp_bats: null, prior_pitchers: null }] })).toEqual(['batting_errors', 'pitching_rbi'])
  })
  it('maps 對方打者左右打 (pitching_pa.opp_bats, 2026-10-16) only when known, and tells when the cloud lacks the column', () => {
    const opp = { gameId: 'G1', inning: 2, outsBefore: 0, oppOrder: 3, pitcher: '乙', pitches: ['IP'], result: '一安', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 }
    expect(toPitchingRow({ ...opp, oppBats: 'L' }, 1).opp_bats).toBe('L')
    expect('opp_bats' in toPitchingRow(opp, 1)).toBe(false)
    const back = rowsToDataset({ players: [], games: [], batting: [], pitching: [{ ...toPitchingRow(opp, 1), opp_bats: 'R' }, { ...toPitchingRow(opp, 2), opp_bats: null }, { ...toPitchingRow(opp, 3), opp_bats: 'X' }], fielding: [] })
    expect(back.pitching[0].oppBats).toBe('R')
    expect('oppBats' in back.pitching[1]).toBe(false)
    expect('oppBats' in back.pitching[2]).toBe(false)
    expect(missingRecordColumns({ games: [], batting: [], pitching: [{ game_id: 'G1', runner: null, rbi: 0, prior_pitchers: null }] })).toEqual(['opp_bats'])
    expect(missingRecordColumns({ games: [], batting: [], pitching: [{ game_id: 'G1', runner: null, rbi: 0, opp_bats: 'L', prior_pitchers: null }] })).toEqual([])
  })

  it('換投前的球數 (pitching_pa.prior_pitchers, 2026-10-18): written only when there is one, read back well formed, missing when no loaded row has the key', () => {
    const prior = [{ name: '甲', pitches: 2 }]
    const row = { gameId: 'G1', inning: 1, pitcher: '乙', pitches: ['B', 'CS', 'IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 }
    expect(toPitchingRow({ ...row, priorPitchers: prior }, 1)).toMatchObject({ prior_pitchers: prior })
    expect('prior_pitchers' in toPitchingRow(row, 1)).toBe(false)
    const pit = [{ ...toPitchingRow({ ...row, priorPitchers: prior }, 1), prior_pitchers: [...prior, { name: '', pitches: 3 }, { name: '丙', pitches: 0 }] }]
    expect(rowsToDataset({ players: [], games: [], batting: [], pitching: pit as never, fielding: [] }).pitching[0].priorPitchers).toEqual(prior)    // (the entries without a name or a count are dropped)
    expect(missingRecordColumns({ games: [], batting: [], pitching: [{ game_id: 'G1', runner: null, rbi: 0, opp_bats: null }] })).toEqual(['prior_pitchers'])
  })
})
