/**
 * 隊內賽 (intra-squad games): both sides are our players.
 *
 * Such a game is stored once, written from one side (GameDayRoster.intra.team, the rows' 我隊): its batting rows are that
 * side's batters (each naming the other side's pitcher, oppPitcher), its pitching rows that side's pitchers (each naming
 * the other side's batter, oppBatter, and 代跑 runner). The other side's view — its batters' plate appearances, its
 * pitchers', its fielders' lines — is made here when the data is read (`mirrorGame`), never saved, so 修改資料 changes
 * both sides at once. The made game has its own id (`mirrorId`) and points back to the stored one (intra.mirrorOf).
 *
 * Every plate appearance is then one batter's and one pitcher's, on either side. 隊內賽 stay out of the team's 戰績 (勝敗,
 * 得失分) and, by default, of every number; the 隊內賽 filter (Filters.intra) counts them too, or only them (`intraView`).
 */
import { errorsOf, UNKNOWN_FIELDER, withOurErrors } from './errors'
import { fieldersOf, normalizeDataset } from './normalize'
import { isPlaced, OPP_PR_UNNAMED, oppBatterName, POSITION_BY_NUMBER, type BattingPA, type Dataset, type FieldingLine, type Filters, type Game, type OppBats, type OppHand, type PitchingPA, type Player } from './types'
import { inferAll, playCounts, reachedOn } from '../record/timeline'
import { oppRunning } from './opponent'
import { earnedAll } from '../record/earned'

/** The other side's view of a stored 隊內賽 has this id: the stored id and this ending. */
export const MIRROR_SUFFIX = '~2'
export const mirrorId = (id: string) => `${id}${MIRROR_SUFFIX}`
/** The stored game behind an id (a mirror's id gives the stored game's). */
export const storedId = (id: string) => (id.endsWith(MIRROR_SUFFIX) ? id.slice(0, -MIRROR_SUFFIX.length) : id)

export const isIntra = (g: Pick<Game, 'dayRoster'>) => !!g.dayRoster?.intra
/** The other side's view, made when the data is read (never saved, never listed as a game of its own). */
export const isMirror = (g: Pick<Game, 'dayRoster'>) => !!g.dayRoster?.intra?.mirrorOf

/** The two sides' names: the rows' 我隊 (`us`, the team's name in an ordinary game) and the other one. */
export function sideNames(g: Pick<Game, 'dayRoster' | 'opponent'>, teamName: string): { us: string; opp: string } {
  return { us: g.dayRoster?.intra?.team || teamName, opp: g.opponent }
}

/** The opponent as a list shows it: a 隊內賽's other side is 「隊內賽・白隊」. */
export const opponentLabel = (g: Pick<Game, 'dayRoster' | 'opponent'>) => (isIntra(g) ? `隊內賽・${g.opponent}` : g.opponent)

/** Text written for an ordinary game (「我隊進攻」「對方第 3 棒」「對方更換投手」) with a 隊內賽's two sides' names. */
export const sideText = (text: string, names: { us: string; opp: string }) => text.replace(/我隊/g, names.us).replace(/對方/g, names.opp)
/** Every string in a plain value (the 文字轉播's halves and items) through sideText. */
export function withSideNames<T>(v: T, names: { us: string; opp: string }): T {
  if (typeof v === 'string') return sideText(v, names) as T
  if (Array.isArray(v)) return v.map((x) => withSideNames(x, names)) as T
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, withSideNames(x, names)])) as T
  return v
}

const handOf = (p?: Player): OppHand | undefined => (p?.throws === 'L' || p?.throws === 'R' ? p.throws : undefined)
const batsOf = (p?: Player): OppBats | undefined => (p?.bats === 'L' || p?.bats === 'R' ? p.bats : undefined)
/** The result's own error (a 失誤 at its 落點, 妨礙 at C): the other side's list never holds it. */
const ownError = (result: string, loc?: number): { pos?: string } | null =>
  result === '妨礙' ? { pos: 'C' } : result === '失誤' ? { pos: loc ? POSITION_BY_NUMBER[loc] : undefined } : null
const isRun = (code?: string) => code === 'R' || code === 'ER'

/** Fields left out when empty, the way the rows are written (the mirror compares equal to rows typed by hand). */
function tidy<T extends object>(row: T): T {
  const out = { ...row } as Record<string, unknown>
  for (const [k, v] of Object.entries(out)) if (v === undefined || (Array.isArray(v) && !v.length && k !== 'pitches')) delete out[k]
  return out as T
}

/**
 * The other side's view of one stored 隊內賽: the game seen from it (its name as 我隊, the stored side as the
 * opponent, home and away the other way round, its 當日登錄名單) and its rows — its batters from the stored pitching
 * rows, its pitchers from the stored batting rows — with its fielders' lines worked out from them like any game's.
 * Each runner's own 盜壘／盜壘失敗／失誤進壘／壘上出局 come from the runner timeline; 自責分 from the rules (record/earned).
 */
export function mirrorGame(game: Game, rows: { batting: BattingPA[]; pitching: PitchingPA[] }, roster: Player[]): Dataset {
  const intra = game.dayRoster!.intra!
  const id = mirrorId(game.id)
  const player = new Map(roster.map((p) => [p.name, p]))
  const g: Game = {
    ...game, id, opponent: intra.team, homeAway: game.homeAway === '主' ? '客' : '主',
    dayRoster: {
      starters: intra.opp.starters, bench: intra.opp.bench, ...(intra.opp.subs ? { subs: intra.opp.subs } : {}), reentry: true,
      ...(game.dayRoster!.rules ? { rules: game.dayRoster!.rules } : {}),
      intra: { team: game.opponent, opp: { starters: game.dayRoster!.starters, bench: game.dayRoster!.bench, ...(game.dayRoster!.subs ? { subs: game.dayRoster!.subs } : {}) }, mirrorOf: game.id },
    },
  }
  // its batters' positions: where they stood (the 當日登錄名單 as it went), else their lineup position
  const fielders = fieldersOf(g)
  const posAt = (name: string, inning: number): string | undefined => {
    for (const [pos, n] of fielders?.(inning) ?? []) if (n === name) return pos
    const sub = (intra.opp.subs ?? []).filter((x) => x.in === name && x.inning <= inning).pop()
    return sub?.pos || intra.opp.starters.find((x) => x.name === name)?.pos || undefined
  }

  // its batters: the stored pitching rows. The stored side's errors are the other side's 對方失誤 (never the result's own).
  const batting: BattingPA[] = rows.pitching.map((p) => {
    const e = errorsOf(p)
    const list = [...e.positions]
    let unknown = e.unknown
    const own = ownError(p.result, p.loc)
    if (own?.pos) { const k = list.indexOf(own.pos); if (k >= 0) list.splice(k, 1) }
    else if (own) unknown--
    const errors = [...list, ...Array.from({ length: Math.max(0, unknown) }, () => UNKNOWN_FIELDER)]
    const batter = oppBatterName(p.oppBatter)
    return tidy<BattingPA>({
      gameId: id, inning: p.inning, outsBefore: p.outsBefore, basesBefore: p.basesBefore, order: p.oppOrder, pos: batter ? posAt(batter, p.inning) : undefined,
      batter, runner: p.runner && p.runner !== OPP_PR_UNNAMED ? p.runner : undefined,
      pitches: p.pitches, result: p.result, loc: p.loc, traj: p.traj, quality: p.quality,
      sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: isRun(p.code) ? 1 : 0, rbi: p.rbi ?? 0,
      code: p.code === 'ER' ? 'R' : p.code, note: p.note, events: p.events, errors,
      oppPitcher: p.pitcher || undefined, oppHand: handOf(player.get(p.pitcher)),
    })
  })
  // each runner's own steals, caught stealing, bases on errors and outs on the bases (as the 對方打擊 box reads them),
  // and the batter put out on his own play after reaching (a triple, then out at home), as ours are written
  const running = oppRunning(rows.pitching)
  rows.pitching.forEach((p, i) => {
    const r = running.get(p)
    if (r) batting[i] = { ...batting[i], sb: r.sb, cs: r.cs, advOnError: r.advOnError, outOnBase: r.outOnBase, ...(r.baserunningOuts ? { baserunningOuts: r.baserunningOuts } : {}) }
  })
  for (const half of inferAll(rows.pitching, 'pit').values()) {
    for (const st of half?.steps ?? []) {
      const b = batting[st.index]
      if (st.batter === 'out' && reachedOn(b.result) && !isPlaced(b) && !b.outOnBase) batting[st.index] = { ...b, outOnBase: 1 }
    }
  }

  // its pitchers: the stored batting rows. Their errors are the other side's own (written so the result's own counts once).
  let current = ''
  const pitchers = rows.batting.map((b) => (current = b.oppPitcher || current))
  // (a row before anyone was named, a 突破僵局 runner: the pitcher who threw next)
  for (let i = pitchers.length - 2; i >= 0; i--) if (!pitchers[i]) pitchers[i] = pitchers[i + 1]
  let pitching: PitchingPA[] = rows.batting.map((b, i) => {
    const list = b.errors?.filter((x) => x !== UNKNOWN_FIELDER) ?? []
    return tidy<PitchingPA>({
      gameId: id, inning: b.inning, outsBefore: b.outsBefore, basesBefore: b.basesBefore, oppOrder: b.order, pitcher: pitchers[i] ?? '',
      oppBatter: b.batter || undefined, runner: b.runner,
      pitches: b.pitches, result: b.result, loc: b.loc, traj: b.traj, quality: b.quality,
      sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, errors: withOurErrors([], list, b.result, b.loc), rbi: b.rbi || undefined,
      oppBats: batsOf(player.get(b.batter)), code: b.run > 0 || b.code === 'R' ? 'ER' : b.code, note: b.note, events: b.events,
    })
  })
  for (const half of inferAll(pitching, 'pit').values()) {
    if (!half) continue
    for (const [row, c] of playCounts(half, 'pit')) pitching[row] = { ...pitching[row], ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, (Number((pitching[row] as unknown as Record<string, unknown>)[k]) || 0) + v])) }
  }
  const earned = earnedAll(pitching)
  pitching = pitching.map((p, i) => (isRun(p.code) && earned.get(i)?.earned === false ? { ...p, code: 'R' } : p))

  // its fielders' lines: worked out like a game imported without any (its 當日登錄名單, its plays)
  const { dataset } = normalizeDataset({ roster: [], games: [g], batting, pitching, fielding: [] as FieldingLine[] })
  return { ...dataset, roster: [] }
}

const mirrors = new WeakMap<Dataset, Dataset>()
/** The dataset with the other side's view of every stored 隊內賽 added (the same object when there is none). */
export function withMirrors(ds: Dataset): Dataset {
  const hit = mirrors.get(ds)
  if (hit) return hit
  const stored = ds.games.filter((g) => isIntra(g) && !isMirror(g))
  let out = ds
  if (stored.length) {
    const made = stored.map((g) => mirrorGame(g, { batting: ds.batting.filter((p) => p.gameId === g.id), pitching: ds.pitching.filter((p) => p.gameId === g.id) }, ds.roster))
    out = {
      roster: ds.roster,
      games: [...ds.games, ...made.flatMap((m) => m.games)],
      batting: [...ds.batting, ...made.flatMap((m) => m.batting)],
      pitching: [...ds.pitching, ...made.flatMap((m) => m.pitching)],
      fielding: [...ds.fielding, ...made.flatMap((m) => m.fielding)],
    }
  }
  mirrors.set(ds, out)
  return out
}

const views = new WeakMap<Dataset, Map<Filters['intra'], Dataset>>()
/**
 * The games the 隊內賽 filter counts: none of them (exclude: the dataset as if they had never been played), all games
 * (include) or only them (only). Give it a dataset with the mirrors (withMirrors) to count both sides.
 */
export function intraView(ds: Dataset, mode: Filters['intra']): Dataset {
  if (mode === 'include' || !ds.games.some(isIntra)) return mode === 'only' ? { ...ds, games: [], batting: [], pitching: [], fielding: [] } : ds
  let m = views.get(ds)
  if (!m) { m = new Map(); views.set(ds, m) }
  const hit = m.get(mode)
  if (hit) return hit
  const keep = new Set(ds.games.filter((g) => isIntra(g) === (mode === 'only')).map((g) => g.id))
  const out: Dataset = {
    roster: ds.roster,
    games: ds.games.filter((g) => keep.has(g.id)),
    batting: ds.batting.filter((p) => keep.has(p.gameId)),
    pitching: ds.pitching.filter((p) => keep.has(p.gameId)),
    fielding: ds.fielding.filter((f) => keep.has(f.gameId)),
  }
  m.set(mode, out)
  return out
}
