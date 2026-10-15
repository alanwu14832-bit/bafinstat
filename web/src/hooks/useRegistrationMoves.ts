import { useMemo } from 'react'
import { registrationMoves, registrationMoveText } from '../data/registrations'
import type { Game } from '../data/types'
import { useDataStore } from '../store/data'

/**
 * The one line under a 杯賽 field when saving this game renames its tournament's 報名名單 too (store/data does it on
 * save): 「報名名單也一起改名：2026 秋季聯賽 → 2026秋季聯賽」; '' when nothing would move.
 */
export function useRegistrationMoveNote(game: Pick<Game, 'id' | 'date' | 'tournament'> | null): string {
  const games = useDataStore((s) => s.base.games)
  const regs = useDataStore((s) => s.registrations)
  const id = game?.id, date = game?.date, tournament = game?.tournament
  return useMemo(() => {
    if (!id || !date) return ''
    const after = games.map((g) => (g.id === id ? { ...g, date, tournament: (tournament ?? '').trim() || '未分類' } : g))
    return registrationMoveText(registrationMoves(regs, games, after))
  }, [games, regs, id, date, tournament])
}
