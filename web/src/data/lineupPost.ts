/**
 * 先發陣容 IG 貼文 (the team's STARTING LINEUP post, 1080 × 1350): what it says, worked out from the lineup on the 先發陣容
 * page and the game it is for. lib/lineupImage.ts draws it; components/ui/LineupPostDialog.tsx edits and shares it.
 */
import type { Game } from './types'
import { positionOf, type Lineup } from '../record/lineup'

export interface LineupPostRow { pos: string; name: string }

/**
 * The rows, in batting order: the position written as the team's posts do (P for a pitcher who bats), then — under a DH —
 * the starting pitcher who does not bat as 「SP」 at the bottom. Blank batting slots are left out.
 */
export function lineupPostRows(l: Lineup): LineupPostRow[] {
  const rows = l.order.filter(Boolean).map((name) => ({ pos: positionOf(l, name) || '—', name }))
  const p = l.field.P
  if (p && !l.order.includes(p)) rows.push({ pos: 'SP', name: p })
  return rows
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
/** 「SUN, 10/18/2026 | 3:00 PM」 (the time left out when the game has none). '' without a game. */
export function lineupPostDate(game?: Pick<Game, 'date' | 'time'>): string {
  if (!game?.date) return ''
  const [y, m, d] = game.date.split('-').map(Number)
  if (!y || !m || !d) return ''
  const day = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  const t = /^(\d{1,2}):(\d{2})/.exec(game.time ?? '')
  const time = t ? ` | ${((Number(t[1]) + 11) % 12) + 1}:${t[2]} ${Number(t[1]) >= 12 ? 'PM' : 'AM'}` : ''
  return `${day}, ${m}/${d}/${y}${time}`
}
/** 「@台大棒球場」 ('' without a venue). */
export const lineupPostVenue = (game?: Pick<Game, 'venue'>) => (game?.venue?.trim() ? `@${game.venue.trim()}` : '')
