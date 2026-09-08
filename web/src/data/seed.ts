/**
 * Real seed data: every game converted from the team's original single-game
 * score sheets (data/games/*.json, produced by tools/convert_single_game.py).
 */
import { type BattingPA, type Dataset, type Game, type PitchingPA, type Player } from './types'
import { normalizeDataset } from './normalize'

export interface RawPA {
  code: string | null; order: number; name: string; pitches: string[]; result: string; loc: number | null; traj: string | null; quality: string | null
  sb: number; adv_err: number; out_on_base: number; run: number; rbi: number; note: string | null; inning: number; outs_before: number; pos?: string
}
export interface RawGame {
  game_id: string; date: string; time: string | null; tournament: string; opponent: string; home_away: '主' | '客'; venue: string | null; weather: string | null; recorder: string | null
  innings_played: number; lineup: Array<{ order: number | null; pos_raw: string | null; name: string; pos: string; starter: boolean }>
  pitchers: Array<{ name: string; role: string; decision: string }>; batting: RawPA[]; pitching: RawPA[]; warnings?: string[]
}

const modules = import.meta.glob('./seed/games/*.json', { eager: true, import: 'default' }) as Record<string, RawGame>
const RAW_GAMES: RawGame[] = Object.keys(modules).sort().map((k) => modules[k])

export const TEAM_NAME = '喝FIN就好BA'

const NON_FIELD = new Set(['DH', 'PH', 'PR', ''])

function toGame(g: RawGame): Game {
  const warn = g.warnings?.length ? `；${g.warnings.join('；')}` : ''
  return {
    id: g.game_id, date: g.date, time: g.time ?? undefined, tournament: g.tournament, opponent: g.opponent, homeAway: g.home_away, venue: g.venue ?? undefined, weather: g.weather ?? undefined,
    recorder: g.recorder ?? undefined, innings: g.innings_played, winningPitcher: g.pitchers.find((p) => p.decision === 'W')?.name, losingPitcher: g.pitchers.find((p) => p.decision === 'L')?.name,
    note: `由原單場紀錄表轉入；杯賽名稱為假設${warn}`,
  }
}
function toBatting(g: RawGame): BattingPA[] {
  return g.batting.map((r) => ({
    gameId: g.game_id, inning: r.inning, outsBefore: r.outs_before, order: r.order, pos: r.pos, batter: r.name, pitches: r.pitches, result: r.result,
    loc: r.loc ?? undefined, traj: r.traj ?? undefined, quality: r.quality ?? undefined, sb: r.sb, cs: 0, advOnError: r.adv_err, outOnBase: r.out_on_base,
    run: r.run, rbi: r.rbi, code: r.code ?? undefined, note: r.note ?? undefined,
  }))
}
function toPitching(g: RawGame): PitchingPA[] {
  return g.pitching.map((r) => ({
    gameId: g.game_id, inning: r.inning, outsBefore: r.outs_before, oppOrder: r.order, pitcher: r.name, pitches: r.pitches, result: r.result,
    loc: r.loc ?? undefined, traj: r.traj ?? undefined, quality: r.quality ?? undefined, sba: r.sb, cs: 0, wp: 0, pb: 0, pk: 0, code: r.code ?? undefined, note: r.note ?? undefined,
  }))
}
function buildRoster(games: RawGame[]): Player[] {
  const seen = new Map<string, Player>()
  for (const g of games) {
    for (const l of g.lineup) if (!seen.has(l.name)) seen.set(l.name, { number: String(seen.size + 1), name: l.name, primaryPos: NON_FIELD.has(l.pos) ? undefined : l.pos, status: '現役' })
    for (const p of g.pitchers) {
      const ex = seen.get(p.name)
      if (!ex) seen.set(p.name, { number: String(seen.size + 1), name: p.name, primaryPos: 'P', status: '現役' })
      else if (ex.primaryPos && ex.primaryPos !== 'P' && !ex.secondaryPos) ex.secondaryPos = 'P'
    }
  }
  return [...seen.values()]
}

/** Convert one raw game (from the converter or the in-browser legacy parser) into a dataset fragment. */
export function rawGameToDataset(g: RawGame): Dataset {
  return { roster: buildRoster([g]), games: [toGame(g)], batting: toBatting(g), pitching: toPitching(g), fielding: [] }
}

export const SEED_GAMES: Game[] = RAW_GAMES.map(toGame)
export const SEED_ROSTER: Player[] = buildRoster(RAW_GAMES)
export const SEED_DATASET: Dataset = normalizeDataset({
  roster: SEED_ROSTER, games: SEED_GAMES,
  batting: RAW_GAMES.flatMap(toBatting), pitching: RAW_GAMES.flatMap(toPitching), fielding: [],
}).dataset
