/**
 * 結束時間 (games.end_time) and 對方投手 (batting_pa.opp_pitcher / opp_hand) need the 2026-10-14 migration. Before an
 * admin runs it the site keeps working: those values are just not stored in the cloud, and saves say so.
 * 對方代跑 (pitching_pa.runner) likewise needs the 2026-10-15 migration.
 */
import type { GameWarning } from './normalize'
import type { BattingPA, Game, PitchingPA } from './types'

export const RECORD_FIELDS_MIGRATION = 'supabase/migrations/2026-10-14_record_fields.sql'
export const END_TIME_UNSUPPORTED = `比賽結束時間沒有存進雲端（開賽時間照常儲存）：請管理員在 Supabase 執行 ${RECORD_FIELDS_MIGRATION}`
export const OPP_PITCHER_UNSUPPORTED = `對方投手（左投／右投）沒有存進雲端（打席照常儲存）：請管理員在 Supabase 執行 ${RECORD_FIELDS_MIGRATION}`
export const OPP_RUNNER_MIGRATION = 'supabase/migrations/2026-10-15_opp_runner.sql'
export const OPP_RUNNER_UNSUPPORTED = `對方代跑沒有存進雲端（其他紀錄照常儲存）：請管理員在 Supabase 執行 ${OPP_RUNNER_MIGRATION}`

/** Whether the cloud has the columns (local mode: always). */
export interface RecordFields { endTime: boolean; oppPitcher: boolean; /** pitching_pa.runner (對方代跑) */ oppRunner: boolean }
export const ALL_RECORD_FIELDS: RecordFields = { endTime: true, oppPitcher: true, oppRunner: true }

/** What a save lost because the cloud lacks the columns: only when the saved data actually had those values. */
export function recordFieldWarnings(fields: RecordFields, fragment: { games: Pick<Game, 'endTime'>[]; batting: Pick<BattingPA, 'oppHand' | 'oppPitcher'>[]; pitching?: Pick<PitchingPA, 'runner'>[] }, gameId = ''): GameWarning[] {
  const out: GameWarning[] = []
  if (!fields.endTime && fragment.games.some((g) => g.endTime)) out.push({ gameId, message: END_TIME_UNSUPPORTED })
  if (!fields.oppPitcher && fragment.batting.some((b) => b.oppHand || b.oppPitcher)) out.push({ gameId, message: OPP_PITCHER_UNSUPPORTED })
  if (!fields.oppRunner && fragment.pitching?.some((p) => p.runner)) out.push({ gameId, message: OPP_RUNNER_UNSUPPORTED })
  return out
}
