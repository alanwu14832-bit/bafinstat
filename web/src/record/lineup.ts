/**
 * Starting lineup drawn up on the 先發陣容 page: who plays where, the batting order, and the bench (到場未先發).
 * Saved on this device; 紀錄比賽 offers it as the default lineup for the game it was drawn up for.
 */
import { FIELD_POSITIONS, type Game, type Player } from '../data/types'
import type { LineupSlot } from './model'

// v1 on purpose: bench / gameId / reentry were added later and readLineup fills them in, so saved lineups survive
export const LINEUP_KEY = 'bafin.lineup.v1'
export type FieldPos = (typeof FIELD_POSITIONS)[number]

export interface Lineup {
  /** position → player name */
  field: Partial<Record<FieldPos, string>>
  dh: string
  /** batting order, 9 names (blank = empty slot) */
  order: string[]
  /** 板凳: came today but does not start (never a starter) */
  bench: string[]
  /** id of the scheduled game this lineup is for ('' = not chosen) */
  gameId: string
  /** 報名名單 (season|tournament) picked when the game is not on the schedule yet; only used while gameId is '' */
  regKey: string
  /** 允許再上場: players substituted out may come back in this game */
  reentry: boolean
  updatedAt: string
}

export const emptyLineup = (): Lineup => ({ field: {}, dh: '', order: Array.from({ length: 9 }, () => ''), bench: [], gameId: '', regKey: '', reentry: false, updatedAt: '' })

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** A stored lineup with every field checked: lineups saved before 板凳 existed (or edited by hand) load with safe defaults. */
export function sanitizeLineup(raw: unknown): Lineup | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const field: Lineup['field'] = {}
  const f = o.field && typeof o.field === 'object' ? (o.field as Record<string, unknown>) : {}
  for (const p of FIELD_POSITIONS) if (str(f[p])) field[p] = str(f[p])
  const order = Array.from({ length: 9 }, (_, i) => str(Array.isArray(o.order) ? o.order[i] : ''))
  const bench = [...new Set((Array.isArray(o.bench) ? o.bench : []).map(str).filter(Boolean))]
  return { field, dh: str(o.dh), order, bench, gameId: str(o.gameId), regKey: str(o.gameId) ? '' : str(o.regKey), reentry: o.reentry === true, updatedAt: str(o.updatedAt) }
}

export const readLineup = (): Lineup | null => {
  try { const v = localStorage.getItem(LINEUP_KEY); return v ? sanitizeLineup(JSON.parse(v)) : null } catch { return null }
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

/**
 * Set (or clear) the DH and keep the batting order right. A DH bats instead of the pitcher, so adding one takes the
 * pitcher's slot (or just clears it when the DH already has a slot of his own, e.g. a fielder moved to DH); switching the
 * DH hands the old DH's slot to the new one; dropping the DH puts the pitcher back into that slot.
 */
export function setDesignatedHitter(l: Lineup, name: string): Lineup {
  const field = { ...l.field }
  for (const p of FIELD_POSITIONS) if (name && field[p] === name) delete field[p]
  const pitcher = field.P ?? ''
  const prev = l.dh
  let order = [...l.order]
  const at = (n: string) => (n ? order.indexOf(n) : -1)
  if (name && name !== prev) {
    const own = at(name)
    const slot = prev && at(prev) >= 0 ? at(prev) : at(pitcher)
    if (own >= 0) { if (slot >= 0 && slot !== own) order[slot] = '' }
    else if (slot >= 0) order[slot] = name
  } else if (!name && prev) {
    const slot = at(prev)
    if (slot >= 0) order[slot] = pitcher && at(pitcher) < 0 ? pitcher : ''
  }
  order = order.map((n, i) => (n && order.indexOf(n) !== i ? '' : n))
  return { ...l, field, dh: name, order, bench: l.bench.filter((n) => n !== name) }
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

/** Everyone who starts: the nine in the field plus the DH. Unlike the batting order, this keeps the pitcher who does not bat under a DH. */
export function starters(l: Lineup): string[] {
  return [...new Set([...FIELD_POSITIONS.map((p) => l.field[p] ?? ''), l.dh].filter(Boolean))]
}

/** A bench list without anyone who now starts (a player is a starter or on the bench, never both). */
export function withoutStarter(bench: string[], l: Lineup): string[] {
  const s = new Set(starters(l))
  return bench.filter((n) => !s.has(n))
}

/** Put a player on the bench or take them off. Starters are refused (the lineup comes back unchanged). */
export function toggleBench(l: Lineup, name: string): Lineup {
  if (!name) return l
  if (l.bench.includes(name)) return { ...l, bench: l.bench.filter((n) => n !== name) }
  if (starters(l).includes(name)) return l
  return { ...l, bench: [...l.bench, name] }
}

/** Plain-text version for the team chat. */
export function lineupText(l: Lineup, opponent = ''): string {
  const lines = l.order.map((n, i) => `${i + 1}. ${n || '—'}${n ? ` (${positionOf(l, n) || '?'})` : ''}`)
  // under a DH the pitcher does not bat, so he gets his own line
  const pitcherLine = l.field.P && l.dh && !l.order.includes(l.field.P) ? [`P ${l.field.P}`] : []
  const bench = withoutStarter(l.bench, l)
  return [opponent ? `先發 vs ${opponent}` : '先發陣容', ...lines, ...pitcherLine, ...(bench.length ? [`板凳：${bench.join('、')}`] : [])].join('\n')
}

/** Extra checks when the page knows the schedule (the chosen game) and the 報名名單 (eligible names; omit when there is no list). */
export interface LineupContext { games?: Game[]; eligible?: Set<string> }

/** Problems worth showing before the lineup is used. */
export function lineupIssues(l: Lineup, roster: Player[], ctx: LineupContext = {}): string[] {
  const out: string[] = []
  if (ctx.games && l.gameId && ctx.games.find((g) => g.id === l.gameId)?.status !== 'scheduled') out.push('選的那場已經紀錄或取消了，請重選')
  const missing = FIELD_POSITIONS.filter((p) => !l.field[p])
  if (missing.length) out.push(`守位還沒排：${missing.join('、')}`)
  const dup = new Map<string, string[]>()
  for (const p of FIELD_POSITIONS) if (l.field[p]) dup.set(l.field[p]!, [...(dup.get(l.field[p]!) ?? []), p])
  if (l.dh) dup.set(l.dh, [...(dup.get(l.dh) ?? []), 'DH'])
  for (const [n, ps] of dup) if (ps.length > 1) out.push(`${n} 同時排在 ${ps.join('、')}`)
  const seen = new Set<string>()
  for (const n of l.order) { if (n && seen.has(n)) out.push(`${n} 在打序出現兩次`); seen.add(n) }
  for (const n of l.order) if (n && !positionOf(l, n)) out.push(`${n} 在打序裡但沒有守位`)
  const start = new Set(starters(l))
  const benched = new Set<string>()
  for (const n of l.bench) {
    if (start.has(n)) out.push(`${n} 同時在先發和板凳`)
    if (benched.has(n)) out.push(`${n} 在板凳出現兩次`)
    benched.add(n)
  }
  const names = new Set(roster.map((p) => p.name))
  const everyone = [...Object.values(l.field), l.dh, ...l.order, ...l.bench]
  for (const n of everyone) if (n && !names.has(n)) out.push(`${n} 不在球員名單`)
  // a stranger is already reported above; only roster players can be missing from the list
  if (ctx.eligible) for (const n of everyone) if (n && names.has(n) && !ctx.eligible.has(n)) out.push(`${n} 不在報名名單`)
  return [...new Set(out)]
}
