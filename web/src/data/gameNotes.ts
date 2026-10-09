/**
 * 比賽附註: the small print under a box score (MLB's game notes), from one game's rows — who hit the doubles and
 * home runs and in which inning, RBIs, steals, errors, each pitcher's pitches-strikes, ground-fly outs and batters
 * faced, and the game's time, weather and field. Lines with nothing to say are left out, and so are empty sections.
 */
import { battedOutKind, battingLines, fieldingLines, pitchingLines, teamBatting, type GameSummary, type PitchingLine } from './stats'
import { formatDuration, durationMinutes, cleanTime } from './gameTime'
import { balksIn } from './plays'
import { isDouble, isPA, DEFAULT_PARAMS, type BattingPA, type Dataset, type PitchingPA, type StatParams } from './types'

export interface NoteLine { label: string; text: string }
export interface NoteSection { title: '打擊' | '跑壘' | '守備' | '投球' | '比賽'; lines: NoteLine[] }

export const NOTES_FOOTNOTE = '繼承跑者：中繼投手上場時已在壘上的跑者／其中回來得分的人數。滾地、飛球出局不含三振與犧牲觸擊。'

/** Pitchers in the order they first pitched. */
export function pitcherOrder(pas: Array<Pick<PitchingPA, 'pitcher'>>): string[] {
  const out: string[] = []
  for (const p of pas) if (p.pitcher && !out.includes(p.pitcher)) out.push(p.pitcher)
  return out
}

/** Box order of a game's batters: batting-order slot (a 代跑 who never batted sits in the slot he ran for), then first appearance. */
export function boxOrderOf(pas: BattingPA[]): (name: string) => number {
  return (name) => { const i = pas.findIndex((p) => p.batter === name || p.runner === name); return (pas[i]?.order ?? 99) * 1000 + (i < 0 ? 999 : i) }
}

/**
 * PitchingLine plus the situational counts of batch 4's pitchingSituations (繼承跑者 ir / irs, 救援失敗 bs, 三上三下
 * inn123, sitGaps). They are read when present; until pitchingLines takes its game context they are absent and
 * those lines simply do not show.
 */
export type SituationalLine = PitchingLine & Partial<Record<'ir' | 'irs' | 'bs' | 'inn123' | 'sitGaps', number>>
/** DEFERRED-TO-MERGE: pass `{ ourRuns: new Map([[summary.game.id, summary.lineUs]]) }` as the 4th argument once batch 4's pitchingLines(pas, games, params, ctx) exists. */
export function gamePitchingLines(pit: PitchingPA[], summary: GameSummary, params: StatParams = DEFAULT_PARAMS): SituationalLine[] {
  return pitchingLines(pit, [summary.game], params) as SituationalLine[]
}

const withCount = (name: string, n: number) => (n > 1 ? `${name} ${n}` : name)
const innText = (inns: number[]) => `第 ${[...new Set(inns)].sort((a, b) => a - b).join('、')} 局`

/** The 比賽 section's time line: 「比賽時間：2 小時 15 分（11:40–13:55）」 with an end time, else 「開賽：11:40」. */
export function clockLine(clock: { time?: string; endTime?: string }): NoteLine | null {
  const start = cleanTime(clock.time)
  if (!start) return null
  const end = cleanTime(clock.endTime)
  const d = durationMinutes(start, end)
  if (end && d !== undefined) return { label: '比賽時間', text: `${formatDuration(d)}（${start}–${end}）` }
  return { label: '開賽', text: start }
}

export function gameNotes(summary: GameSummary, ds: Dataset, clock?: { time?: string; endTime?: string }, params: StatParams = DEFAULT_PARAMS): NoteSection[] {
  const g = summary.game
  const bat = ds.batting.filter((p) => p.gameId === g.id)
  const pit = ds.pitching.filter((p) => p.gameId === g.id)
  const fld = ds.fielding.filter((f) => f.gameId === g.id)
  const at = boxOrderOf(bat)
  const lines = battingLines(ds, bat, params).sort((a, b) => at(a.name) - at(b.name))
  const team = teamBatting(ds, bat, params)
  const sections: NoteSection[] = []
  const add = (title: NoteSection['title'], ls: Array<NoteLine | null | false | undefined>) => {
    const kept = ls.filter((l): l is NoteLine => !!l && !!l.text)
    if (kept.length) sections.push({ title, lines: kept })
  }
  const join = (xs: string[]) => xs.join('、')

  // 打擊
  const hitsOf = (test: (r: string) => boolean, runs = false): string => {
    const by = new Map<string, BattingPA[]>()
    for (const p of bat) if (isPA(p) && test(p.result)) by.set(p.batter, [...(by.get(p.batter) ?? []), p])
    return join([...by.entries()].sort((a, b) => at(a[0]) - at(b[0])).map(([name, ps]) => {
      const rbi = ps.reduce((s, p) => s + p.rbi, 0)
      return `${withCount(name, ps.length)}（${innText(ps.map((p) => p.inning))}${runs && rbi > 0 ? `，${rbi} 分` : ''}）`
    }))
  }
  const twoOut = new Map<string, number>()
  for (const p of bat) if (isPA(p) && p.outsBefore === 2 && p.rbi > 0) twoOut.set(p.batter, (twoOut.get(p.batter) ?? 0) + p.rbi)
  add('打擊', [
    { label: '二壘安打', text: hitsOf(isDouble) },
    { label: '三壘安打', text: hitsOf((r) => r === '三安') },
    { label: '全壘打', text: hitsOf((r) => r === '全壘打', true) },
    { label: '打點', text: join(lines.filter((l) => l.rbi > 0).sort((a, b) => b.rbi - a.rbi).map((l) => `${l.name} ${l.rbi}`)) },
    { label: '兩出局後打點', text: join([...twoOut.entries()].sort((a, b) => at(a[0]) - at(b[0])).map(([n, v]) => `${n} ${v}`)) },
    team.rispAB > 0 && { label: '得點圈打擊', text: `${team.rispAB} 打數 ${team.rispH} 安` },
    summary.lobUs > 0 && { label: '殘壘', text: String(summary.lobUs) },
  ])

  // 跑壘
  add('跑壘', [
    { label: '盜壘', text: join(lines.filter((l) => l.sb > 0).map((l) => withCount(l.name, l.sb))) },
    { label: '盜壘失敗', text: join(lines.filter((l) => l.cs > 0).map((l) => withCount(l.name, l.cs))) },
    { label: '跑壘出局', text: join(lines.filter((l) => l.baserunningOuts > 0).map((l) => withCount(l.name, l.baserunningOuts))) },
  ])

  // 守備
  const fl = fieldingLines(fld)
  const sum = (k: 'cs' | 'pk') => pit.reduce((s, p) => s + (p[k] ?? 0), 0)
  const dps = pit.filter((p) => p.result === '雙殺').length
  add('守備', [
    { label: '失誤', text: join(fl.filter((f) => f.e > 0).map((f) => withCount(f.name, f.e))) },
    dps > 0 && { label: '雙殺守備', text: `${dps} 次` },
    sum('cs') > 0 && { label: '阻殺', text: `${sum('cs')} 次` },
    sum('pk') > 0 && { label: '牽制出局', text: `${sum('pk')} 次` },
    { label: '捕逸', text: join(fl.filter((f) => f.pb > 0).map((f) => withCount(f.name, f.pb))) },
  ])

  // 投球, in the order they pitched
  const order = pitcherOrder(pit)
  const pl = gamePitchingLines(pit, summary, params).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
  const goAo = new Map<string, { go: number; ao: number }>()
  for (const p of pit) {
    if (!isPA(p)) continue
    const k = battedOutKind(p)
    if (!k) continue
    const v = goAo.get(p.pitcher) ?? { go: 0, ao: 0 }
    if (k === 'GO') v.go++; else v.ao++
    goAo.set(p.pitcher, v)
  }
  const bk = new Map<string, number>()
  for (const p of pit) { const n = balksIn(p.events); if (n) bk.set(p.pitcher, (bk.get(p.pitcher) ?? 0) + n) }
  const each = (f: (l: SituationalLine) => string | null) => join(pl.map((l) => f(l)).filter((x): x is string => !!x))
  const gaps = pl.reduce((s, l) => s + (l.sitGaps ?? 0), 0)
  add('投球', [
    { label: '用球數-好球數', text: each((l) => (l.pc > 0 ? `${l.name} ${l.pc}-${l.strikes}` : null)) },
    goAo.size > 0 && { label: '滾地出局-飛球出局', text: each((l) => { const v = goAo.get(l.name) ?? { go: 0, ao: 0 }; return `${l.name} ${v.go}-${v.ao}` }) },
    { label: '面對打者', text: each((l) => (l.bf > 0 ? `${l.name} ${l.bf}` : null)) },
    { label: '繼承跑者-失分', text: each((l) => (l.ir ? `${l.name} ${l.ir}-${l.irs ?? 0}` : null)) },
    { label: '救援失敗', text: each((l) => (l.bs ? withCount(l.name, l.bs) : null)) },
    { label: '三上三下', text: each((l) => (l.inn123 ? `${l.name} ${l.inn123} 局` : null)) },
    { label: '投手犯規', text: each((l) => (bk.get(l.name) ? withCount(l.name, bk.get(l.name)!) : null)) },
    { label: '暴投', text: each((l) => (l.wp ? withCount(l.name, l.wp) : null)) },
    { label: '觸身球', text: each((l) => (l.hbp ? withCount(l.name, l.hbp) : null)) },
    gaps > 0 && { label: '說明', text: `有 ${gaps} 次換投發生在沒有記壘上跑者的半局，繼承跑者與救援失敗沒有算這幾次` },
  ])

  // 比賽
  add('比賽', [
    clockLine(clock ?? { time: g.time, endTime: g.endTime }),
    g.weather?.trim() ? { label: '天氣', text: g.weather.trim() } : null,
    g.venue?.trim() ? { label: '場地', text: g.venue.trim() } : null,
  ])
  return sections
}

