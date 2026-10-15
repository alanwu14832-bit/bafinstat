/**
 * Plays many random but legal games through the 紀錄比賽 model (pitch by pitch, runners stealing and getting
 * caught, substitutions, pitching changes) and checks that what gets saved is consistent: the audit finds nothing
 * to flag, saving raises no review warnings, and the saved game shows the same score as the live scoreboard.
 */
import { describe, expect, it } from 'vitest'
import { offense, score, toGameEdit, type RecordState } from './model'
import { auditGame } from '../data/audit'
import { normalizeGameEdit } from '../data/edit'
import { battingLines, pitchingLines, summarizeGame } from '../data/stats'
import { DEFAULT_PARAMS, EMPTY_DATASET, isBattedBall, isPA, isPlaced, missingBattedBall, type Dataset } from '../data/types'
import { deriveHalf, inferHalf, inningsOf, midOf } from './timeline'
import { earnedAll, earnedRepairs } from './earned'
import { playGame, playGameWith, roster } from '../test/simGame'
import { pitcherSituations, reliefEntries } from '../data/pitchingSituations'
import { onDeckOf } from './upNext'
import { halfCards, liveContext } from '../data/liveFacts'
import { ourErrorCount } from '../data/errors'
import { oppTotals } from '../data/opponent'
import { paContexts, splitTable } from '../data/splits'

describe('random games through the recording model', () => {
  const seeds = Array.from({ length: 150 }, (_, i) => i + 1)
  it.each(seeds)('game %i saves cleanly', (seed) => {
    const s = playGame(seed)
    const issues = auditGame(s.batting, s.pitching).map((i) => i.message)
    expect(issues).toEqual([])
    const edit = toGameEdit(s)
    const { fragment, warnings } = normalizeGameEdit(roster, edit)
    const msgs = warnings.map((w) => w.message).filter((m) => !m.startsWith('沒有守備紀錄') && !m.startsWith('刺殺／助殺由投球紀錄推定'))
    expect(msgs).toEqual([])
    const sum = summarizeGame(fragment, fragment.games[0])
    const live = score(s)
    expect([sum.runsUs, sum.runsOpp]).toEqual([live.us, live.opp])
    // every opponent run was called by the rules as it was recorded: reading the saved game again agrees (but for
    // a half that ended on the bases, whose last runner plays may have no row to sit on)
    expect(earnedRepairs(s.pitching)).toEqual([])
    // every batted ball carries its 落點 and 軌跡 (required while recording, batch 14), and BIP counts them all
    expect([...s.batting, ...s.pitching].filter((p) => missingBattedBall(p).length)).toEqual([])
    expect(battingLines(fragment, s.batting).reduce((a, l) => a + l.bip, 0)).toBe(s.batting.filter((p) => p.batter && isBattedBall(p)).length)
    expect(pitchingLines(s.pitching, fragment.games).reduce((a, l) => a + l.bip, 0)).toBe(s.pitching.filter((p) => p.pitcher && isBattedBall(p)).length)
    // 突破僵局 runners are no plate appearances
    expect([...s.batting, ...s.pitching].filter(isPlaced).every((p) => p.pitches.length === 0)).toBe(true)
    expect(battingLines(fragment, s.batting).reduce((a, l) => a + l.pa, 0)).toBe(s.batting.filter((p) => p.batter && isPA(p)).length)
    // 繼承跑者／救援失敗／三上三下: every relief entry can be judged (runners are always recorded), and the counts add up
    const game = fragment.games[0]
    const sits = [...pitcherSituations(s.pitching, [game], new Map([[game.id, sum.lineUs]])).values()]
    const total = (k: 'gaps' | 'ir' | 'irs' | 'leadoffBf') => sits.reduce((a, x) => a + x[k], 0)
    expect(total('gaps')).toBe(0)
    expect(total('irs')).toBeLessThanOrEqual(total('ir'))
    for (const x of sits) { expect(x.inn13).toBeLessThanOrEqual(x.pitchInn); expect(x.pitchInn).toBeLessThanOrEqual(x.fullInn); expect(x.inn123).toBeLessThanOrEqual(x.fullInn) }
    expect(total('leadoffBf')).toBe(new Set(s.pitching.filter(isPA).map((p) => p.inning)).size)
    const firstOf = new Map<number, number>()
    s.pitching.forEach((p, i) => { if (!firstOf.has(p.inning)) firstOf.set(p.inning, i) })
    for (const e of reliefEntries(s.pitching, { homeAway: game.homeAway, ourLine: sum.lineUs })) {
      expect(e.sure).toBe(true)
      if (firstOf.get(e.inning) !== e.row) expect(e.runners, `entry at row ${e.row}`).toBe(s.start.pit.get(e.row)?.length)
      else expect(e.ir).toBe(0)
    }
  })
  it('some relievers come in mid-inning with runners on, and some of those runners score', () => {
    const entries = seeds.slice(0, 60).map(playGame).flatMap((g) => reliefEntries(g.pitching))
    expect(entries.filter((e) => e.ir > 0).length).toBeGreaterThan(3)
    expect(entries.some((e) => e.irs > 0)).toBe(true)
  })
  it('some games go to extra innings with the tie-break, and some runners move on a balk', () => {
    const games = seeds.slice(0, 30).map(playGame)
    expect(games.filter((g) => g.batting.some(isPlaced)).length).toBeGreaterThan(5)
    expect(games.filter((g) => g.pitching.some(isPlaced)).length).toBeGreaterThan(5)
    expect(games.some((g) => [...g.batting, ...g.pitching].some((p) => p.events?.some((e) => e.kind === 'bk')))).toBe(true)
  })
})

describe('the runner timeline rebuilt from saved rows', () => {
  const seeds = Array.from({ length: 150 }, (_, i) => i + 1)
  it.each(seeds)('game %i: who was on base each plate appearance, and writing it back changes nothing', (seed) => {
    const g = playGame(seed)
    for (const side of ['bat', 'pit'] as const) {
      const rows = side === 'bat' ? g.batting : g.pitching
      let derived: Array<(typeof rows)[number]> = rows.slice()
      for (const [inning, idx] of inningsOf(rows)) {
        const half = inferHalf(rows, idx, side)
        expect(half, `${side} inning ${inning}`).not.toBeNull()
        for (const st of half!.steps) {
          expect(midOf(st), `${side} PA ${st.index}`).toEqual(g.truth[side].get(st.index))
          expect(st.before, `${side} PA ${st.index} (batter came up)`).toEqual(g.start[side].get(st.index))
        }
        derived = deriveHalf(derived as never[], half!, side)
      }
      const pick = (r: (typeof rows)[number]) => JSON.stringify(r, ['basesBefore', 'outsBefore', 'run', 'code', 'outOnBase', 'cs', 'events', 'at', 'kind', 'from', 'to'])
      expect(derived.map(pick)).toEqual(rows.map(pick))
    }
  })
})

describe('runner plays between pitches', () => {
  it('are saved on the plate appearance they happened in, after the pitch they followed', () => {
    const games = Array.from({ length: 40 }, (_, i) => playGame(i + 1))
    const rows = games.flatMap((g) => [...g.batting, ...g.pitching])
    const events = rows.flatMap((p) => (p.events ?? []).map((e) => ({ e, n: p.pitches.length })))
    expect(events.some(({ e }) => e.at > 0)).toBe(true)
    expect(events.some(({ e }) => e.kind === 'wp')).toBe(true)
    for (const { e, n } of events) expect(e.at).toBeLessThanOrEqual(n)
  })
})

describe('what the recorder adds on the side', () => {
  const seeds = Array.from({ length: 150 }, (_, i) => i + 1)
  it.each(seeds)('game %i: each row carries the opponent pitcher / batter current when it was sent, and the times are kept', (seed) => {
    const g = playGame(seed)
    expect(g.batting.map((b) => ({ ...(b.oppPitcher ? { oppPitcher: b.oppPitcher } : {}), ...(b.oppHand ? { oppHand: b.oppHand } : {}) }))).toEqual(g.expect.bat)
    expect(g.pitching.map((p) => p.oppBatter)).toEqual(g.expect.pit)
    if (!g.names) expect(g.pitching.every((p) => p.oppBatter === undefined)).toBe(true)
    expect(g.firstPitchAt).toBeDefined()
    expect(g.lastPlayAt! >= g.firstPitchAt!).toBe(true)
  })
  it.each(seeds)('game %i: 對方代跑 lands on the row where that runner reached, and changes no run, earned run or out', (seed) => {
    const g = playGame(seed)
    expect(new Map(g.pitching.flatMap((p, i) => (p.runner ? [[i, p.runner] as const] : [])))).toEqual(g.expect.runner)
    const plain = playGameWith(seed, undefined, { oppPR: false })
    expect(plain.pitching.some((p) => p.runner)).toBe(false)
    // (a 對方代跑 clears his slot's 左右打, so the sides picked after it may differ)
    const strip = (rows: typeof g.pitching) => rows.map(({ runner: _r, oppBatter: _b, oppBats: _s, ...p }) => p)
    expect(strip(g.pitching)).toEqual(strip(plain.pitching))
    expect(g.batting).toEqual(plain.batting)
    const lines = (x: typeof g) => pitchingLines(x.pitching, []).map((l) => [l.name, l.outs, l.r, l.er, l.h, l.bb])
    expect(lines(g)).toEqual(lines(plain))
    expect(earnedAll(g.pitching)).toEqual(earnedAll(plain.pitching))
  })
  it('some games have names and opponent pitchers at all', () => {
    const games = seeds.slice(0, 40).map(playGame)
    expect(games.some((g) => g.names && g.pitching.some((p) => p.oppBatter?.startsWith('代打')))).toBe(true)
    expect(games.some((g) => g.batting.some((b) => b.oppHand) && g.batting.some((b) => !b.oppHand))).toBe(true)
    // 對方代跑: named and unnamed, and some of them score
    const runners = games.flatMap((g) => g.pitching.filter((p) => p.runner))
    expect(runners.some((p) => p.runner === '對方代跑')).toBe(true)
    expect(runners.some((p) => p.runner!.startsWith('代跑'))).toBe(true)
    expect(runners.some((p) => p.code === 'R' || p.code === 'ER')).toBe(true)
  })
})

describe('both sides recorded alike (batch 11)', () => {
  const seeds = Array.from({ length: 150 }, (_, i) => i + 1)
  it.each(seeds)('game %i: E counts every error of theirs; their RBI and our 備註 are kept', (seed) => {
    const g = playGame(seed)
    const { fragment } = normalizeGameEdit(roster, toGameEdit(g))
    const sum = summarizeGame(fragment, fragment.games[0])
    expect(sum.errorsOpp).toBe(g.expect.oppErrors)
    expect(sum.errorsUs).toBe(ourErrorCount(fragment.pitching))
    // their RBI never more than the runs that scored on the play
    const runsOn = (i: number) => g.pitching.filter((p, k) => (k === i || (p.inning === g.pitching[i].inning && k < i)) && (p.code === 'R' || p.code === 'ER')).length
    g.pitching.forEach((p, i) => expect(p.rbi ?? 0).toBeLessThanOrEqual(runsOn(i)))
    expect(oppTotals(fragment.pitching).rbi).toBe(g.pitching.reduce((a, p) => a + (p.rbi ?? 0), 0))
    expect([...g.batting, ...g.pitching].filter((p) => p.note?.includes('備註')).length).toBe(g.expect.notes)
  })
  it('the games have errors of theirs, their RBI and their runners on our errors at all', () => {
    const games = seeds.slice(0, 40).map(playGame)
    expect(games.some((g) => g.batting.some((b) => b.errors?.includes('?')))).toBe(true)
    expect(games.some((g) => g.batting.some((b) => b.errors?.some((e) => e !== '?')))).toBe(true)
    expect(games.some((g) => g.pitching.some((p) => (p.rbi ?? 0) > 0))).toBe(true)
    expect(games.some((g) => g.pitching.some((p) => p.events?.some((e) => e.kind === 'err')))).toBe(true)
  })
})

describe('the live board over random games', () => {
  // three earlier games of the same season (same date, smaller ids), so the cards have something to say
  const earlier = [201, 202, 203].map((seed, i) => {
    const { fragment } = normalizeGameEdit(roster, toGameEdit(playGame(seed)))
    const id = `G20260100-0${i + 1}`
    return { ...fragment, games: fragment.games.map((g) => ({ ...g, id })), batting: fragment.batting.map((p) => ({ ...p, gameId: id })), pitching: fragment.pitching.map((p) => ({ ...p, gameId: id })) }
  })
  const base: Dataset = { ...EMPTY_DATASET, roster, games: earlier.flatMap((d) => d.games), batting: earlier.flatMap((d) => d.batting), pitching: earlier.flatMap((d) => d.pitching) }
  it.each(Array.from({ length: 150 }, (_, i) => i + 1))('game %i: 準備打擊 is never the batter at the plate; one card per half, none twice', (seed) => {
    const wrong: string[] = []
    const s = playGameWith(seed, (st: RecordState) => {
      const { onDeck, inHole } = onDeckOf(st)
      const us = offense(st) === 'us'
      const atPlate = us ? st.slot + 1 : st.oppOrder
      for (const b of [onDeck, inHole]) if (!b || b.us !== us || b.order === atPlate) wrong.push(`${st.inning}${st.half} ${JSON.stringify(b)}`)
    })
    expect(wrong).toEqual([])
    for (const ctx of [liveContext(EMPTY_DATASET, s.game, DEFAULT_PARAMS), liveContext(base, s.game, DEFAULT_PARAMS)]) {
      const cards = halfCards(s, ctx)
      const halves = (s.inning - 1) * 2 + (s.half === 'bottom' ? 2 : 1)
      expect(cards).toHaveLength(halves)
      const ids = cards.flatMap((c) => (c ? [c.id] : []))
      expect(new Set(ids).size).toBe(ids.length)
      expect(cards.flatMap((c) => (c ? [c.text, c.figure ?? '', c.kicker] : [])).join('|')).not.toMatch(/undefined|NaN/)
    }
  })
  it('the cards do have something to say', () => {
    const s = playGame(7)
    expect(halfCards(s, liveContext(base, s.game, DEFAULT_PARAMS)).filter(Boolean).length).toBeGreaterThan(2)
  })
})

describe('對方打者左右打 (batch 18)', () => {
  const seeds = Array.from({ length: 150 }, (_, i) => i + 1)
  it.each(seeds)('game %i: each of their plate appearances carries the side picked for his slot (不知道: none); it survives saving; the split adds up', (seed) => {
    const g = playGame(seed)
    expect(g.pitching.map((p, i) => (isPA(p) ? g.expect.bats[i] : undefined))).toEqual(g.pitching.map((p) => p.oppBats))
    // a 突破僵局 runner never has one
    expect(g.pitching.filter(isPlaced).every((p) => !p.oppBats)).toBe(true)
    const { fragment } = normalizeGameEdit(roster, toGameEdit(g))
    expect(fragment.pitching.map((p) => p.oppBats)).toEqual(g.pitching.map((p) => p.oppBats))
    const ds: Dataset = { ...EMPTY_DATASET, roster, games: fragment.games, pitching: fragment.pitching }
    const t = splitTable(fragment.pitching, paContexts(ds, 'pit'), 'pit', 'bats', { roster, innings: 7 })
    const n = (side: 'L' | 'R') => fragment.pitching.filter((p) => isPA(p) && p.oppBats === side).length
    expect(t.rows.find((r) => r.key === 'vs-LHB')?.line.pa).toBe(n('L'))
    expect(t.rows.find((r) => r.key === 'vs-RHB')?.line.pa).toBe(n('R'))
    expect(t.missing).toBe(fragment.pitching.filter((p) => isPA(p) && !p.oppBats).length)
  })
  it('the games have 左打, 右打 and 不知道, and switch hitters', () => {
    const games = seeds.slice(0, 40).map(playGame)
    const all = games.flatMap((g) => g.pitching.filter(isPA))
    expect(all.some((p) => p.oppBats === 'L')).toBe(true)
    expect(all.some((p) => p.oppBats === 'R')).toBe(true)
    expect(all.some((p) => !p.oppBats)).toBe(true)
    // the same slot and batter on both sides in one game
    const both = games.some((g) => [1, 2, 3, 4, 5, 6, 7, 8, 9].some((o) => new Set(g.pitching.filter((p) => isPA(p) && p.oppOrder === o && p.oppBats).map((p) => p.oppBats)).size > 1))
    expect(both).toBe(true)
  })
})
