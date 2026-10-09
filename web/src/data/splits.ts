/**
 * 情境拆分: a batter's (or the batters our pitchers faced) numbers split by situation — the count, outs and runners,
 * inning, batting order, his n-th plate appearance of the game / the pitcher's time through the order, and the
 * opponent pitcher's hand. Everything comes from what is recorded already (逐球, 出局(前), 壘上(前), 棒次, 局); nothing
 * is stored.
 *
 * Each plate appearance's situation (`paContexts`) is worked out once over the whole, unfiltered dataset in stored
 * order, keyed by the row object itself: the filtered rows the pages hold are the same objects, so a position filter
 * does not change which plate appearance of the game it was. Tie-break runners (突破僵局) are in no split.
 */
import { countParts, countTrail, type CountTrail } from './counts'
import { lineFor, type BattingLine } from './stats'
import { isPA, type BattingPA, type Dataset, type OppHand, type PitchingPA, type Player } from './types'

export type SplitSide = 'bat' | 'pit'
export type SplitGroup = 'count' | 'situation' | 'inning' | 'order' | 'nth' | 'hand'
/** Rows with fewer plate appearances are greyed out (樣本少). */
export const SPLIT_MIN_PA = 10

export interface PaContext {
  trail: CountTrail
  /** the first pitch: swung at (SS / F / IP) or taken (B / CS / S); null without pitches */
  firstPitch: 'swing' | 'take' | null
  outs?: number
  /** runners on, normalised ('' = bases empty, '13' = first and third); undefined = not recorded */
  bases?: string
  inning: number
  /** batting order slot (the opponent's for a pitcher) */
  slot?: number
  /** batter: his n-th plate appearance of the game; pitcher: the n-th time through the order */
  nth: number
  oppHand?: OppHand
}

/** 壘上(前) as a sorted set of bases: '無' / '0' -> '', '31' -> '13'; undefined / '' -> undefined (not recorded). */
export function normBases(b?: string): string | undefined {
  if (b === undefined || b === null || b === '') return undefined
  if (b === '無' || b === '0') return ''
  return [...new Set(b.split('').filter((c) => c === '1' || c === '2' || c === '3'))].sort().join('')
}

/** The opponent pitcher's hand on one of our plate appearances (recorded since 2026-10; undefined before, and for pitching rows). */
export const oppPitcherHandOf = (pa: BattingPA | PitchingPA): OppHand | undefined => (pa as BattingPA).oppHand

/** A pitching row in the batting shape, so the batting line (AVG, OBP, SLG, K%…) reads as 被打擊率, 被上壘率… */
export function asBattingPA(p: PitchingPA): BattingPA {
  return {
    gameId: p.gameId, inning: p.inning, outsBefore: p.outsBefore, basesBefore: p.basesBefore, order: p.oppOrder, batter: '對手', pitches: p.pitches, result: p.result,
    loc: p.loc, traj: p.traj, quality: p.quality, code: p.code, sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0,
  }
}

const SWING = new Set(['SS', 'F', 'IP'])
const TAKE = new Set(['B', 'CS', 'S'])

/** The situation of every plate appearance of one side, over the whole dataset (rows keyed by object). */
export function paContexts(ds: Pick<Dataset, 'batting' | 'pitching'>, side: SplitSide): WeakMap<object, PaContext> {
  const out = new WeakMap<object, PaContext>()
  const seen = new Map<string, number>()
  for (const p of side === 'bat' ? ds.batting : ds.pitching) {
    if (!isPA(p)) continue
    const trail = countTrail(p.pitches)
    const first = p.pitches.find((c) => SWING.has(c) || TAKE.has(c))
    const slot = side === 'bat' ? (p as BattingPA).order : (p as PitchingPA).oppOrder
    let nth: number
    if (side === 'bat') {
      const k = `${p.gameId}\u0000${(p as BattingPA).batter}`
      nth = (seen.get(k) ?? 0) + 1
      seen.set(k, nth)
    } else {
      const who = `${p.gameId}\u0000${(p as PitchingPA).pitcher}`
      const faced = seen.get(who) ?? 0
      seen.set(who, faced + 1)
      if (slot) {
        const k = `${who}\u0000${slot}`
        nth = (seen.get(k) ?? 0) + 1
        seen.set(k, nth)
      } else nth = Math.floor(faced / 9) + 1
    }
    out.set(p, {
      trail, firstPitch: first === undefined ? null : SWING.has(first) ? 'swing' : 'take',
      outs: typeof p.outsBefore === 'number' ? p.outsBefore : undefined, bases: normBases(p.basesBefore), inning: p.inning,
      slot: slot || undefined, nth, oppHand: oppPitcherHandOf(p),
    })
  }
  return out
}

export interface SplitDef { key: string; label: string; /** what the label means, in a line under it */ desc?: string; test: (c: PaContext) => boolean }

const AHEAD = new Set(['1-0', '2-0', '3-0', '2-1', '3-1'])   // more balls: the batter is ahead
const EVEN = new Set(['0-0', '1-1', '2-2'])
const BEHIND = new Set(['0-1', '0-2', '1-2'])
const strikesOf = (c: PaContext) => (c.trail.final ? countParts(c.trail.final)[1] : -1)
const risp = (c: PaContext) => !!c.bases && (c.bases.includes('2') || c.bases.includes('3'))

/** What a split needs: the plate appearances without it are left out of that tab (and counted). */
const HAS: Record<SplitGroup, (c: PaContext) => boolean> = {
  count: (c) => c.trail.n > 0,
  situation: (c) => c.outs !== undefined || c.bases !== undefined,
  inning: (c) => c.inning >= 1,
  order: (c) => !!c.slot,
  nth: () => true,
  hand: (c) => !!c.oppHand,
}

/** The splits of one tab, in the order baseball people read them. */
export function splitDefs(side: SplitSide, group: SplitGroup, innings: number): SplitDef[] {
  const bat = side === 'bat'
  switch (group) {
    case 'count': {
      const fin = (set: Set<string>) => (c: PaContext) => !!c.trail.final && set.has(c.trail.final)
      return [
        { key: 'first-swing', label: bat ? '第一球就揮棒' : '第一球打者就揮棒', test: (c) => c.firstPitch === 'swing' },
        { key: 'first-take', label: bat ? '第一球沒揮' : '第一球打者沒揮', test: (c) => c.firstPitch === 'take' },
        { key: 'after-1-0', label: '第一球壞球之後（1壞0好）', test: (c) => c.trail.passed.includes('1-0') },
        { key: 'after-0-1', label: '第一球好球之後（0壞1好）', test: (c) => c.trail.passed.includes('0-1') },
        { key: 'ahead', label: '球數領先時結束', desc: bat ? '壞球較多：1壞0好、2壞0好、3壞0好、2壞1好、3壞1好' : '好球較多：0壞1好、0壞2好、1壞2好', test: fin(bat ? AHEAD : BEHIND) },
        { key: 'even', label: '球數平手時結束', desc: '0壞0好、1壞1好、2壞2好', test: fin(EVEN) },
        { key: 'behind', label: '球數落後時結束', desc: bat ? '好球較多：0壞1好、0壞2好、1壞2好' : '壞球較多：1壞0好、2壞0好、3壞0好、2壞1好、3壞1好', test: fin(bat ? BEHIND : AHEAD) },
        { key: 'full', label: '滿球數（3壞2好）時結束', test: (c) => c.trail.final === '3-2' },
        { key: 'two-strike', label: '兩好球之後', test: (c) => strikesOf(c) === 2 },
        { key: 'pre-two', label: '兩好球前就結束', test: (c) => strikesOf(c) >= 0 && strikesOf(c) < 2 },
      ]
    }
    case 'situation': return [
      { key: 'out-0', label: '無人出局', test: (c) => c.outs === 0 },
      { key: 'out-1', label: '一出局', test: (c) => c.outs === 1 },
      { key: 'out-2', label: '兩出局', test: (c) => c.outs === 2 },
      { key: 'empty', label: '壘上無人', test: (c) => c.bases === '' },
      { key: 'on', label: '壘上有人', test: (c) => !!c.bases },
      { key: 'first', label: '只有一壘有人', test: (c) => c.bases === '1' },
      { key: 'risp', label: '得點圈有人（二、三壘有跑者）', test: risp },
      { key: 'loaded', label: '滿壘', test: (c) => c.bases === '123' },
      { key: 'risp-2', label: '兩出局、得點圈有人', test: (c) => c.outs === 2 && risp(c) },
    ]
    case 'inning': return [
      ...Array.from({ length: innings }, (_, i) => ({ key: `inn-${i + 1}`, label: `第 ${i + 1} 局`, test: (c: PaContext) => c.inning === i + 1 })),
      { key: 'extra', label: '延長賽', test: (c) => c.inning > innings },
    ]
    case 'order': return [
      ...Array.from({ length: 9 }, (_, i) => ({ key: `slot-${i + 1}`, label: `${bat ? '' : '對方'}第 ${i + 1} 棒`, test: (c: PaContext) => c.slot === i + 1 })),
      { key: 'slot-10', label: `${bat ? '' : '對方'}第 10 棒以後`, test: (c) => (c.slot ?? 0) >= 10 },
    ]
    case 'nth': return bat
      ? [
        { key: 'nth-1', label: '本場第 1 打席', test: (c) => c.nth === 1 },
        { key: 'nth-2', label: '第 2 打席', test: (c) => c.nth === 2 },
        { key: 'nth-3', label: '第 3 打席', test: (c) => c.nth === 3 },
        { key: 'nth-4', label: '第 4 打席以後', test: (c) => c.nth >= 4 },
      ]
      : [
        { key: 'tto-1', label: '第一輪（第一次面對這一棒）', test: (c) => c.nth === 1 },
        { key: 'tto-2', label: '第二輪', test: (c) => c.nth === 2 },
        { key: 'tto-3', label: '第三輪以後', test: (c) => c.nth >= 3 },
      ]
    case 'hand': return [
      { key: 'vs-L', label: '對左投', test: (c) => c.oppHand === 'L' },
      { key: 'vs-R', label: '對右投', test: (c) => c.oppHand === 'R' },
    ]
  }
}

export const SPLIT_GROUP_LABEL: Record<SplitGroup, (side: SplitSide) => string> = {
  count: () => '球數', situation: () => '出局・壘上', inning: () => '局數', order: () => '棒次',
  nth: (side) => (side === 'bat' ? '本場第幾打席' : '第幾輪'), hand: () => '對左右投',
}

export interface SplitRow { key: string; label: string; desc?: string; line: BattingLine; /** fewer than SPLIT_MIN_PA plate appearances */ small: boolean; /** the 「全部」 row */ all?: boolean }
export interface SplitTable {
  rows: SplitRow[]
  /** plate appearances left out of this tab (missing what it needs) */
  missing: number
  /** 出局・壘上: of those, without 出局(前) / without 壘上(前) */
  missingOuts?: number
  missingBases?: number
}

type Row = BattingPA | PitchingPA
const asBat = (side: SplitSide, rows: Row[]): BattingPA[] => (side === 'bat' ? (rows as BattingPA[]) : (rows as PitchingPA[]).map(asBattingPA))
const lineOf = (label: string, side: SplitSide, rows: Row[], roster: Player[]) => lineFor(label, asBat(side, rows), roster)

/** One tab's table: 「全部」 (every plate appearance the tab can place), then a row per split. 局數 and 棒次 rows nobody
 *  reached are left out. */
export function splitTable(rows: Row[], ctx: WeakMap<object, PaContext>, side: SplitSide, group: SplitGroup, opts: { roster: Player[]; innings: number }): SplitTable {
  const known: Array<[Row, PaContext]> = []
  let missing = 0, missingOuts = 0, missingBases = 0
  for (const r of rows) {
    const c = ctx.get(r)
    if (!c) continue
    if (group === 'situation') { if (c.outs === undefined) missingOuts++; if (c.bases === undefined) missingBases++ }
    if (group === 'situation' ? c.outs === undefined || c.bases === undefined : !HAS[group](c)) missing++
    if (HAS[group](c)) known.push([r, c])
  }
  const all: SplitRow = { key: 'all', label: '全部', line: lineOf('全部', side, known.map(([r]) => r), opts.roster), small: false, all: true }
  all.small = all.line.pa < SPLIT_MIN_PA
  const out: SplitRow[] = [all]
  for (const d of splitDefs(side, group, opts.innings)) {
    const these = known.filter(([, c]) => d.test(c)).map(([r]) => r)
    if (!these.length && (group === 'inning' || group === 'order')) continue
    const line = lineOf(d.label, side, these, opts.roster)
    out.push({ key: d.key, label: d.label, ...(d.desc ? { desc: d.desc } : {}), line, small: line.pa < SPLIT_MIN_PA })
  }
  return { rows: out, missing, ...(group === 'situation' ? { missingOuts, missingBases } : {}) }
}

export interface CountCell { key: string; balls: number; strikes: number; line: BattingLine; small: boolean }
/** The 4 × 3 count grid: per count, the plate appearances that went through it ('passed') or ended in it ('final'). */
export function countGrid(rows: Row[], ctx: WeakMap<object, PaContext>, side: SplitSide, mode: 'passed' | 'final', roster: Player[]): CountCell[] {
  const known = rows.map((r) => [r, ctx.get(r)] as const).filter((x): x is readonly [Row, PaContext] => !!x[1] && x[1].trail.n > 0)
  const out: CountCell[] = []
  for (let b = 0; b <= 3; b++) for (let s = 0; s <= 2; s++) {
    const key = `${b}-${s}`
    const these = known.filter(([, c]) => (mode === 'passed' ? c.trail.passed.includes(key) : c.trail.final === key)).map(([r]) => r)
    const line = lineOf(key, side, these, roster)
    out.push({ key, balls: b, strikes: s, line, small: line.pa < SPLIT_MIN_PA })
  }
  return out
}

/** The tabs to show: 對左右投 only for batters, and only once some plate appearance has the opponent pitcher's hand. */
export function availableGroups(side: SplitSide, ds: Pick<Dataset, 'batting' | 'pitching'>, ctx: WeakMap<object, PaContext>): SplitGroup[] {
  const groups: SplitGroup[] = ['count', 'situation', 'inning', 'order', 'nth']
  if (side === 'bat' && ds.batting.some((p) => ctx.get(p)?.oppHand)) groups.push('hand')
  return groups
}

/** 「1壞2好」 for a 'b-s' count (a bare 1-2 is easily read the wrong way round). */
export const countLabel = (k: string) => { const [b, s] = countParts(k); return `${b}壞${s}好` }
