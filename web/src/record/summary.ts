/**
 * One line saying what the last tap did, so the recorder can see at a glance that it went in right (and undo it if
 * not): 「蘇柏愷 一安・陳威儒 得分・2：0」「陳威儒 暴投 1B→2B」「三出局，換 3 局下」. Pitches alone say nothing.
 */
import { playText } from '../data/plays'
import { UNKNOWN_FIELDER } from '../data/errors'
import { isPlaced, OPP_HAND_LABEL, OPP_PR_UNNAMED, oppBatterName } from '../data/types'
import { offense, score, type RecordState } from './model'

const halfName = (s: RecordState) => `${s.inning} 局${s.half === 'top' ? '上' : '下'}`

export function describeChange(a: RecordState, b: RecordState): string | null {
  const parts: string[] = []
  const side = offense(a)
  // 突破僵局: the runners the rule put on (rows of their own, no plate appearance)
  const newRows = [...b.batting.slice(a.batting.length), ...b.pitching.slice(a.pitching.length)]
  if (newRows.length && newRows.every(isPlaced)) {
    const BASE = { 1: '一壘', 2: '二壘', 3: '三壘' } as const
    const placed = b.runners.filter((r) => r.side === side && !a.runners.some((x) => x.side === r.side && x.row === r.row)).sort((x, z) => z.base - x.base)
    return `突破僵局：${placed.map((r) => `${BASE[r.base]} ${r.name}`).join('、')}`
  }
  const bat = b.batting.length > a.batting.length ? b.batting[b.batting.length - 1] : null
  const pit = b.pitching.length > a.pitching.length ? b.pitching[b.pitching.length - 1] : null
  if (bat) parts.push(`${bat.batter} ${bat.result}${bat.rbi ? `（${bat.rbi} 分打點）` : ''}`)
  else if (pit) parts.push(`對方${pit.oppBatter ? ` ${pit.oppBatter}` : pit.oppOrder ? ` ${pit.oppOrder} 棒` : ''} ${pit.result}${pit.rbi ? `（${pit.rbi} 分打點）` : ''}`)
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
    // 對方失誤 (a 失誤進壘 already says so; a fielder named is said too)
    if ((b.extras.oppErrors?.length ?? 0) > (a.extras.oppErrors?.length ?? 0)) {
      const pos = b.extras.oppErrors![b.extras.oppErrors!.length - 1]
      if (pos !== UNKNOWN_FIELDER) parts.push(`對方失誤 ${pos}`); else if (!plays.length) parts.push('對方失誤')
    }
    if (b.oppBatter && b.oppBatter !== a.oppBatter && b.pitching.length === a.pitching.length) parts.push(`對方代打${oppBatterName(b.oppBatter) ? ` ${oppBatterName(b.oppBatter)}` : ''}`)
    for (const k of ['wp', 'pb'] as const) if (b.extras[k] > a.extras[k] && !plays.length) parts.push(k === 'wp' ? '暴投' : '捕逸')
  }
  for (const x of (b.subs ?? []).slice((a.subs ?? []).length)) {
    parts.push(x.kind === 'P' ? `換投：${x.in} 接替 ${x.out}` : `${x.in} ${x.kind === 'PH' ? '代打' : x.kind === 'PR' ? '代跑' : '換上'}（換下 ${x.out}${x.kind === 'DEF' && x.pos ? `，守 ${x.pos}` : ''}）`)
  }
  // 對方代跑: a runner's name changed on the row where he reached (「對方代跑：12號 替 第 3 棒 王」)
  let oppPinch = false
  for (let i = 0; i < Math.min(a.pitching.length, b.pitching.length); i++) {
    const was = a.pitching[i], now = b.pitching[i]
    if (!now.runner || now.runner === was.runner) continue
    oppPinch = true
    const before = a.runners.find((r) => r.side === 'opp' && r.row === i)?.name ?? was.runner ?? was.oppBatter ?? ''
    const named = before && before !== OPP_PR_UNNAMED && !/^對方 \d+ 棒$/.test(before) ? before : before === OPP_PR_UNNAMED ? '代跑' : ''
    const who = [was.oppOrder ? `第 ${was.oppOrder} 棒` : '', named].filter(Boolean).join(' ') || '對方跑者'
    parts.push(`對方代跑：${now.runner === OPP_PR_UNNAMED ? '' : `${now.runner} `}替 ${who}`)
  }
  // 對方投手 / 對方打序 (when a play went in at the same time, e.g. a change then the next plate appearance, it is said too)
  const pa = a.oppPitcher, pb = b.oppPitcher
  if ((pa?.name ?? '') !== (pb?.name ?? '') || (pa?.hand ?? '') !== (pb?.hand ?? '')) parts.push(`對方投手：${pb ? [pb.hand ? OPP_HAND_LABEL[pb.hand] : '', pb.name ?? ''].filter(Boolean).join(' ') : '未填'}`)
  if (b.oppHandOff && !a.oppHandOff) parts.push('這場不記對方投手（之後可以按「對方投手」補記）')
  if ((a.oppLineup ?? []).join('\u0000') !== (b.oppLineup ?? []).join('\u0000') && a.oppLineup && !oppPinch) parts.push('對方打序已更新')
  const sa = score(a), sb = score(b)
  const runs = sb.us - sa.us + (sb.opp - sa.opp)
  if (runs > 0) parts.push(`${sb.us > sa.us ? '得' : '失'} ${runs} 分・${sb.us}：${sb.opp}`)
  if (b.half !== a.half || b.inning !== a.inning) parts.push(`三出局，換 ${halfName(b)}`)
  else if (b.outs > a.outs) parts.push(`${b.outs} 出局`)
  return parts.length ? parts.join('・') : null
}
