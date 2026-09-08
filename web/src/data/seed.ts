/**
 * Real seed data: every game converted from the team's original single-game
 * score sheets (data/games/*.json, produced by tools/convert_single_game.py).
 */
import { POSITION_BY_NUMBER, type BattingPA, type Dataset, type FieldingLine, type Game, type PitchingPA, type Player } from './types'

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
/** Innings by lineup; errors attributed by the recorded batted-ball location; pitchers' innings from their outs. */
function toFielding(g: RawGame): FieldingLine[] {
  const errByPos: Record<string, number> = {}
  let unknown = 0
  for (const p of g.pitching) {
    if (p.result !== '失誤') continue
    if (p.loc) { const pos = POSITION_BY_NUMBER[p.loc]; errByPos[pos] = (errByPos[pos] ?? 0) + 1 } else unknown++
  }
  const blank = { po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0 }
  const lines: FieldingLine[] = g.lineup.filter((l) => l.starter && !NON_FIELD.has(l.pos)).map((l) => ({
    gameId: g.game_id, player: l.name, pos: l.pos, innings: g.innings_played, ...blank, e: errByPos[l.pos] ?? 0, note: errByPos[l.pos] ? '失誤依原表落點推定' : undefined,
  }))
  const outs = new Map<string, number>()
  for (const p of g.pitching) if (p.code === 'I' || p.code === 'II' || p.code === 'III') outs.set(p.name, (outs.get(p.name) ?? 0) + (p.result === '雙殺' && p.outs_before <= 1 ? 2 : 1))
  g.pitchers.forEach((p, i) => lines.push({ gameId: g.game_id, player: p.name, pos: 'P', innings: Math.round(((outs.get(p.name) ?? 0) / 3) * 10) / 10, ...blank, e: i === 0 ? errByPos.P ?? 0 : 0, note: p.role || undefined }))
  if (unknown && lines.length) lines[0].note = `${lines[0].note ?? ''}；另有 ${unknown} 次失誤原表未記落點，未歸屬個人`
  return lines
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
  return { roster: buildRoster([g]), games: [toGame(g)], batting: toBatting(g), pitching: toPitching(g), fielding: toFielding(g) }
}

export const SEED_GAMES: Game[] = RAW_GAMES.map(toGame)
export const SEED_ROSTER: Player[] = buildRoster(RAW_GAMES)
export const SEED_DATASET: Dataset = {
  roster: SEED_ROSTER, games: SEED_GAMES,
  batting: RAW_GAMES.flatMap(toBatting), pitching: RAW_GAMES.flatMap(toPitching), fielding: RAW_GAMES.flatMap(toFielding),
}
