import { Link } from 'react-router-dom'
import { Card } from './Card'
import { Badge } from './Badge'
import { PlateBadge } from './Scoreboard'
import { cx } from '../../lib/format'
import { moreTiedText, type RecordList } from '../../data/records'
import type { Player } from '../../data/types'

const playerLink = (name: string) => `/players?player=${encodeURIComponent(name)}&tab=career`
const gameLink = (id: string) => `/games?game=${encodeURIComponent(id)}`

/**
 * One 紀錄簿 list: rank, jersey, name (to his 生涯 tab), a context line (the game, the season and sample, or the span),
 * the value on the right. Ties share a rank; a tie too big for the list collapses into the footer line.
 */
export function RecordCard({ list, roster }: { list: RecordList; roster: Player[] }) {
  const number = (name?: string) => (name ? roster.find((p) => p.name === name)?.number : undefined)
  return (
    <Card title={list.title} subtitle={list.rule} bodyClassName="px-3 pb-3" className="min-w-0">
      {list.entries.length === 0 && !list.moreTied ? (
        <p className="px-2 py-4 text-[13px] text-muted">還沒有達到門檻的紀錄<span className="block text-[11px] mt-0.5">{list.rule}</span></p>
      ) : (
        list.entries.length > 0 && <ol className="flex flex-col" aria-label={list.title}>
          {list.entries.map((e, i) => {
            const n = number(e.name)
            // One main target per row, stretched over the whole row (≥ 44 px): the player, or the game for a team
            // record. A player's single game (or the game a streak ended in) gets its own 36 px link on the line under
            // the name, above the stretched one, so the two never overlap.
            const main = e.name ? playerLink(e.name) : e.gameId ? gameLink(e.gameId) : undefined
            const label = e.name ?? e.title
            const second = e.name && e.gameId && list.category !== 'season' ? gameLink(e.gameId) : undefined
            return (
              <li key={`${label}-${e.gameId ?? ''}-${e.context}-${i}`} className="relative flex items-center gap-3 min-h-11 px-2 py-1 border-t border-border first:border-t-0">
                <span className="w-6 text-right tnum text-[13px] font-semibold text-ink-2 shrink-0" aria-label={`第 ${e.rank} 名`}>{e.rank}</span>
                {e.name && <PlateBadge size={26} active={e.active !== false}>{n ?? e.name.slice(0, 1)}</PlateBadge>}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {main
                      ? <Link to={main} className="text-[14px] font-medium text-ink truncate hover:underline underline-offset-2 after:absolute after:inset-0">{label}</Link>
                      : <span className="text-[14px] font-medium text-ink truncate">{label}</span>}
                    {list.category === 'career' && e.active && <span className="size-1.5 rounded-full bg-good shrink-0" title="現役" aria-label="現役" />}
                    {e.ongoing && <Badge variant="accent" className="shrink-0">進行中</Badge>}
                    {e.demo && <Badge variant="outline" className="shrink-0">示範</Badge>}
                  </span>
                  {second
                    ? <Link to={second} className="relative z-10 flex items-center min-h-9 w-fit max-w-full text-[12px] text-muted hover:text-ink underline-offset-2 hover:underline"><span className="line-clamp-2 break-words">{e.context}</span></Link>
                    : <span className="block text-[12px] text-muted line-clamp-2 break-words">{e.context}</span>}
                </span>
                <span className={cx('figure tnum font-semibold text-ink shrink-0 text-right', e.display.length > 5 ? 'text-[17px]' : 'text-[20px]')}>{e.display}</span>
              </li>
            )
          })}
        </ol>
      )}
      {list.moreTied > 0 && <p className={cx('px-2 text-[12px] text-muted', list.entries.length ? 'pt-2 border-t border-border' : 'py-2 text-[13px]')}>{moreTiedText(list)}</p>}
    </Card>
  )
}
