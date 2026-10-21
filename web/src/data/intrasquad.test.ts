import { describe, expect, it } from 'vitest'
import { toGameEdit } from '../record/model'
import { inferAll, outsIn } from '../record/timeline'
import { earnedRepairs } from '../record/earned'
import { normalizeGameEdit } from './edit'
import { auditGame } from './audit'
import { oppTotals } from './opponent'
import { pitchingLines, summarizeGame, teamBatting } from './stats'
import { DEFAULT_PARAMS, EMPTY_DATASET, type Dataset, type Game } from './types'
import { parseDayRoster } from './gameRoster'
import { applyRosterChange } from './roster'
import { intraView, isMirror, mirrorId, sideText, storedId, withMirrors, withSideNames } from './intrasquad'
import { playGame, POS, roster } from '../test/simGame'

/** A random game played through the recording model, made a 隊內賽: their batters are B1…B9 by slot, their pitchers
 *  白投 (then 白救 from the 5th inning). */
function intraGame(seed: number): { ds: Dataset; game: Game } {
  const s = playGame(seed)
  const { fragment } = normalizeGameEdit(roster, toGameEdit(s))
  const g = fragment.games[0]
  const game: Game = { ...g, opponent: '白隊', dayRoster: { ...(g.dayRoster ?? { starters: [], bench: [], reentry: false }), intra: { team: '紅隊', opp: { starters: POS.map((pos, i) => ({ name: `B${i + 1}`, pos, order: i + 1 })), bench: [] } } } }
  const batting = fragment.batting.map((p) => ({ ...p, oppPitcher: p.inning >= 5 ? '白救' : '白投' }))
  const pitching = fragment.pitching.map((p) => ({ ...p, ...(p.oppBatter || !p.oppOrder ? {} : { oppBatter: `B${p.oppOrder}` }) }))
  const players = [...roster, ...Array.from({ length: 9 }, (_, i) => ({ name: `B${i + 1}` })), { name: '白投' }, { name: '白救' }]
  return { ds: { roster: players, games: [game], batting, pitching, fielding: fragment.fielding }, game }
}

describe('隊內賽: the other side\'s view of the game', () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i + 1)
  it.each(seeds)('game %i: every plate appearance is one batter\'s and one pitcher\'s on either side', (seed) => {
    const { ds, game } = intraGame(seed)
    const full = withMirrors(ds)
    const mid = mirrorId(game.id)
    const m = full.games.find((g) => g.id === mid)!
    expect(isMirror(m)).toBe(true)
    expect([m.opponent, m.homeAway, m.dayRoster?.intra?.team, m.dayRoster?.intra?.mirrorOf]).toEqual(['紅隊', game.homeAway === '主' ? '客' : '主', '白隊', game.id])
    const mBat = full.batting.filter((p) => p.gameId === mid), mPit = full.pitching.filter((p) => p.gameId === mid)
    const bat = ds.batting, pit = ds.pitching

    // the score, each side's way round
    const a = summarizeGame(full, game), b = summarizeGame(full, m)
    expect([b.runsUs, b.runsOpp, b.hitsUs, b.hitsOpp]).toEqual([a.runsOpp, a.runsUs, a.hitsOpp, a.hitsUs])
    expect([b.lineUs, b.lineOpp]).toEqual([a.lineOpp, a.lineUs])

    // their batters: the same totals as the 對方打擊 box of the stored game
    const them = teamBatting(EMPTY_DATASET, mBat), box = oppTotals(pit)
    for (const k of ['pa', 'ab', 'r', 'h', 'h2', 'hr', 'rbi', 'bb', 'so', 'sb', 'cs'] as const) expect(them[k], k).toBe(box[k])

    // their pitchers: what our batters did
    const us = teamBatting(EMPTY_DATASET, bat)
    const lines = pitchingLines(mPit, [m], DEFAULT_PARAMS)
    const sum = (k: 'bf' | 'h' | 'hr' | 'bb' | 'k' | 'r' | 'outs') => lines.reduce((x, l) => x + (l[k] as number), 0)
    expect([sum('bf'), sum('h'), sum('hr'), sum('bb'), sum('k'), sum('r')]).toEqual([us.pa, us.h, us.hr, us.bb + us.ibb, us.so, us.r])
    const outs = [...inferAll(bat, 'bat').values()].reduce((x, h) => x + (h?.steps.reduce((y, st) => y + outsIn(st), 0) ?? 0), 0)
    expect(sum('outs')).toBe(outs)
    expect(new Set(mPit.map((p) => p.pitcher))).toEqual(new Set(bat.some((p) => p.inning >= 5) ? ['白投', '白救'] : ['白投']))

    // written as consistently as rows recorded on the screen: nothing to flag, every run's 自責 by the rules
    expect(auditGame(mBat, mPit).map((i) => i.message)).toEqual([])
    expect(earnedRepairs(mPit)).toEqual([])
    // their fielders: a line each from their lineup, with putouts credited from the plays (as ours are)
    const fld = full.fielding.filter((f) => f.gameId === mid)
    expect(fld.filter((f) => f.pos !== 'P').map((f) => f.player).sort()).toEqual(expect.arrayContaining(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']))
    expect(fld.reduce((x, f) => x + f.po, 0)).toBeGreaterThan(0)
  })

  it('the 隊內賽 filter leaves them out, counts them, or counts only them', () => {
    const { ds, game } = intraGame(7)
    const other: Game = { id: 'G-other', date: '2026-01-02', tournament: '盃', opponent: '對手', homeAway: '主' }
    const all: Dataset = { ...ds, games: [...ds.games, other], batting: [...ds.batting, { ...ds.batting[0], gameId: other.id }] }
    const full = withMirrors(all)
    expect(intraView(full, 'exclude').games.map((g) => g.id)).toEqual([other.id])
    expect(intraView(full, 'only').games.map((g) => g.id)).toEqual([game.id, mirrorId(game.id)])
    expect(intraView(full, 'include')).toBe(full)
    expect(intraView(full, 'exclude').batting.every((p) => p.gameId === other.id)).toBe(true)
    // cached: the same objects every time (the pages' memos rely on it)
    expect(withMirrors(all)).toBe(full)
    expect(intraView(full, 'exclude')).toBe(intraView(full, 'exclude'))
    expect(storedId(mirrorId(game.id))).toBe(game.id)
  })

  it('the other side is kept through a save (parseDayRoster) and renamed with the roster', () => {
    const { ds, game } = intraGame(3)
    expect(parseDayRoster(JSON.parse(JSON.stringify(game.dayRoster)))).toEqual(game.dayRoster)
    const next = applyRosterChange(ds, { players: [{ original: 'B3', player: { name: 'B三' } }, { original: '白投', player: { name: '白先發' } }], removed: [] })
    expect(next.games[0].dayRoster?.intra?.opp.starters[2].name).toBe('B三')
    expect(next.pitching.some((p) => p.oppBatter === 'B3')).toBe(false)
    expect(next.pitching.some((p) => p.oppBatter === 'B三')).toBe(true)
    expect(next.batting.filter((p) => p.inning < 5).every((p) => p.oppPitcher === '白先發')).toBe(true)
  })

  it('reads 「我隊」「對方」 as the two sides\' names', () => {
    expect(sideText('三局上 對方進攻・對方第 3 棒', { us: '紅隊', opp: '白隊' })).toBe('三局上 白隊進攻・白隊第 3 棒')
    expect(withSideNames({ a: ['我隊進攻', 3], b: { c: '對方失誤' } }, { us: '紅', opp: '白' })).toEqual({ a: ['紅進攻', 3], b: { c: '白失誤' } })
  })
})
