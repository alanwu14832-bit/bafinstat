/**
 * Plays many random but legal games through the 紀錄比賽 model (pitch by pitch, runners stealing and getting
 * caught, substitutions, pitching changes) and checks that what gets saved is consistent: the audit finds nothing
 * to flag, saving raises no review warnings, and the saved game shows the same score as the live scoreboard.
 */
import { describe, expect, it } from 'vitest'
import { offense, score, toGameEdit, type RecordState } from './model'
import { auditGame } from '../data/audit'
import { normalizeGameEdit } from '../data/edit'
import { battingLines, summarizeGame } from '../data/stats'
import { DEFAULT_PARAMS, EMPTY_DATASET, isPA, isPlaced, type Dataset } from '../data/types'
import { deriveHalf, inferHalf, inningsOf, midOf } from './timeline'
import { earnedRepairs } from './earned'
import { playGame, playGameWith, roster } from '../test/simGame'
import { onDeckOf } from './upNext'
import { halfCards, liveContext } from '../data/liveFacts'

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
    // 突破僵局 runners are no plate appearances
    expect([...s.batting, ...s.pitching].filter(isPlaced).every((p) => p.pitches.length === 0)).toBe(true)
    expect(battingLines(fragment, s.batting).reduce((a, l) => a + l.pa, 0)).toBe(s.batting.filter((p) => p.batter && isPA(p)).length)
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
  it('some games have names and opponent pitchers at all', () => {
    const games = seeds.slice(0, 40).map(playGame)
    expect(games.some((g) => g.names && g.pitching.some((p) => p.oppBatter?.startsWith('代打')))).toBe(true)
    expect(games.some((g) => g.batting.some((b) => b.oppHand) && g.batting.some((b) => !b.oppHand))).toBe(true)
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
