import { describe, expect, it } from 'vitest'
import { dayRosterNames, gameAppearances, parseDayRoster, renameInDayRoster } from './gameRoster'
import { normalizeDataset } from './normalize'
import { SEED_DATASET } from './seed'
import type { Game, GameDayRoster } from './types'

const ID = 'G20251222-01'
const seedGame = () => SEED_DATASET.games.find((g) => g.id === ID)!
const LINEUP = [['嚴敬翔', 'SS'], ['蔡奇霖', '2B'], ['梁睿至', 'C'], ['許振謙', '1B'], ['劉哲宏', 'CF'], ['劉品辰', 'RF'], ['王廷宇', 'LF'], ['吳藹倫', '3B'], ['黃襄璟', 'DH']] as const
const roster: GameDayRoster = {
  starters: [...LINEUP.map(([name, pos], i) => ({ name, pos, order: i + 1 })), { name: '林昱丞', pos: 'P' }],
  bench: ['蘇柏愷', '鄭羣燁', '曾亭維', '林凱堉', '沒上場'],
  subs: [
    { kind: 'PR', in: '蘇柏愷', out: '許振謙', pos: 'PR', inning: 3, half: 'bottom', slot: 3 },
    { kind: 'PH', in: '鄭羣燁', out: '黃襄璟', pos: 'PH', inning: 4, half: 'bottom', slot: 8 },
  ],
  reentry: false,
}

describe('parseDayRoster', () => {
  it('returns undefined for null, garbage and empty rosters', () => {
    for (const v of [null, undefined, 'x', 3, [], {}, { starters: [], bench: [] }, { starters: [{ name: ' ' }], bench: ['', 5], subs: [{ in: '' }] }]) expect(parseDayRoster(v), JSON.stringify(v)).toBeUndefined()
  })
  it('cleans names, dedupes, removes bench starters and coerces reentry; idempotent', () => {
    const messy = {
      starters: [{ name: ' 甲 ', pos: 'cf', order: 1 }, { name: '甲', pos: 'SS', order: 2 }, { name: '乙', pos: ' ss ', order: '2' }, { name: '壬', pos: 'P' }, 'junk', { pos: 'C' }],
      bench: ['丙', ' 丙', '甲', '', null, '丁'],
      subs: [{ kind: 'ph', in: ' 戊 ', out: '甲', pos: 'ph', inning: 5, half: 'top', slot: 0 }, { kind: 'weird', in: '己', out: 3, inning: 'x', half: 'bottom' }, { kind: 'P' }],
      reentry: 'yes',
    }
    const r = parseDayRoster(messy)!
    expect(r).toEqual({
      starters: [{ name: '甲', pos: 'CF', order: 1 }, { name: '乙', pos: 'SS', order: 2 }, { name: '壬', pos: 'P' }],
      bench: ['丙', '丁'],
      subs: [{ kind: 'PH', in: '戊', out: '甲', pos: 'PH', inning: 5, half: 'top', slot: 0 }, { kind: 'DEF', in: '己', out: '', pos: '', inning: 0, half: 'bottom' }],
      reentry: false,
    })
    expect('order' in r.starters[2]).toBe(false)
    expect(parseDayRoster(r)).toEqual(r)
    expect(parseDayRoster(JSON.stringify(roster))).toEqual(roster)
    expect(parseDayRoster({ ...roster, reentry: true })!.reentry).toBe(true)
    // a roster with only a bench is still a roster; empty subs are left out
    expect(parseDayRoster({ starters: [], bench: ['丙'], subs: [], reentry: false })).toEqual({ starters: [], bench: ['丙'], reentry: false })
  })
  it('survives normalize (and normalize stays idempotent)', () => {
    const ds = { ...SEED_DATASET, games: SEED_DATASET.games.map((g) => (g.id === ID ? { ...g, dayRoster: roster } : g)) }
    const once = normalizeDataset(ds).dataset
    expect(once.games.find((g) => g.id === ID)!.dayRoster).toEqual(roster)
    expect(once.games.some((g) => 'dayRoster' in g && g.id !== ID)).toBe(false)
    expect(normalizeDataset(once).dataset).toEqual(once)
    const junk = normalizeDataset({ ...SEED_DATASET, games: SEED_DATASET.games.map((g) => ({ ...g, dayRoster: 'junk' as unknown as GameDayRoster })) }).dataset
    expect(junk.games.every((g) => !('dayRoster' in g))).toBe(true)
  })
})

describe('gameAppearances', () => {
  it('infers starters and substitutes from the rows when a game has no day roster', () => {
    const a = gameAppearances(SEED_DATASET, seedGame())
    expect(a.inferred).toBe(true)
    expect(a.starters.map((s) => [s.order, s.name, s.pos])).toEqual([...LINEUP.map(([name, pos], i) => [i + 1, name, pos]), [undefined, '林昱丞', 'P']])
    // the pinch runner 蘇柏愷 has no rows at all, so without a roster he cannot be known
    expect(a.subs.map((s) => [s.name, s.inning, s.half])).toEqual([['鄭羣燁', 4, 'bottom'], ['曾亭維', 5, 'top'], ['林凱堉', 6, 'top']])
    expect(a.subs.every((s) => !s.kind)).toBe(true)
    expect(a.bench).toEqual([])
  })
  it('uses the saved roster: logged substitutions first, then everyone else who played, then the unused bench', () => {
    const a = gameAppearances(SEED_DATASET, { ...seedGame(), dayRoster: roster })
    expect(a.inferred).toBe(false)
    expect(a.starters).toHaveLength(10)
    expect(a.starters[9]).toEqual({ name: '林昱丞', pos: 'P', order: undefined })
    expect(a.subs.map((s) => [s.name, s.kind, s.inning, s.half, s.replaced])).toEqual([
      ['蘇柏愷', 'PR', 3, 'bottom', '許振謙'], ['鄭羣燁', 'PH', 4, 'bottom', '黃襄璟'], ['曾亭維', undefined, 5, 'top', undefined], ['林凱堉', undefined, 6, 'top', undefined],
    ])
    expect(a.bench).toEqual(['沒上場'])
  })
  it('reads the unfiltered rows of that game only; a game without rows has nothing', () => {
    const empty: Game = { id: 'G20270101-01', date: '2027-01-01', tournament: '友誼賽', opponent: '未來隊', homeAway: '客', status: 'scheduled' }
    expect(gameAppearances(SEED_DATASET, empty)).toEqual({ starters: [], subs: [], bench: [], inferred: true })
    const planned = gameAppearances(SEED_DATASET, { ...empty, dayRoster: { starters: [{ name: '甲', pos: 'P', order: 1 }], bench: ['乙'], reentry: true } })
    expect(planned).toMatchObject({ starters: [{ name: '甲', pos: 'P', order: 1 }], subs: [], bench: ['乙'], inferred: false })
  })
})

describe('day roster names', () => {
  it('lists every name and follows renames', () => {
    expect(dayRosterNames(roster)).toEqual(expect.arrayContaining(['嚴敬翔', '林昱丞', '沒上場', '蘇柏愷', '許振謙', '黃襄璟']))
    expect(dayRosterNames(undefined)).toEqual([])
    expect(renameInDayRoster(roster, [['路人', '某人']])).toBe(roster)
    expect(renameInDayRoster(undefined, [['甲', '乙']])).toBeUndefined()
    const r = renameInDayRoster(roster, [['許振謙', '許振謙2'], ['蘇柏愷', '蘇柏凱'], ['沒上場', '沒來']])
    expect(r.starters[3].name).toBe('許振謙2')
    expect(r.subs![0]).toMatchObject({ in: '蘇柏凱', out: '許振謙2' })
    expect(r.bench).toContain('沒來')
    expect(dayRosterNames(r)).not.toContain('許振謙')
    // renaming onto a name already listed does not duplicate it
    expect(renameInDayRoster({ starters: [{ name: '甲', pos: 'C', order: 1 }], bench: ['乙', '丙'], reentry: false }, [['乙', '丙']]).bench).toEqual(['丙'])
  })
})
