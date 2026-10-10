import { describe, expect, it } from 'vitest'
import { buildRunModel, buildWinModel, END, resultClass, ruleOutcomes, stateOf, WIN_PRIOR, type PaSample, type Transition, type WinRules } from './winModel'

const E = 0, B1 = 1, B2 = 2, B12 = 3, B3 = 4, B123 = 7
const NO_RUNNER_PLAY = { runnerPlay: 0, runnerOut: 0 }
const sorted = (ts: Transition[]) => ts.map((t) => ({ to: t.to, runs: t.runs, p: Number(t.p.toFixed(10)) })).sort((a, z) => a.to - z.to || a.runs - z.runs)

describe('ruleOutcomes (the rule model, one plate appearance)', () => {
  it('a home run with nobody on: back to 無人, one run', () => {
    expect(sorted(ruleOutcomes(stateOf(0, E), { HR: 1 }, NO_RUNNER_PLAY))).toEqual([{ to: stateOf(0, E), runs: 1, p: 1 }])
  })
  it('a bases-loaded walk forces a run in', () => {
    expect(sorted(ruleOutcomes(stateOf(1, B123), { BB: 1 }, NO_RUNNER_PLAY))).toEqual([{ to: stateOf(1, B123), runs: 1, p: 1 }])
  })
  it('a single with a runner on first: to second, or to third with single13', () => {
    expect(sorted(ruleOutcomes(stateOf(0, B1), { '1B': 1 }, { ...NO_RUNNER_PLAY, single13: 0.4 }))).toEqual(sorted([
      { to: stateOf(0, B12), runs: 0, p: 0.6 }, { to: stateOf(0, B1 | B3), runs: 0, p: 0.4 },
    ]))
  })
  it('a single with a runner on second: he scores with single2H, else stops at third', () => {
    expect(sorted(ruleOutcomes(stateOf(0, B2), { '1B': 1 }, { ...NO_RUNNER_PLAY, single2H: 0.7 }))).toEqual(sorted([
      { to: stateOf(0, B1), runs: 1, p: 0.7 }, { to: stateOf(0, B1 | B3), runs: 0, p: 0.3 },
    ]))
  })
  it('an out with two out ends the half, whatever the bases', () => {
    for (let b = 0; b < 8; b++) expect(sorted(ruleOutcomes(stateOf(2, b), { OUT: 1 }, NO_RUNNER_PLAY))).toEqual([{ to: END, runs: 0, p: 1 }])
  })
  it('an out with a runner on first: double play, the runners move up, or they stay', () => {
    expect(sorted(ruleOutcomes(stateOf(0, B1), { OUT: 1 }, { ...NO_RUNNER_PLAY, dp: 0.1, outAdvance: 0.3 }))).toEqual(sorted([
      { to: stateOf(2, E), runs: 0, p: 0.1 }, { to: stateOf(1, B2), runs: 0, p: 0.27 }, { to: stateOf(1, B1), runs: 0, p: 0.63 },
    ]))
  })
  it('an out with a runner on third: he scores with outAdvance', () => {
    expect(sorted(ruleOutcomes(stateOf(1, B3), { OUT: 1 }, { ...NO_RUNNER_PLAY, outAdvance: 0.3 }))).toEqual(sorted([
      { to: stateOf(2, E), runs: 1, p: 0.3 }, { to: stateOf(2, B3), runs: 0, p: 0.7 },
    ]))
  })
  it('the runner play comes first: the lead runner moves up or is out', () => {
    const ts = ruleOutcomes(stateOf(2, B3), { K: 1 }, { runnerPlay: 0.3, runnerOut: 0.05 })
    // from third he scores, then the strikeout ends the half; out on the bases ends it at once
    expect(sorted(ts)).toEqual([{ to: END, runs: 0, p: 0.7 }, { to: END, runs: 1, p: 0.3 }])
    const all = ruleOutcomes(stateOf(0, B12), WIN_PRIOR.rates, WIN_PRIOR.adv)
    expect(all.reduce((a, t) => a + t.p, 0)).toBeCloseTo(1, 12)
  })
  it('classes the results', () => {
    expect(['三振', '保送', '故四', '觸身', '妨礙', '一安', '內安', '二安', '場地二安', '三安', '全壘打', '失誤', '野選', '內滾', '犧飛', '雙殺'].map(resultClass))
      .toEqual(['K', 'BB', 'BB', 'BB', 'BB', '1B', '1B', '2B', '2B', '3B', 'HR', 'E', 'FC', 'OUT', 'OUT', 'OUT'])
  })
})

describe('buildRunModel', () => {
  const prior = buildRunModel([])
  it('prior only: every distribution sums to 1 and RE is ordered', () => {
    for (let s = 0; s < END; s++) expect(prior.F[s].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
    expect(prior.re[0]).toBeGreaterThan(0.6)
    expect(prior.re[0]).toBeLessThan(1.6)
    for (let b = 0; b < 8; b++) {
      expect(prior.re[stateOf(0, b)]).toBeGreaterThan(prior.re[stateOf(1, b)])
      expect(prior.re[stateOf(1, b)]).toBeGreaterThan(prior.re[stateOf(2, b)])
    }
    for (let o = 0; o < 3; o++) {
      expect(prior.re[stateOf(o, B123)]).toBeGreaterThan(prior.re[stateOf(o, B1)])
      expect(prior.re[stateOf(o, B1)]).toBeGreaterThan(prior.re[stateOf(o, E)])
    }
    expect(prior.re[stateOf(0, B12)]).toBeGreaterThan(prior.re[stateOf(0, E)])
    expect(prior.re[END]).toBe(0)
  })
  it('lots of data wins: 500 three-up-three-down halves', () => {
    const ts: PaSample[] = []
    for (let h = 0; h < 500; h++) ts.push({ from: 0, to: 8, runs: 0, cls: 'K', half: h }, { from: 8, to: 16, runs: 0, cls: 'OUT', half: h }, { from: 16, to: END, runs: 0, cls: 'OUT', half: h })
    const m = buildRunModel(ts)
    expect(m.re[0]).toBeLessThan(0.1)
    expect(m.sample.halves).toBe(500)
    expect(m.sample.runsPerHalfActual).toBe(0)
    expect(m.sample.empiricalRe[0]).toBe(0)
    expect(m.sample.n[0]).toBe(500)
  })
  it('a small sample leans on the prior: one half (a home run, then three strikeouts)', () => {
    const ts: PaSample[] = [{ from: 0, to: 0, runs: 1, cls: 'HR', half: 1 }, { from: 0, to: 8, runs: 0, cls: 'K', half: 1 }, { from: 8, to: 16, runs: 0, cls: 'K', half: 1 }, { from: 16, to: END, runs: 0, cls: 'K', half: 1 }]
    const m = buildRunModel(ts)
    expect(Math.abs(m.re[0] - prior.re[0])).toBeLessThan(0.15)
    expect(m.sample.halves).toBe(1)
    expect(m.sample.runsPerHalfActual).toBe(1)
    expect(m.sample.runDist.actual).toEqual([0, 1, 0, 0])
  })
})

describe('buildWinModel (home win probability)', () => {
  const rules: WinRules = { innings: 7, tiebreakFrom: 8, tiebreakBases: [1, 2] }
  const run = buildRunModel([])
  const m = buildWinModel(run, rules)
  it('starts near even (the home team bats last)', () => {
    const w = m.we(1, 'top', stateOf(0, E), 0)
    expect(w).toBeGreaterThan(0.47)
    expect(w).toBeLessThan(0.56)
  })
  it('ends: the last half over, a lead, a walk-off', () => {
    expect(m.after(7, 'bottom', END, -1)).toBe(0)
    expect(m.after(7, 'top', END, 1)).toBe(1)
    for (let s = 0; s < END; s++) expect(m.we(7, 'bottom', s, 1)).toBe(1)
    expect(m.after(7, 'bottom', stateOf(0, E), 1)).toBe(1)
  })
  it('more runners and fewer outs help the batting team', () => {
    const loaded = m.we(7, 'bottom', stateOf(0, B123), 0), empty = m.we(7, 'bottom', stateOf(0, E), 0), twoOut = m.we(7, 'bottom', stateOf(2, E), 0)
    expect(loaded).toBeGreaterThan(empty)
    expect(empty).toBeGreaterThan(twoOut)
    expect(twoOut).toBeGreaterThan(0.3)
  })
  it('a bigger lead is better, and a lead is worth less with more innings to go', () => {
    for (let d = -5; d < 5; d++) expect(m.we(1, 'top', 0, d + 1)).toBeGreaterThan(m.we(1, 'top', 0, d))
    const nine = buildWinModel(run, { innings: 9, tiebreakFrom: 10, tiebreakBases: [1, 2] })
    expect(nine.we(7, 'bottom', 0, 3)).toBeLessThan(m.we(7, 'bottom', 0, 3))
  })
  it('extra innings: tie-break start, and without the rule', () => {
    expect(m.startState(8)).toBe(stateOf(0, B12))
    expect(m.startState(7)).toBe(0)
    const w = m.we(8, 'top', m.startState(8), 0)
    expect(w).toBeGreaterThan(0.45)
    expect(w).toBeLessThan(0.62)
    const plain = buildWinModel(run, { innings: 7, tiebreakFrom: null, tiebreakBases: [] })
    // two equal teams: a repeating tied inning is a coin flip (walk-offs do not change who wins)
    expect(plain.pStar).toBeGreaterThanOrEqual(0.5 - 1e-9)
    expect(plain.pStar).toBeLessThan(0.6)
    expect(plain.startState(9)).toBe(0)
    expect(run.re[stateOf(0, B12)]).toBeGreaterThan(run.re[stateOf(0, E)])
  })
  it('leverage: late and close is high, a blowout is low', () => {
    const high = m.liRaw(7, 'bottom', stateOf(2, B123), 0), start = m.liRaw(1, 'top', stateOf(0, E), 0), blowout = m.liRaw(5, 'top', stateOf(0, E), 10)
    expect(high).toBeGreaterThan(start)
    expect(start).toBeGreaterThan(blowout)
  })
  it('stays a probability everywhere', () => {
    for (const i of [1, 4, 7, 8, 9, 12]) for (const h of ['top', 'bottom'] as const) for (let s = 0; s < END; s++) for (const d of [-40, -3, 0, 2, 40]) {
      const w = m.we(i, h, s, d)
      expect(w).toBeGreaterThanOrEqual(0)
      expect(w).toBeLessThanOrEqual(1 + 1e-12)
    }
  })
})
