/**
 * Starting lineup drawn up on the 先發陣容 page: who plays where, and the batting order.
 * Saved on this device; 紀錄比賽 offers it as the default lineup for the next game.
 */
import { FIELD_POSITIONS, type Player } from '../data/types'
import type { LineupSlot } from './model'

export const LINEUP_KEY = 'bafin.lineup.v1'
export type FieldPos = (typeof FIELD_POSITIONS)[number]

export interface Lineup {
  /** position → player name */
  field: Partial<Record<FieldPos, string>>
  dh: string
  /** batting order, 9 names (blank = empty slot) */
  order: string[]
  updatedAt: string
}

export const emptyLineup = (): Lineup => ({ field: {}, dh: '', order: Array.from({ length: 9 }, () => ''), updatedAt: '' })

export const readLineup = (): Lineup | null => {
  try { const v = localStorage.getItem(LINEUP_KEY); return v ? { ...emptyLineup(), ...(JSON.parse(v) as Lineup) } : null } catch { return null }
}
export const writeLineup = (l: Lineup | null) => { try { if (l) localStorage.setItem(LINEUP_KEY, JSON.stringify(l)); else localStorage.removeItem(LINEUP_KEY) } catch { /* ignore */ } }

/** Position a player is assigned to on the field (DH included), or ''. */
export function positionOf(l: Lineup, name: string): string {
  if (!name) return ''
  for (const p of FIELD_POSITIONS) if (l.field[p] === name) return p
  return l.dh === name ? 'DH' : ''
}

/** Everyone on the field who is not yet in the batting order, in scorer's number order (DH last). */
export function unassigned(l: Lineup): string[] {
  const inOrder = new Set(l.order.filter(Boolean))
  const names = FIELD_POSITIONS.map((p) => l.field[p] ?? '').filter(Boolean)
  if (l.dh) names.push(l.dh)
  return names.filter((n) => !inOrder.has(n))
}

/** Fill the empty batting slots with fielders who are not batting yet (a DH replaces the pitcher). */
export function autoOrder(l: Lineup): Lineup {
  const pool = unassigned(l).filter((n) => !(l.dh && n === l.field.P))
  const order = l.order.map((n) => n || pool.shift() || '')
  return { ...l, order }
}

/** The lineup as 紀錄比賽 expects it: batting slots with their positions (pitcher's slot marked P). */
export function toLineupSlots(l: Lineup): LineupSlot[] {
  return l.order.map((name) => ({ name, pos: positionOf(l, name) }))
}

/** Plain-text version for the team chat. */
export function lineupText(l: Lineup, opponent = ''): string {
  const lines = l.order.map((n, i) => `${i + 1}. ${n || '—'}${n ? ` (${positionOf(l, n) || '?'})` : ''}`)
  const bench = l.field.P && l.dh && !l.order.includes(l.field.P) ? [`P ${l.field.P}`] : []
  return [opponent ? `先發 vs ${opponent}` : '先發陣容', ...lines, ...bench].join('\n')
}

/** Problems worth showing before the lineup is used. */
export function lineupIssues(l: Lineup, roster: Player[]): string[] {
  const out: string[] = []
  const missing = FIELD_POSITIONS.filter((p) => !l.field[p])
  if (missing.length) out.push(`守位還沒排：${missing.join('、')}`)
  const dup = new Map<string, string[]>()
  for (const p of FIELD_POSITIONS) if (l.field[p]) dup.set(l.field[p]!, [...(dup.get(l.field[p]!) ?? []), p])
  if (l.dh) dup.set(l.dh, [...(dup.get(l.dh) ?? []), 'DH'])
  for (const [n, ps] of dup) if (ps.length > 1) out.push(`${n} 同時排在 ${ps.join('、')}`)
  const seen = new Set<string>()
  for (const n of l.order) { if (n && seen.has(n)) out.push(`${n} 在打序出現兩次`); seen.add(n) }
  for (const n of l.order) if (n && !positionOf(l, n)) out.push(`${n} 在打序裡但沒有守位`)
  const names = new Set(roster.map((p) => p.name))
  for (const n of [...Object.values(l.field), l.dh, ...l.order]) if (n && !names.has(n)) out.push(`${n} 不在球員名單`)
  return [...new Set(out)]
}
