import { describe, expect, it } from 'vitest'
import { addPitch, changePitcher, commitPA, defaultPlan, newGame, type PAPlan, type RecordState } from '../record/model'
import { placeTiebreak } from '../record/tiebreak'
import { holdCandidates, pitcherSituations, pitchingNotes, reliefEntries, runsByInning } from './pitchingSituations'
import { ourRunsOf, pitchingLines, summarizeGame, teamPitching } from './stats'
import { SEED_DATASET } from './seed'
import { DEFAULT_PARAMS as P, type Game, type PitchingPA } from './types'

const lineup = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const gameOf = (homeAway: '主' | '客'): Game => ({ id: 'G20260301-01', date: '2026-03-01', tournament: '友誼賽', opponent: '測試隊', homeAway, innings: 7 })
const start = (homeAway: '主' | '客' = '主') => newGame(gameOf(homeAway), lineup, '壬')
/** one plate appearance on the given pitches (an IP is added for a ball in play) */
const pa = (s: RecordState, result: string, patch: Partial<PAPlan> = {}, pitches?: string[]) => {
  for (const c of pitches ?? []) s = addPitch(s, c)
  if (!pitches) s = addPitch(s, result === '三振' ? 'SS' : 'IP')
  if (result === '三振' && !pitches) s = addPitch(addPitch(s, 'SS'), 'SS')
  const plan = defaultPlan(s, result)
  return commitPA(s, { ...plan, ...patch, runners: { ...plan.runners, ...patch.runners } })
}
const k = (s: RecordState) => pa(s, '三振')
const k3 = (s: RecordState) => k(k(k(s)))
const hr = (s: RecordState, n: number) => { for (let i = 0; i < n; i++) s = pa(s, '全壘打'); return s }
const scoreOf = (s: RecordState) => ({ homeAway: s.game.homeAway, ourLine: runsByInning(s.batting) })
const ctxOf = (s: RecordState) => ({ ourRuns: new Map([[s.game.id, runsByInning(s.batting)]]) })
const line = (s: RecordState, name: string, withCtx = true) => pitchingLines(s.pitching, [s.game], P, withCtx ? ctxOf(s) : undefined).find((l) => l.name === name)!
const strip = (rows: PitchingPA[]) => rows.map(({ basesBefore: _b, outsBefore: _o, ...r }) => r as PitchingPA)

describe('繼承跑者 (IR / IRS)', () => {
  // home game: the opponent bats first, so every plate appearance of the top half is our pitchers'
  const inherited = () => {
    let s = k(start())
    s = pa(s, '保送', {}, ['B', 'B', 'B', 'B'])
    s = pa(s, '保送', {}, ['B', 'B', 'B', 'B'])
    s = changePitcher(s, '癸')
    s = pa(s, '二安', { runners: { 1: 'home', 2: 'home' } })
    s = k(s)
    return pa(s, '內滾')
  }
  it('a reliever who comes in with two on and lets both score: ir 2, irs 2; the runs stay on the starter', () => {
    const s = inherited()
    expect(reliefEntries(s.pitching, scoreOf(s))).toMatchObject([{ pitcher: '癸', inning: 1, outs: 1, runners: 2, ir: 2, irs: 2, sure: true }])
    const g = line(s, '癸')
    expect([g.ir, g.irs, g.irsPct]).toEqual([2, 2, 1])
    const st = pitchingLines(s.pitching, [s.game], P, { ourRuns: new Map([[s.game.id, [0]]]) }).find((l) => l.name === '壬')!
    expect([st.ir, st.r, st.er]).toEqual([0, 2, 2])
  })
  it('a change at the start of an inning inherits nobody', () => {
    let s = k3(start())
    s = k3(s)                                             // our half
    s = changePitcher(s, '癸')
    s = k(pa(s, '一安'))
    expect(reliefEntries(s.pitching, scoreOf(s))).toMatchObject([{ pitcher: '癸', inning: 2, ir: 0, sure: true }])
  })
  it('a new pitcher who starts a 突破僵局 half inherits none of the placed runners', () => {
    let s = k3(start())
    s = { ...s, inning: 8, half: 'top', outs: 0, runners: [], oppOrder: 3 }
    s = placeTiebreak(s)
    s = changePitcher(s, '癸')
    s = k3(s)
    const e = reliefEntries(s.pitching, scoreOf(s))
    expect(e).toMatchObject([{ pitcher: '癸', inning: 8, ir: 0, sure: true }])
    const x = pitcherSituations(s.pitching, [s.game], ctxOf(s).ourRuns).get('癸')!
    // never 1-2-3 (it started with runners on); the leadoff is the first real batter
    expect([x.fullInn, x.inn123, x.leadoffBf, x.leadoffOuts]).toEqual([1, 0, 1, 1])
  })
  it('older rows without 壘上(前)／出局(前): a mid-inning change is not judged and shows as a gap', () => {
    const s = inherited()
    const rows = strip(s.pitching)
    expect(reliefEntries(rows, scoreOf(s))).toMatchObject([{ pitcher: '癸', sure: false }])
    const g = pitchingLines(rows, [s.game], P, ctxOf(s)).find((l) => l.name === '癸')!
    expect([g.ir, g.sitGaps]).toEqual([0, 1])
    expect(teamPitching(rows, P, [s.game], ctxOf(s)).sitGaps).toBe(1)
  })
  it('older rows: a reliever pulled mid-inning in a later inning keeps the blown save he already had; one change is one gap', () => {
    let s = k3(start())
    s = k3(hr(s, 2))                                      // bottom 1: 2–0
    s = changePitcher(s, '癸')
    s = k3(hr(s, 2))                                      // top 2: he starts it and gives up the tie (BS)
    s = k3(s)                                             // bottom 2
    s = k(s)
    s = changePitcher(s, '子')
    s = k(k(s))                                           // top 3: 子 replaces him after one out
    const full = pitchingLines(s.pitching, [s.game], P, ctxOf(s))
    expect([full.find((l) => l.name === '癸')!.bs, full.reduce((a, l) => a + l.sitGaps, 0)]).toEqual([1, 0])
    const inn3 = s.pitching.map((r) => (r.inning === 3 ? strip([r])[0] : r))
    for (const rows of [inn3, strip(s.pitching)]) {
      const lines = pitchingLines(rows, [s.game], P, ctxOf(s))
      const of = (n: string) => lines.find((l) => l.name === n)!
      expect([of('癸').bs, of('癸').sitGaps, of('子').sitGaps]).toEqual([1, 0, 1])
      expect(teamPitching(rows, P, [s.game], ctxOf(s)).sitGaps).toBe(1)
      const e = reliefEntries(rows, scoreOf(s))
      expect(e).toMatchObject([{ pitcher: '癸', sure: true, blown: true, leadAtExit: null }, { pitcher: '子', sure: false }])
    }
  })
  it('older rows: the pitcher who starts a half and is pulled in it is no gap, but gets no hold suggestion', () => {
    let s = k3(start())
    s = k3(hr(s, 2))                                      // 2–0
    s = changePitcher(s, '癸')
    s = k(s)
    s = changePitcher(s, '子')
    s = k(k(s))
    const rows = strip(s.pitching)
    const e = reliefEntries(rows, scoreOf(s))
    expect(e).toMatchObject([{ pitcher: '癸', sure: true, saveSituation: true, leadAtExit: null }, { pitcher: '子', sure: false }])
    expect(holdCandidates(e, [])).toEqual([])
    expect(holdCandidates(reliefEntries(s.pitching, scoreOf(s)), [])).toEqual(['癸'])
  })
  it('pitchingNotes lists the inherited runners and the ground / fly outs', () => {
    const s = inherited()
    const notes = pitchingNotes(pitchingLines(s.pitching, [s.game], P, ctxOf(s)))
    expect(notes).toContainEqual({ label: '繼承跑者－回來得分', text: '癸 2-2' })
    expect(notes.find((n) => n.label === '滾地－飛球出局')?.text).toBe('癸 1-0')
    // a game with no relievers: no IR or BS lines
    const solo = k3(start())
    const plain = pitchingNotes(pitchingLines(solo.pitching, [solo.game], P, ctxOf(solo)))
    expect(plain.map((n) => n.label)).not.toContain('繼承跑者－回來得分')
    expect(plain.map((n) => n.label)).not.toContain('救援失敗')
  })
})

describe('救援失敗 (BS) and save situations', () => {
  // home: 3–0 after the 1st; 癸 starts the 2nd
  const upThree = () => hr(k3(start()), 3)
  it('a reliever who comes in up 3 and gives up the tying runs blows the save; the next one at 3–3 has no save situation', () => {
    let s = k3(upThree())                                 // our half: 3 runs, 3 outs
    s = changePitcher(s, '癸')
    s = pa(s, '保送', {}, ['B', 'B', 'B', 'B'])
    s = pa(s, '保送', {}, ['B', 'B', 'B', 'B'])
    s = pa(s, '全壘打')
    s = k3(s)
    s = k3(s)                                             // our 2nd: nothing
    s = changePitcher(s, '子')
    s = k3(s)
    const e = reliefEntries(s.pitching, scoreOf(s))
    expect(runsByInning(s.batting)).toEqual([3, 0])
    expect(e).toMatchObject([{ pitcher: '癸', lead: 3, saveSituation: true, blown: true }, { pitcher: '子', lead: 0, saveSituation: false, blown: false, finished: true }])
    expect(line(s, '癸').bs).toBe(1)
    expect(line(s, '子').bs).toBe(0)
    // without 壘上(前): the change came at the start of the inning, so it is still judged
    expect(pitchingLines(strip(s.pitching), [s.game], P, ctxOf(s)).find((l) => l.name === '癸')!.bs).toBe(1)
  })
  it('a 5-run lead with the bases empty is no save situation (5 runs allowed are no blown save)', () => {
    let s = k3(hr(k3(start()), 5))
    s = changePitcher(s, '癸')
    s = k3(hr(s, 5))
    expect(reliefEntries(s.pitching, scoreOf(s))).toMatchObject([{ pitcher: '癸', lead: 5, saveSituation: false, blown: false }])
    expect(line(s, '癸').bs).toBe(0)
  })
  it('the tying run on deck: a 4-run lead with two on is a save situation, a 5-run lead with two on is not', () => {
    for (const [runs, want] of [[4, true], [5, false]] as const) {
      let s = k3(hr(k3(start()), runs))
      s = pa(pa(s, '一安'), '一安')
      s = changePitcher(s, '癸')
      s = k3(s)
      expect(reliefEntries(s.pitching, scoreOf(s))[0]).toMatchObject({ pitcher: '癸', runners: 2, lead: runs, saveSituation: want })
    }
  })
  it('away: a reliever who comes in the bottom of the 7th up 1 and gets three outs finishes it, no blown save and no hold', () => {
    let s = start('客')
    for (let i = 1; i <= 6; i++) s = k3(k3(s))           // we bat the top, they the bottom
    s = k3(hr(s, 1))                                      // top 7: 1 run
    s = changePitcher(s, '癸')
    s = k3(s)
    const e = reliefEntries(s.pitching, scoreOf(s))
    expect(runsByInning(s.batting)).toEqual([0, 0, 0, 0, 0, 0, 1])
    expect(e).toMatchObject([{ pitcher: '癸', inning: 7, lead: 1, saveSituation: true, blown: false, finished: true }])
    expect(holdCandidates(e, ['壬'])).toEqual([])
  })
})

describe('中繼建議 (holdCandidates)', () => {
  const play = (runsAllowed: number) => {
    let s = k3(hr(k3(start()), 2))                       // 2–0 after the 1st
    s = changePitcher(s, '癸')
    s = k3(hr(s, runsAllowed))
    s = k3(s)
    s = changePitcher(s, '子')
    return k3(s)
  }
  it('came in up 2, got three outs and left still ahead: suggested (勝投 and 救援 never are)', () => {
    const s = play(0)
    const e = reliefEntries(s.pitching, scoreOf(s))
    expect(holdCandidates(e, ['壬', '子'])).toEqual(['癸'])
    expect(holdCandidates(e, ['癸', '子'])).toEqual([])
  })
  it('...but not when he let the lead go', () => {
    const s = play(2)
    expect(holdCandidates(reliefEntries(s.pitching, scoreOf(s)), ['壬', '子'])).toEqual([])
  })
})

describe('首打者出局, 三上三下 and 13 球內', () => {
  it('counts by half-inning for the pitcher who pitched it alone', () => {
    let s = pa(start(), '三振', {}, ['S', 'S', 'S'])
    s = pa(s, '內滾', {}, ['IP'])
    s = pa(s, '外飛', {}, ['IP'])                          // top 1: 1-2-3 on 5 pitches
    let x = pitcherSituations(s.pitching, [s.game]).get('壬')!
    expect([x.fullInn, x.inn13, x.inn123, x.leadoffOuts, x.leadoffBf]).toEqual([1, 1, 1, 1, 1])
    s = k3(s)                                             // our half
    s = pa(s, '保送', {}, ['B', 'B', 'B', 'B'])
    s = pa(s, '三振', {}, ['S', 'S', 'S'])
    s = pa(s, '三振', {}, ['B', 'B', 'B', 'S', 'S', 'S'])
    s = pa(s, '內滾', {}, ['B', 'IP'])                     // top 2: 15 pitches, a walk first
    x = pitcherSituations(s.pitching, [s.game]).get('壬')!
    expect([x.fullInn, x.inn13, x.inn123, x.leadoffOuts, x.leadoffBf]).toEqual([2, 1, 1, 1, 2])
    s = k3(s)
    // top 3: the leadoff man strikes out but reaches on a passed ball — no leadoff out
    s = commitPA({ ...s, extras: { ...s.extras, pb: 1 } }, { ...defaultPlan(addPitch(addPitch(addPitch(s, 'SS'), 'SS'), 'SS'), '三振'), batter: 1 })
    s = k3(s)
    x = pitcherSituations(s.pitching, [s.game]).get('壬')!
    expect([x.fullInn, x.inn123, x.leadoffOuts, x.leadoffBf]).toEqual([3, 1, 1, 3])
  })
  it('13 球內 only counts halves whose pitches were recorded (an import without 逐球 is not 100%)', () => {
    let s = pa(start(), '三振', {}, ['S', 'S', 'S'])
    s = pa(s, '內滾', {}, ['IP'])
    s = pa(s, '外飛', {}, ['IP'])                          // top 1: 5 pitches
    s = k3(s)
    for (let i = 0; i < 3; i++) s = pa(s, '三振', {}, ['B', 'B', 'B', 'S', 'S', 'S'])   // top 2: 18 pitches
    let x = pitcherSituations(s.pitching, [s.game]).get('壬')!
    expect([x.fullInn, x.pitchInn, x.inn13]).toEqual([2, 2, 1])
    // no pitches at all: still full innings, but neither is judged
    const bare = s.pitching.map((r) => ({ ...r, pitches: [] }))
    x = pitcherSituations(bare, [s.game]).get('壬')!
    expect([x.fullInn, x.pitchInn, x.inn13]).toEqual([2, 0, 0])
    expect(pitchingLines(bare, [s.game], P, ctxOf(s))[0].inn13Pct).toBeNull()
    // one batter of the 1st without pitches: that half is left out
    const part = s.pitching.map((r, i) => (i === 1 ? { ...r, pitches: [] } : r))
    x = pitcherSituations(part, [s.game]).get('壬')!
    expect([x.pitchInn, x.inn13]).toEqual([1, 0])
    // a 故四 without pitches does not spoil the half
    const ibb = s.pitching.map((r, i) => (i === 1 ? { ...r, result: '故四', pitches: [] } : r))
    expect(pitcherSituations(ibb, [s.game]).get('壬')!.pitchInn).toBe(2)
  })
  it('an inning with a pitching change is a full inning for neither pitcher', () => {
    let s = k(start())
    s = changePitcher(s, '癸')
    s = k(k(s))
    const m = pitcherSituations(s.pitching, [s.game])
    expect(m.get('壬')!.fullInn).toBe(0)
    expect(m.get('癸')!.fullInn).toBe(0)
  })
  it('without the score (no ctx) the situational numbers stay 0 / null; with it the team line is the sum', () => {
    const s = k(pa(k(start()), '一安'))
    const bare = pitchingLines(s.pitching, [s.game], P)[0]
    expect([bare.ir, bare.irs, bare.bs, bare.inn123, bare.fullInn, bare.inn13, bare.leadoffBf]).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect([bare.irsPct, bare.leadoffOutPct, bare.inn13Pct]).toEqual([null, null, null])
  })
})

describe('the sample games (SEED_DATASET)', () => {
  const ds = SEED_DATASET
  const ctx = { ourRuns: ourRunsOf(ds.games.map((g) => summarizeGame(ds, g))) }
  const one = (id: string) => pitchingLines(ds.pitching.filter((p) => p.gameId === id), ds.games, P, ctx)
  it('G20251010-01: 林昱丞 came in up 5–4 and a batter who reached on an error scored the tying run (BS); 蔡奇霖 came in at a tie', () => {
    const lines = one('G20251010-01')
    expect(lines.find((l) => l.name === '林昱丞')!.bs).toBe(1)
    expect(lines.find((l) => l.name === '蔡奇霖')!.bs).toBe(0)
    expect(lines.reduce((a, l) => a + l.sitGaps, 0)).toBe(0)
  })
  it('G20251222-01: three mid-inning changes without 壘上(前) are gaps', () => {
    expect(one('G20251222-01').reduce((a, l) => a + l.sitGaps, 0)).toBe(3)
  })
  it('season: 林昱丞 and 許振謙', () => {
    const all = pitchingLines(ds.pitching, ds.games, P, ctx)
    const l = all.find((x) => x.name === '林昱丞')!
    expect([l.fullInn, l.inn13, l.inn123, l.leadoffOuts, l.leadoffBf, l.go, l.ao, l.goAo]).toEqual([6, 2, 1, 4, 7, 5, 5, 1])
    const x = all.find((p) => p.name === '許振謙')!
    expect([x.inn13, x.fullInn]).toEqual([2, 2])
    // the same games imported without 逐球: no 13-pitch innings judged, instead of 100%
    const bare = pitchingLines(ds.pitching.map((p) => ({ ...p, pitches: [] })), ds.games, P, ctx).find((p) => p.name === '林昱丞')!
    expect([bare.fullInn, bare.pitchInn, bare.inn13, bare.inn13Pct]).toEqual([6, 0, 0, null])
    // the team line with ctx = the sums of the pitchers' lines
    const t = teamPitching(ds.pitching, P, ds.games, ctx)
    for (const k of ['leadoffBf', 'leadoffOuts', 'fullInn', 'pitchInn', 'inn13', 'inn123', 'ir', 'irs', 'bs', 'sitGaps'] as const) expect(t[k], k).toBe(all.reduce((a, p) => a + p[k], 0))
  })
})
