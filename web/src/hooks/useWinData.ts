import { useMemo } from 'react'
import { TEAM } from '../config/team'
import { defaultWinRules, type WinRules } from '../data/winModel'
import { buildWinData, type WinData } from '../data/winTimeline'
import { effectiveDataset, useDataStore } from '../store/data'
import { intraView } from '../data/intrasquad'
import { useLiveIds } from './useLiveGames'

/**
 * The team's rules for the win-probability model: TEAM.innings (not the per-device 每場局數 setting, so everyone sees
 * the same numbers) and the team's tie-break (TEAM.tiebreak; '' = none), from the inning after regulation.
 */
export const teamWinRules = (): WinRules => defaultWinRules(TEAM.innings, TEAM.tiebreak)

/**
 * The win-probability model and every game's events (data/winTimeline.ts), for the loaded games plus the demo ones
 * when they are shown (which never train the model). Cached per dataset, so only 打擊, 投球 and the game pages pay
 * for it, once per save.
 */
export function useWinData(): WinData {
  const base = useDataStore((s) => s.base)
  const demo = useDataStore((s) => s.demo)
  // (a game being recorded has no end point yet: rebuilt when one starts or stops being live)
  const live = useLiveIds()
  // (隊內賽 neither train the model nor count: both sides are ours)
  return useMemo(() => buildWinData(intraView(effectiveDataset(base, demo), 'exclude'), teamWinRules()), [base, demo, live]) // eslint-disable-line react-hooks/exhaustive-deps
}
