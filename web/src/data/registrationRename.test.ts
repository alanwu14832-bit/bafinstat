/**
 * Batch 17 bug 3: after the maintainer renamed 秋季聯賽 → 2026秋季聯賽 the 杯賽 filter still listed 秋季聯賽 (its 報名名單
 * kept the old name). Renaming a tournament now renames its list when no game is left under the old name.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { applyRegistrationMoves, followRenames, orphanRegistration, readLocalRegistrations, registrationMoves, registrationMoveText, writeLocalRegistrations } from './registrations'
import { useDataStore } from '../store/data'
import { EMPTY_DATASET, type Game, type Registration } from './types'

const g = (id: string, tournament: string, date = '2026-10-01', extra: Partial<Game> = {}): Game => ({ id, date, tournament, opponent: '甲', homeAway: '主', ...extra })
const reg = (tournament: string, players: string[] = ['王'], season = 2026): Registration => ({ season, tournament, players })

describe('registrationMoves', () => {
  it('the last game under the old name renamed: the list moves', () => {
    const before = [g('G1', '秋季聯賽')]
    const after = [g('G1', '2026秋季聯賽')]
    const moves = registrationMoves([reg('秋季聯賽')], before, after)
    expect(moves).toEqual([{ from: reg('秋季聯賽'), to: reg('2026秋季聯賽') }])
    expect(applyRegistrationMoves([reg('秋季聯賽'), reg('大專盃')], moves).map((r) => r.tournament).sort()).toEqual(['2026秋季聯賽', '大專盃'])
    expect(registrationMoveText(moves)).toBe('報名名單也一起改名：2026 年「秋季聯賽」→「2026秋季聯賽」')
  })
  it('other games still under the old name: nothing moves', () => {
    const before = [g('G1', '秋季聯賽'), g('G2', '秋季聯賽', '2026-10-08')]
    expect(registrationMoves([reg('秋季聯賽')], before, [g('G1', '2026秋季聯賽'), before[1]])).toEqual([])
  })
  it('a list already under the new name: players merged', () => {
    const moves = registrationMoves([reg('秋季聯賽', ['王', '李']), reg('2026秋季聯賽', ['李', '陳'])], [g('G1', '秋季聯賽')], [g('G1', '2026秋季聯賽')])
    expect(moves[0].to.players.sort()).toEqual(['李', '王', '陳'].sort())
  })
  it('two old names renamed into one new name: both lists end up in it', () => {
    const regs = [reg('A', ['x']), reg('B', ['y'])]
    const moves = registrationMoves(regs, [g('G1', 'A'), g('G2', 'B')], [g('G1', 'C'), g('G2', 'C')])
    expect(applyRegistrationMoves(regs, moves)).toEqual([reg('C', ['x', 'y'])])
    // (the cloud writes each move's list in turn: the last one has everyone)
    expect(moves.at(-1)!.to.players.sort()).toEqual(['x', 'y'])
  })
  it('Excel 取代: the file’s own 報名名單 sheet, still under the old name, follows the file’s renamed games', () => {
    // exported before the rename, the games' 杯賽 changed in Excel, the 報名名單 sheet left as it was
    const file = [reg('秋季聯賽', ['王', '李']), reg('大專盃', ['陳'])]
    const out = followRenames(file, [g('G1', '秋季聯賽')], [g('G1', '2026秋季聯賽')])
    expect(out.map((r) => r.tournament).sort()).toEqual(['2026秋季聯賽', '大專盃'])
    expect(followRenames(file, [g('G1', '秋季聯賽')], [g('G1', '秋季聯賽')])).toEqual(file)
  })
  it('the last game changed to 友誼賽 / 未分類 / 練習: the list stays (those names never take a list)', () => {
    const regs = [reg('秋季聯賽', ['甲', '乙'])]
    const before = [g('G1', '秋季聯賽'), g('G2', '友誼賽', '2026-09-01')]
    for (const t of ['友誼賽', '未分類', '練習', ' 友誼賽 ']) {
      expect(registrationMoves(regs, before, [g('G1', t), before[1]])).toEqual([])
      expect(followRenames(regs, before, [g('G1', t), before[1]])).toEqual(regs)
    }
    // the editor still flags the list (no game uses 秋季聯賽 any more) and offers nothing
    expect(orphanRegistration(regs[0], regs, [g('G1', '友誼賽'), before[1]])).toEqual({ orphan: true })
  })
  it('only that year’s list; no list, nothing; an untouched game, nothing', () => {
    expect(registrationMoves([reg('秋季聯賽', ['王'], 2025)], [g('G1', '秋季聯賽')], [g('G1', '2026秋季聯賽')])).toEqual([])
    expect(registrationMoves([], [g('G1', '秋季聯賽')], [g('G1', '2026秋季聯賽')])).toEqual([])
    expect(registrationMoves([reg('秋季聯賽')], [g('G1', '秋季聯賽')], [g('G1', '秋季聯賽')])).toEqual([])
  })
})

describe('orphanRegistration (報名名單 editor)', () => {
  it('a list no game uses that year is flagged, with the one free same-year tournament as the fix', () => {
    const games = [g('G1', '2026秋季聯賽'), g('G2', '2026秋季聯賽', '2026-10-08', { status: 'scheduled' })]
    expect(orphanRegistration(reg('秋季聯賽'), [reg('秋季聯賽')], games)).toEqual({ orphan: true, suggestion: '2026秋季聯賽' })
    expect(orphanRegistration(reg('2026秋季聯賽'), [reg('2026秋季聯賽')], games)).toEqual({ orphan: false })
    // 友誼賽 (never a list) is not a candidate; of two candidates the one whose name contains the old one; two unlike
    // candidates: no suggestion; the candidate already has a list: none either
    expect(orphanRegistration(reg('秋季聯賽'), [reg('秋季聯賽')], [...games, g('G3', '友誼賽')])).toEqual({ orphan: true, suggestion: '2026秋季聯賽' })
    expect(orphanRegistration(reg('秋季聯賽'), [reg('秋季聯賽')], [...games, g('G3', '校際盃')])).toEqual({ orphan: true, suggestion: '2026秋季聯賽' })
    expect(orphanRegistration(reg('秋聯'), [reg('秋聯')], [...games, g('G3', '校際盃')])).toEqual({ orphan: true })
    // a list registered before its first game, the year's other games 友誼賽: flagged, nothing offered
    expect(orphanRegistration(reg('大專盃'), [reg('大專盃')], [g('G4', '友誼賽')])).toEqual({ orphan: true })
    expect(orphanRegistration(reg('秋季聯賽'), [reg('秋季聯賽'), reg('2026秋季聯賽')], games)).toEqual({ orphan: true })
  })
})

describe('saving a renamed game renames its list (local mode)', () => {
  beforeEach(() => { writeLocalRegistrations([]); useDataStore.setState({ registrations: [] }) })
  it('修改資料 / 賽程: 秋季聯賽 → 2026秋季聯賽', async () => {
    const games = [g('G20261001-01', '秋季聯賽'), g('G20261008-01', '秋季聯賽', '2026-10-08', { status: 'scheduled' })]
    useDataStore.setState({ base: { ...EMPTY_DATASET, games }, registrations: [reg('秋季聯賽', ['王', '李'])], cloud: { ...useDataStore.getState().cloud, configured: false } })
    const save = useDataStore.getState().saveGame
    await save({ game: { ...games[0], tournament: '2026秋季聯賽' }, batting: [], pitching: [], fielding: [] })
    // one game is still under the old name: the list stays
    expect(useDataStore.getState().registrations.map((r) => r.tournament)).toEqual(['秋季聯賽'])
    await save({ game: { ...games[1], tournament: '2026秋季聯賽' }, batting: [], pitching: [], fielding: [] })
    expect(useDataStore.getState().registrations).toEqual([reg('2026秋季聯賽', ['王', '李'])])
    expect(readLocalRegistrations().map((r) => r.tournament)).toEqual(['2026秋季聯賽'])
  })
  it('Excel 取代全部資料 with the games renamed', async () => {
    useDataStore.setState({ base: { ...EMPTY_DATASET, games: [g('G1', '秋季聯賽')] }, registrations: [reg('秋季聯賽')], cloud: { ...useDataStore.getState().cloud, configured: false } })
    await useDataStore.getState().replaceDataset({ ...EMPTY_DATASET, games: [g('G1', '2026秋季聯賽')] })
    expect(useDataStore.getState().registrations.map((r) => r.tournament)).toEqual(['2026秋季聯賽'])
  })
})
