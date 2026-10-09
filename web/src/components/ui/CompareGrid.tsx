import { useState } from 'react'
import { Download } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { Input } from './Input'
import { PlateBadge } from './Scoreboard'
import { StatHint } from './StatHint'
import { Badge } from './Badge'
import type { CompareRow } from '../../data/playerMetrics'
import { prMix } from '../../lib/fmt'
import { cx } from '../../lib/format'
import { downloadCompareImage } from '../../lib/shareImage'

export interface ComparePlayer {
  name: string
  number?: string
  /** 「45 打席」/「6.1 局」 */
  note: string
  /** below the pool minimum (PA / BF) */
  small?: boolean
  /** no numbers of this kind (無投球紀錄) */
  none?: string
}

export interface CompareGridProps {
  kind: 'batting' | 'pitching'
  players: ComparePlayer[]
  rows: CompareRow[]
  /** tap a name to make him the main player */
  onPick: (name: string) => void
  /** the filter scope (subtitle of the image) */
  scope: string
  /** 「隊內百分位：和 14 位 PA ≥ 10 的隊友比」 */
  poolNote: string
  footer: string
}

/** 多人比較: one column per player (up to 9), rows = the comparison metrics; cells tinted by the team percentile, the
 *  best of each row bold and outlined. The label column stays put while the table scrolls inside the card. */
export function CompareGrid({ kind, players, rows, onPick, scope, poolNote, footer }: CompareGridProps) {
  const [title, setTitle] = useState('')
  const what = kind === 'batting' ? '打擊' : '投球'
  const save = () => downloadCompareImage({
    title: title.trim() || `${players[0]?.name ?? ''} 等 ${players.length} 人${what}比較`,
    subtitle: `${scope}・${poolNote}`,
    players: players.map((p) => ({ name: p.name, number: p.number, note: p.none ?? p.note })),
    rows, footer,
  })
  return (
    <Card title={`${players.length} 人比較・${what}`} subtitle="同一篩選範圍；底色是隊內百分位（紅好藍差），粗體＝這一列最佳；出賽、打席數只標『較多』" flush
      action={(
        <>
          <Input size="sm" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="圖片標題（選填）" placeholder="例如：2026 大專盃 內野手比較" className="w-full sm:w-[220px]" maxLength={40} />
          <Button variant="ghost" size="sm" icon={<Download />} onClick={save} title="把這張比較表存成 PNG 圖片">存成圖片</Button>
        </>
      )}>
      {/* relative: the sr-only 「（最佳）」 spans are absolutely positioned; this makes the scroller clip them instead of
          widening the whole page */}
      <div className="relative overflow-x-auto">
        <table className="border-collapse text-[13px]" style={{ width: 88 + 76 * players.length, minWidth: '100%' }} data-testid="compare-grid">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface w-[88px] min-w-[88px]" />
              {players.map((p, i) => (
                <th key={p.name} scope="col" className="w-[76px] min-w-[76px] px-1 pt-3 pb-2 align-top font-normal">
                  <span className="flex flex-col items-center gap-1">
                    <PlateBadge size={24} active={i === 0}>{p.number ?? p.name.slice(0, 1)}</PlateBadge>
                    {i === 0 ? <span className="text-[13px] font-semibold text-ink truncate max-w-[72px]" data-testid="compare-name">{p.name}</span> : (
                      <button type="button" onClick={() => onPick(p.name)} title={`改看 ${p.name}`} data-testid="compare-name"
                        className="text-[13px] font-medium text-ink truncate max-w-[72px] underline decoration-dotted underline-offset-[3px] cursor-pointer min-h-9 pointer-fine:min-h-0">{p.name}</button>
                    )}
                    <span className="text-[11px] text-muted whitespace-nowrap">{p.none ?? p.note}</span>
                    {p.small && !p.none && <Badge variant="outline">樣本少</Badge>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-1 text-left text-[12px] font-medium text-muted whitespace-nowrap"><StatHint label={r.label}>{r.label}</StatHint></th>
                {r.cells.map((c, i) => (
                  <td key={players[i]?.name ?? i} className="px-1 py-1 text-center">
                    <span className={cx('inline-flex items-center justify-center min-w-[60px] h-7 px-1.5 rounded-[8px] tnum',
                      c.best ? 'font-bold text-ink ring-2 ring-ink' : c.more ? 'font-bold text-ink' : c.small ? 'text-muted' : 'text-ink-2')}
                      style={c.pr !== null && !c.small ? { background: `color-mix(in oklab, ${prMix(c.pr)} 22%, transparent)` } : undefined}
                      title={c.pr !== null ? `隊內 PR ${c.pr}${c.small ? '（樣本少）' : ''}` : undefined}>
                      {c.text}{c.best && <span className="sr-only">（最佳）</span>}{c.more && <span className="sr-only">（較多）</span>}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
