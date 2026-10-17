/**
 * batch 15, bug 2: 三壘安打 then out on the bases. A batter who reached and was put out on that same play is an out on
 * the bases (壘上出局, his row's code I is that out): the 修改資料 warning 「上壘卻記出局碼」 must never stay up for it,
 * recorded live or fixed in the editor. His hit still counts.
 */
import { describe, expect, it } from 'vitest'
import { auditGame, needsOutOnBase } from '../data/audit'
import { normalizeDataset } from '../data/normalize'
import { battingLines, pitchingLines } from '../data/stats'
import { SEED_DATASET } from '../data/seed'
import type { BattingPA } from '../data/types'
import { addPitch, commitPA, defaultPlan, newGame, runnerEvent, type RecordState } from './model'
import { splitTail } from '../data/winTimeline'
import { buildFeed, itemText } from '../data/broadcast'
import { applyPlayCounts, batterOutMark, deriveHalf, inferHalf, isBatterOutMark, reachedOn, setEnd } from './timeline'

const pa = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, batter: '甲', pitches: ['IP'], result: '', loc: 8, traj: 'L', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
const warnings = (rows: BattingPA[]) => auditGame(rows, []).filter((i) => i.message.includes('卻記出局碼')).map((i) => i.message)

describe('who reached on his result', () => {
  it('hits, walks, 觸身, 失誤, 野選 reach; outs, strikeouts and tie-break runners do not', () => {
    for (const r of ['一安', '二安', '三安', '保送', '觸身', '失誤', '野選']) expect(reachedOn(r), r).toBe(true)
    for (const r of ['內滾', '外飛', '三振', '犧觸', '雙殺', '突破僵局', '']) expect(reachedOn(r), r).toBe(false)
    expect(batterOutMark('三安', 1)).toEqual({ at: 1, kind: 'outPlay', from: 3, to: 'out', play: true, batter: true })
  })
})

describe('the audit', () => {
  const legacy = [pa({ result: '三安', basesBefore: '無', outsBefore: 0, code: 'I' }), pa({ batter: '乙', result: '內滾', loc: 6, traj: 'G', basesBefore: '無', outsBefore: 1, code: 'II' }), pa({ batter: '丙', result: '外飛', traj: 'F', basesBefore: '無', outsBefore: 2, code: 'III' })]
  it('a hit with an out code and nothing saying he was put out on the bases is flagged, naming only controls that exist', () => {
    const w = warnings(legacy)
    expect(w).toHaveLength(1)
    // the game page's 待核對 list and the notice after a save (no such controls there): it says to open 修改資料
    expect(w[0]).toBe('第 1 局・甲：上壘（三安）卻記出局碼 I。若是打完被觸殺出局：到「修改資料」打開這個打席，在「壘上跑者」把他設成出局，或按「設成壘上出局」（會記成壘上出局）')
    expect(w[0]).not.toContain('壘死')
    // inside 修改資料, where both are on screen
    const inEditor = auditGame(legacy, [], 'editor').filter((i) => i.message.includes('卻記出局碼')).map((i) => i.message)
    expect(inEditor).toEqual(['第 1 局・甲：上壘（三安）卻記出局碼 I。若是打完被觸殺出局：在「壘上跑者」把他設成出局，或按「設成壘上出局」（會記成壘上出局）'])
    // an Excel import: the workbook's own column, no site buttons
    const inExcel = auditGame(legacy, [], 'excel').filter((i) => i.message.includes('卻記出局碼')).map((i) => i.message)
    expect(inExcel).toEqual(['第 1 局・甲：上壘（三安）卻記出局碼 I。若是打完被觸殺出局：在 Excel 這一列的「壘上出局」填 1（舊表沒有這欄就填「壘死」）'])
    expect(needsOutOnBase(legacy[0])).toBe(true)
  })
  it('an import reads the workbook wording, a save of the site the page wording', () => {
    const game = { id: 'G', date: '2026-10-14', tournament: '友誼賽', opponent: '測試隊', homeAway: '客' as const, innings: 7 }
    const ds = { roster: [], games: [game], batting: legacy, pitching: [], fielding: [] }
    const said = (place?: 'excel') => normalizeDataset(ds, place).warnings.map((w) => w.message).filter((m) => m.includes('卻記出局碼'))
    expect(said('excel')).toEqual(['待核對：第 1 局・甲：上壘（三安）卻記出局碼 I。若是打完被觸殺出局：在 Excel 這一列的「壘上出局」填 1（舊表沒有這欄就填「壘死」）'])
    expect(said()[0]).toContain('到「修改資料」打開這個打席')
  })
  it('hit + I + 壘上出局 (or 盜壘失敗) is fine', () => {
    expect(warnings([{ ...legacy[0], outOnBase: 1 }, ...legacy.slice(1)])).toEqual([])
    expect(warnings([{ ...legacy[0], cs: 1 }, ...legacy.slice(1)])).toEqual([])
    expect(needsOutOnBase({ ...legacy[0], outOnBase: 1 })).toBe(false)
  })
  it('the editor\'s one click (outOnBase 1 + the mark) clears it; following the inning again marks the same thing', () => {
    const fixed = { ...legacy[0], outOnBase: 1, events: [batterOutMark('三安', 1)] }
    expect(warnings([fixed, ...legacy.slice(1)])).toEqual([])
    const h = inferHalf(legacy, [0, 1, 2], 'bat')!
    expect(h.steps[0].batter).toBe('out')
    const rows = deriveHalf(legacy, h, 'bat')
    expect(rows[0]).toMatchObject({ outOnBase: 1, code: 'I', events: [batterOutMark('三安', 1)] })
    expect(warnings(rows)).toEqual([])
  })
})

describe('修改資料 壘上跑者: the batter set to 出局 after his hit', () => {
  // 甲 三安 and left on 3B, two outs after him: the inning is not over
  const rows = [pa({ result: '三安', basesBefore: '無', outsBefore: 0, code: 'L' }), pa({ batter: '乙', result: '內滾', loc: 6, traj: 'G', basesBefore: '3', outsBefore: 0, code: 'I' }), pa({ batter: '丙', result: '外飛', traj: 'F', basesBefore: '3', outsBefore: 1, code: 'II' })]
  const idx = [0, 1, 2]
  it('setting him 出局 counts 壘上出局 (with the mark); back to 3B / 得分 clears both', () => {
    const h = setEnd(inferHalf(rows, idx, 'bat')!, 0, 'batter', 'out')
    const out = deriveHalf(rows, h, 'bat')
    expect(out[0]).toMatchObject({ code: 'I', outOnBase: 1, run: 0 })
    expect((out[0].events ?? []).filter(isBatterOutMark)).toHaveLength(1)
    expect(out.map((r) => r.code)).toEqual(['I', 'II', 'III'])
    expect(warnings(out)).toEqual([])
    // 跑壘失誤（壘死） is kept on his row while he stays out
    const mistake = out.map((r, i) => (i === 0 ? { ...r, baserunningOuts: 1 } : r))
    const again = deriveHalf(mistake, inferHalf(mistake, idx, 'bat')!, 'bat')
    expect(again[0]).toMatchObject({ outOnBase: 1, baserunningOuts: 1 })
    // back on 3B: nothing of it left
    const back = deriveHalf(mistake, setEnd(inferHalf(mistake, idx, 'bat')!, 0, 'batter', 3), 'bat')
    expect(back[0].outOnBase).toBe(0)
    expect('baserunningOuts' in back[0]).toBe(false)
    expect((back[0].events ?? []).some(isBatterOutMark)).toBe(false)
    expect(back[0].code).toBe('L')
    // 得分 too
    const home = deriveHalf(mistake, setEnd(inferHalf(mistake, idx, 'bat')!, 0, 'batter', 'home'), 'bat')
    expect(home[0]).toMatchObject({ outOnBase: 0, run: 1, code: 'R' })
    expect('baserunningOuts' in home[0]).toBe(false)
  })
  it('a result changed to an out takes away what the mark set', () => {
    const h = setEnd(inferHalf(rows, idx, 'bat')!, 0, 'batter', 'out')
    const out = deriveHalf(rows, h, 'bat')
    const ground = out.map((r, i) => (i === 0 ? { ...r, result: '內滾', baserunningOuts: 1 } : r))
    const re = deriveHalf(ground, inferHalf(ground, idx, 'bat')!, 'bat')
    expect(re[0]).toMatchObject({ code: 'I', outOnBase: 0 })
    expect('baserunningOuts' in re[0]).toBe(false)
    expect((re[0].events ?? []).some(isBatterOutMark)).toBe(false)
  })
  it('set 出局 on his own play when his row counted a later 盜壘刺 (no runner play): that 盜壘失敗 goes, 壘上出局 + the mark', () => {
    // 甲 三安; after 丁's plate appearance he was caught stealing home for the third out, kept only as his count
    const cs = [pa({ result: '三安', basesBefore: '無', outsBefore: 0, code: 'III', cs: 1 }), pa({ batter: '乙', result: '外飛', traj: 'F', basesBefore: '3', outsBefore: 0, code: 'I' }), pa({ batter: '丙', result: '外飛', traj: 'F', basesBefore: '3', outsBefore: 1, code: 'II' }), pa({ batter: '丁', result: '一安', basesBefore: '3', outsBefore: 2, code: 'L' })]
    const all = [0, 1, 2, 3]
    const before = inferHalf(cs, all, 'bat')!
    // following the inning untouched keeps his 盜壘失敗
    expect(deriveHalf(applyPlayCounts(cs, before, before, 'bat'), before, 'bat')[0]).toMatchObject({ code: 'III', cs: 1, outOnBase: 0 })
    const h = setEnd(before, 0, 'batter', 'out')
    const out = deriveHalf(applyPlayCounts(cs, before, h, 'bat'), h, 'bat')
    expect(out[0]).toMatchObject({ code: 'I', cs: 0, outOnBase: 1 })
    expect((out[0].events ?? []).filter(isBatterOutMark)).toHaveLength(1)
    expect(warnings(out)).toEqual([])
    const line = battingLines({ ...SEED_DATASET, roster: [] }, out).find((l) => l.name === '甲')!
    expect(line).toMatchObject({ h: 1, h3: 1, cs: 0 })
    // a 盜壘刺 during the next plate appearance that the codes put on his own step (old sheets) is not touched
    const old = [pa({ result: '一安', basesBefore: '無', outsBefore: 0, code: 'I', cs: 1 }), pa({ batter: '乙', result: '外飛', traj: 'F', basesBefore: '無', outsBefore: 1, code: 'II' }), pa({ batter: '丙', result: '外飛', traj: 'F', basesBefore: '無', outsBefore: 2, code: 'III' })]
    const oh = inferHalf(old, [0, 1, 2], 'bat')!
    expect(deriveHalf(applyPlayCounts(old, oh, oh, 'bat'), oh, 'bat')[0]).toMatchObject({ code: 'I', cs: 1, outOnBase: 0 })
  })
  it('a 牽制 after the half\'s last plate appearance (his count, no mark) stays what it was', () => {
    const tail = [pa({ result: '外飛', traj: 'F', basesBefore: '無', outsBefore: 0, code: 'I' }), pa({ batter: '乙', result: '外飛', traj: 'F', basesBefore: '無', outsBefore: 1, code: 'II' }), pa({ batter: '丙', result: '一安', basesBefore: '無', outsBefore: 2, code: 'III', outOnBase: 1 })]
    const re = deriveHalf(tail, inferHalf(tail, [0, 1, 2], 'bat')!, 'bat')
    expect(re[2]).toMatchObject({ outOnBase: 1, code: 'III' })
    expect((re[2].events ?? []).some(isBatterOutMark)).toBe(false)
  })
})

describe('紀錄比賽: the same play recorded live', () => {
  const game = { id: 'G20261014-01', date: '2026-10-14', tournament: '友誼賽', opponent: '測試隊', homeAway: '客' as const, innings: 7 }
  const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
  const triple = (s: RecordState, mistake = false) => commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '三安'), loc: 8, traj: 'L', batter: 'out', ...(mistake ? { batterRunningOut: true } : {}) })
  it('三安, then tagged out at home on the play: 壘上出局 + the mark, code I, no warning; his hit still counts', () => {
    let s = newGame(game, lineup, '壬')
    s = triple(s)
    expect(s.outs).toBe(1)
    expect(s.runners).toEqual([])
    expect(s.batting[0]).toMatchObject({ result: '三安', code: 'I', outOnBase: 1 })
    expect('baserunningOuts' in s.batting[0]).toBe(false)
    expect(s.batting[0].events).toEqual([batterOutMark('三安', 1, 'home')])  // out at the plate: the base after 3B
    expect(warnings(s.batting)).toEqual([])
    // the editor following the inning keeps exactly what was recorded
    const re = deriveHalf(s.batting, inferHalf(s.batting, [0], 'bat')!, 'bat')
    expect(re[0]).toEqual(s.batting[0])
    const line = battingLines({ ...SEED_DATASET, roster: [] }, s.batting).find((l) => l.name === '甲')!
    expect(line).toMatchObject({ pa: 1, ab: 1, h: 1, h3: 1, tb: 3, baserunningOuts: 0 })
  })
  it('as the third out of the half: the feed and the win-probability events read it as on the play, not a 牽制 later', () => {
    const s0 = newGame(game, lineup, '壬')
    let s = commitPA(addPitch(s0, 'IP'), { ...defaultPlan(s0, '外飛'), loc: 8, traj: 'F' })
    s = commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '外飛'), loc: 8, traj: 'F' })
    s = triple(s)
    expect(s.batting[2]).toMatchObject({ code: 'III', outOnBase: 1 })
    const text = buildFeed({ homeAway: '客', opponent: '測試隊', batting: s.batting, pitching: [], subs: [] }).flatMap((h) => h.items).map(itemText)
    expect(text.at(-1)).toBe('丙 擊出中外野平飛球，三壘安打；打者出局。')
    expect(text.some((t) => t.includes('牽制'))).toBe(false)
    const h = inferHalf(s.batting, [0, 1, 2], 'bat')!
    expect(splitTail(s.batting, h.steps, 'bat')).toBeNull()
    // the same row without the mark (a 牽制 after the half's last plate appearance) is still split off as one
    const old = s.batting.map((r, i) => (i === 2 ? { ...r, events: undefined } : r))
    expect(splitTail(old, inferHalf(old, [0, 1, 2], 'bat')!.steps, 'bat')?.tail.map((m) => m.kind)).toEqual(['pk'])
  })
  it('his own baserunning mistake on the play (壘死): baserunningOuts too', () => {
    const s = triple(newGame(game, lineup, '壬'), true)
    expect(s.batting[0]).toMatchObject({ code: 'I', outOnBase: 1, baserunningOuts: 1 })
    expect(warnings(s.batting)).toEqual([])
    expect(battingLines({ ...SEED_DATASET, roster: [] }, s.batting).find((l) => l.name === '甲')).toMatchObject({ h3: 1, ab: 1, baserunningOuts: 1 })
  })
  it('an out on the bases between pitches (壘死 / 牽制) counts on the runner\'s row, no warning', () => {
    let s = commitPA(addPitch(newGame(game, lineup, '壬'), 'IP'), { ...defaultPlan(newGame(game, lineup, '壬'), '三安'), loc: 8, traj: 'L' })
    s = runnerEvent(addPitch(s, 'B'), 0, 'us', 'out')
    s = commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '內滾'), loc: 6, traj: 'G' })
    expect(s.batting[0]).toMatchObject({ code: 'I', outOnBase: 1, baserunningOuts: 1 })
    expect(s.batting[1].code).toBe('II')
    expect(warnings(s.batting)).toEqual([])
  })
  it('not a reach (a ground out): no 壘上出局, no mark, and no 壘死 even if asked', () => {
    const s0 = newGame(game, lineup, '壬')
    const s = commitPA(addPitch(s0, 'IP'), { ...defaultPlan(s0, '內滾'), loc: 6, traj: 'G', batterRunningOut: true })
    expect(s.batting[0]).toMatchObject({ code: 'I', outOnBase: 0 })
    expect(s.batting[0].events).toBeUndefined()
    expect('baserunningOuts' in s.batting[0]).toBe(false)
  })
  it('their batter (三安, out at home): our pitcher gets the out, nothing else changes', () => {
    const s0 = newGame({ ...game, homeAway: '主' }, lineup, '壬')
    const s = commitPA(addPitch(s0, 'IP'), { ...defaultPlan(s0, '三安'), loc: 8, traj: 'L', batter: 'out' })
    expect(s.pitching[0]).toMatchObject({ result: '三安', code: 'I' })
    expect(s.pitching[0].events).toBeUndefined()
    const l = pitchingLines(s.pitching, [s0.game]).find((x) => x.name === '壬')!
    expect(l).toMatchObject({ outs: 1, h: 1, bf: 1 })
  })
})
