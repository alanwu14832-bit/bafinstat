import { describe, expect, it } from 'vitest'
import { applyRunEvent, basePath, runEnding, blankBattingAt, blankPitchingAt, codeFor, lastPitchFor, startBase, stillOn, toggleBase, undoRunStep, withResult, withRun } from './paEdit'
import type { BattingPA, PitchingPA } from '../data/types'

const bat = (p: Partial<BattingPA>): BattingPA => ({ gameId: 'G', inning: 1, batter: '甲', pitches: [], result: '', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...p })
const pit = (p: Partial<PitchingPA>): PitchingPA => ({ gameId: 'G', inning: 1, pitcher: '壬', pitches: [], result: '', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...p })

describe('editing one plate appearance with the recording buttons', () => {
  it('an out gets its out code from 出局(前); a double play counts two; hand-set L / R / ER stay', () => {
    expect(codeFor('內滾', 0, undefined)).toBe('I')
    expect(codeFor('外飛', 2, 'I')).toBe('III')
    expect(codeFor('雙殺', 1, undefined)).toBe('III')
    expect(codeFor('三振', undefined, undefined)).toBeUndefined()
    expect(codeFor('一安', 1, 'II')).toBeUndefined()
    expect(codeFor('一安', 1, 'R')).toBe('R')
    expect(codeFor('內飛', 1, 'L')).toBe('L')
  })
  it('changing the result adds the ball-in-play pitch and clears batted-ball fields when there is none', () => {
    const a = withResult(bat({ pitches: ['B', 'CS', 'F'], result: '一安', loc: 8, traj: 'L', quality: '強', outsBefore: 1 }), '外飛')
    expect(a).toMatchObject({ result: '外飛', pitches: ['B', 'CS', 'IP'], code: 'II', loc: 8 })
    const k = withResult(bat({ pitches: ['CS', 'SS', 'SS'], result: '內滾', loc: 6, traj: 'G', code: 'I', outsBefore: 0 }), '三振')
    expect(k.pitches).toEqual(['CS', 'SS', 'SS'])
    expect(k).not.toHaveProperty('loc'); expect(k).not.toHaveProperty('traj')
    expect(k.code).toBe('I')
    const bb = withResult(pit({ result: '內滾', code: 'II', outsBefore: 1 }), '保送')
    expect(bb).not.toHaveProperty('code')
  })
  it('the last pitch follows the new result', () => {
    expect(lastPitchFor(['CS', 'B', 'SS'], '二安')).toEqual(['CS', 'B', 'IP'])
    expect(lastPitchFor(['CS', 'B', 'IP'], '三振')).toEqual(['CS', 'B', 'SS'])
    expect(lastPitchFor(['B', 'B', 'B', 'IP'], '保送')).toEqual(['B', 'B', 'B', 'B'])
    expect(lastPitchFor(['B', 'IP'], '觸身')).toEqual(['B'])
    expect(lastPitchFor(['CS', 'CS', 'CS'], '三振')).toEqual(['CS', 'CS', 'CS'])
    expect(withResult(bat({ pitches: ['CS', 'SS', 'SS'], result: '三振', code: 'II', outsBefore: 1 }), '二安')).toMatchObject({ pitches: ['CS', 'SS', 'IP'] })
  })
  it('得分 moves the R code with it', () => {
    expect(withRun(bat({ result: '一安' }), 1)).toMatchObject({ run: 1, code: 'R' })
    expect(withRun(bat({ result: '一安', code: 'L' }), 1).code).toBe('R')
    expect(withRun(bat({ result: '一安', run: 1, code: 'R' }), 0)).not.toHaveProperty('code')
    expect(withRun(bat({ result: '一安' }), 5).run).toBe(1)
  })
  it('壘上(前) toggles one base at a time', () => {
    expect(toggleBase('無', 1)).toBe('1')
    expect(toggleBase('1', 3)).toBe('13')
    expect(toggleBase('13', 1)).toBe('3')
    expect(toggleBase('3', 3)).toBe('無')
    expect(toggleBase(undefined, 2)).toBe('2')
  })
  it('an inserted row continues the order with whoever holds that slot (a 代跑 took it over)', () => {
    const rows = [bat({ order: 1, batter: '甲', pos: 'SS' }), bat({ order: 2, batter: '乙', pos: 'C', runner: '癸' }), bat({ order: 3, batter: '丙', inning: 2 }), bat({ order: 2, batter: '乙', inning: 1 })]
    expect(blankBattingAt(rows, 1, 'G')).toMatchObject({ order: 2, batter: '乙', pos: 'C', inning: 1 })
    expect(blankBattingAt(rows, 3, 'G')).toMatchObject({ order: 4, batter: '', inning: 2 })
    const r = blankBattingAt(rows.slice(0, 2), 2, 'G')
    expect(r).toMatchObject({ order: 3, batter: '' })
    const afterPr = blankBattingAt([bat({ order: 9, batter: '壬' }), bat({ order: 1, batter: '甲', runner: '癸' }), bat({ order: 2, batter: '乙' })], 3, 'G')
    expect(afterPr).toMatchObject({ order: 3 })
    expect(blankBattingAt([bat({ order: 1, batter: '甲', runner: '癸' }), bat({ order: 9, batter: '壬' })], 2, 'G')).toMatchObject({ order: 1, batter: '癸' })
    expect(blankBattingAt([bat({ order: 1, batter: '甲', runner: '癸' }), bat({ order: 9, batter: '壬' })], 2, 'G')).not.toHaveProperty('pos')
    expect(blankBattingAt([], 0, 'G')).toMatchObject({ order: 1, inning: 1, batter: '' })
    expect(blankPitchingAt([pit({ oppOrder: 4, pitcher: '子', inning: 3 })], 1, 'G')).toMatchObject({ oppOrder: 5, pitcher: '子', inning: 3 })
    expect(blankPitchingAt([pit({ oppOrder: 4, pitcher: '子', inning: 3 })], 0, 'G')).toMatchObject({ oppOrder: 1, pitcher: '子', inning: 3 })
  })
})

describe('base running of our batter after he reached', () => {
  it('a single plus an error, a steal, then home', () => {
    let p = bat({ result: '一安' })
    expect(startBase(p)).toBe(1); expect(stillOn(p)).toBe(true)
    p = applyRunEvent(p, 'err'); p = applyRunEvent(p, 'sb'); p = applyRunEvent(p, 'score')
    expect(p).toMatchObject({ advOnError: 1, sb: 1, run: 1, code: 'R' })
    expect(basePath(p).map((s) => `${s.label}${s.base ?? ''}${s.end ?? ''}`)).toEqual(['一安1', '失誤進壘2', '盜壘3', '得分run'])
    expect(stillOn(p)).toBe(false)
    p = undoRunStep(p); expect(p).toMatchObject({ run: 0, sb: 1 }); expect(p).not.toHaveProperty('code')
    p = undoRunStep(p); expect(p.sb).toBe(0)
    p = undoRunStep(p); expect(p.advOnError).toBe(0)
  })
  it('caught stealing, picked off, left on base; outs at the plate have no path', () => {
    expect(applyRunEvent(bat({ result: '保送', code: 'L' }), 'cs')).toMatchObject({ cs: 1 })
    expect(applyRunEvent(bat({ result: '保送', code: 'L' }), 'cs')).not.toHaveProperty('code')
    expect(basePath(applyRunEvent(bat({ result: '二安' }), 'pk')).at(-1)).toMatchObject({ end: 'out' })
    expect(applyRunEvent(bat({ result: '三安', run: 1, code: 'R' }), 'stranded')).toMatchObject({ run: 0, code: 'L' })
    expect(basePath(bat({ result: '內滾', code: 'I' }))).toEqual([])
    expect(startBase(bat({ result: '三振', code: 'L' }))).toBe(1) // 不死三振 and left on base
    expect(basePath(bat({ result: '全壘打', run: 1, code: 'R' }))).toEqual([{ label: '全壘打', end: 'run' }])
  })
  it('a steal can be added after the ending; a new ending replaces the old one', () => {
    let p = applyRunEvent(bat({ result: '一安' }), 'score')
    p = applyRunEvent(p, 'err')
    expect(p).toMatchObject({ run: 1, code: 'R', advOnError: 1 })
    expect(runEnding(p)).toBe('score')
    p = applyRunEvent(p, 'cs')
    expect(p).toMatchObject({ run: 0, cs: 1, advOnError: 1 }); expect(p).not.toHaveProperty('code')
    p = applyRunEvent({ ...p, code: 'II' }, 'stranded')
    expect(p).toMatchObject({ cs: 0, outOnBase: 0, code: 'L' })
    expect(runEnding(bat({ result: '一安' }))).toBeNull()
  })
})
