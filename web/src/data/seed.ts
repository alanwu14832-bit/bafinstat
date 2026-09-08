/**
 * Real seed data: the 2025-10-10 game vs 群風, converted from the team's
 * original single-game score sheet (data/game_20251010_qunfeng.json).
 */
import raw from './seed/game_20251010_qunfeng.json'
import { POSITION_BY_NUMBER, type BattingPA, type Dataset, type FieldingLine, type Game, type PitchingPA, type Player } from './types'

interface RawPA {
  code: string | null; order: number; name: string; pitches: string[]; result: string; loc: number | null; traj: string | null; quality: string | null
  sb: number; adv_err: number; out_on_base: number; run: number; rbi: number; note: string | null; inning: number; outs_before: number; pos?: string
}
interface RawGame {
  game_id: string; date: string; time: string; tournament: string; opponent: string; home_away: '主' | '客'; venue: string; weather: string; recorder: string
  innings_played: number; lineup: Array<{ order: number | null; pos_raw: string; name: string; pos: string; starter: boolean }>
  pitchers: Array<{ name: string; role: string; decision: string }>; batting: RawPA[]; pitching: RawPA[]
}

const g = raw as unknown as RawGame

export const TEAM_NAME = '喝FIN就好BA'

export const SEED_GAME: Game = {
  id: g.game_id, date: g.date, time: g.time, tournament: g.tournament, opponent: g.opponent, homeAway: g.home_away, venue: g.venue, weather: g.weather,
  recorder: g.recorder, innings: g.innings_played, winningPitcher: g.pitchers.find((p) => p.decision === 'W')?.name,
  note: '由原單場紀錄表轉入；杯賽名稱為假設值',
}

export const SEED_ROSTER: Player[] = g.lineup.map((l, i) => ({ number: String(i + 1), name: l.name, primaryPos: l.pos, status: '現役' }))

export const SEED_BATTING: BattingPA[] = g.batting.map((r) => ({
  gameId: g.game_id, inning: r.inning, outsBefore: r.outs_before, order: r.order, pos: r.pos, batter: r.name, pitches: r.pitches, result: r.result,
  loc: r.loc ?? undefined, traj: r.traj ?? undefined, quality: r.quality ?? undefined, sb: r.sb, cs: 0, advOnError: r.adv_err, outOnBase: r.out_on_base,
  run: r.run, rbi: r.rbi, code: r.code ?? undefined, note: r.note ?? undefined,
}))

export const SEED_PITCHING: PitchingPA[] = g.pitching.map((r) => ({
  gameId: g.game_id, inning: r.inning, outsBefore: r.outs_before, oppOrder: r.order, pitcher: r.name, pitches: r.pitches, result: r.result,
  loc: r.loc ?? undefined, traj: r.traj ?? undefined, quality: r.quality ?? undefined, sba: r.sb, cs: 0, wp: 0, pb: 0, pk: 0, code: r.code ?? undefined, note: r.note ?? undefined,
}))

/** Fielding: innings from the lineup; errors attributed by the recorded batted-ball location (one error had no location). */
function seedFielding(): FieldingLine[] {
  const errByPos: Record<string, number> = {}
  let unknown = 0
  for (const p of g.pitching) {
    if (p.result !== '失誤') continue
    if (p.loc) { const pos = POSITION_BY_NUMBER[p.loc]; errByPos[pos] = (errByPos[pos] ?? 0) + 1 } else unknown++
  }
  const lines: FieldingLine[] = g.lineup.filter((l) => l.starter).map((l) => ({
    gameId: g.game_id, player: l.name, pos: l.pos, innings: 5, po: 0, a: 0, e: errByPos[l.pos] ?? 0, dp: 0, pb: 0, sb: 0, cs: 0,
    note: errByPos[l.pos] ? '失誤依原表落點推定' : undefined,
  }))
  lines.push({ gameId: g.game_id, player: '蔡奇霖', pos: 'P', innings: 1, po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0, note: '中繼' })
  lines.push({ gameId: g.game_id, player: '林昱丞', pos: 'P', innings: 2, po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0, note: '中繼' })
  lines.push({ gameId: g.game_id, player: '謝昊瑾', pos: 'C', po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0, note: '替補捕手；局數未記' })
  if (unknown) lines[0].note = `${lines[0].note ?? ''}；另有 ${unknown} 次失誤原表未記落點，未歸屬個人`
  return lines
}

export const SEED_DATASET: Dataset = {
  roster: SEED_ROSTER, games: [SEED_GAME], batting: SEED_BATTING, pitching: SEED_PITCHING, fielding: seedFielding(),
}
