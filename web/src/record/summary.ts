/**
 * One line saying what the last tap did, so the recorder can see at a glance that it went in right (and undo it if
 * not): 「蘇柏愷 一安・陳威儒 得分・2：0」「陳威儒 暴投 1B→2B」「三出局，換 3 局下」. Pitches alone say nothing.
 */
import { playText } from '../data/plays'
import { offense, score, type RecordState } from './model'

const halfName = (s: RecordState) => `${s.inning} 局${s.half === 'top' ? '上' : '下'}`

export function describeChange(a: RecordState, b: RecordState): string | null {
  const parts: string[] = []
  const side = offense(a)
  const bat = b.batting.length > a.batting.length ? b.batting[b.batting.length - 1] : null
  const pit = b.pitching.length > a.pitching.length ? b.pitching[b.pitching.length - 1] : null
  if (bat) parts.push(`${bat.batter} ${bat.result}${bat.rbi ? `（${bat.rbi} 分打點）` : ''}`)
  else if (pit) parts.push(`對方${pit.oppBatter ? ` ${pit.oppBatter}` : pit.oppOrder ? ` ${pit.oppOrder} 棒` : ''} ${pit.result}`)
  if (bat || pit) {
    // 趁傳進壘 on the hit
    for (const e of (bat ?? pit)!.events ?? []) if (e.play) parts.push(playText(e))
  } else {
    // runner plays between pitches: names from where everyone stood before (lead runner moves first)
    const plays = b.half === a.half && b.inning === a.inning ? (b.plays ?? []).slice((a.plays ?? []).length) : []
    const nameAt = (base: number) => a.runners.find((r) => r.side === side && r.base === base)?.name ?? ''
    for (const e of plays) parts.push(`${nameAt(e.from)} ${playText(e)}`.trim())
    if (!plays.length && (b.half !== a.half || b.inning !== a.inning) && a.runners.length && b.batting.length === a.batting.length) {
      // the half ended on the bases (no play is logged once the half is over)
      const gone = a.runners.find((r) => (r.side === 'us' ? b.batting[r.row]?.code : b.pitching[r.row]?.code) === 'III')
      if (gone) parts.push(`${gone.name} 出局`)
    }
    if ((b.extras.pka ?? 0) > (a.extras.pka ?? 0)) parts.push('牽制（安全）')
    if ((b.extras.errors?.length ?? 0) > (a.extras.errors?.length ?? 0)) parts.push(`我隊失誤 ${b.extras.errors![b.extras.errors!.length - 1]}`)
    for (const k of ['wp', 'pb'] as const) if (b.extras[k] > a.extras[k] && !plays.length) parts.push(k === 'wp' ? '暴投' : '捕逸')
  }
  for (const x of (b.subs ?? []).slice((a.subs ?? []).length)) {
    parts.push(x.kind === 'P' ? `換投：${x.in} 接替 ${x.out}` : `${x.in} ${x.kind === 'PH' ? '代打' : x.kind === 'PR' ? '代跑' : '換上'}（換下 ${x.out}${x.kind === 'DEF' && x.pos ? `，守 ${x.pos}` : ''}）`)
  }
  const sa = score(a), sb = score(b)
  const runs = sb.us - sa.us + (sb.opp - sa.opp)
  if (runs > 0) parts.push(`${sb.us > sa.us ? '得' : '失'} ${runs} 分・${sb.us}：${sb.opp}`)
  if (b.half !== a.half || b.inning !== a.inning) parts.push(`三出局，換 ${halfName(b)}`)
  else if (b.outs > a.outs) parts.push(`${b.outs} 出局`)
  return parts.length ? parts.join('・') : null
}
