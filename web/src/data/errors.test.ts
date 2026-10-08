import { describe, expect, it } from 'vitest'
import { cleanErrors, errorsOf } from './errors'
import { extractGame, reconcileFielding } from './edit'
import { deriveFielding, normalizeDataset } from './normalize'
import { SEED_DATASET } from './seed'
import type { BattingPA, FieldingLine, Game, PitchingPA } from './types'

const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G', inning: 1, pitcher: '壬', pitches: [], result: '', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })

describe('守備失誤 on opponent plate appearances', () => {
  it('reads positions however they are typed', () => {
    expect(cleanErrors('ss、lf')).toEqual(['SS', 'LF'])
    expect(cleanErrors('6 7,游擊')).toEqual(['SS', 'LF', 'SS'])
    expect(cleanErrors(['1B', 'DH', 'x'])).toEqual(['1B'])
    expect(cleanErrors(undefined)).toEqual([])
  })
  it('a hit plus an error is charged; a 失誤 result without the list still counts at its 落點', () => {
    expect(errorsOf(pit({ result: '一安', errors: ['LF'] }))).toEqual({ positions: ['LF'], unknown: 0 })
    expect(errorsOf(pit({ result: '失誤', loc: 6 }))).toEqual({ positions: ['SS'], unknown: 0 })
    expect(errorsOf(pit({ result: '失誤' }))).toEqual({ positions: [], unknown: 1 })
    expect(errorsOf(pit({ result: '失誤', loc: 6, errors: ['2B'] }))).toEqual({ positions: ['2B'], unknown: 0 })
    expect(errorsOf(pit({ result: '一安' }))).toEqual({ positions: [], unknown: 0 })
  })
  it('editing plate appearances moves E / PO onto the fielders and keeps what was typed by hand', () => {
    const id = 'G20251222-01'
    const before = extractGame(SEED_DATASET, id)!
    const lf = before.fielding.find((l) => l.pos === 'LF')!
    // someone typed an extra error for the shortstop by hand earlier
    const lines = before.fielding.map((l) => (l.pos === 'SS' ? { ...l, e: l.e + 1 } : l))
    const ss = lines.find((l) => l.pos === 'SS')!
    const i = before.pitching.findIndex((p) => p.result === '一安')
    const j = before.pitching.findIndex((p) => p.result === '外飛' && p.loc === 8)
    const after = { batting: before.batting, pitching: before.pitching.map((p, k) => (k === i ? { ...p, errors: ['LF'] } : k === j ? { ...p, result: '一安', code: undefined } : p)) }
    const out = reconcileFielding(lines, before.game, before, after)
    expect(out.find((l) => l.pos === 'LF')!.e).toBe(lf.e + 1)
    expect(out.find((l) => l.pos === 'SS')!.e).toBe(ss.e)
    if (lines.some((l) => l.po || l.a)) expect(out.find((l) => l.pos === 'CF')!.po).toBe(lines.find((l) => l.pos === 'CF')!.po - 1)
    // nothing changed → nothing moves
    expect(reconcileFielding(lines, before.game, before, before)).toEqual(lines)
    // a game without fielding lines is left to the save, which derives them (with the new error)
    expect(reconcileFielding([], before.game, before, after)).toEqual([])
    const { dataset } = normalizeDataset({ ...SEED_DATASET, games: [before.game], batting: after.batting, pitching: after.pitching, fielding: [] })
    expect(dataset.fielding.find((l) => l.pos === 'LF')!.e).toBeGreaterThanOrEqual(1)
  })
})

describe('an error goes to the one player at that position then (模擬比賽 2026-10-08)', () => {
  const bat = (batter: string, pos: string, inning: number): BattingPA => ({ gameId: 'G', inning, batter, pos, pitches: ['IP'], result: '內滾', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 })
  const game = (dayRoster?: Game['dayRoster']): Game => ({ id: 'G', date: '2026-10-08', tournament: '友誼賽', opponent: '模擬隊', homeAway: '主', innings: 4, ...(dayRoster ? { dayRoster } : {}) })
  // 甲 starts in left, 乙 replaces him there (代守) at the top of the 2nd; we are home, so we field the top halves
  const batting = [bat('甲', 'LF', 1), bat('丙', 'C', 1), bat('乙', 'LF', 3)]
  const roster = { starters: [{ name: '甲', pos: 'LF', order: 1 }, { name: '丙', pos: 'C', order: 2 }], bench: ['乙'], reentry: false, subs: [{ kind: 'DEF' as const, in: '乙', out: '甲', pos: 'LF', inning: 2, half: 'top' as const, slot: 0 }] }
  const e = (lines: FieldingLine[]) => Object.fromEntries(lines.filter((l) => l.pos !== 'P').map((l) => [l.player, l.e]))
  it('a 1st-inning error is the starter’s, a 3rd-inning one the substitute’s — never both', () => {
    expect(e(deriveFielding(game(roster), batting, [pit({ inning: 1, result: '一安', errors: ['LF'] })]).lines)).toEqual({ 甲: 1, 丙: 0, 乙: 0 })
    expect(e(deriveFielding(game(roster), batting, [pit({ inning: 3, result: '一安', errors: ['LF'] })]).lines)).toEqual({ 甲: 0, 丙: 0, 乙: 1 })
  })
  it('without the 當日登錄名單 it goes by first plate appearance', () => {
    expect(e(deriveFielding(game(), batting, [pit({ inning: 1, result: '失誤', loc: 7 })]).lines)).toEqual({ 甲: 1, 丙: 0, 乙: 0 })
  })
  it('catcher’s interference (妨礙) is the catcher’s error, ours or theirs', () => {
    expect(errorsOf(pit({ result: '妨礙' })).positions).toEqual(['C'])
    expect(e(deriveFielding(game(roster), batting, [pit({ inning: 2, result: '妨礙' })]).lines)).toEqual({ 甲: 0, 丙: 1, 乙: 0 })
  })
})
