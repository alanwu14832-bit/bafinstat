/**
 * Deterministic demo games so the dashboard can show filters, trends and
 * leaderboards before a full season is recorded. Every generated game is
 * flagged `isDemo: true` and rendered with a 示範 badge; nothing here is real.
 */
import type { BattingPA, Dataset, FieldingLine, Game, PitchingPA, Player } from './types'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const OPPONENTS = ['群風', '北極熊', '海盜', '雷鳴', '飛鷹']
const TOURNAMENTS = ['友誼賽', '春季聯賽', '秋季聯賽', '校際盃']
const VENUES = ['台大棒球場', '新生公園棒球場', '天母棒球場', '觀山棒球場']
const RESULT_POOL: Array<[string, number]> = [
  ['三振', 20], ['內滾', 17], ['外飛', 12], ['內飛', 6], ['一安', 17], ['二安', 5], ['三安', 1], ['全壘打', 1], ['保送', 10], ['觸身', 2], ['失誤', 4], ['野選', 2], ['犧觸', 1], ['犧飛', 1], ['雙殺', 1],
]
const TOTAL_W = RESULT_POOL.reduce((a, [, w]) => a + w, 0)
const pick = <T,>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]
function pickResult(rng: () => number, skill: number): string {
  // skill shifts weight toward hits/walks (batters) or strikeouts (pitchers)
  let r = rng() * TOTAL_W
  for (const [res, w] of RESULT_POOL) {
    const adj = ['一安', '二安', '三安', '全壘打', '保送'].includes(res) ? w * (1 + skill) : ['三振'].includes(res) ? w * (1 - skill) : w
    r -= adj
    if (r <= 0) return res
  }
  return '內滾'
}
function pitchesFor(rng: () => number, result: string): string[] {
  const seq: string[] = []
  let s = 0, b = 0
  const end = result === '三振' ? 'K' : result === '保送' ? 'BB' : result === '觸身' ? 'HBP' : 'IP'
  while (seq.length < 11) {
    if (end === 'K' && s === 2 && rng() < 0.55) { seq.push(rng() < 0.6 ? 'SS' : 'CS'); return seq }
    if (end === 'BB' && b === 3) { seq.push('B'); return seq }
    if (end === 'HBP' && rng() < 0.4) { seq.push('B'); return seq }
    if (end === 'IP' && rng() < 0.38) { seq.push('IP'); return seq }
    const roll = rng()
    if (roll < 0.36 || (end === 'BB' && roll < 0.5)) { seq.push('B'); b++; if (b === 4 && end !== 'BB') { seq[seq.length - 1] = 'F' ; b = 3 } }
    else if (roll < 0.58) { seq.push(rng() < 0.5 ? 'CS' : 'SS'); if (s < 2) s++; else seq[seq.length - 1] = 'F' }
    else { seq.push('F'); if (s < 2) s++ }
  }
  seq.push(end === 'K' ? 'SS' : end === 'BB' ? 'B' : 'IP')
  return seq
}
const bases = ['無', '無', '無', '1', '1', '2', '12', '3', '13', '23', '123']

export function generateDemo(roster: Player[], opts: { games?: number; seed?: number; startDate?: string } = {}): Dataset {
  const n = opts.games ?? 14
  const rng = mulberry32(opts.seed ?? 20251010)
  const players = roster.map((p) => p.name)
  const pitchers = roster.filter((p) => p.primaryPos === 'P' || p.secondaryPos === 'P').map((p) => p.name)
  const arms = pitchers.length ? pitchers : players.slice(0, 3)
  const skill = new Map(players.map((p) => [p, (rng() - 0.5) * 0.5]))
  const games: Game[] = []
  const batting: BattingPA[] = []
  const pitching: PitchingPA[] = []
  const fielding: FieldingLine[] = []
  const start = new Date(opts.startDate ?? '2025-10-18')
  for (let gi = 0; gi < n; gi++) {
    const d = new Date(start); d.setDate(start.getDate() + gi * 9 + Math.floor(rng() * 4))
    const date = d.toISOString().slice(0, 10)
    const id = `D${date.replace(/-/g, '')}-${String(gi + 1).padStart(2, '0')}`
    const tournament = TOURNAMENTS[Math.min(TOURNAMENTS.length - 1, Math.floor(gi / 4))]
    const game: Game = { id, date, tournament, opponent: pick(rng, OPPONENTS), homeAway: rng() < 0.5 ? '主' : '客', venue: pick(rng, VENUES), innings: 7, isDemo: true, note: '示範資料（程式產生）' }
    // lineup: 9 starters rotated
    const rotated = [...players.slice(gi % players.length), ...players.slice(0, gi % players.length)].slice(0, 9)
    const posList = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']
    const posOf = new Map(rotated.map((p, i) => [p, posList[i]]))
    const runsUs: number[] = []
    let order = 0
    for (let inn = 1; inn <= 7; inn++) {
      let outs = 0, runs = 0, onBase = 0
      while (outs < 3) {
        const batter = rotated[order % 9]; order++
        let result = pickResult(rng, skill.get(batter) ?? 0)
        if (result === '雙殺' && outs > 1) result = '內滾'
        const pitches = pitchesFor(rng, result)
        const bip = pitches[pitches.length - 1] === 'IP'
        const reached = ['一安', '二安', '三安', '全壘打', '保送', '觸身', '失誤', '野選'].includes(result)
        const out = !reached && result !== '妨礙'
        const outsBefore = outs
        if (out) outs += result === '雙殺' ? 2 : 1
        const scored = result === '全壘打' ? 1 : reached && rng() < 0.28 ? 1 : 0
        const rbi = result === '全壘打' ? 1 + Math.min(onBase, Math.floor(rng() * 2)) : reached && onBase > 0 && rng() < 0.3 ? 1 : ['犧飛', '內滾'].includes(result) && onBase > 0 && rng() < 0.25 ? 1 : 0
        runs += scored + (rbi > 0 && result !== '全壘打' ? rbi : 0)
        onBase = Math.max(0, Math.min(3, onBase + (reached ? 1 : 0) - (rbi > 0 ? rbi : 0) - (scored && result !== '全壘打' ? 1 : 0)))
        const traj = bip ? (rng() < 0.45 ? 'G' : rng() < 0.7 ? 'F' : 'L') : undefined
        batting.push({
          gameId: id, inning: inn, outsBefore, basesBefore: pick(rng, bases), order: ((order - 1) % 9) + 1, pos: posOf.get(batter), batter, pitches, result,
          loc: bip ? 1 + Math.floor(rng() * 9) : undefined, traj, quality: bip ? (rng() < 0.35 ? '強' : rng() < 0.75 ? '中' : '弱') : undefined,
          sb: reached && rng() < 0.12 ? 1 : 0, cs: reached && rng() < 0.04 ? 1 : 0, advOnError: 0, outOnBase: 0, run: scored, rbi,
          code: out ? (['I', 'II', 'III'][Math.min(outs, 3) - 1]) : scored ? 'R' : 'L',
        })
        if (outs >= 3) break
      }
      runsUs.push(runs)
    }
    // opponent half innings vs our pitchers
    const starter = arms[gi % arms.length]
    const reliever = arms[(gi + 1) % arms.length]
    const runsOpp: number[] = []
    for (let inn = 1; inn <= 7; inn++) {
      const pitcher = inn <= 5 ? starter : reliever
      let outs = 0, runs = 0, oppOrder = 0
      while (outs < 3) {
        oppOrder++
        let result = pickResult(rng, -(skill.get(pitcher) ?? 0))
        if (result === '雙殺' && outs > 1) result = '內滾'
        const pitches = pitchesFor(rng, result)
        const bip = pitches[pitches.length - 1] === 'IP'
        const reached = ['一安', '二安', '三安', '全壘打', '保送', '觸身', '失誤', '野選'].includes(result)
        const out = !reached
        const outsBefore = outs
        if (out) outs += result === '雙殺' ? 2 : 1
        const scored = result === '全壘打' ? 1 : reached && rng() < 0.22 ? 1 : 0
        runs += scored
        const earned = scored && result !== '失誤' && rng() < 0.8
        const traj = bip ? (rng() < 0.45 ? 'G' : rng() < 0.7 ? 'F' : 'L') : undefined
        pitching.push({
          gameId: id, inning: inn, outsBefore, basesBefore: pick(rng, bases), oppOrder: ((oppOrder - 1) % 9) + 1, pitcher, pitches, result,
          loc: bip ? 1 + Math.floor(rng() * 9) : undefined, traj, quality: bip ? (rng() < 0.3 ? '強' : rng() < 0.75 ? '中' : '弱') : undefined,
          sba: reached && rng() < 0.1 ? 1 : 0, cs: 0, wp: rng() < 0.03 ? 1 : 0, pb: 0, pk: 0,
          code: out ? (['I', 'II', 'III'][Math.min(outs, 3) - 1]) : scored ? (earned ? 'ER' : 'R') : 'L',
        })
        if (outs >= 3) break
      }
      runsOpp.push(runs)
    }
    const us = runsUs.reduce((a, b) => a + b, 0), opp = runsOpp.reduce((a, b) => a + b, 0)
    if (us > opp) game.winningPitcher = starter; else if (us < opp) game.losingPitcher = starter
    if (us > opp && us - opp <= 3) game.savePitcher = reliever
    games.push(game)
    for (const p of rotated) {
      const pos = posOf.get(p)!
      const chances = pos === 'DH' ? 0 : 1 + Math.floor(rng() * (pos === 'C' ? 7 : pos === '1B' ? 6 : 4))
      const e = rng() < 0.18 ? 1 : 0
      fielding.push({ gameId: id, player: p, pos, innings: 7, po: Math.max(0, chances - Math.floor(rng() * 2) - e), a: pos === '2B' || pos === 'SS' || pos === '3B' ? Math.floor(rng() * 4) : Math.floor(rng() * 2), e, dp: rng() < 0.15 ? 1 : 0, pb: pos === 'C' && rng() < 0.2 ? 1 : 0, sb: pos === 'C' ? Math.floor(rng() * 3) : 0, cs: pos === 'C' && rng() < 0.35 ? 1 : 0 })
    }
    fielding.push({ gameId: id, player: starter, pos: 'P', innings: 5, po: 0, a: Math.floor(rng() * 2), e: 0, dp: 0, pb: 0, sb: 0, cs: 0 })
    fielding.push({ gameId: id, player: reliever, pos: 'P', innings: 2, po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0 })
  }
  return { roster, games, batting, pitching, fielding }
}

export function mergeDatasets(base: Dataset, extra: Dataset): Dataset {
  const ids = new Set(base.games.map((g) => g.id))
  const newGames = extra.games.filter((g) => !ids.has(g.id))
  const newIds = new Set(newGames.map((g) => g.id))
  const names = new Set(base.roster.map((p) => p.name))
  return {
    roster: [...base.roster, ...extra.roster.filter((p) => !names.has(p.name))],
    games: [...base.games, ...newGames],
    batting: [...base.batting, ...extra.batting.filter((p) => newIds.has(p.gameId))],
    pitching: [...base.pitching, ...extra.pitching.filter((p) => newIds.has(p.gameId))],
    fielding: [...base.fielding, ...extra.fielding.filter((p) => newIds.has(p.gameId))],
  }
}
