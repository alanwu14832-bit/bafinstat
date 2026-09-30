import { describe, expect, it } from 'vitest'
import { cleanErrors, errorsOf } from './errors'
import { extractGame, reconcileFielding } from './edit'
import { normalizeDataset } from './normalize'
import { SEED_DATASET } from './seed'
import type { PitchingPA } from './types'

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
