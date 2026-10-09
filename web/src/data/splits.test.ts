import { describe, expect, it } from 'vitest'
import { availableGroups, countGrid, normBases, paContexts, splitTable } from './splits'
import { lineFor, teamBatting, teamPitching } from './stats'
import { SEED_DATASET } from './seed'
import { countTrail } from './counts'
import { isPA, type BattingPA, type Dataset, type PitchingPA } from './types'

const ds = SEED_DATASET
const opts = { roster: ds.roster, innings: 7 }
const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G1', inning: 1, batter: '甲', pitches: ['IP'], result: '內滾', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G1', inning: 1, pitcher: 'A', pitches: ['IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })
const only = (b: BattingPA[] = [], p: PitchingPA[] = []): Dataset => ({ roster: [], games: [], batting: b, pitching: p, fielding: [] })
const pa = (t: { rows: Array<{ key: string; line: { pa: number } }> }, key: string) => t.rows.find((r) => r.key === key)?.line.pa

describe('情境拆分 on the sample games', () => {
  const ctx = paContexts(ds, 'bat')
  const rows = ds.batting
  const withPitches = rows.filter((p) => isPA(p) && p.pitches.length > 0).length
  it('the 12 counts split every plate appearance with pitches, once', () => {
    expect(withPitches).toBe(64)
    expect(countGrid(rows, ctx, 'bat', 'final', ds.roster).reduce((a, c) => a + c.line.pa, 0)).toBe(64)
    expect(countGrid(rows, ctx, 'bat', 'passed', ds.roster).find((c) => c.key === '0-0')!.line.pa).toBe(64)
    const t = splitTable(rows, ctx, 'bat', 'count', opts)
    expect(['ahead', 'even', 'behind', 'full'].reduce((a, k) => a + pa(t, k)!, 0)).toBe(64)
    expect(pa(t, 'two-strike')! + pa(t, 'pre-two')!).toBe(64)
    expect(t.rows[0]).toMatchObject({ key: 'all', label: '全部' })
  })
  it('outs split the plate appearances with 出局(前); without 壘上(前) the base rows are empty and counted as missing', () => {
    const t = splitTable(rows, ctx, 'bat', 'situation', opts)
    expect(pa(t, 'out-0')! + pa(t, 'out-1')! + pa(t, 'out-2')!).toBe(rows.filter((p) => isPA(p) && typeof p.outsBefore === 'number').length)
    for (const k of ['empty', 'on', 'first', 'risp', 'loaded', 'risp-2']) expect(pa(t, k), k).toBe(0)
    expect(t.missing).toBe(64)
    expect(t.missingBases).toBe(64)
  })
  it('every split row is the batting line of the same plate appearances', () => {
    const t = splitTable(rows, ctx, 'bat', 'count', opts)
    const two = rows.filter((p) => ctx.get(p)?.trail.final?.endsWith('-2'))
    const want = teamBatting(ds, two)
    const got = t.rows.find((r) => r.key === 'two-strike')!.line
    expect([got.pa, got.h, got.avg, got.obp]).toEqual([want.pa, want.h, want.avg, want.obp])
    expect(got).toEqual(lineFor('兩好球之後', two, ds.roster))
  })
  it('a pitcher\'s 「全部」 is what the batters he faced did: PA = BF, H = H, SO = K', () => {
    const pctx = paContexts(ds, 'pit')
    const all = splitTable(ds.pitching, pctx, 'pit', 'nth', opts).rows[0].line
    const tp = teamPitching(ds.pitching, undefined, ds.games)
    expect([all.pa, all.h, all.so]).toEqual([tp.bf, tp.h, tp.k])
  })
})

describe('第幾輪 and 本場第幾打席', () => {
  it('times through the order counts the opponent slots each pitcher has faced in the game', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3].map((o) => pit({ pitcher: 'A', oppOrder: o }))
    const b = [4, 5, 6, 7, 8, 9, 1, 2, 3, 4].map((o) => pit({ pitcher: 'B', oppOrder: o }))
    const ctx = paContexts(only([], [...a, ...b]), 'pit')
    expect(a.map((p) => ctx.get(p)!.nth)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2])
    expect(b.map((p) => ctx.get(p)!.nth)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 2])
    const t = splitTable([...a, ...b], ctx, 'pit', 'nth', opts)
    expect([pa(t, 'tto-1'), pa(t, 'tto-2'), pa(t, 'tto-3')]).toEqual([18, 4, 0])
    // without 對方棒次: every 9 batters is a time through
    const plain = Array.from({ length: 10 }, () => pit({ gameId: 'G2' }))
    const c2 = paContexts(only([], plain), 'pit')
    expect(c2.get(plain[8])!.nth).toBe(1)
    expect(c2.get(plain[9])!.nth).toBe(2)
  })
  it('his n-th plate appearance is counted over the whole game, whatever the position filter', () => {
    const rows = [bat({ pos: 'LF' }), bat({ batter: '乙', pos: 'C' }), bat({ pos: 'LF', inning: 3 }), bat({ result: '', pitches: [], inning: 4 }), bat({ pos: '1B', inning: 5 })]
    const ctx = paContexts(only(rows), 'bat')
    const filtered = rows.filter((p) => p.pos === '1B')
    expect(ctx.get(filtered[0])!.nth).toBe(3)
    expect(pa(splitTable(filtered, ctx, 'bat', 'nth', opts), 'nth-3')).toBe(1)
  })
})

describe('局數, 壘上, 領先／落後, 對左右投, 突破僵局', () => {
  it('the inning after the regulation ones is 延長賽 (7 innings here, 9 on the varsity)', () => {
    const rows = [bat({ inning: 7 }), bat({ inning: 8 })]
    const ctx = paContexts(only(rows), 'bat')
    const seven = splitTable(rows, ctx, 'bat', 'inning', { roster: [], innings: 7 })
    expect([pa(seven, 'inn-7'), pa(seven, 'extra'), pa(seven, 'inn-8')]).toEqual([1, 1, undefined])
    const nine = splitTable(rows, ctx, 'bat', 'inning', { roster: [], innings: 9 })
    // innings (and batting slots) nobody batted in are left out
    expect(nine.rows.map((r) => r.key)).toEqual(['all', 'inn-7', 'inn-8'])
    // ...while the other tabs keep their empty rows (shown as —)
    expect(splitTable(rows, ctx, 'bat', 'nth', opts).rows.map((r) => r.line.pa)).toEqual([2, 1, 1, 0, 0])
  })
  it('normBases', () => {
    expect([normBases('無'), normBases('0'), normBases('31'), normBases('1'), normBases('123'), normBases(undefined), normBases('')]).toEqual(['', '', '13', '1', '123', undefined, undefined])
    const rows = [bat({ basesBefore: '31', outsBefore: 2 }), bat({ basesBefore: '無', outsBefore: 0 }), bat({})]
    const t = splitTable(rows, paContexts(only(rows), 'bat'), 'bat', 'situation', opts)
    expect([pa(t, 'risp'), pa(t, 'risp-2'), pa(t, 'empty'), pa(t, 'on'), t.missing]).toEqual([1, 1, 1, 1, 1])
  })
  it('a plate appearance ending 0-2 is 落後 for the batter and 領先 for the pitcher', () => {
    expect(countTrail(['SS', 'SS', 'IP']).final).toBe('0-2')
    const b = [bat({ pitches: ['SS', 'SS', 'IP'] })]
    const p = [pit({ pitches: ['SS', 'SS', 'IP'] })]
    const tb = splitTable(b, paContexts(only(b), 'bat'), 'bat', 'count', opts)
    const tp = splitTable(p, paContexts(only([], p), 'pit'), 'pit', 'count', opts)
    expect([pa(tb, 'behind'), pa(tb, 'ahead')]).toEqual([1, 0])
    expect([pa(tp, 'ahead'), pa(tp, 'behind')]).toEqual([1, 0])
  })
  it('對左右投 shows only once some plate appearance has the opponent pitcher\'s hand', () => {
    const rows = [bat({}), bat({ inning: 2 })]
    expect(availableGroups('bat', only(rows), paContexts(only(rows), 'bat'))).not.toContain('hand')
    const withHand = [bat({ oppHand: 'L' }), bat({ inning: 2 })]
    const ctx = paContexts(only(withHand), 'bat')
    expect(availableGroups('bat', only(withHand), ctx)).toContain('hand')
    expect(availableGroups('pit', only(withHand), ctx)).not.toContain('hand')
    const t = splitTable(withHand, ctx, 'bat', 'hand', opts)
    expect([pa(t, 'vs-L'), pa(t, 'vs-R'), t.missing]).toEqual([1, 0, 1])
  })
  it('a 突破僵局 runner is in no split', () => {
    const rows = [bat({ result: '突破僵局', pitches: [], inning: 8, order: 3 }), bat({ inning: 8, order: 4 })]
    const ctx = paContexts(only(rows), 'bat')
    expect(ctx.get(rows[0])).toBeUndefined()
    for (const g of ['count', 'inning', 'order', 'nth'] as const) expect(splitTable(rows, ctx, 'bat', g, opts).rows[0].line.pa, g).toBe(1)
    expect(splitTable(rows, ctx, 'bat', 'order', opts).rows.map((r) => r.key)).toEqual(['all', 'slot-4'])
  })
})
