/**
 * 延長賽突破僵局 (WBSC tie-break): from the first extra inning on, every half-inning starts with runners on base (by
 * default 一、二壘) and nobody out. The leadoff is the next batter due; the runner on first is the batter just before
 * him, the one on second the batter before that (the order wraps).
 *
 * The runners are rows of their own on the batting side's rows (result 突破僵局, no pitches), lead runner first, before
 * the inning's first plate appearance; they are not plate appearances. Their base is not stored (timeline.placedBases).
 * Live, the recorder places them with one tap (placeTiebreak) or skips the rule for that half (skipTiebreak); in
 * 修改資料 they can be added to or taken off a finished inning (addPlacedRows / removePlacedRows).
 */
import { TEAM } from '../config/team'
import { isPlaced, TIEBREAK, type BattingPA, type PitchingPA } from '../data/types'
import { basesString, offense, oppFields, type Base, type RecordState, type Runner, type TiebreakRule } from './model'
import { inferHalf, inningsOf, shiftHalf, withoutRunners, withPlaced, type Half, type OnBase, type Side } from './timeline'

const BASE_ZH: Record<Base, string> = { 1: '一壘', 2: '二壘', 3: '三壘' }

/** '12' → [1, 2] (bases, ascending; anything else is ignored). */
export function parseTiebreakBases(v: string | undefined): Base[] {
  return [...new Set(String(v ?? '').split('').filter((c) => c === '1' || c === '2' || c === '3').map(Number) as Base[])].sort((a, z) => a - z)
}
/** 「一、二壘」「二壘」「滿壘」 */
export function basesLabel(bases: Base[]): string {
  const b = [...bases].sort((a, z) => a - z)
  if (b.length === 3) return '滿壘'
  if (b.length === 1) return BASE_ZH[b[0]]
  return `${b.map((x) => BASE_ZH[x].slice(0, 1)).join('、')}壘`
}
/** 「第 8 局起・一、二壘」, or 「不採用」. */
export function tiebreakLabel(rule: TiebreakRule | null | undefined): string {
  return rule && rule.bases.length ? `第 ${rule.from} 局起・${basesLabel(rule.bases)}` : '不採用'
}
/** The team's rule for a game of `innings` innings: from the inning after regulation, on TEAM.tiebreak's bases (null = off). */
export function defaultTiebreak(innings?: number, bases: string = TEAM.tiebreak): TiebreakRule | null {
  const b = parseTiebreakBases(bases)
  return b.length ? { from: (innings ?? TEAM.innings) + 1, bases: b } : null
}
/** This game's rule (drafts from before the setting use the team's default). */
export function tiebreakRuleOf(s: RecordState): TiebreakRule | null {
  return s.tiebreak === undefined ? defaultTiebreak(s.game.innings) : s.tiebreak
}
/**
 * The innings of a saved game that can be extra innings (修改資料's 「＋ 突破僵局跑者」). The planned length is not
 * saved (a finished game's 局數 is the innings it went), so it is read off the game itself: from the first inning that
 * already has 突破僵局 runners on either side; else the innings after the 5th that started tied, with the score tied
 * after every inning since (a game only goes on past its regulation innings while it stays tied).
 */
export function extraInnings(bat: Array<Pick<BattingPA, 'inning' | 'result' | 'run'>>, pit: Array<Pick<PitchingPA, 'inning' | 'result' | 'code'>>, minRegulation = 5): Set<number> {
  const played = Math.max(0, ...bat.map((r) => r.inning || 0), ...pit.map((r) => r.inning || 0))
  const out = new Set<number>()
  const placed = [...bat, ...pit].filter((r) => r.inning && isPlaced(r)).map((r) => r.inning)
  if (placed.length) {
    for (let i = Math.min(...placed); i <= played; i++) out.add(i)
    return out
  }
  // runs after each inning: ours from the batting rows, theirs from the pitching rows
  const diff = Array.from({ length: played + 1 }, () => 0)
  for (const r of bat) if (r.inning >= 1 && r.run) diff[r.inning] += r.run
  for (const r of pit) if (r.inning >= 1 && (r.code === 'R' || r.code === 'ER')) diff[r.inning] -= 1
  for (let i = 1; i <= played; i++) diff[i] += diff[i - 1]
  for (let k = played - 1; k >= minRegulation && diff[k] === 0; k--) out.add(k + 1)
  return out
}
export const halfKey = (s: Pick<RecordState, 'inning' | 'half'>) => `${s.inning}${s.half}`

/** The runners have to be placed now: an extra half-inning under the rule that has not started yet. */
export function tiebreakDue(s: RecordState): boolean {
  const rule = tiebreakRuleOf(s)
  if (!rule || !rule.bases.length || s.finished || s.inning < rule.from) return false
  if (s.outs || s.runners.length || s.pitches.length || s.plays?.length) return false
  if ((s.tiebreakSkip ?? []).includes(halfKey(s))) return false
  const rows: Array<BattingPA | PitchingPA> = offense(s) === 'us' ? s.batting : s.pitching
  return !rows.some((r) => r.inning === s.inning)
}

/** One runner the rule puts on (base 1–3), or the batter up (base 0). */
export interface PlacedPreview { base: Base | 0; order: number; name: string; /** the opponent's name is known */ named?: boolean }

const mod = (a: number, n: number) => ((a % n) + n) % n
/** The opponent batter of `order`: their lineup (記對方打者姓名), else the name typed the last time that slot came up. */
function oppNameOf(s: RecordState, order: number): string | undefined {
  const fromLineup = s.oppNames ? s.oppLineup?.[order - 1] : ''
  if (fromLineup) return fromLineup
  return [...s.pitching].reverse().find((p) => p.oppOrder === order && p.oppBatter)?.oppBatter || undefined
}

/** Who goes where, lead runner first, then the batter up. */
export function tiebreakPreview(s: RecordState): PlacedPreview[] {
  const rule = tiebreakRuleOf(s)
  if (!rule) return []
  const asc = [...rule.bases].sort((a, z) => a - z)
  const us = offense(s) === 'us'
  const n = s.lineup.length || 9
  const at = (back: number): Omit<PlacedPreview, 'base'> => {
    if (us) { const slot = mod(s.slot - back, n); return { order: slot + 1, name: s.lineup[slot]?.name ?? '' } }
    const order = mod(s.oppOrder - 1 - back, 9) + 1
    const name = back === 0 ? (s.oppBatter || (s.oppNames ? s.oppLineup?.[order - 1] : '') || '') : oppNameOf(s, order) ?? ''
    return { order, name: name || `對方 ${order} 棒`, ...(name ? { named: true } : {}) }
  }
  // the base at ascending place i is i + 1 batters before the one up
  const runners = asc.map((base, i) => ({ base, ...at(i + 1) })).sort((a, z) => z.base - a.base)
  return [...runners, { base: 0, ...at(0) }]
}

/** Put the runners on (one act, so one undo): a row each, lead runner first, then the runner on base. */
export function placeTiebreak(s: RecordState): RecordState {
  const rule = tiebreakRuleOf(s)
  if (!rule || !rule.bases.length || s.runners.length) return s
  const us = offense(s) === 'us'
  const batting = s.batting.slice(), pitching = s.pitching.slice()
  const runners: Runner[] = []
  for (const p of tiebreakPreview(s)) {
    if (!p.base) continue
    const base = { gameId: s.game.id, inning: s.inning, outsBefore: 0, basesBefore: basesString(runners), pitches: [] as string[], result: TIEBREAK }
    let row: number
    if (us) {
      const slot = s.lineup[p.order - 1]
      batting.push({ ...base, order: p.order, ...(slot?.pos ? { pos: slot.pos } : {}), batter: p.name, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...oppFields(s.oppPitcher) })
      row = batting.length - 1
    } else {
      pitching.push({ ...base, oppOrder: p.order, pitcher: s.pitcher, oppBatter: p.named ? p.name : undefined, sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 })
      row = pitching.length - 1
    }
    runners.push({ base: p.base, side: us ? 'us' : 'opp', row, name: p.name })
  }
  return { ...s, batting, pitching, runners: runners.sort((a, z) => z.base - a.base) }
}

/** 「這局不用」: this half starts without placed runners. */
export const skipTiebreak = (s: RecordState): RecordState => ({ ...s, tiebreakSkip: [...new Set([...(s.tiebreakSkip ?? []), halfKey(s)])] })
/** 改規則 (null = 這場不採用). */
export const setTiebreakRule = (s: RecordState, rule: TiebreakRule | null): RecordState => ({ ...s, tiebreak: rule })

/* ------------------------------------------------ 修改資料 */
type Row = BattingPA | PitchingPA
export interface PlacedEdit<T extends Row> {
  /** the side's rows with the change */
  rows: T[]
  /** the inning as it is now (rows already in their new places) */
  half: Half
  /** the inning as it was, with its row indexes moved to the new places (for the play counts) */
  before: Half
  /** where the inning's first row is, and how many rows went in (+) or out (−) there */
  at: number
  shift: number
  /** 「二壘 戊、一壘 己」 */
  text: string
}
export const REBUILD_FIRST = '這局的壘上狀況對不起來，請先按「依打擊結果重建這局的跑者」'

const placedText = (rows: Row[], list: OnBase[], side: Side) => list.map((o) => {
  const r = rows[o.row]
  const who = side === 'bat' ? (r as BattingPA).runner || (r as BattingPA).batter || '（未填）' : (r as PitchingPA).oppBatter || `對方 ${(r as PitchingPA).oppOrder ?? '?'} 棒`
  return `${BASE_ZH[o.base]} ${who}`
}).join('、')

/** Put tie-break runners (bases, e.g. [1, 2]) in front of a finished inning: rows in, the timeline carried through. */
export function addPlacedRows<T extends Row>(rows: T[], inning: number, side: Side, bases: Base[], gameId: string): PlacedEdit<T> | { reason: string } {
  const idx = inningsOf(rows).get(inning) ?? []
  if (!idx.length) return { reason: '這局沒有打席' }
  if (idx.some((i) => isPlaced(rows[i]))) return { reason: '這局已經有突破僵局跑者' }
  const old = inferHalf(rows, idx, side)
  if (!old) return { reason: REBUILD_FIRST }
  const at = idx[0]
  const lead = rows[at]
  const lead2 = [...bases].sort((a, z) => z - a)
  const k = lead2.length
  const asc = [...bases].sort((a, z) => a - z)
  const made: Row[] = []
  const placed: OnBase[] = []
  for (const base of lead2) {
    const back = asc.indexOf(base) + 1
    const common = { gameId, inning, outsBefore: 0, basesBefore: placed.map((o) => o.base).sort().join('') || '無', pitches: [] as string[], result: TIEBREAK }
    if (side === 'bat') {
      const b = lead as BattingPA
      const n = Math.max(9, ...(rows as BattingPA[]).map((r) => r.order ?? 0))
      const order = b.order ? mod(b.order - 1 - back, n) + 1 : undefined
      const holder = order ? [...(rows as BattingPA[]).slice(0, at)].reverse().find((p) => p.order === order) : undefined
      const opp = { ...(b.oppPitcher ? { oppPitcher: b.oppPitcher } : {}), ...(b.oppHand ? { oppHand: b.oppHand } : {}) }
      made.push({ ...common, ...(order ? { order } : {}), ...(holder && !holder.runner && holder.pos ? { pos: holder.pos } : {}), batter: holder ? holder.runner || holder.batter : '', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, ...opp } as BattingPA)
    } else {
      const p = lead as PitchingPA
      const order = p.oppOrder ? mod(p.oppOrder - 1 - back, 9) + 1 : undefined
      const oppBatter = order ? [...(rows as PitchingPA[]).slice(0, at)].reverse().find((x) => x.oppOrder === order && x.oppBatter)?.oppBatter : undefined
      made.push({ ...common, ...(order ? { oppOrder: order } : {}), pitcher: p.pitcher, ...(oppBatter ? { oppBatter } : {}), sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 } as PitchingPA)
    }
    placed.push({ row: at + placed.length, base })
  }
  const next = [...rows.slice(0, at), ...(made as T[]), ...rows.slice(at)]
  const before = shiftHalf(old, at, k)
  return { rows: next, half: withPlaced(before, at, placed), before, at, shift: k, text: placedText(next, placed, side) }
}

/** Take the tie-break runners off an inning: their rows out, everyone else carried on without them. */
export function removePlacedRows<T extends Row>(rows: T[], inning: number, side: Side): PlacedEdit<T> | { reason: string } {
  const idx = inningsOf(rows).get(inning) ?? []
  const gone = idx.filter((i) => isPlaced(rows[i]))
  if (!gone.length) return { reason: '這局沒有突破僵局跑者' }
  const k = gone.length
  const at = idx[0]
  if (gone.some((i, n) => i !== idx[n])) return { reason: '突破僵局跑者要排在這局最前面，請先把他們移到這局最前面' }
  const half = inferHalf(rows, idx, side)
  if (!half) return { reason: REBUILD_FIRST }
  const list = half.steps.filter((st) => gone.includes(st.index)).map((st) => ({ row: st.index, base: (typeof st.batter === 'number' ? st.batter : 2) as Base }))
  const text = placedText(rows, list, side)
  const next = rows.filter((_, i) => !gone.includes(i))
  const after = shiftHalf(withoutRunners(half, gone), at, -k)
  return { rows: next, half: after, before: shiftHalf(half, at, -k), at, shift: -k, text }
}
