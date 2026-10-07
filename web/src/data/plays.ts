/**
 * 逐球跑壘: runner plays between pitches (第 2 球暴投 1B→2B). Saved on the plate appearance they happened in as
 * `events`; in a spreadsheet they are one text column, e.g. 「2 暴投 1-2；3 盜壘 2-3」.
 */
import { PLAY_EVENT_LABELS, type PlayEvent } from './types'

const BASE = { 1: '1B', 2: '2B', 3: '3B', home: '本壘', out: '出局' } as const
export const playLabel = (kind: string) => PLAY_EVENT_LABELS[kind] ?? kind
/** 「暴投 1B→2B」「盜壘 3B→得分」「盜壘失敗（2B）」 */
export function playText(e: PlayEvent): string {
  const label = playLabel(e.kind)
  if (e.to === 'out') return `${label}（${BASE[e.from]}）`
  return `${label} ${BASE[e.from]}→${e.to === 'home' ? '得分' : BASE[e.to]}`
}
/** When it happened: 「第一球前」 or 「第 3 球」. */
export const playWhen = (at: number) => (at <= 0 ? '第一球前' : `第 ${at} 球`)

const KIND_BY_LABEL = Object.fromEntries(Object.entries(PLAY_EVENT_LABELS).map(([k, v]) => [v, k]))
const toText = (t: PlayEvent['to']) => (t === 'home' ? 'H' : t === 'out' ? 'X' : String(t))
/** For the 跑壘事件 column of the spreadsheets. */
export function playsText(events?: PlayEvent[]): string {
  return (events ?? []).map((e) => `${e.at} ${playLabel(e.kind)} ${e.from}-${toText(e.to)}`).join('；')
}
/** Back from the column (anything that does not read as a play is skipped). */
export function parsePlays(v: unknown): PlayEvent[] {
  const out: PlayEvent[] = []
  for (const part of String(v ?? '').split(/[；;\n]/)) {
    const m = part.trim().match(/^(\d+)\s+(\S+)\s+([123])\s*-\s*([123HX])$/i)
    if (!m) continue
    const kind = KIND_BY_LABEL[m[2]] ?? (m[2] in PLAY_EVENT_LABELS ? m[2] : null)
    if (!kind) continue
    const t = m[4].toUpperCase()
    out.push({ at: Number(m[1]), kind, from: Number(m[3]) as 1 | 2 | 3, to: t === 'H' ? 'home' : t === 'X' ? 'out' : (Number(t) as 1 | 2 | 3) })
  }
  return out
}
