/**
 * The opponent at bat: our pitching rows read as their batting. 對方打擊 on the game page, the 逐局表's opponent
 * rows and the 對手情蒐 card (every game against one opponent) all use the site's own batting formulas
 * (battingLines / teamBatting) on rows mapped to the batting shape.
 *
 * A batter is his recorded name (對方打者姓名, when the recorder kept them), else his slot 「第 N 棒」, so a pinch
 * hitter without a name is merged into his slot. Placeholder names such as 「對方 3 棒」 or 「3棒」 count as no name.
 * 對方代跑 (PitchingPA.runner) is treated like our 代跑: the run after the batter reached is the runner's (his name, or
 * 「對方代跑」 when none was typed). Their RBI is PitchingPA.rbi; their steals, caught stealing and outs on the bases are
 * worked out per runner from the innings (oppRunning).
 */
import { battingLines, summarizeGame, teamBatting, type BattingLine } from './stats'
import { inferAll, midOf } from '../record/timeline'
import { EMPTY_DATASET, OPP_PR_UNNAMED, oppBatterName, type BattingPA, type Dataset, type Game, type PitchingPA } from './types'

const PLACEHOLDER = /^(對方)?\s*(第\s*)?\d+\s*棒次?$/
const NO_SLOT = '棒次未記'

/** The recorded name, or 「第 N 棒」 (棒次未記 without a slot). */
export function oppKey(pa: Pick<PitchingPA, 'oppBatter' | 'oppOrder'>): string {
  // (a 對方代打 is his name after the mark; without one he is merged into his slot)
  const name = oppBatterName(pa.oppBatter)
  if (name && !PLACEHOLDER.test(name) && !/^\d+$/.test(name)) return name
  return pa.oppOrder ? `第 ${pa.oppOrder} 棒` : NO_SLOT
}
/** Whether a row carries a real opponent batter name. */
export const hasOppName = (pa: Pick<PitchingPA, 'oppBatter' | 'oppOrder'>) => { const k = oppKey(pa); return k !== NO_SLOT && !/^第 \d+ 棒$/.test(k) }

/** Who ran for the opponent batter on this row (a name, else 「對方代跑」), or undefined when nobody did. */
export function oppRunnerKey(pa: Pick<PitchingPA, 'runner'>): string | undefined {
  const name = pa.runner?.trim() ?? ''
  if (!name) return undefined
  return PLACEHOLDER.test(name) || /^\d+$/.test(name) ? OPP_PR_UNNAMED : name
}

/** Base running of their runners, worked out from the innings (record/timeline.ts) as the recorder entered them. */
export interface OppRunning { sb: number; cs: number; advOnError: number; outOnBase: number; baserunningOuts: number }
/**
 * Each of their runners' 盜壘 / 盜壘失敗 / 失誤進壘 / 壘上出局 / 壘死, on the row he reached on (like ours): our pitcher's
 * rows count them only as 被盜壘 / 阻殺 / 牽制, so they are read off the runner plays and where everyone ended. An inning
 * that cannot be followed adds nothing. Keyed by the row object.
 */
export function oppRunning(pas: PitchingPA[]): Map<PitchingPA, OppRunning> {
  const out = new Map<PitchingPA, OppRunning>()
  const byGame = new Map<string, PitchingPA[]>()
  for (const p of pas) { const g = byGame.get(p.gameId) ?? []; g.push(p); byGame.set(p.gameId, g) }
  for (const rows of byGame.values()) {
    const get = (row: number) => { const r = rows[row]; let c = out.get(r); if (!c) { c = { sb: 0, cs: 0, advOnError: 0, outOnBase: 0, baserunningOuts: 0 }; out.set(r, c) } return c }
    for (const half of inferAll(rows, 'pit').values()) {
      if (!half) continue
      for (const st of half.steps) {
        for (const m of st.moves) {
          const c = get(m.row)
          if (m.kind === 'sb') c.sb++
          else if (m.kind === 'cs') c.cs++
          else if (m.kind === 'err') c.advOnError += (m.to === 'home' ? 4 : m.to === 'out' ? m.from : m.to) - m.from
          else if (m.kind === 'pk' || m.kind === 'out') { c.outOnBase++; if (m.kind === 'out') c.baserunningOuts++ }
        }
        // put out on the batted ball (a force, a double play, thrown out taking an extra base): 壘死 when marked so
        const outMarks = (rows[st.index].events ?? []).filter((e) => e.play && !e.batter && e.kind === 'out')
        const mid = midOf(st)
        for (const o of mid) {
          if (st.dest[o.row] !== 'out') continue
          const c = get(o.row)
          c.outOnBase++
          if (outMarks.some((e) => e.from === o.base)) c.baserunningOuts++
        }
        // 失誤進壘 on the batted ball: the bases beyond where the hit put him
        for (const e of (rows[st.index].events ?? []).filter((x) => x.play && x.kind === 'err' && x.to !== 'out')) {
          const to = e.to === 'home' ? 4 : (e.to as number)
          const who = e.batter ? st.index : mid.find((o) => (st.dest[o.row] === e.to))?.row
          if (who !== undefined) get(who).advOnError += Math.max(0, to - e.from)
        }
      }
    }
  }
  return out
}

/** A pitching row as the opponent's batting row (their runs: the row's R / ER code; their RBI as recorded). A 對方代跑
 *  is the row's runner, so his run is his, as with our 代跑. `running`: his base running (oppRunning), when known. */
export function asOppBatting(pa: PitchingPA, running?: OppRunning): BattingPA {
  const batter = oppKey(pa)
  const runner = oppRunnerKey(pa)
  const r = running ?? { sb: 0, cs: 0, advOnError: 0, outOnBase: 0, baserunningOuts: 0 }
  return {
    gameId: pa.gameId, inning: pa.inning, outsBefore: pa.outsBefore, basesBefore: pa.basesBefore, order: pa.oppOrder, batter, ...(runner && runner !== batter ? { runner } : {}),
    pitches: pa.pitches, result: pa.result, loc: pa.loc, traj: pa.traj, quality: pa.quality, code: pa.code,
    sb: r.sb, cs: r.cs, advOnError: r.advOnError, outOnBase: r.outOnBase, ...(r.baserunningOuts ? { baserunningOuts: r.baserunningOuts } : {}),
    run: pa.code === 'R' || pa.code === 'ER' ? 1 : 0, rbi: pa.rbi ?? 0,
  }
}
const asOppRows = (pas: PitchingPA[]): BattingPA[] => { const run = oppRunning(pas); return pas.map((p) => asOppBatting(p, run.get(p))) }

export type OppBattingLine = BattingLine & { slot?: number; label: string }

/** One line per opponent batter (name or slot), in batting-order slot, then first appearance (unknown slot last). */
export function oppBattingLines(pas: PitchingPA[]): OppBattingLine[] {
  const mapped = asOppRows(pas)
  const first = new Map<string, number>()
  const slot = new Map<string, number | undefined>()
  // (a 代跑 is listed in the slot he ran for)
  mapped.forEach((p, i) => { for (const k of [p.batter, p.runner]) if (k && !first.has(k)) { first.set(k, i); slot.set(k, p.order) } })
  const rank = (k: string) => (slot.get(k) ?? 1e6) * 1e6 + (first.get(k) ?? 0)
  return battingLines(EMPTY_DATASET, mapped)
    .map((l) => ({ ...l, slot: slot.get(l.name), label: l.name }))
    .sort((a, b) => rank(a.name) - rank(b.name))
}

/** The opponent's team batting line (合計: its R and H equal the line score). */
export const oppTotals = (pas: PitchingPA[]): BattingLine => teamBatting(EMPTY_DATASET, asOppRows(pas))

const LEFT = new Set([5, 6, 7, 56, 78])
const CENTER = new Set([1, 2, 8, 46])
const RIGHT = new Set([3, 4, 9, 34, 89])
/** Which third of the field a 落點 is in (from the catcher's view; the batter's hand is unknown). */
export const fieldSide = (loc?: number): 'left' | 'center' | 'right' | null => (!loc ? null : LEFT.has(loc) ? 'left' : CENTER.has(loc) ? 'center' : RIGHT.has(loc) ? 'right' : null)

export type ScoutLine = OppBattingLine & { lastDate: string; field: { left: number; center: number; right: number } }

/** Played games against `opponent` (names compared trimmed), oldest first. */
export const gamesAgainst = (ds: Dataset, opponent: string): Game[] =>
  ds.games.filter((g) => !g.status && g.opponent.trim() === opponent.trim() && !!opponent.trim()).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

/** 對手情蒐: every opponent batter across all our games against `opponent`, merged by name (or slot). */
export function scoutLines(ds: Dataset, opponent: string): ScoutLine[] {
  const games = gamesAgainst(ds, opponent)
  const date = new Map(games.map((g) => [g.id, g.date]))
  const pas = ds.pitching.filter((p) => date.has(p.gameId))
  const extra = new Map<string, { lastDate: string; field: { left: number; center: number; right: number } }>()
  const blank = () => ({ lastDate: '', field: { left: 0, center: 0, right: 0 } })
  for (const p of pas) {
    const k = oppKey(p)
    const e = extra.get(k) ?? blank()
    const d = date.get(p.gameId) ?? ''
    if (d > e.lastDate) e.lastDate = d
    const side = p.result === '突破僵局' ? null : fieldSide(p.loc)
    if (side) e.field[side]++
    extra.set(k, e)
    // a 對方代跑 was there that day too
    const r = oppRunnerKey(p)
    if (r && r !== k) { const x = extra.get(r) ?? blank(); if (d > x.lastDate) x.lastDate = d; extra.set(r, x) }
  }
  return oppBattingLines(pas).map((l) => ({ ...l, ...(extra.get(l.name) ?? blank()) })).sort((a, b) => b.pa - a.pa || (a.slot ?? 99) - (b.slot ?? 99))
}

/** Our record against `opponent` and their team batting in those games. */
export function scoutSummary(ds: Dataset, opponent: string): { games: number; w: number; l: number; t: number; /** still being recorded (in no column of the record) */ live: number; team: BattingLine } {
  const games = gamesAgainst(ds, opponent)
  const res = games.map((g) => summarizeGame(ds, g).result)
  const ids = new Set(games.map((g) => g.id))
  return {
    games: games.length, w: res.filter((r) => r === 'W').length, l: res.filter((r) => r === 'L').length, t: res.filter((r) => r === 'T').length, live: res.filter((r) => r === 'live').length,
    team: oppTotals(ds.pitching.filter((p) => ids.has(p.gameId))),
  }
}
