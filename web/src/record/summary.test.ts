import { describe, expect, it } from 'vitest'
import { addPitch, changePitcher, commitPA, defaultPlan, newGame, runnerEvent, wildPitch } from './model'
import { describeChange } from './summary'
import type { Game } from '../data/types'

const game: Game = { id: 'G20261007-01', date: '2026-10-07', tournament: '測試', opponent: '對手', homeAway: '客', innings: 7 }
const start = () => newGame(game, ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name) => ({ name, pos: 'C' })), '壬', { bench: ['子'] })
const send = (s: ReturnType<typeof start>, r: string) => commitPA(s, defaultPlan(s, r))

describe('the line shown after each tap', () => {
  it('says the result, the runs and the outs', () => {
    let s = send(start(), '一安')
    const t = send(s, '全壘打')
    expect(describeChange(s, t)).toBe('乙 全壘打（2 分打點）・得 2 分・2：0')
    s = t
    expect(describeChange(s, send(s, '三振'))).toBe('丙 三振・1 出局')
  })
  it('names the runner on a play between pitches, and stays quiet on a pitch', () => {
    const s = addPitch(send(send(start(), '一安'), '一安'), 'B')
    expect(describeChange(send(send(start(), '一安'), '一安'), s)).toBeNull()
    expect(describeChange(s, wildPitch(s, 'wp'))).toBe('甲 暴投 2B→3B・乙 暴投 1B→2B')
    expect(describeChange(s, runnerEvent(s, 1, 'us', 'cs'))).toBe('乙 盜壘失敗（1B）・1 出局')
  })
  it('says when the half is over and who came in', () => {
    let s = start()
    for (const r of ['三振', '三振']) s = send(s, r)
    expect(describeChange(s, send(s, '外飛'))).toBe('丙 外飛・三出局，換 1 局下')
    expect(describeChange(s, changePitcher(s, '子'))).toBe('換投：子 接替 壬')
  })
})

describe('趁傳進壘 on a hit', () => {
  it('saves the extra bases taken on the throw, says so, and the timeline reads past it', async () => {
    const { inferHalf, deriveHalf, setEnd } = await import('./timeline')
    const s = send(start(), '一安')                       // 甲 on first
    const plan = defaultPlan(s, '一安')                    // 乙 singles: 甲 to 2B, 乙 to 1B
    plan.runners[0] = 3; plan.batter = 2; plan.throws = [0, 'batter']   // both take one more on the throw
    const t = commitPA(s, plan)
    expect(t.batting[1].events).toEqual([{ at: 1, kind: 'throw', from: 2, to: 3, play: true }, { at: 1, kind: 'throw', from: 1, to: 2, play: true, batter: true }])
    expect(describeChange(s, t)).toBe('乙 一安・趁傳進壘 2B→3B・打者趁傳進壘 1B→2B')
    const rows = send(send(send(t, '三振'), '三振'), '三振').batting
    const half = inferHalf(rows, [0, 1, 2, 3, 4], 'bat')!
    expect(half).not.toBeNull()
    expect(deriveHalf(rows, half, 'bat')[1].events).toHaveLength(2)
    // 甲 is sent back to 2B: his 趁傳 no longer applies, the batter's stays
    expect(deriveHalf(rows, setEnd(half, 1, 0, 2), 'bat')[1].events).toEqual([expect.objectContaining({ batter: true })])
  })
})

describe('失誤進壘 on a hit', () => {
  it('while we bat: counts on the runner, no RBI for that run, and says so', async () => {
    const { defaultRbi } = await import('./model')
    const s = send(start(), '一安')                       // 甲 on first
    const plan = defaultPlan(s, '一安')                    // 乙 singles: 甲 to 2B
    plan.runners[0] = 'home'; plan.errAdv = [0]            // 外野手爆傳：甲 一路跑回來
    plan.rbi = defaultRbi(plan)
    expect(plan.rbi).toBe(0)
    const t = commitPA(s, plan)
    expect(t.batting[0].advOnError).toBe(2)                // 2B→3B→本壘
    expect(t.batting[0].run).toBe(1); expect(t.batting[1].rbi).toBe(0)
    expect(t.batting[1].events).toEqual([{ at: 1, kind: 'err', from: 2, to: 'home', play: true }])
    expect(describeChange(s, t)).toBe('乙 一安・失誤進壘 2B→得分・得 1 分・1：0')
  })
  it('while we field: our fielder gets the error and the run is unearned', () => {
    let s = newGame({ ...game, homeAway: '主' }, ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name) => ({ name, pos: 'C' })), '壬')
    s = commitPA(s, defaultPlan(s, '一安'))                // their leadoff on first
    const plan = defaultPlan(s, '一安')
    plan.runners[0] = 3; plan.batter = 2; plan.errAdv = [0, 'batter']; plan.errBy = ['RF']; plan.earned = false
    const t = commitPA(s, plan)
    expect(t.pitching[1].errors).toEqual(['RF'])
    expect(t.pitching[1].events?.map((e) => e.kind)).toEqual(['err', 'err'])
    expect(describeChange(s, t)).toBe('對方 2 棒 一安・失誤進壘 2B→3B・打者失誤進壘 1B→2B')
  })
})

describe('場地二安', () => {
  it('is a double in the stats and every runner moves up exactly two bases', async () => {
    const { battingLines } = await import('../data/stats')
    const { normalizeGameEdit } = await import('../data/edit')
    const { SEED_DATASET } = await import('../data/seed')
    const { toGameEdit } = await import('./model')
    let s = send(send(start(), '一安'), '保送')            // 甲 2B, 乙 1B
    const plan = defaultPlan(s, '場地二安')
    expect(plan.batter).toBe(2); expect(plan.runners).toEqual({ 0: 'home', 1: 3 })
    s = commitPA(s, plan)
    expect(s.batting[2].rbi).toBe(1)
    const { fragment } = normalizeGameEdit(SEED_DATASET.roster, toGameEdit(s))
    const line = battingLines(fragment, fragment.batting).find((l) => l.name === '丙')!
    expect(line.h).toBe(1); expect(line.h2).toBe(1); expect(line.tb).toBe(2)
  })
})

describe('擊進場內 is the last pitch', () => {
  it('ignores anything tapped after IP, so a double tap stays one IP', () => {
    const s = addPitch(addPitch(addPitch(start(), 'B'), 'IP'), 'IP')
    expect(addPitch(s, 'B').pitches).toEqual(['B', 'IP'])
  })
})

describe('軌跡 the result already tells', () => {
  it('is filled in for grounders and fly balls, left to the recorder for hits and errors', () => {
    const s = send(start(), '一安')
    expect(['內滾', '雙殺', '犧觸', '野選', '內飛', '外飛', '界外飛', '犧飛', '一安', '失誤'].map((r) => defaultPlan(s, r).traj)).toEqual(['G', 'G', 'G', 'G', 'F', 'F', 'F', 'F', undefined, undefined])
  })
})
