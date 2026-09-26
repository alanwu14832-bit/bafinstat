/** Helpers shared by every page that lets someone pick a scheduled game (先發陣容, 紀錄比賽, 賽程). */
import type { Game } from './types'

/** Games still on the schedule (not recorded, not cancelled), soonest first. */
export function scheduledGames(games: Game[]): Game[] {
  return games.filter((g) => g.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
}

/** One line naming a game in a picker: 2026-10-03 13:00 vs 台大（大專盃）. */
export const gameLabel = (g: Pick<Game, 'date' | 'time' | 'opponent' | 'tournament'>) => `${g.date}${g.time ? ` ${g.time}` : ''} vs ${g.opponent}（${g.tournament}）`
