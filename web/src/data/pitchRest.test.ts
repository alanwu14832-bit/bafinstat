import { describe, expect, it } from 'vitest'
import { TEAM_DEFAULTS } from '../config/teamDefaults'
import { backOn, checkRestRules, liveRestHint, md, mdWeek, nextTier, outings, pitchesToday, restBoard, restDays, restStatus, rulesText, type Outing } from './pitchRest'
import { outsCredited, pitchTotals } from './stats'
import { EMPTY_DATASET, type Dataset, type Game, type PitchingPA } from './types'

const R = TEAM_DEFAULTS.pitchRest
let gid = 0
const out = (date: string, pitches: number, extra: Partial<Outing> = {}): Outing => ({ pitcher: '王', gameId: `G${++gid}`, date, opponent: '資管', pitches, batters: 5, outs: 3, unknownPAs: 0, ...extra })

describe('rest days (Pitch Smart 19–22)', () => {
  it('follows the tiers', () => {
    const cases: Array<[number, number]> = [[0, 0], [30, 0], [31, 1], [45, 1], [46, 2], [60, 2], [61, 3], [80, 3], [81, 4], [105, 4], [106, 5], [130, 5]]
    for (const [p, d] of cases) expect(restDays(p, R), `${p} 球`).toBe(d)
  })
  it('knows the next tier', () => {
    expect(nextTier(28, R)).toEqual({ at: 31, rest: 1 })
    expect(nextTier(105, R)).toEqual({ at: 106, rest: 5 })
    expect(nextTier(106, R)).toBeNull()
  })
  it('checks the rules', () => {
    expect(checkRestRules(R)).toEqual([])
    expect(checkRestRules({ ...R, tiers: [[30, 0], [30, 1], [60, 1]] }).length).toBeGreaterThan(0)
    expect(checkRestRules({ ...R, dailyMax: 100 }).length).toBe(1)
    expect(checkRestRules({ ...R, over: 3 }).length).toBe(1)
  })
  it('writes the rules out', () => {
    expect(rulesText(R)).toEqual(['1–30 球：不用休息', '31–45 球：休 1 天', '46–60 球：休 2 天', '61–80 球：休 3 天', '81–105 球：休 4 天', '106 球以上：休 5 天', '一天最多 120 球', '不要連續 3 天出賽', '一天只投一場'])
  })
})

describe('live hint under the pitch count', () => {
  it('says how long he rests and warns near the next tier or the daily max', () => {
    expect(liveRestHint(0, R)).toEqual({ rest: 0, short: '不用休息', warn: null, tone: 'ok' })
    expect(liveRestHint(25, R).warn).toBeNull()
    expect(liveRestHint(26, R)).toMatchObject({ warn: '再投 5 球就要多休一天（31 球起休 1 天）', tone: 'warning' })
    expect(liveRestHint(30, R).warn).toBe('再投 1 球就要多休一天（31 球起休 1 天）')
    expect(liveRestHint(31, R)).toMatchObject({ short: '需休 1 天', warn: null })
    expect(liveRestHint(101, R).warn).toBe('再投 5 球就要多休一天（106 球起休 5 天）')
    expect(liveRestHint(106, R)).toMatchObject({ short: '需休 5 天', warn: null, tone: 'ok' })
    expect(liveRestHint(115, R)).toMatchObject({ warn: '離單日上限 120 球還有 5 球', tone: 'warning' })
    expect(liveRestHint(120, R)).toMatchObject({ warn: '已達單日上限 120 球', tone: 'critical' })
    expect(liveRestHint(125, R)).toMatchObject({ warn: '超過單日上限 120 球（多 5 球）', tone: 'critical' })
  })
  it('says 多休 N 天 when a tier jumps more than one day', () => {
    expect(liveRestHint(28, { ...R, tiers: [[30, 0], [45, 2], [60, 3], [80, 4], [105, 5]], over: 6 }).warn).toBe('再投 3 球就要多休 2 天（31 球起休 2 天）')
  })
})

describe('rest status', () => {
  const asOf = '2026-10-09'
  it('rests after a big day', () => {
    const s = restStatus('王', [out('2026-10-07', 85)], asOf, R)
    expect(s.available).toBe(false)
    expect(s.earliest).toBe('2026-10-12')
    expect(s.reason).toBe('10/07 投 85 球，要休 4 天')
    const t = [out('2026-10-05', 85)]
    expect(restStatus('王', t, '2026-10-09', R).available).toBe(false)
    expect(restStatus('王', t, '2026-10-10', R).available).toBe(true)
  })
  it('never three days in a row', () => {
    const s = restStatus('王', [out('2026-10-07', 20), out('2026-10-08', 25)], asOf, R)
    expect(s.earliest).toBe('2026-10-10')
    expect(s.available).toBe(false)
    expect(s.reason).toContain('已連續 2 天出賽')
  })
  it('adds up a doubleheader', () => {
    const s = restStatus('王', [out('2026-10-08', 20), out('2026-10-08', 15)], asOf, R)
    expect(s.days[0].pitches).toBe(35)
    expect(s.earliest).toBe('2026-10-10')
    expect(s.warnings).toContain('10/08 一天投了 2 場')
  })
  it('warns about too many pitches, too little rest, too many days in a row and missing pitches', () => {
    expect(restStatus('王', [out('2026-10-01', 125)], asOf, R).warnings.join()).toContain('超過單日上限 120 球')
    expect(restStatus('王', [out('2026-10-01', 70), out('2026-10-03', 20)], asOf, R).warnings).toContain('10/03 出賽時休息不夠（10/01 投 70 球，建議 10/05 起再投）')
    expect(restStatus('王', [out('2026-10-06', 10), out('2026-10-07', 10), out('2026-10-08', 10)], asOf, R).warnings).toContain('10/06–10/08 連續 3 天出賽')
    expect(restStatus('王', [out('2026-10-02', 40, { unknownPAs: 3 })], asOf, R).warnings).toContain('10/02 有 3 個打席沒記球數，實際用球可能更多')
  })
  it('leaves out the game being recorded and anything older than the window', () => {
    const a = out('2026-10-09', 50, { gameId: 'THIS' })
    const b = out('2026-10-09', 20)
    const s = restStatus('王', [a, b], asOf, R, { excludeGameId: 'THIS' })
    expect(s.days).toHaveLength(1)
    expect(s.days[0].pitches).toBe(20)
    const old = restStatus('王', [out('2026-08-30', 110)], asOf, R)
    expect(old.days).toEqual([])
    expect(old.available).toBe(true)
    expect(old.earliest).toBe(asOf)
  })
  it('one game a day can be turned off', () => {
    expect(restStatus('王', [out('2026-10-09', 20)], asOf, R).available).toBe(false)
    expect(restStatus('王', [out('2026-10-09', 20)], asOf, { ...R, oneGamePerDay: false }).available).toBe(true)
  })
  it('crosses into the next month', () => {
    expect(restStatus('王', [out('2026-10-30', 70)], '2026-10-30', R).earliest).toBe('2026-11-03')
  })
  it('adds the last seven days', () => {
    const s = restStatus('王', [out('2026-10-02', 30), out('2026-10-03', 20), out('2026-10-09', 10)], asOf, R)
    expect(s.last7).toBe(30)
  })
  it('counts other games of the day', () => {
    const all = [out('2026-10-09', 30, { gameId: 'A' }), out('2026-10-09', 15, { gameId: 'B' }), out('2026-10-08', 40)]
    expect(pitchesToday('王', '2026-10-09', all, 'B')).toBe(30)
    expect(pitchesToday('王', '2026-10-09', all)).toBe(45)
  })
})

const game = (id: string, date: string, extra: Partial<Game> = {}): Game => ({ id, date, tournament: '聯賽', opponent: '資管', homeAway: '主', ...extra })
const row = (gameId: string, pitcher: string, pitches: string[], result: string, extra: Partial<PitchingPA> = {}): PitchingPA => ({ gameId, inning: 1, pitcher, pitches, result, sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, ...extra })

describe('outings from the games', () => {
  const ds: Dataset = {
    ...EMPTY_DATASET,
    roster: [{ name: '甲', primaryPos: 'P' }, { name: '乙', secondaryPos: 'P' }, { name: '丙', primaryPos: 'P' }, { name: '丁', primaryPos: 'P', status: '畢業' }],
    games: [game('G2', '2026-10-07'), game('G1', '2026-10-01'), game('S1', '2026-10-12', { status: 'scheduled' })],
    pitching: [
      row('G1', '甲', ['B', 'S', 'IP'], '內滾', { code: 'I' }), row('G1', '甲', ['B', 'B', 'B', 'B'], '保送'), row('G1', '乙', ['SS', 'SS', 'SS'], '三振', { code: 'II', inning: 1 }),
      row('G2', '甲', [], '突破僵局'), row('G2', '甲', ['IP'], '外飛', { code: 'I' }), row('G2', '甲', [], '三振', { code: 'II' }), row('G2', '甲', [], '故四'),
      row('S1', '甲', ['B'], '保送'),
    ],
  }
  it('one per pitcher per game, by date, skipping scheduled games and placed runners', () => {
    const o = outings(ds)
    expect(o.map((x) => `${x.gameId}:${x.pitcher}`)).toEqual(['G1:甲', 'G1:乙', 'G2:甲'])
    const g1 = ds.pitching.filter((p) => p.gameId === 'G1' && p.pitcher === '甲')
    expect(o[0].pitches).toBe(g1.reduce((n, p) => n + pitchTotals(p.pitches).pitches, 0))
    const credit = outsCredited(ds.pitching.filter((p) => p.gameId !== 'S1'))
    expect(o[0].outs).toBe(g1.reduce((n, p) => n + (credit.get(p) ?? 0), 0))
    expect(o[1].outs).toBe(1)
    expect(o[2].batters).toBe(3)
    expect(o[2].unknownPAs).toBe(1)   // the 三振 without pitches; the empty 故四 is complete
  })
  it('the board splits who can pitch, who rests, and who did not pitch', () => {
    const b = restBoard(ds, '2026-10-09', R)
    expect(b.available.map((s) => s.name)).toEqual(['甲', '乙'])
    expect(b.resting).toEqual([])
    expect(b.idle).toEqual(['丙'])
    const c = restBoard(ds, '2026-10-07', R)
    expect(c.resting.map((s) => s.name)).toEqual(['甲'])
  })
})

describe('dates in the rest texts', () => {
  it('always pads to MM/DD, with or without the weekday', () => {
    expect(md('2026-10-09')).toBe('10/09')
    expect(mdWeek('2026-10-09')).toBe('10/09（五）')
    expect(mdWeek('2026-12-25')).toBe('12/25（五）')
    expect(backOn({ name: '甲', asOf: '2026-10-08', days: [], earliest: '2026-10-09', available: false, warnings: [], last7: 0 })).toBe('10/09（五）起可投')
  })
})
