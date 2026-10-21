import { describe, expect, it } from 'vitest'
import { addPitch, commitPA, defaultPlan, intraPitcher, intraSub, needsOppBats, needsOppHand, newGame, offense, otherSide, subCandidates, toGameEdit, type RecordState } from './model'
import { normalizeGameEdit } from '../data/edit'
import { battingLines, pitchingLines } from '../data/stats'
import { DEFAULT_PARAMS, type Player } from '../data/types'
import { mirrorId, withMirrors } from '../data/intrasquad'

const red = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const white = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申'].map((name, i) => ({ name, pos: ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'P'][i] }))
const roster: Player[] = [...red, ...white, { name: '酉' }, { name: '戌' }, { name: '亥' }].map((p) => ({ name: p.name, status: '現役', bats: 'R', throws: p.name === '申' ? 'L' : 'R' }))
const game = { id: 'G20260401-01', date: '2026-04-01', tournament: '隊內賽', opponent: '白隊', homeAway: '客' as const, innings: 5 }
const start = () => newGame(game, red, '壬', { intra: { team: '紅隊', lineup: white, pitcher: '申', bats: { 子: 'R', 丑: 'L' }, throws: { 申: 'L', 酉: 'R' } } })
const out = (s: RecordState, result = '內滾') => commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, result), loc: 6, traj: 'G' })

describe('隊內賽 recording', () => {
  it('starts with the other side named and both sides free to bring players back; asks only what the roster does not know', () => {
    const s = start()
    expect(s.oppNames).toBe(true)
    expect(s.oppLineup).toEqual(white.map((l) => l.name))
    expect(s.oppPitcher).toEqual({ name: '申', hand: 'L' })
    expect(s.reentry).toBe(true)
    expect(needsOppHand(s, true)).toBe(false)
    expect(otherSide(s).lineup[0]).toEqual({ name: '子', pos: 'C' })
  })

  it('records both sides\' changes and saves the other side with the game; its view has its batters, pitchers and fielders', () => {
    let s = start()
    // 紅隊 bats first against 申
    expect(offense(s)).toBe('us')
    s = commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '一安'), loc: 8, traj: 'L' })
    // 白隊 brings in 酉 to pitch (from outside its order: he takes 申's slot), and moves 卯 from SS to 2B, 寅 to SS
    s = intraPitcher(s, '酉')
    expect(s.oppPitcher).toEqual(expect.objectContaining({ name: '酉', hand: 'R' }))
    expect(s.oppLineup?.[8]).toBe('酉')
    s = intraSub(s, 3, '', '2B')
    s = intraSub(s, 2, '', 'SS')
    s = out(s); s = out(s); s = out(s)
    expect(s.batting.map((p) => p.oppPitcher)).toEqual(['申', '酉', '酉', '酉'])
    // 白隊 bats: 子 (known 右打: not asked), then 丑 is pinch-hit for by 戌, who singles; 亥 runs for him
    expect(offense(s)).toBe('opp')
    expect(needsOppBats(s, true)).toBe(false)
    s = out(s)
    s = intraSub(s, 1, '戌', 'PH')
    expect(s.oppLineup?.[1]).toBe('戌')
    s = commitPA(addPitch(s, 'IP'), { ...defaultPlan(s, '一安'), loc: 9, traj: 'L' })
    s = intraSub(s, 1, '亥', 'PR')
    expect(s.runners.find((r) => r.side === 'opp')?.name).toBe('亥')
    s = out(s); s = out(s)
    // our players stay ours: 紅隊's candidates never offer 白隊's, and the other way round
    const theirs = subCandidates(otherSide(s), roster.map((p) => p.name).filter((n) => !red.some((l) => l.name === n)), 'batter')
    expect(theirs.names).not.toContain('甲')

    const edit = toGameEdit(s)
    const intra = edit.game.dayRoster?.intra
    expect(intra?.team).toBe('紅隊')
    expect(intra?.opp.starters.map((x) => x.name)).toEqual(white.map((l) => l.name))
    expect(intra?.opp.subs?.map((x) => `${x.kind} ${x.in}/${x.out} ${x.pos}`)).toEqual(['P 酉/申 P', 'DEF 卯/卯 2B', 'DEF 寅/寅 SS', 'PH 戌/丑 PH', 'PR 亥/戌 PR'])
    // (the pinch hitter's row is his, the pinch runner runs for it)
    expect(edit.pitching[1]).toEqual(expect.objectContaining({ oppBatter: '代打 戌', runner: '亥' }))

    const { fragment } = normalizeGameEdit(roster, edit)
    const full = withMirrors({ ...fragment, roster })
    const mid = mirrorId(game.id)
    const theirBat = battingLines(full, full.batting.filter((p) => p.gameId === mid))
    expect(theirBat.find((l) => l.name === '戌')).toEqual(expect.objectContaining({ pa: 1, h: 1 }))
    expect(theirBat.find((l) => l.name === '子')).toEqual(expect.objectContaining({ pa: 1, h: 0 }))
    const theirPit = pitchingLines(full.pitching.filter((p) => p.gameId === mid), full.games.filter((g) => g.id === mid), DEFAULT_PARAMS)
    expect(theirPit.map((l) => [l.name, l.bf, l.h, l.outs]).sort()).toEqual([['申', 1, 1, 0], ['酉', 3, 0, 3]])
    // their fielders where they stood after the moves: 卯 at 2B, 寅 at SS
    const fld = full.fielding.filter((f) => f.gameId === mid)
    expect(fld.some((f) => f.player === '卯' && f.pos === '2B')).toBe(true)
    expect(fld.some((f) => f.player === '寅' && f.pos === 'SS')).toBe(true)
  })
})
