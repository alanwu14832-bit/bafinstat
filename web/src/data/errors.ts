/**
 * 守備失誤 on an opponent plate appearance: which of our fielders erred while that batter was up (a hit plus an
 * error, a bad throw on a steal, a dropped fly…). Stored as positions, one entry per error, so two errors by the
 * shortstop are ['SS', 'SS']. A 失誤 result without this list still counts one error at its 落點, as before.
 */
import { POSITION_BY_NUMBER, type PitchingPA } from './types'

export const FIELD_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const
const VALID = new Set<string>(FIELD_POSITIONS)
const ALIAS: Record<string, string> = { 投: 'P', 投手: 'P', 捕: 'C', 捕手: 'C', 一壘: '1B', 二壘: '2B', 三壘: '3B', 游擊: 'SS', 游: 'SS', 左外野: 'LF', 左: 'LF', 中外野: 'CF', 中: 'CF', 右外野: 'RF', 右: 'RF' }

/** Positions from an array or typed text ('SS、LF', '6 7', '游擊,左外野'); anything else is dropped. */
export function cleanErrors(v: unknown): string[] {
  const parts = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/[\s、,，;；/]+/) : []
  return parts.map((t) => t.trim().toUpperCase()).filter(Boolean)
    .map((t) => (/^[1-9]$/.test(t) ? POSITION_BY_NUMBER[Number(t)] : ALIAS[t] ?? t))
    .filter((t) => VALID.has(t))
}

/** Errors charged on this plate appearance: the list when there is one, else a 失誤 result at its 落點 (unknown without one). */
export function errorsOf(p: PitchingPA): { positions: string[]; unknown: number } {
  if (p.errors?.length) return { positions: p.errors, unknown: 0 }
  if (p.result !== '失誤') return { positions: [], unknown: 0 }
  const pos = p.loc ? POSITION_BY_NUMBER[p.loc] : undefined
  return pos ? { positions: [pos], unknown: 0 } : { positions: [], unknown: 1 }
}

/** 'SS、SS、LF' for the Excel cell and the play-by-play. */
export const errorsText = (e?: string[]) => (e ?? []).join('、')
