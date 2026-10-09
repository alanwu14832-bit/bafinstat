/**
 * 自責分／非自責分 (棒球規則 9.16), worked out from the runner timeline instead of a checkbox.
 *
 * The opponent's half-inning is played again without our errors and passed balls (捕逸), the way an official scorer
 * reconstructs it:
 *   - a batter who reached on an error (失誤), on 妨礙 (catcher's interference), on a strikeout he only survived
 *     through a passed ball or an error, or on a fielder's choice that put out a runner who would not have been on
 *     base, is out instead (that was a chance to retire him), and his run is never earned;
 *   - bases taken on an error or a passed ball (失誤進壘, 捕逸) are not taken; nobody moves up on the play of a 失誤;
 *   - everyone else moves as many bases as he really did, never onto or past the man ahead, and is pushed on only
 *     when a batter forces him (benefit of the doubt to the pitcher); a runner who really scored but is still on
 *     base in the errorless inning moves on what the next batters do (one base a single, two a double, home on a
 *     home run, from third on a sacrifice fly);
 *   - outs on a play count before its runs (a run that would come in on the third out does not).
 * A run is earned when its runner also scores in that inning before it has three outs.
 * Runs are charged to the pitcher who let the runner on (the row's 投手). A relief pitcher gets no benefit of the
 * outs missed before he came in: his runs are judged by an errorless inning that starts when he took over, with the
 * outs and runners really there then.
 * 突破僵局 (WBSC / MLB): a runner the tie-break rule put on base counts as having reached on an error, but no error is
 * charged and no out is added: in the errorless inning he simply stands on his base, moves and is put out the way he
 * really was (a pickoff of him is a real out), and his own run is never earned. (WBSC also makes unearned the run of a
 * batter who reached on a fielder's choice that put the placed runner out; that one is left to the recorder's tap.)
 * Not knowable from the rows (the recorder sets these by hand): a muffed foul fly that kept the batter alive, a
 * runner who would have been out without a bad throw.
 */
import { HIT_BASE_COUNT, isPlaced, type PitchingPA } from '../data/types'
import { batterEndFor, inferAll, midOf, outsIn, type End, type Half, type Step } from './timeline'

export interface EarnedCall { earned: boolean; /** why it is not earned */ why?: string }
/** Why a tie-break runner's run is unearned. */
export const TIEBREAK_WHY = '突破僵局放上壘的跑者：規則視同失誤上壘（不算失誤），得分不算自責分'

/** Bases taken this way are not taken in the errorless inning. */
const AIDED = new Set(['err', 'pb'])
const num = (e: End) => (e === 'home' ? 4 : e === 'out' ? 0 : e)
const isRun = (p: { code?: string }) => p.code === 'R' || p.code === 'ER'

interface Errorless {
  /** rows that score in the errorless inning before its third out */
  scored: Set<number>
  /** step at which the errorless inning reached three outs (Infinity: never) */
  threeAt: number
  /** rows who are out in the errorless inning the moment they reached, and why */
  why: Map<number, string>
  /** rows who took a base on an error or a passed ball, and how */
  aided: Map<number, Set<string>>
  /** what the inning had: 失誤, 捕逸, 妨礙 */
  aids: Set<string>
}

/** Bases a runner who already scored (but not in the errorless inning) takes on a result. */
function onResult(result: string, base: number): number {
  if (result === '全壘打') return 4
  if (result === '犧飛') return base === 3 ? 1 : 0
  if (result === '犧觸') return 1
  if (result === '內安') return 0
  return HIT_BASE_COUNT[result] ?? 0
}

function errorless(rows: PitchingPA[], half: Half, start: number): Errorless {
  const g: Errorless = { scored: new Set(), threeAt: Infinity, why: new Map(), aided: new Map(), aids: new Set() }
  const on = new Map<number, number>()
  let outs = 0
  for (let j = 0; j < start; j++) outs += outsIn(half.steps[j])
  for (const o of half.steps[start]?.before ?? []) on.set(o.row, o.base)
  // the outs really made so far: while the errorless inning has no more than that, a play goes the way it really
  // went (a run that crossed before the third out on the same play still counts); once it has more, its outs come
  // first (a run that would come in on the errorless third out does not count)
  let actual = outs
  let j = start
  const addOut = () => { outs++; if (outs >= 3 && g.threeAt === Infinity) g.threeAt = j }
  const out = (row: number) => { on.delete(row); addOut() }
  const score = (row: number) => { on.delete(row); g.scored.add(row) }
  const aid = (row: number, how: string) => { g.aided.set(row, new Set([...(g.aided.get(row) ?? []), how])); g.aids.add(how) }
  // up `n` bases, never onto or past the runner ahead
  const advance = (row: number, n: number) => {
    const b = on.get(row)
    if (b === undefined || n <= 0) return
    let to = b + n
    for (const [r2, b2] of on) if (r2 !== row && b2 > b && b2 <= to) to = Math.min(to, b2 - 1)
    if (to >= 4) score(row)
    else if (to > b) on.set(row, to)
  }
  // the batter takes first: whoever stands on first, and on every base right behind him, moves up one
  const force = () => {
    let k = 1
    const at = (b: number) => [...on].find(([, x]) => x === b)?.[0]
    while (at(k) !== undefined) k++
    for (let b = k - 1; b >= 1; b--) { const row = at(b)!; if (b + 1 >= 4) score(row); else on.set(row, b + 1) }
  }
  for (; j < half.steps.length && outs < 3; j++) {
    const st: Step = half.steps[j], r = rows[st.index]
    if (!r) break
    // a tie-break runner: on his base, nobody else moves (no out, no force)
    if (isPlaced(r)) {
      if (typeof st.batter === 'number') on.set(st.index, st.batter)
      else if (st.batter === 'home') g.scored.add(st.index)
      else addOut()
      actual += st.outs.length
      continue
    }
    for (const m of st.moves) {
      if (outs >= 3) break
      if (m.to === 'out') actual++
      if (!on.has(m.row)) continue
      if (m.to === 'out') out(m.row)
      else if (AIDED.has(m.kind)) aid(m.row, m.kind === 'pb' ? '捕逸' : '失誤')
      else advance(m.row, num(m.to) - m.from)
    }
    if (outs >= 3) break
    const ahead = outs > actual
    actual += st.outs.length
    // who is out on the play; one on a runner who is not there in the errorless inning is no out there
    let phantom = false, playOuts = 0
    for (const row of st.outs) { if (row === st.index) continue; if (on.has(row)) { on.delete(row); playOuts++ } else phantom = true }
    const res = r.result
    let batter: number | null = null
    // nobody moves up on the play that put a batter on who should have been out (an error, 妨礙, the third strike missed)
    let hold = false
    if (st.batter === 'out') playOuts++
    else {
      const kPb = res === '三振' && (r.pb ?? 0) > 0, kErr = res === '三振' && (r.errors?.length ?? 0) > 0
      const why = res === '失誤' ? '上壘靠我隊失誤'
        : res === '妨礙' ? '因妨礙上壘'
        : kPb || kErr ? `不死三振是${kPb ? '捕逸' : '失誤'}造成的`
        : res === '野選' && phantom ? '野選上壘，但被封殺的跑者沒有失誤的話不會在壘上'
        : null
      if (why) { g.why.set(st.index, why); g.aids.add(res === '妨礙' ? '妨礙' : kPb ? '捕逸' : '失誤'); playOuts++; hold = res !== '野選' }
      else {
        batter = num(st.batter)
        const mark = (r.events ?? []).find((e) => e.play && e.batter && e.kind === 'err')
        if (mark && mark.from < batter) { batter = mark.from; aid(st.index, '失誤') }
      }
    }
    if (ahead) { for (let n = 0; n < playOuts; n++) addOut(); if (outs >= 3) break }
    // where each runner really got to on the play without an error's help, and the furthest one from each base got:
    // a runner standing there in the errorless inning gets as far (a runner from second scored on this hit, so he
    // would have too); otherwise he goes as many bases as he really did
    const midRows = midOf(st)
    const midBase = new Map(midRows.map((o) => [o.row, o.base]))
    const errMarks = (r.events ?? []).filter((e) => e.play && !e.batter && e.kind === 'err')
    const clean = new Map<number, number>(), reach = new Map<number, number>()
    for (const o of midRows) {
      const d = st.dest[o.row]
      if (d === undefined || d === 'out') continue
      let end = num(d)
      if (hold) { if (end > o.base) aid(o.row, res === '妨礙' ? '妨礙' : '失誤'); end = o.base }
      else {
        // his 失誤進壘 mark starts where the hit alone put him (the lead runner takes the furthest one)
        const m = errMarks.filter((e) => e.to === d && e.from >= o.base).sort((x, z) => z.from - x.from)[0]
        if (m) { errMarks.splice(errMarks.indexOf(m), 1); aid(o.row, '失誤'); end = Math.min(end, m.from) }
      }
      clean.set(o.row, end)
      reach.set(o.base, Math.max(reach.get(o.base) ?? 0, end))
    }
    for (const [row] of [...on].sort((a, z) => z[1] - a[1])) {
      const gb = on.get(row)
      if (gb === undefined) continue
      const a = midBase.get(row)
      const own = a === undefined ? gb + onResult(res, gb) : clean.has(row) ? gb + clean.get(row)! - a : null
      if (own === null) continue
      advance(row, (reach.get(gb) ?? own) - gb)
    }
    if (batter !== null) {
      if (batter >= 4) g.scored.add(st.index)
      else {
        const lowest = Math.min(4, ...on.values())
        let b = Math.min(batter, lowest - 1)
        if (b < 1) { force(); b = 1 }
        on.set(st.index, b)
      }
    }
    if (!ahead) for (let n = 0; n < playOuts; n++) addOut()
  }
  return g
}

/** Rows who scored in one plate appearance: between its pitches, on its play, and the batter. */
export function runsIn(st: Step): number[] {
  return [...st.moves.filter((m) => m.to === 'home').map((m) => m.row), ...Object.entries(st.dest).filter(([, d]) => d === 'home').map(([row]) => Number(row)), ...(st.batter === 'home' ? [st.index] : [])]
}

/** Earned or not, for every run of one opponent half-inning (keyed by the row of the runner who scored). */
export function earnedCalls(rows: PitchingPA[], half: Half): Map<number, EarnedCall> {
  const scoredAt = new Map<number, number>()
  half.steps.forEach((st, j) => { for (const row of runsIn(st)) scoredAt.set(row, j) })
  const cache = new Map<number, Errorless>()
  const out = new Map<number, EarnedCall>()
  for (const [row, at] of scoredAt) {
    if (rows[row] && isPlaced(rows[row])) { out.set(row, { earned: false, why: TIEBREAK_WHY }); continue }
    const pitcher = rows[row]?.pitcher
    // the errorless inning of the pitcher who let him on starts when that pitcher took over this inning
    const start = Math.max(0, half.steps.findIndex((st) => rows[st.index]?.pitcher === pitcher))
    if (!cache.has(start)) cache.set(start, errorless(rows, half, start))
    const g = cache.get(start)!
    if (g.scored.has(row)) { out.set(row, { earned: true }); continue }
    const aids = [...g.aids].join('、') || '失誤'
    const why = g.why.get(row)
      ?? (g.threeAt <= at ? `沒有${aids}的話，這局在他回本壘前已經三出局`
        : g.aided.has(row) ? `靠${[...g.aided.get(row)!].join('、')}多跑的壘才回到本壘`
        : `沒有${aids}的話，他回不到本壘`)
    out.set(row, { earned: false, why })
  }
  return out
}

/** Earned or not for every opponent run in innings the timeline can follow (others are left to the rows). */
export function earnedAll(rows: PitchingPA[]): Map<number, EarnedCall> {
  const out = new Map<number, EarnedCall>()
  for (const half of inferAll(rows, 'pit').values()) if (half) for (const [row, c] of earnedCalls(rows, half)) out.set(row, c)
  return out
}

/**
 * Keep the runs' 自責／非自責 codes in step with an edit: a run whose code agreed with the rules before the edit (or
 * that is new, or in `fresh`) takes what the rules say now; one the recorder had set otherwise by hand keeps it.
 */
export function applyEarned<T extends PitchingPA>(rows: T[], before: Map<number, EarnedCall>, after: Map<number, EarnedCall>, fresh: Set<number> = new Set()): T[] {
  let changed = false
  const out = rows.map((r, i) => {
    const now = after.get(i)
    if (!now || !isRun(r)) return r
    const was = before.get(i)
    if (was && !fresh.has(i) && r.code !== (was.earned ? 'ER' : 'R')) return r
    const code = now.earned ? 'ER' : 'R'
    if (r.code === code) return r
    changed = true
    return { ...r, code }
  })
  return changed ? out : rows
}

export interface EarnedFix { index: number; inning: number; name: string; from: 'R' | 'ER'; to: 'R' | 'ER'; why?: string }

/**
 * A half that ended with an out on the bases (or without a third out) may have lost runner plays: when the third
 * out comes between the next batter's pitches, that plate appearance has no row to keep them on, and the timeline
 * folds them into the one before. The runs of its last plate appearance are then not second-guessed.
 */
function lastStepUnsure(rows: PitchingPA[], half: Half): boolean {
  const last = half.steps[half.steps.length - 1]
  if (!last || half.steps.reduce((n, st) => n + outsIn(st), 0) < 3) return true
  return !(last.batter === 'out' && last.outs[last.outs.length - 1] === last.index && batterEndFor(rows[last.index]?.result ?? '') === 'out')
}

/** Runs whose code is not what the rules say (older games, or a call made by hand), for the recorder to review. */
export function earnedRepairs(pitching: PitchingPA[]): EarnedFix[] {
  const out: EarnedFix[] = []
  for (const half of inferAll(pitching, 'pit').values()) {
    if (!half) continue
    const unsure = lastStepUnsure(pitching, half) ? new Set(runsIn(half.steps[half.steps.length - 1])) : new Set<number>()
    for (const [i, c] of earnedCalls(pitching, half)) {
      const r = pitching[i]
      if (!isRun(r) || unsure.has(i)) continue
      const to = c.earned ? 'ER' : 'R'
      if (r.code === to) continue
      out.push({ index: i, inning: r.inning, name: `對方${r.oppBatter ? ` ${r.oppBatter}` : r.oppOrder ? `第 ${r.oppOrder} 棒` : ''}（投手 ${r.pitcher}）`, from: r.code as 'R' | 'ER', to, why: c.why })
    }
  }
  return out.sort((a, z) => a.index - z.index)
}

export const applyEarnedRepairs = <T extends PitchingPA>(pitching: T[], fixes: EarnedFix[]): T[] =>
  pitching.map((p, i) => { const f = fixes.find((x) => x.index === i); return f ? { ...p, code: f.to } : p })
