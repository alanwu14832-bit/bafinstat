/**
 * Plays many random but legal games through the 紀錄比賽 model (pitch by pitch, runners stealing and getting
 * caught, substitutions, pitching changes) and checks that what gets saved is consistent: the audit finds nothing
 * to flag, saving raises no review warnings, and the saved game shows the same score as the live scoreboard.
 */
import { describe, expect, it } from 'vitest'
import { score, toGameEdit } from './model'
import { auditGame } from '../data/audit'
import { normalizeGameEdit } from '../data/edit'
import { summarizeGame } from '../data/stats'
import { deriveHalf, inferHalf, inningsOf, midOf } from './timeline'
import { earnedRepairs } from './earned'
import { playGame, roster } from '../test/simGame'

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

